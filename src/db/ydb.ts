import { Driver } from '@ydbjs/core';
import { AccessTokenCredentialsProvider } from '@ydbjs/auth/access-token';
import { query, type QueryClient } from '@ydbjs/query';
import { fromJs } from '@ydbjs/value';

function createYdbCredentialsProvider() {
  const token = process.env.YDB_TOKEN?.trim();
  if (!token) {
    throw new Error('YDB_TOKEN must be configured for the @ydbjs/core driver');
  }
  return new AccessTokenCredentialsProvider({ token });
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
  const resultSets = await request.idempotent(true);
  return resultSets.flat() as T[];
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
