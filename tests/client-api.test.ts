/** Клиентский слой: блокировка экрана на время записи в БД, таймаут и подтверждение доставки. */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { events, installBrowserStubs, resetBrowserStubs } from './client-setup.ts';

installBrowserStubs();
const { ApiService, withBlockingSave, setRequestTimeoutForTests } = await import('../src/services/api.ts');
const { StorageManager } = await import('../src/services/storage.ts');

const blocking = () => events.filter((e) => e.type === 'coffee-blocking-save').map((e) => e.detail.active);
const realFetch = globalThis.fetch;
let calls: { url: string; init: any }[] = [];

function stubFetch(handler: (url: string, init: any) => Response | Promise<Response>) {
  (globalThis as any).fetch = async (url: string, init: any) => {
    calls.push({ url, init });
    return handler(url, init);
  };
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  resetBrowserStubs();
  calls = [];
  setRequestTimeoutForTests(30_000);
  (globalThis as any).fetch = realFetch;
});

test('withBlockingSave: включает блокировку, снимает её после завершения и при ошибке; вложенные вызовы учитываются', async () => {
  await withBlockingSave('a', async () => {
    await withBlockingSave('b', async () => 1);
    assert.equal(blocking().at(-1), true, 'внешняя запись ещё идёт — блокировка не снята');
  });
  assert.deepEqual(blocking(), [true, true, true, false]);

  events.length = 0;
  await assert.rejects(() => withBlockingSave('c', async () => { throw new Error('сбой'); }), /сбой/);
  assert.deepEqual(blocking(), [true, false]); // после ошибки экран не остаётся заблокированным
});

test('сохранение справочника блокирует экран, пока идёт запрос, и снимает блокировку после ответа', async () => {
  let activeDuringRequest: boolean | undefined;
  stubFetch(() => {
    activeDuringRequest = blocking().at(-1);
    return json(200, { success: true });
  });
  const ok = await ApiService.saveProduct({ id: 'p1', name: 'Кофе', sku: 'S', unit: 'шт', category: 'Кофе', archived: false } as any);
  assert.equal(ok, true);
  assert.equal(activeDuringRequest, true);
  assert.equal(blocking().at(-1), false);
  assert.equal(StorageManager.getProducts().length, 1);
});

test('отказ сервера: блокировка снята, ошибка показана, локально ничего не сохранено', async () => {
  stubFetch(() => json(409, { error: 'Этот email уже используется другим сотрудником.' }));
  const ok = await ApiService.saveEmployee({ id: 'e1', name: 'Анна', role: 'driver', email: 'a@a.ru', password: 'secret-pass-1', archived: false } as any);
  assert.equal(ok, false);
  assert.equal(blocking().at(-1), false);
  assert.deepEqual(StorageManager.getEmployees(), []);
  const err = events.find((e) => e.type === 'coffee-sync-error');
  assert.match(err!.detail.message, /email уже используется/);
});

test('пароль сотрудника уходит на сервер, но не попадает в локальный кэш', async () => {
  stubFetch(() => json(200, { success: true }));
  await ApiService.saveEmployee({ id: 'e1', name: 'Анна', role: 'driver', email: 'a@a.ru', password: 'secret-pass-1', archived: false } as any);
  assert.match(calls[0].init.body, /secret-pass-1/);
  assert.ok(!JSON.stringify(StorageManager.getEmployees()).includes('secret-pass-1'));
  assert.equal(StorageManager.getEmployees()[0].hasPassword, true);
});

test('зависший сервер: запрос обрывается по таймауту, экран разблокируется', async () => {
  setRequestTimeoutForTests(50);
  stubFetch((_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'TimeoutError')));
  }));
  // В Node таймер AbortSignal.timeout не удерживает процесс (в браузере такой проблемы нет) — держим цикл событий сами
  const keepAlive = setInterval(() => {}, 20);
  let ok: boolean;
  try {
    ok = await ApiService.saveProduct({ id: 'p1', name: 'x', sku: 'S', unit: 'шт', category: 'c', archived: false } as any);
  } finally {
    clearInterval(keepAlive);
  }
  assert.equal(ok, false);
  assert.equal(blocking().at(-1), false);
  assert.ok(events.some((e) => e.type === 'coffee-sync-error' && /Нет связи/.test(e.detail.message)));
});

test('подтверждение доставки: блокирует экран, вызывает сервер и обновляет накладную в кэше', async () => {
  StorageManager.setCurrentUser({ id: 'd', name: 'Водитель', role: 'driver', accountId: 'acc-a', accountName: 'A', dbSchema: '' } as any);
  const delivered = { id: 'WB-1', accountId: 'acc-a', pointId: 'p', pointName: 'P', status: 'dispatched', deliveredAt: '2026-10-01T09:30:00.000Z', items: [] };
  stubFetch(() => json(200, delivered));
  const result = await ApiService.confirmDelivery('WB-1');
  assert.equal(calls[0].url, '/api/waybills/WB-1/deliver');
  assert.equal(calls[0].init.method, 'PUT');
  assert.equal(result.deliveredAt, '2026-10-01T09:30:00.000Z');
  assert.equal(StorageManager.getWaybills()[0].deliveredAt, '2026-10-01T09:30:00.000Z');
  assert.deepEqual(blocking(), [true, false]);

  stubFetch(() => json(409, { error: 'Накладная уже принята.' }));
  await assert.rejects(() => ApiService.confirmDelivery('WB-1'), /уже принята/);
  assert.equal(blocking().at(-1), false);
});

test('получение заказов и накладных заменяет кэш данными сервера', async () => {
  StorageManager.setCurrentUser({ id: 'a', name: 'A', role: 'admin', accountId: 'acc-a', accountName: 'A', dbSchema: '' } as any);
  StorageManager.saveWaybill({ id: 'stale', accountId: 'acc-a', pointId: 'p', pointName: 'P', status: 'formed', items: [] } as any);
  stubFetch(() => json(200, [{ id: 'fresh', accountId: 'acc-a', pointId: 'p', pointName: 'P', status: 'formed', items: [] }]));
  await ApiService.getWaybills();
  assert.deepEqual(StorageManager.getWaybills().map((w) => w.id), ['fresh']);
  stubFetch(() => json(200, []));
  await ApiService.getWaybills();
  assert.deepEqual(StorageManager.getWaybills(), []);
  assert.deepEqual(blocking(), []); // чтение данных экран не блокирует
});

test('удаление черновика: DELETE на сервер, экран блокируется, запись исчезает из кэша', async () => {
  StorageManager.setCurrentUser({ id: 's', name: 'Старший', role: 'shift_supervisor', accountId: 'acc-a', accountName: 'A', dbSchema: '' } as any);
  StorageManager.saveOrder({ id: 'ord-1-dr4ft', accountId: 'acc-a', pointId: 'p', pointName: 'P', slotId: 'morning', date: '2026-10-05', status: 'draft', items: [], createdBy: 'x', createdAt: '', updatedAt: '' } as any);
  stubFetch(() => json(200, { success: true }));
  await ApiService.deleteDraftOrder('ord-1-dr4ft');
  assert.equal(calls[0].url, '/api/orders/ord-1-dr4ft');
  assert.equal(calls[0].init.method, 'DELETE');
  assert.deepEqual(StorageManager.getOrders(), []);
  assert.deepEqual(blocking(), [true, false]);
});

test('удаление черновика: «уже нет на сервере» (404) не ошибка, отказ сервера (409) — ошибка и запись остаётся', async () => {
  StorageManager.setCurrentUser({ id: 's', name: 'Старший', role: 'shift_supervisor', accountId: 'acc-a', accountName: 'A', dbSchema: '' } as any);
  const saved = { id: 'ord-2-x', accountId: 'acc-a', pointId: 'p', pointName: 'P', slotId: 'morning', date: '2026-10-05', status: 'draft', items: [], createdBy: 'x', createdAt: '', updatedAt: '' } as any;
  StorageManager.saveOrder(saved);

  stubFetch(() => json(409, { error: 'Удалить можно только черновик. Отправленная заявка уже передана в цех.' }));
  await assert.rejects(() => ApiService.deleteDraftOrder('ord-2-x'), /Удалить можно только черновик/);
  assert.equal(StorageManager.getOrders().length, 1);
  assert.equal(blocking().at(-1), false);

  stubFetch(() => json(404, { error: 'Заявка не найдена.' }));
  await ApiService.deleteDraftOrder('ord-2-x');
  assert.deepEqual(StorageManager.getOrders(), []);
});
