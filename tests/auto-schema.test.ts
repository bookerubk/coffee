/** Автомиграция схемы на Vercel: новые колонки появляются при первом запросе, без ручного ydb:schema. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createLegacyTable, installFakeYdb, resetFakeYdb } from './fakeYdb.ts';

process.env.VERCEL = '1';
process.env.AUTH_SECRET = 'test-secret-test-secret-test-secret-123456';
process.env.YDB_ENDPOINT = 'grpcs://fake:2135';
process.env.YDB_DATABASE = '/fake/db';
process.env.YDB_TOKEN = 'fake-token';
installFakeYdb();
const q = await import('../src/db/queries.ts');
const { app } = await import('../server.ts');

let server: Server;
let base = '';
before(() => {
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

test('YDB_AUTO_SCHEMA=true: первый запрос добавляет колонки подтверждения доставки в старую таблицу', async () => {
  resetFakeYdb();
  createLegacyTable('waybills', ['id Utf8', 'account_id Utf8', 'created_at Utf8', 'updated_at Utf8', 'archived Utf8', 'order_id Utf8', 'point_id Utf8', 'point_name Utf8', 'date Utf8', 'slot_id Utf8', 'status Utf8', 'driver_name Utf8', 'driver_id Utf8', 'workshop_id Utf8', 'legal_entity_id Utf8', 'dispatched_by Utf8', 'dispatched_at Utf8', 'received_by Utf8', 'received_at Utf8', 'items Utf8']);
  const waybill = { id: 'WB-1', accountId: 'acc-a', orderId: 'o', pointId: 'p', pointName: 'P', date: '2026-10-01', slotId: 'morning', status: 'dispatched', items: [], deliveredAt: '2026-10-01T09:30:00.000Z' };

  // без автомиграции запись с новой колонкой падает (старая схема)
  await assert.rejects(() => q.upsertWaybillQuery(waybill), /Failed to upsert waybill/);

  process.env.YDB_AUTO_SCHEMA = 'true';
  const res = await fetch(base + '/api/auth/me'); // любой запрос к /api запускает проверку схемы (ответ 401 — вход не нужен)
  assert.equal(res.status, 401);

  await q.upsertWaybillQuery(waybill);
  assert.equal((await q.getWaybillsQuery('acc-a'))[0].deliveredAt, '2026-10-01T09:30:00.000Z');
});

test('публичные /api/health и /api/time не ждут и не зависят от схемы', async () => {
  assert.equal((await fetch(base + '/api/health')).status, 200);
  assert.equal((await fetch(base + '/api/time')).status, 200);
});
