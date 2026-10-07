import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createLegacyTable, installFakeYdb, resetFakeYdb } from './fakeYdb.ts';

installFakeYdb();
const { ensureYdbSchema } = await import('../src/db/ydb.ts');
const q = await import('../src/db/queries.ts');

before(async () => {
  resetFakeYdb();
  await ensureYdbSchema();
});
beforeEach(async () => {
  resetFakeYdb();
  await ensureYdbSchema();
});

test('точка: массив сотрудников и boolean переживают запись/чтение', async () => {
  await q.upsertPointQuery({ id: 'p1', accountId: 'acc-a', name: 'Точка', address: 'ул. 1', assignedEmployeeIds: ['e1', 'e2'], archived: true });
  const [p] = await q.getPointsQuery('acc-a');
  assert.deepEqual(p.assignedEmployeeIds, ['e1', 'e2']);
  assert.equal(p.archived, true);
});

test('юрлицо: ИНН/КПП/счёт/телефон остаются строками (не превращаются в числа)', async () => {
  await q.upsertLegalEntityQuery({
    id: 'le1', accountId: 'acc-a', name: 'ООО', shortName: 'ООО', inn: '0123456789', kpp: '012345678',
    legalAddress: 'адрес', bik: '044525225', checkingAccount: '40702810900000000001', phone: '89991234567',
  });
  const [le] = await q.getLegalEntitiesQuery('acc-a');
  assert.equal(le.inn, '0123456789');
  assert.equal(le.kpp, '012345678');
  assert.equal(le.checkingAccount, '40702810900000000001');
  assert.equal(le.phone, '89991234567');
});

test('заказ: items — массив, даты — ISO-строки, поиск по idempotencyKey', async () => {
  await q.upsertOrderQuery({
    id: 'o1', accountId: 'acc-a', idempotencyKey: 'k1', pointId: 'p1', pointName: 'Точка', slotId: 'morning',
    date: '2026-10-01', status: 'submitted', items: [{ productId: 'x', quantity: 3 }], createdBy: 'Иван',
  });
  const [o] = await q.getOrdersQuery('acc-a');
  assert.deepEqual(o.items, [{ productId: 'x', quantity: 3 }]);
  assert.match(o.createdAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.ok(o.submittedAt);
  const byKey = await q.findOrderByKeyQuery('k1', 'acc-a');
  assert.equal(byKey?.id, 'o1');
});

test('заказ: повторный upsert обновляет статус, но не затирает createdAt', async () => {
  const base = { id: 'o2', accountId: 'acc-a', pointId: 'p', pointName: 'P', slotId: 'morning', date: '2026-10-01', items: [], createdBy: 'x', createdAt: '2026-10-01T05:00:00.000Z' };
  await q.upsertOrderQuery({ ...base, status: 'submitted' });
  await q.upsertOrderQuery({ ...base, status: 'aggregated', createdAt: '2030-01-01T00:00:00.000Z' });
  const [o] = await q.getOrdersQuery('acc-a');
  assert.equal(o.status, 'aggregated');
  assert.equal(o.createdAt, '2026-10-01T05:00:00.000Z');
});

test('накладная: даты и items читаются корректно', async () => {
  await q.upsertWaybillQuery({
    id: 'WB-1', accountId: 'acc-a', orderId: 'o1', pointId: 'p1', pointName: 'Точка', date: '2026-10-01', slotId: 'morning',
    status: 'dispatched', dispatchedAt: '2026-10-01T06:00:00.000Z', items: [{ productId: 'x', orderedQuantity: 2, dispatchedQuantity: 2 }],
    createdAt: '2026-10-01T05:00:00.000Z',
  });
  const [w] = await q.getWaybillsQuery('acc-a');
  assert.equal(w.dispatchedAt, '2026-10-01T06:00:00.000Z');
  assert.equal(w.items[0].orderedQuantity, 2);
});

test('сотрудник: email сохраняется (нужен для входа)', async () => {
  await q.upsertEmployeeQuery({ id: 'e1', accountId: 'acc-a', name: 'Анна', role: 'admin', email: 'anna@x.ru' });
  const [e] = await q.getEmployeesQuery('acc-a');
  assert.equal(e.email, 'anna@x.ru');
});

test('смены: у разных аккаунтов независимые настройки', async () => {
  await q.upsertSlotQuery({ id: 'morning', accountId: 'acc-a', name: 'Утро A', deadlineTime: '06:00', deliveryTime: '08:00', description: '', isActive: true });
  await q.upsertSlotQuery({ id: 'morning', accountId: 'acc-b', name: 'Утро B', deadlineTime: '09:00', deliveryTime: '11:00', description: '', isActive: true });
  const a = (await q.getSlotsQuery('acc-a')).find((s: any) => s.id === 'morning');
  const b = (await q.getSlotsQuery('acc-b')).find((s: any) => s.id === 'morning');
  assert.equal(a.deadlineTime, '06:00');
  assert.equal(b.deadlineTime, '09:00');
});

test('seed: не затирает правки существующего аккаунта и читается без ошибок', async () => {
  await q.upsertTenantAccountQuery({ id: 'acc-aroma', name: 'Переименовано' });
  await q.seedDatabaseIfEmpty();
  const accounts = await q.getTenantAccountsQuery();
  assert.equal(accounts.find((a: any) => a.id === 'acc-aroma')?.name, 'Переименовано');
  assert.ok((await q.getPointsQuery('acc-aroma')).length > 0);
  assert.ok((await q.getOrdersQuery('acc-aroma')).length > 0);
  assert.ok((await q.getWaybillsQuery('acc-aroma')).length > 0);
});

test('миграция: колонка password_hash добавляется в существующую таблицу employees и сохраняет данные', async () => {
  resetFakeYdb();
  // «Старая» схема без password_hash, в таблице уже есть сотрудник
  createLegacyTable('employees', ['id Utf8', 'account_id Utf8', 'created_at Utf8', 'updated_at Utf8', 'archived Utf8', 'name Utf8', 'role Utf8', 'point_id Utf8', 'workshop_id Utf8', 'driver_id Utf8', 'phone Utf8', 'email Utf8']);
  const { upsertYdbRow } = await import('../src/db/ydb.ts');
  await upsertYdbRow('employees', { id: 'old', account_id: 'acc-a', name: 'Старый', role: 'admin', email: 'old@a.test', archived: 'false' });

  await ensureYdbSchema();
  await ensureYdbSchema(); // повторный запуск безопасен

  await q.setEmployeePasswordHashQuery('old', 'scrypt$1$2$3$a$b');
  const found = await q.findEmployeeAuthByEmailQuery('OLD@a.test');
  assert.equal(found?.id, 'old');
  assert.equal(found?.passwordHash, 'scrypt$1$2$3$a$b');
  assert.equal(found?.name, 'Старый'); // установка пароля не затёрла остальные поля
});

test('аутентификация: пароль не попадает в обычные выборки сотрудников', async () => {
  await q.upsertEmployeeQuery({ id: 'e1', accountId: 'acc-a', name: 'А', role: 'admin', email: 'a@a.test', passwordHash: 'scrypt$secret' });
  const [e] = await q.getEmployeesQuery('acc-a');
  assert.equal(e.hasPassword, true);
  assert.ok(!JSON.stringify(e).includes('scrypt'));
  // Обычное редактирование без passwordHash не стирает пароль
  await q.upsertEmployeeQuery({ id: 'e1', accountId: 'acc-a', name: 'А2', role: 'admin', email: 'a@a.test' });
  assert.equal((await q.getEmployeeAuthByIdQuery('e1'))?.passwordHash, 'scrypt$secret');
});

test('миграция: колонки подтверждения доставки добавляются в существующую таблицу waybills', async () => {
  resetFakeYdb();
  createLegacyTable('waybills', ['id Utf8', 'account_id Utf8', 'created_at Utf8', 'updated_at Utf8', 'archived Utf8', 'order_id Utf8', 'point_id Utf8', 'point_name Utf8', 'date Utf8', 'slot_id Utf8', 'status Utf8', 'driver_name Utf8', 'driver_id Utf8', 'workshop_id Utf8', 'legal_entity_id Utf8', 'dispatched_by Utf8', 'dispatched_at Utf8', 'received_by Utf8', 'received_at Utf8', 'items Utf8']);
  await ensureYdbSchema();
  await ensureYdbSchema(); // повторный запуск безопасен
  await q.upsertWaybillQuery({ id: 'WB-D', accountId: 'acc-a', orderId: 'o', pointId: 'p', pointName: 'P', date: '2026-10-01', slotId: 'morning', status: 'dispatched', items: [], deliveredAt: '2026-10-01T09:30:00.000Z', deliveredBy: 'Водитель' });
  const [w] = await q.getWaybillsQuery('acc-a');
  assert.equal(w.deliveredAt, '2026-10-01T09:30:00.000Z');
  assert.equal(w.deliveredBy, 'Водитель');
  // последующее сохранение (например, приёмка) не стирает подтверждение доставки
  await q.upsertWaybillQuery({ ...w, status: 'received', receivedAt: '2026-10-01T09:40:00.000Z' });
  const [after] = await q.getWaybillsQuery('acc-a');
  assert.equal(after.deliveredAt, '2026-10-01T09:30:00.000Z');
});
