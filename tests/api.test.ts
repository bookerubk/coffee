import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { installFakeYdb, resetFakeYdb } from './fakeYdb.ts';

process.env.VERCEL = '1'; // не запускать startServer (Vite/listen) при импорте
installFakeYdb();
const { ensureYdbSchema } = await import('../src/db/ydb.ts');
const { app } = await import('../server.ts');

let server: Server;
let base = '';

before(async () => {
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => {
  server.close();
});
beforeEach(async () => {
  resetFakeYdb();
  await ensureYdbSchema();
});

async function call(method: string, path: string, body?: unknown, account = 'acc-a') {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-account-id': account },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* не JSON */
  }
  return { status: res.status, json };
}

const item = { productId: 'prod-1', sku: 'S1', name: 'Круассан', unit: 'шт', category: 'Выпечка', quantity: 5 };
const order = (over: Record<string, unknown> = {}) => ({
  idempotencyKey: 'k-' + Math.random(),
  pointId: 'point-1',
  pointName: 'Точка 1',
  slotId: 'morning',
  date: '2026-10-01',
  items: [item],
  createdBy: 'Иван',
  ...over,
});

test('черновик → отправка с тем же ключом превращает черновик в отправленный заказ', async () => {
  const key = 'same-key';
  const draft = await call('POST', '/api/orders', order({ idempotencyKey: key, isDraft: true }));
  assert.equal(draft.json.order.status, 'draft');

  const sent = await call('POST', '/api/orders', order({ idempotencyKey: key, items: [{ ...item, quantity: 9 }] }));
  assert.equal(sent.status, 200);
  assert.equal(sent.json.order.status, 'submitted');
  assert.equal(sent.json.order.id, draft.json.order.id);
  assert.equal(sent.json.order.items[0].quantity, 9);

  const again = await call('POST', '/api/orders', order({ idempotencyKey: key }));
  assert.equal(again.json.isDuplicate, true);

  const list = await call('GET', '/api/orders');
  assert.equal(list.json.length, 1);
  assert.equal(list.json[0].status, 'submitted');
});

test('повторное сохранение черновика обновляет позиции', async () => {
  const key = 'draft-key';
  await call('POST', '/api/orders', order({ idempotencyKey: key, isDraft: true }));
  const second = await call('POST', '/api/orders', order({ idempotencyKey: key, isDraft: true, items: [{ ...item, quantity: 7 }] }));
  assert.equal(second.json.order.items[0].quantity, 7);
  assert.equal((await call('GET', '/api/orders')).json.length, 1);
});

test('валидация заказа: слот, количество, пустая заявка, дата', async () => {
  assert.equal((await call('POST', '/api/orders', order({ slotId: 'night' }))).status, 400);
  assert.equal((await call('POST', '/api/orders', order({ items: [{ ...item, quantity: -1 }] }))).status, 400);
  assert.equal((await call('POST', '/api/orders', order({ items: [{ ...item, quantity: 1.5 }] }))).status, 400);
  assert.equal((await call('POST', '/api/orders', order({ items: [{ ...item, quantity: 0 }] }))).status, 400);
  assert.equal((await call('POST', '/api/orders', order({ date: 'вчера' }))).status, 400);
  assert.equal((await call('POST', '/api/orders', order({ items: undefined }))).status, 400);
});

test('клиент не может перезаписать чужой заказ, передав orderId', async () => {
  const a = await call('POST', '/api/orders', order(), 'acc-a');
  const b = await call('POST', '/api/orders', order({ orderId: a.json.order.id, pointId: 'point-x' }), 'acc-b');
  assert.notEqual(b.json.order.id, a.json.order.id);
  assert.equal((await call('GET', '/api/orders', undefined, 'acc-a')).json[0].pointId, 'point-1');
});

test('генерация накладных: два заказа одной точки/слота/даты → разные накладные, повтор без дублей', async () => {
  await call('POST', '/api/orders', order());
  await call('POST', '/api/orders', order({ items: [{ ...item, quantity: 2 }] }));
  const gen = await call('POST', '/api/waybills/generate', { date: '2026-10-01', slotId: 'morning' });
  assert.equal(gen.status, 200);
  assert.equal(gen.json.length, 2);
  assert.equal(new Set(gen.json.map((w: any) => w.id)).size, 2);

  const again = await call('POST', '/api/waybills/generate', { date: '2026-10-01', slotId: 'morning' });
  assert.equal(again.json.length, 2);
  assert.equal((await call('GET', '/api/waybills')).json.length, 2);
  const orders = (await call('GET', '/api/orders')).json;
  assert.ok(orders.every((o: any) => o.status === 'aggregated'));
});

test('ID накладных не пересекаются между аккаунтами', async () => {
  await call('POST', '/api/orders', order(), 'acc-a');
  await call('POST', '/api/orders', order(), 'acc-b');
  const a = await call('POST', '/api/waybills/generate', { date: '2026-10-01', slotId: 'morning' }, 'acc-a');
  const b = await call('POST', '/api/waybills/generate', { date: '2026-10-01', slotId: 'morning' }, 'acc-b');
  assert.notEqual(a.json[0].id, b.json[0].id);
  assert.equal((await call('GET', '/api/waybills', undefined, 'acc-a')).json.length, 1);
  assert.equal((await call('GET', '/api/waybills', undefined, 'acc-b')).json.length, 1);
});

test('генерация накладных ограничена цехом оператора', async () => {
  await call('POST', '/api/points', { id: 'point-1', name: 'Т1', address: '', assignedWorkshopId: 'ws-1', assignedEmployeeIds: [] });
  await call('POST', '/api/points', { id: 'point-2', name: 'Т2', address: '', assignedWorkshopId: 'ws-2', assignedEmployeeIds: [] });
  await call('POST', '/api/orders', order({ pointId: 'point-1' }));
  await call('POST', '/api/orders', order({ pointId: 'point-2' }));
  const gen = await call('POST', '/api/waybills/generate', { date: '2026-10-01', slotId: 'morning', workshopId: 'ws-1' });
  assert.deepEqual(gen.json.map((w: any) => w.pointId), ['point-1']);
  const orders = (await call('GET', '/api/orders')).json;
  assert.equal(orders.find((o: any) => o.pointId === 'point-2').status, 'submitted');
});

async function makeWaybill() {
  await call('POST', '/api/orders', order());
  const gen = await call('POST', '/api/waybills/generate', { date: '2026-10-01', slotId: 'morning' });
  return gen.json[0];
}

test('отгрузка: валидация, причина расхождения, запрет изменения после приёмки', async () => {
  const wb = await makeWaybill();
  const url = `/api/waybills/${wb.id}/dispatch`;

  assert.equal((await call('PUT', url, { newStatus: 'dispatched' })).status, 400); // нет items
  assert.equal((await call('PUT', url, { items: [], newStatus: 'received' })).status, 400); // чужой статус
  assert.equal((await call('PUT', url, { items: [{ productId: 'prod-1', dispatchedQuantity: -2 }], newStatus: 'dispatched' })).status, 400);
  assert.equal((await call('PUT', url, { items: [{ productId: 'prod-1', dispatchedQuantity: 3 }], newStatus: 'dispatched' })).status, 400); // нет причины

  const ok = await call('PUT', url, { items: [{ productId: 'prod-1', dispatchedQuantity: 3, dispatchDiscrepancyReason: 'не хватило сырья' }], newStatus: 'dispatched', operatorName: 'Оператор' });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.status, 'dispatched');
  assert.equal(ok.json.items[0].receivedQuantity, 3);

  assert.equal((await call('PUT', url, { items: [], newStatus: 'packing' })).status, 409); // назад в сборку нельзя
});

test('исправление отгрузки пересчитывает «принято» по умолчанию', async () => {
  const wb = await makeWaybill();
  const url = `/api/waybills/${wb.id}/dispatch`;
  await call('PUT', url, { items: [{ productId: 'prod-1', dispatchedQuantity: 3, dispatchDiscrepancyReason: 'брак' }], newStatus: 'packing' });
  const fixed = await call('PUT', url, { items: [{ productId: 'prod-1', dispatchedQuantity: 5 }], newStatus: 'dispatched', operatorName: 'О' });
  assert.equal(fixed.json.items[0].dispatchedQuantity, 5);
  assert.equal(fixed.json.items[0].receivedQuantity, 5);
});

test('приёмка: только отгруженную, с причиной расхождения; статус считается по всем позициям', async () => {
  const wb = await makeWaybill();
  const recv = `/api/waybills/${wb.id}/receive`;
  const good = [{ productId: 'prod-1', receivedQuantity: 5 }];

  assert.equal((await call('PUT', recv, { items: good, supervisorName: 'С' })).status, 409); // ещё не отгружена
  await call('PUT', `/api/waybills/${wb.id}/dispatch`, { items: [{ productId: 'prod-1', dispatchedQuantity: 5 }], newStatus: 'dispatched', operatorName: 'О' });

  assert.equal((await call('PUT', recv, { supervisorName: 'С' })).status, 400); // нет items
  assert.equal((await call('PUT', recv, { items: [{ productId: 'prod-1', receivedQuantity: 4 }] })).status, 400); // нет причины
  assert.equal((await call('PUT', recv, { items: [{ productId: 'prod-1', receivedQuantity: 4, receiveDiscrepancyReason: 'придумал' }] })).status, 400);
  assert.equal((await call('PUT', recv, { items: [{ productId: 'prod-1', receivedQuantity: 4, receiveDiscrepancyReason: 'other' }] })).status, 400); // нужен комментарий
  assert.equal((await call('PUT', recv, { items: [{ productId: 'prod-1', receivedQuantity: 4, receiveDiscrepancyReason: 'damaged', receiveDiscrepancyPhoto: 'javascript:alert(1)' }] })).status, 400);

  const done = await call('PUT', recv, { items: [{ productId: 'prod-1', receivedQuantity: 4, receiveDiscrepancyReason: 'damaged' }], supervisorName: 'С' });
  assert.equal(done.status, 200);
  assert.equal(done.json.status, 'received_with_discrepancies');

  assert.equal((await call('PUT', recv, { items: good, supervisorName: 'С' })).status, 409); // повторная приёмка
});

test('водитель может только начать рейс', async () => {
  const wb = await makeWaybill();
  const url = `/api/waybills/${wb.id}/driver-status`;
  assert.equal((await call('PUT', url, { status: 'received' })).status, 400);
  const ok = await call('PUT', url, { status: 'dispatched', driverName: 'Михаил', driverId: 'drv-1' });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.status, 'dispatched');
});

test('заголовок аккаунта сильнее body.accountId', async () => {
  const res = await call('POST', '/api/points', { id: 'p-h', name: 'T', address: '', accountId: 'acc-b', assignedEmployeeIds: [] }, 'acc-a');
  assert.equal(res.status, 200);
  assert.equal((await call('GET', '/api/points', undefined, 'acc-a')).json.length, 1);
  assert.equal((await call('GET', '/api/points', undefined, 'acc-b')).json.length, 0);
});

test('неизвестный /api-маршрут и битый JSON возвращают JSON-ошибки', async () => {
  const nf = await call('GET', '/api/nope');
  assert.equal(nf.status, 404);
  assert.ok(nf.json.error);
  const bad = await call('POST', '/api/orders', '{not json');
  assert.equal(bad.status, 400);
  assert.ok(bad.json.error);
});

test('ID аккаунта валидируется', async () => {
  assert.equal((await call('POST', '/api/accounts', { id: 'плохой id!', name: 'X' })).status, 400);
  assert.equal((await call('POST', '/api/accounts', { id: 'acc-new', name: 'X' })).status, 200);
});
