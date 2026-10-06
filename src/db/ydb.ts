import { Driver } from '@ydbjs/core';
import { AccessTokenCredentialsProvider } from '@ydbjs/auth/access-token';
import { ServiceAccountCredentialsProvider } from '@ydbjs/auth-yandex-cloud';
import type { ServiceAccountKey } from '@ydbjs/auth-yandex-cloud';
import type { CredentialsProvider } from '@ydbjs/auth';
import { query, type QueryClient } from '@ydbjs/query';
import { fromJs } from '@ydbjs/value';

/**
 * Значение переменной окружения без «мусора» от копирования в панель хостинга:
 * пробелы и переводы строк по краям, обрамляющие кавычки (YDB_TOKEN="..." целиком вставляют в поле значения).
 */
export function readEnv(name: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  let value = env[name]?.trim();
  if (value && value.length >= 2) {
    const first = value[0];
    if ((first === '"' || first === "'") && value[value.length - 1] === first) value = value.slice(1, -1).trim();
  }
  return value || undefined;
}

/** Описание того, чего не хватает для подключения к YDB (null — конфигурация полная). */
export function ydbConfigProblem(env: NodeJS.ProcessEnv = process.env): string | null {
  const missing: string[] = [];
  if (!readEnv('YDB_ENDPOINT', env)) missing.push('YDB_ENDPOINT');
  if (!readEnv('YDB_DATABASE', env)) missing.push('YDB_DATABASE');
  if (!readEnv('YDB_SERVICE_ACCOUNT_KEY', env) && !readEnv('YDB_TOKEN', env)) {
    missing.push('YDB_SERVICE_ACCOUNT_KEY (рекомендуется) или YDB_TOKEN');
  }
  return missing.length > 0 ? `Не заданы переменные окружения: ${missing.join(', ')}.` : null;
}

/** Ключ сервисного аккаунта: JSON authorized key целиком или его base64 (удобнее для переменных окружения). */
export function parseServiceAccountKey(raw: string): ServiceAccountKey {
  let text = raw.trim();
  if (!text.startsWith('{')) text = Buffer.from(text, 'base64').toString('utf8').trim();
  const unreadable = (cause?: unknown) =>
    new Error(
      'YDB_SERVICE_ACCOUNT_KEY: не удалось разобрать ключ. Вставьте содержимое authorized_key.json целиком ' +
        'или его base64 (base64 -w0 authorized_key.json).',
      { cause },
    );
  let key: ServiceAccountKey;
  try {
    key = JSON.parse(text);
  } catch (cause) {
    throw unreadable(cause);
  }
  // Произвольная строка после декодирования base64 иногда оказывается валидным JSON-скаляром (число, null)
  if (typeof key !== 'object' || key === null || Array.isArray(key)) throw unreadable();
  if (!key?.id || !key?.service_account_id || !key?.private_key) {
    throw new Error('YDB_SERVICE_ACCOUNT_KEY: в ключе нет обязательных полей id, service_account_id, private_key.');
  }
  return key;
}

/** YDB_IAM_ENDPOINT принимает и полный URL, и host[:port] (как было в прежнем .env.example). */
export function normalizeIamEndpoint(raw: string): string {
  const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
  if (url.pathname === '/') url.pathname = '/iam/v1/tokens';
  return url.toString();
}

/**
 * Учётные данные YDB:
 *  1) YDB_SERVICE_ACCOUNT_KEY — ключ сервисного аккаунта: IAM-токен получается и обновляется автоматически
 *     (подходит для постоянной работы, в т.ч. на Vercel);
 *  2) YDB_TOKEN — готовый IAM-токен. Он живёт около 12 часов, потом YDB отвечает UNAUTHENTICATED.
 */
export function createYdbCredentialsProvider(env: NodeJS.ProcessEnv = process.env): CredentialsProvider {
  const serviceAccountKey = readEnv('YDB_SERVICE_ACCOUNT_KEY', env);
  if (serviceAccountKey) {
    const iamEndpoint = readEnv('YDB_IAM_ENDPOINT', env);
    return new ServiceAccountCredentialsProvider(
      parseServiceAccountKey(serviceAccountKey),
      iamEndpoint ? { iamEndpoint: normalizeIamEndpoint(iamEndpoint) } : undefined,
    );
  }
  // Токен не содержит пробелов: убираем случайные переносы строк и префикс «Bearer »
  const token = readEnv('YDB_TOKEN', env)?.replace(/^Bearer\s+/i, '').replace(/\s+/g, '');
  if (!token) {
    throw new Error('Задайте YDB_SERVICE_ACCOUNT_KEY (рекомендуется) или YDB_TOKEN для подключения к YDB.');
  }
  return new AccessTokenCredentialsProvider({ token });
}

declare global {
  var _ydbDriver: Driver | undefined;
  var _ydbQueryClient: QueryClient | undefined;
}

function connectionString() {
  const endpoint = readEnv('YDB_ENDPOINT');
  const database = readEnv('YDB_DATABASE');
  if (!endpoint || !database) throw new Error('YDB_ENDPOINT and YDB_DATABASE must be configured');
  return `${endpoint}/?database=${encodeURIComponent(database)}`;
}

let authHintShown = false;

/** Только для тестов: подсказки пишутся один раз на процесс, а тестам нужно проверять их заново. */
export function resetYdbErrorHints() {
  authHintShown = false;
}

/** Понятная подсказка в логах вместо голого gRPC-кода (один раз на процесс, чтобы не засорять журнал). */
function explainYdbError(error: unknown) {
  const code = (error as { code?: number })?.code;
  const text = String((error as Error)?.message ?? error);
  if (!authHintShown && (code === 16 || /UNAUTHENTICATED/.test(text))) {
    authHintShown = true;
    console.error(
      '[ydb] YDB отклонил учётные данные (UNAUTHENTICATED). Если используется YDB_TOKEN — IAM-токен живёт ~12 часов ' +
        'и мог истечь: получите новый (yc iam create-token), вставьте БЕЗ кавычек и пробелов и сделайте redeploy. ' +
        'Для постоянной работы задайте YDB_SERVICE_ACCOUNT_KEY (ключ сервисного аккаунта) — токен будет обновляться сам.',
    );
  } else if (!authHintShown && (code === 7 || /PERMISSION_DENIED/.test(text))) {
    authHintShown = true;
    console.error('[ydb] Нет прав на базу (PERMISSION_DENIED): выдайте сервисному аккаунту роль ydb.editor на эту базу.');
  }
  return error;
}

export function createYdbDriver() {
  global._ydbDriver ??= new Driver(connectionString(), {
    credentialsProvider: createYdbCredentialsProvider(),
  });
  return global._ydbDriver;
}

export function createYdbQueryClient() {
  global._ydbQueryClient ??= query(createYdbDriver());
  return global._ydbQueryClient;
}

export async function executeYql<T = Record<string, unknown>>(text: string, parameters: Record<string, unknown> = {}) {
  const entries = Object.entries(parameters).filter(([, value]) => value !== undefined);
  let request = createYdbQueryClient()(text);
  for (const [name, value] of entries) {
    request = request.param(name, fromJs(value as never));
  }
  try {
    const resultSets = await request.idempotent(true);
    return resultSets.flat() as T[];
  } catch (error) {
    throw explainYdbError(error);
  }
}

export async function ensureYdbTable(table: string, columns: string[]) {
  await executeYql(`CREATE TABLE IF NOT EXISTS \`${table}\` (${columns.join(', ')}, PRIMARY KEY (id));`);
}

export async function upsertYdbRow(table: string, row: Record<string, unknown>) {
  const entries = Object.entries(row).filter(([, value]) => value !== undefined);
  const columns = entries.map(([key]) => key);
  const parameters = Object.fromEntries(entries.map(([key, value]) => [`_${key}`, value]));
  const values = entries.map(([key]) => `\$_${key}`);
  await executeYql(`UPSERT INTO \`${table}\` (${columns.join(', ')}) VALUES (${values.join(', ')});`, parameters);
}

export async function selectYdbRows(table: string, filters: Record<string, unknown> = {}) {
  const entries = Object.entries(filters).filter(([, value]) => value !== undefined);
  const parameters = Object.fromEntries(entries.map(([column, value]) => [`_${column}`, value]));
  const where = entries.length > 0
    ? ` WHERE ${entries.map(([column]) => `${column} = \$_${column}`).join(' AND ')}`
    : '';
  return executeYql<Record<string, unknown>>(`SELECT * FROM \`${table}\`${where};`, parameters);
}

export async function checkYdbConnection() {
  await executeYql('SELECT 1 AS connected;');
  return true;
}

export async function closeYdbConnection() {
  await global._ydbQueryClient?.[Symbol.asyncDispose]();
  await global._ydbDriver?.[Symbol.asyncDispose]();
  global._ydbQueryClient = undefined;
  global._ydbDriver = undefined;
}

export const YDB_TABLES = {
  users: 'users',
  tenantAccounts: 'tenant_accounts',
  legalEntities: 'legal_entities',
  workshops: 'workshops',
  drivers: 'drivers',
  coffeePoints: 'coffee_points',
  products: 'products',
  employees: 'employees',
  slots: 'slots',
  shiftOrders: 'shift_orders',
  waybills: 'waybills',
} as const;

const baseColumns = ['id Utf8', 'account_id Utf8', 'created_at Utf8'];
const auditColumns = [...baseColumns, 'updated_at Utf8', 'archived Utf8'];

export const YDB_TABLE_DEFINITIONS: Record<string, string[]> = {
  users: [...baseColumns, 'uid Utf8', 'email Utf8', 'name Utf8', 'role Utf8', 'point_id Utf8', 'workshop_id Utf8', 'driver_id Utf8'],
  tenant_accounts: [...baseColumns, 'name Utf8', 'db_schema Utf8', 'inn Utf8', 'admin_email Utf8', 'admin_name Utf8', 'description Utf8'],
  legal_entities: [...auditColumns, 'name Utf8', 'short_name Utf8', 'inn Utf8', 'kpp Utf8', 'ogrn Utf8', 'legal_address Utf8', 'actual_address Utf8', 'bank_name Utf8', 'bik Utf8', 'checking_account Utf8', 'correspondent_account Utf8', 'director_name Utf8', 'phone Utf8', 'email Utf8', 'tax_system Utf8', 'source Utf8', 'external_id Utf8'],
  workshops: [...auditColumns, 'name Utf8', 'legal_entity_id Utf8', 'address Utf8', 'chief_name Utf8', 'phone Utf8', 'capacity Utf8', 'source Utf8', 'external_id Utf8'],
  drivers: [...auditColumns, 'name Utf8', 'phone Utf8', 'legal_entity_id Utf8', 'assigned_workshop_id Utf8', 'vehicle_model Utf8', 'license_plate Utf8', 'has_refrigerator Utf8', 'status Utf8'],
  coffee_points: [...auditColumns, 'name Utf8', 'address Utf8', 'legal_entity_id Utf8', 'assigned_workshop_id Utf8', 'assigned_employee_ids Utf8', 'source Utf8', 'external_id Utf8'],
  products: [...auditColumns, 'sku Utf8', 'name Utf8', 'unit Utf8', 'category Utf8', 'source Utf8', 'external_id Utf8'],
  employees: [...auditColumns, 'name Utf8', 'role Utf8', 'point_id Utf8', 'workshop_id Utf8', 'driver_id Utf8', 'phone Utf8', 'email Utf8', 'password_hash Utf8'],
  slots: [...baseColumns, 'name Utf8', 'deadline_time Utf8', 'delivery_time Utf8', 'description Utf8', 'is_active Utf8'],
  shift_orders: [...baseColumns, 'updated_at Utf8', 'idempotency_key Utf8', 'point_id Utf8', 'point_name Utf8', 'slot_id Utf8', 'date Utf8', 'status Utf8', 'items Utf8', 'created_by Utf8', 'submitted_at Utf8'],
  waybills: [...baseColumns, 'order_id Utf8', 'point_id Utf8', 'point_name Utf8', 'date Utf8', 'slot_id Utf8', 'status Utf8', 'driver_name Utf8', 'driver_id Utf8', 'workshop_id Utf8', 'legal_entity_id Utf8', 'dispatched_by Utf8', 'dispatched_at Utf8', 'received_by Utf8', 'received_at Utf8', 'items Utf8'],
};

// Колонки, добавленные после первой версии схемы. CREATE TABLE IF NOT EXISTS не меняет уже
// существующие таблицы, поэтому для них недостающие колонки добавляются отдельно.
const MIGRATION_COLUMNS: Record<string, string[]> = {
  employees: ['password_hash Utf8'],
};

export async function ensureYdbColumn(table: string, columnDefinition: string) {
  const column = columnDefinition.split(' ')[0];
  try {
    await executeYql(`SELECT ${column} FROM \`${table}\` LIMIT 1;`);
    return; // колонка уже есть
  } catch {
    // колонки нет (или таблица недоступна — тогда следующий запрос вернёт понятную ошибку)
  }
  await executeYql(`ALTER TABLE \`${table}\` ADD COLUMN ${columnDefinition};`);
}

export async function ensureYdbSchema() {
  for (const [table, columns] of Object.entries(YDB_TABLE_DEFINITIONS)) {
    await ensureYdbTable(table, columns);
  }
  for (const [table, columns] of Object.entries(MIGRATION_COLUMNS)) {
    for (const column of columns) await ensureYdbColumn(table, column);
  }
}

/**
 * Все колонки в YDB хранятся как Utf8, поэтому на запись любое значение
 * приводится к строке: Date → ISO, boolean → 'true'/'false', number → строка,
 * объекты и массивы → JSON. null остаётся NULL.
 */
export function toYdbRow(input: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(input).map(([key, value]) => {
    let encoded: unknown = value;
    if (value instanceof Date) encoded = value.toISOString();
    else if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'bigint') encoded = String(value);
    else if (typeof value === 'object' && value !== null) encoded = JSON.stringify(value);
    return [key.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`), encoded];
  }));
}

// Колонки, в которых лежит JSON и булевы значения. Остальное — всегда строки:
// ИНН, КПП, телефоны, расчётные счета и SKU нельзя превращать в числа
// (теряются ведущие нули и точность для 20-значных счетов).
const JSON_COLUMNS = new Set(['items', 'assigned_employee_ids']);
const BOOL_COLUMNS = new Set(['archived', 'has_refrigerator', 'is_active']);

function decodeYdbValue(column: string, value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (BOOL_COLUMNS.has(column)) return value === true || value === 'true';
  if (JSON_COLUMNS.has(column)) {
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  }
  // Совместимость со старыми строками, где дата была записана как JSON-строка в кавычках.
  if (column.endsWith('_at') && typeof value === 'string' && value.startsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

export function fromYdbRow<T>(row: Record<string, unknown>): T {
  return Object.fromEntries(Object.entries(row).map(([column, value]) => [
    column.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()),
    decodeYdbValue(column, value),
  ])) as T;
}

export { createYdbDriver as createPool };
export const db = { query: executeYql };
