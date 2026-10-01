export type YdbType = 'Utf8' | 'Uint64' | 'Int64' | 'Bool' | 'Json';
export type YdbColumn = { name: string; type: YdbType; table: YdbTable };
// Имя таблицы хранится в служебном поле: у многих таблиц есть колонка `name`,
// и раньше она затирала имя таблицы (запросы уходили в таблицу "[object Object]").
type YdbTable = Record<string, YdbColumn> & { __tableName: string };

const UINT64_COLUMNS = new Set(['capacity']);
const BOOL_COLUMNS = new Set(['archived', 'has_refrigerator', 'is_active']);
const JSON_COLUMNS = new Set(['items', 'assigned_employee_ids']);

function ydbTypeForColumn(column: string): YdbType {
  if (UINT64_COLUMNS.has(column)) return 'Uint64';
  if (BOOL_COLUMNS.has(column)) return 'Bool';
  if (JSON_COLUMNS.has(column)) return 'Json';
  return 'Utf8';
}

function ydbTable(name: string, columns: string[]) {
  const table = { __tableName: name } as YdbTable;
  for (const column of columns) {
    const camel = column.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
    table[camel] = { name: camel, type: ydbTypeForColumn(column), table };
  }
  return table;
}

const common = ['id', 'account_id', 'created_at'];

export const users = ydbTable('users', [...common, 'uid', 'email', 'name', 'role', 'point_id', 'workshop_id', 'driver_id']);
export const tenantAccounts = ydbTable('tenant_accounts', [...common, 'name', 'db_schema', 'inn', 'admin_email', 'admin_name', 'description']);
export const legalEntities = ydbTable('legal_entities', [...common, 'name', 'short_name', 'inn', 'kpp', 'ogrn', 'legal_address', 'actual_address', 'bank_name', 'bik', 'checking_account', 'correspondent_account', 'director_name', 'phone', 'email', 'tax_system', 'source', 'external_id', 'archived']);
export const workshops = ydbTable('workshops', [...common, 'name', 'legal_entity_id', 'address', 'chief_name', 'phone', 'capacity', 'source', 'external_id', 'archived']);
export const drivers = ydbTable('drivers', [...common, 'name', 'phone', 'legal_entity_id', 'assigned_workshop_id', 'vehicle_model', 'license_plate', 'has_refrigerator', 'status', 'archived']);
export const coffeePoints = ydbTable('coffee_points', [...common, 'name', 'address', 'legal_entity_id', 'assigned_workshop_id', 'assigned_employee_ids', 'source', 'external_id', 'archived']);
export const products = ydbTable('products', [...common, 'sku', 'name', 'unit', 'category', 'source', 'external_id', 'archived']);
export const employees = ydbTable('employees', [...common, 'name', 'role', 'point_id', 'workshop_id', 'driver_id', 'phone', 'email', 'archived']);
export const slots = ydbTable('slots', ['id', 'account_id', 'name', 'deadline_time', 'delivery_time', 'description', 'is_active']);
export const shiftOrders = ydbTable('shift_orders', [...common, 'idempotency_key', 'point_id', 'point_name', 'slot_id', 'date', 'status', 'items', 'created_by', 'updated_at', 'submitted_at']);
export const waybills = ydbTable('waybills', [...common, 'order_id', 'point_id', 'point_name', 'date', 'slot_id', 'status', 'driver_name', 'driver_id', 'workshop_id', 'legal_entity_id', 'dispatched_by', 'dispatched_at', 'received_by', 'received_at', 'items']);

export type User = typeof users;
export type TenantAccount = typeof tenantAccounts;
export type LegalEntity = typeof legalEntities;
export type Workshop = typeof workshops;
export type Driver = typeof drivers;
export type CoffeePoint = typeof coffeePoints;
export type Product = typeof products;
export type Employee = typeof employees;
export type Slot = typeof slots;
export type ShiftOrder = typeof shiftOrders;
export type Waybill = typeof waybills;

export const YDB_SCHEMA = {
  users, tenantAccounts, legalEntities, workshops, drivers, coffeePoints,
  products, employees, slots, shiftOrders, waybills,
} as const;
