import { Driver, QueryClient, getCredentialsFromEnv } from 'ydb-sdk';

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
  global._ydbDriver ??= new Driver({ connectionString: connectionString(), authService: getCredentialsFromEnv() });
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
  await executeYql(`CREATE TABLE IF NOT EXISTS \`${table}\` (${columns.map((column) => `${column} Utf8`).join(', ')}, PRIMARY KEY (id));`);
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
  tenantAccounts: 'tenant_accounts', legalEntities: 'legal_entities', workshops: 'workshops', drivers: 'drivers',
  coffeePoints: 'coffee_points', products: 'products', employees: 'employees', slots: 'slots',
  shiftOrders: 'shift_orders', waybills: 'waybills',
} as const;

export const YDB_COLUMNS = [
  'id', 'account_id', 'name', 'description', 'status', 'items', 'created_at', 'updated_at', 'archived',
  'db_schema', 'inn', 'admin_email', 'admin_name', 'short_name', 'kpp', 'ogrn', 'legal_address', 'actual_address',
  'bank_name', 'bik', 'checking_account', 'correspondent_account', 'director_name', 'phone', 'email', 'tax_system',
  'source', 'external_id', 'legal_entity_id', 'address', 'chief_name', 'capacity', 'assigned_workshop_id',
  'vehicle_model', 'license_plate', 'has_refrigerator', 'point_id', 'assigned_employee_ids', 'sku', 'unit', 'category',
  'role', 'workshop_id', 'driver_id', 'deadline_time', 'delivery_time', 'is_active', 'idempotency_key', 'point_name',
  'slot_id', 'date', 'created_by', 'submitted_at', 'order_id', 'driver_name', 'dispatched_by', 'dispatched_at',
  'received_by', 'received_at',
];
export async function ensureYdbSchema() {
  for (const table of Object.values(YDB_TABLES)) await ensureYdbTable(table, YDB_COLUMNS);
}

export function toYdbRow(input: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [key.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`), typeof value === 'object' && value !== null ? JSON.stringify(value) : value]));
}

export function fromYdbRow<T>(row: Record<string, unknown>): T {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()), value])) as T;
}

export { createYdbDriver as createPool };
export const db = { query: executeYql };
