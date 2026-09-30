import { Driver, QueryClient, IamAuthService, getCredentialsFromEnv } from 'ydb-sdk';

function createYdbAuthService() {
  const serviceAccountId = process.env.YDB_SERVICE_ACCOUNT_ID;
  const keyId = process.env.YDB_KEY_ID;
  const privateKey = process.env.YDB_PRIVATE_KEY?.replace(/\\n/g, '\n');

  const configuredKeyParts = [serviceAccountId, keyId, privateKey].filter(Boolean).length;
  if (configuredKeyParts > 0 && configuredKeyParts < 3) {
    throw new Error('YDB_SERVICE_ACCOUNT_ID, YDB_KEY_ID, and YDB_PRIVATE_KEY must be configured together');
  }

  if (serviceAccountId && keyId && privateKey) {
    return new IamAuthService({
      iamEndpoint: process.env.YDB_IAM_ENDPOINT || 'iam.api.cloud.yandex.net:443',
      serviceAccountId,
      accessKeyId: keyId,
      privateKey: Buffer.from(privateKey),
    });
  }

  return getCredentialsFromEnv();
}

declare global {
  var _ydbDriver: Driver | undefined;
  var _ydbQueryClient: QueryClient | undefined;
}

function connectionString() {
  const endpoint = process.env.YDB_ENDPOINT;
  const database = process.env.YDB_DATABASE;
  if (!endpoint || !database) throw new Error('YDB_ENDPOINT and YDB_DATABASE must be configured');
  return `${endpoint}/?database=${encodeURIComponent(database)}`;
}

export function createYdbDriver() {
  global._ydbDriver ??= new Driver({ connectionString: connectionString(), authService: createYdbAuthService() });
  return global._ydbDriver;
}

export function createYdbQueryClient() {
  global._ydbQueryClient ??= createYdbDriver().queryClient;
  return global._ydbQueryClient;
}

export async function executeYql<T = Record<string, unknown>>(text: string, parameters?: Record<string, unknown>) {
  const client = createYdbQueryClient();
  return client.do({
    fn: async (session) => {
      const result = await session.execute({ text, parameters: parameters as never, rowMode: 0 });
      const rows: T[] = [];
      for await (const resultSet of result.resultSets) {
        for await (const row of resultSet.rows) rows.push(row as T);
      }
      await result.opFinished;
      return rows;
    },
    idempotent: true,
  });
}

export async function ensureYdbTable(table: string, columns: string[]) {
  await executeYql(`CREATE TABLE IF NOT EXISTS \`${table}\` (${columns.join(', ')}, PRIMARY KEY (id));`);
}

export async function upsertYdbRow(table: string, row: Record<string, unknown>) {
  const entries = Object.entries(row).filter(([, value]) => value !== undefined);
  const columns = entries.map(([key]) => key);
  const values = entries.map(([, value]) => JSON.stringify(value == null ? '' : String(value instanceof Date ? value.toISOString() : value)));
  await executeYql(`UPSERT INTO \`${table}\` (${columns.join(', ')}) VALUES (${values.join(', ')});`);
}

export async function selectYdbRows(table: string, accountId?: string) {
  const where = accountId ? ` WHERE account_id = '${accountId.replace(/'/g, "''")}'` : '';
  return executeYql<Record<string, unknown>>(`SELECT * FROM \`${table}\`${where};`);
}

export async function checkYdbConnection() {
  await executeYql('SELECT 1 AS connected;');
  return true;
}

export async function closeYdbConnection() {
  await global._ydbQueryClient?.destroy();
  await global._ydbDriver?.destroy();
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
  employees: [...auditColumns, 'name Utf8', 'role Utf8', 'point_id Utf8', 'workshop_id Utf8', 'driver_id Utf8', 'phone Utf8', 'email Utf8'],
  slots: [...baseColumns, 'name Utf8', 'deadline_time Utf8', 'delivery_time Utf8', 'description Utf8', 'is_active Utf8'],
  shift_orders: [...baseColumns, 'updated_at Utf8', 'idempotency_key Utf8', 'point_id Utf8', 'point_name Utf8', 'slot_id Utf8', 'date Utf8', 'status Utf8', 'items Utf8', 'created_by Utf8', 'submitted_at Utf8'],
  waybills: [...baseColumns, 'order_id Utf8', 'point_id Utf8', 'point_name Utf8', 'date Utf8', 'slot_id Utf8', 'status Utf8', 'driver_name Utf8', 'driver_id Utf8', 'workshop_id Utf8', 'legal_entity_id Utf8', 'dispatched_by Utf8', 'dispatched_at Utf8', 'received_by Utf8', 'received_at Utf8', 'items Utf8'],
};

export async function ensureYdbSchema() {
  for (const [table, columns] of Object.entries(YDB_TABLE_DEFINITIONS)) {
    await ensureYdbTable(table, columns);
  }
}

export function toYdbRow(input: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [key.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`), typeof value === 'object' && value !== null ? JSON.stringify(value) : value]));
}

function decodeYdbValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function fromYdbRow<T>(row: Record<string, unknown>): T {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()),
    decodeYdbValue(value),
  ])) as T;
}

export { createYdbDriver as createPool };
export const db = { query: executeYql };
