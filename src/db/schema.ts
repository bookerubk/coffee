import { boolean, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

// Users table (mandatory for Cloud SQL + Firebase auth integration)
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID
  email: text('email').notNull(),
  name: text('name'),
  role: text('role').default('shift_supervisor'),
  accountId: text('account_id').default('acc-aroma'),
  pointId: text('point_id'),
  workshopId: text('workshop_id'),
  driverId: text('driver_id'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Tenant Accounts / Organizations (Изолированные базы данных / аккаунты компаний)
export const tenantAccounts = pgTable('tenant_accounts', {
  id: text('id').primaryKey(), // e.g. "acc-aroma", "acc-nordic"
  name: text('name').notNull(),
  dbSchema: text('db_schema').notNull(), // schema / database identifier
  inn: text('inn').notNull().default(''),
  adminEmail: text('admin_email').notNull().default(''),
  adminName: text('admin_name').notNull().default(''),
  description: text('description').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow(),
});

// Legal Entities (Юридические лица)
export const legalEntities = pgTable('legal_entities', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull().default('acc-aroma'),
  name: text('name').notNull(),
  shortName: text('short_name').notNull(),
  inn: text('inn').notNull(),
  kpp: text('kpp').notNull().default(''),
  ogrn: text('ogrn').notNull().default(''),
  legalAddress: text('legal_address').notNull(),
  actualAddress: text('actual_address').notNull().default(''),
  bankName: text('bank_name').notNull().default(''),
  bik: text('bik').notNull().default(''),
  checkingAccount: text('checking_account').notNull().default(''),
  correspondentAccount: text('correspondent_account').notNull().default(''),
  directorName: text('director_name').notNull().default(''),
  phone: text('phone').notNull().default(''),
  email: text('email').notNull().default(''),
  taxSystem: text('tax_system').notNull().default('УСН (Доходы - Расходы)'),
  source: text('source').notNull().default('manual'), // manual | external
  externalId: text('external_id').notNull().default(''),
  archived: boolean('archived').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

// Production Workshops (Производственные цеха и пекарни)
export const workshops = pgTable('workshops', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull().default('acc-aroma'),
  name: text('name').notNull(),
  legalEntityId: text('legal_entity_id').notNull().default(''),
  address: text('address').notNull(),
  chiefName: text('chief_name').notNull().default(''),
  phone: text('phone').notNull().default(''),
  capacity: text('capacity').notNull().default(''),
  source: text('source').notNull().default('manual'), // manual | external
  externalId: text('external_id').notNull().default(''),
  archived: boolean('archived').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

// Delivery Drivers (Водители доставки)
export const drivers = pgTable('drivers', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull().default('acc-aroma'),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  legalEntityId: text('legal_entity_id').notNull().default(''),
  assignedWorkshopId: text('assigned_workshop_id').notNull().default(''),
  vehicleModel: text('vehicle_model').notNull().default(''),
  licensePlate: text('license_plate').notNull().default(''),
  hasRefrigerator: boolean('has_refrigerator').notNull().default(false),
  status: text('status').notNull().default('active'), // active | on_route | day_off
  archived: boolean('archived').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

// Coffee Points (Кофейни сети)
export const coffeePoints = pgTable('coffee_points', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull().default('acc-aroma'),
  name: text('name').notNull(),
  address: text('address').notNull(),
  legalEntityId: text('legal_entity_id').notNull().default(''),
  assignedWorkshopId: text('assigned_workshop_id').notNull().default(''),
  assignedEmployeeIds: text('assigned_employee_ids').notNull().default('[]'),
  source: text('source').notNull().default('manual'), // manual | external
  externalId: text('external_id').notNull().default(''),
  archived: boolean('archived').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

// Products & SKUs (Товары)
export const products = pgTable('products', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull().default('acc-aroma'),
  sku: text('sku').notNull(),
  name: text('name').notNull(),
  unit: text('unit').notNull(),
  category: text('category').notNull(),
  source: text('source').notNull().default('manual'), // manual | external
  externalId: text('external_id').notNull().default(''),
  archived: boolean('archived').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

// Employees (Штат сотрудников)
export const employees = pgTable('employees', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull().default('acc-aroma'),
  name: text('name').notNull(),
  role: text('role').notNull(), // shift_supervisor | production_operator | admin | driver
  pointId: text('point_id'),
  workshopId: text('workshop_id'),
  driverId: text('driver_id'),
  phone: text('phone'),
  archived: boolean('archived').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

// Slots Configuration (Слоты и дедлайны)
export const slots = pgTable('slots', {
  id: text('id').primaryKey(), // morning | evening
  accountId: text('account_id').notNull().default('acc-aroma'),
  name: text('name').notNull(),
  deadlineTime: text('deadline_time').notNull(),
  deliveryTime: text('delivery_time').notNull(),
  description: text('description').notNull(),
  isActive: boolean('is_active').notNull().default(true),
});

// Shift Orders (Заявки смен с Idempotency)
export const shiftOrders = pgTable('shift_orders', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull().default('acc-aroma'),
  idempotencyKey: text('idempotency_key').notNull(),
  pointId: text('point_id').notNull(),
  pointName: text('point_name').notNull(),
  slotId: text('slot_id').notNull(),
  date: text('date').notNull(),
  status: text('status').notNull(), // draft | submitted | aggregated
  items: text('items').notNull(), // JSON serialized OrderItem[]
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  submittedAt: timestamp('submitted_at'),
});

// Waybills (Накладные отгрузки и приёмки)
export const waybills = pgTable('waybills', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull().default('acc-aroma'),
  orderId: text('order_id').notNull(),
  pointId: text('point_id').notNull(),
  pointName: text('point_name').notNull(),
  date: text('date').notNull(),
  slotId: text('slot_id').notNull(),
  status: text('status').notNull(), // formed | packing | dispatched | received | received_with_discrepancies
  driverName: text('driver_name'),
  driverId: text('driver_id'),
  workshopId: text('workshop_id'),
  legalEntityId: text('legal_entity_id'),
  dispatchedBy: text('dispatched_by'),
  dispatchedAt: timestamp('dispatched_at'),
  receivedBy: text('received_by'),
  receivedAt: timestamp('received_at'),
  items: text('items').notNull(), // JSON serialized WaybillItem[]
  createdAt: timestamp('created_at').defaultNow(),
});
