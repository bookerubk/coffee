/** Клиентский кэш: источник истины — сервер; демо-данных по умолчанию нет. */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { events, installBrowserStubs, resetBrowserStubs } from './client-setup.ts';

installBrowserStubs();
const { StorageManager } = await import('../src/services/storage.ts');

const user = { id: 'u1', name: 'Тест', role: 'admin', accountId: 'acc-a', accountName: 'A', dbSchema: '' } as any;
const order = (id: string, accountId = 'acc-a') => ({ id, accountId, pointId: 'p', pointName: 'P', slotId: 'morning', date: '2026-10-01', status: 'submitted', items: [], createdBy: 'x', createdAt: '', updatedAt: '' }) as any;
const waybill = (id: string, accountId = 'acc-a') => ({ id, accountId, orderId: 'o', pointId: 'p', pointName: 'P', date: '2026-10-01', slotId: 'morning', status: 'formed', items: [], createdAt: '' }) as any;

beforeEach(() => resetBrowserStubs());

test('в пустом кэше нет демо-данных: справочники, заказы и накладные пусты', () => {
  for (const [name, list] of Object.entries({
    points: StorageManager.getPoints(), products: StorageManager.getProducts(), employees: StorageManager.getEmployees(),
    orders: StorageManager.getOrders(), waybills: StorageManager.getWaybills(), legalEntities: StorageManager.getLegalEntities(),
    workshops: StorageManager.getWorkshops(), drivers: StorageManager.getDrivers(), accounts: StorageManager.getTenantAccounts(),
  })) {
    assert.deepEqual(list, [], `${name} должны быть пустыми без данных с сервера`);
  }
  assert.deepEqual(StorageManager.getDiscrepancies(), []);
});

test('настройки смен — единственная конфигурация по умолчанию', () => {
  assert.deepEqual(StorageManager.getSlots().map((s) => s.id).sort(), ['evening', 'morning']);
});

test('данные с сервера ЗАМЕНЯЮТ кэш (удалённые на сервере записи исчезают), чужие аккаунты не трогаются', () => {
  StorageManager.setCurrentUser(user);
  StorageManager.saveOrder(order('old-1'));
  StorageManager.saveOrder(order('other-acc', 'acc-b'));
  StorageManager.replaceOrders([order('new-1')]);
  assert.deepEqual(StorageManager.getOrders().map((o) => o.id), ['new-1']);

  StorageManager.saveWaybill(waybill('wb-old'));
  StorageManager.replaceWaybills([]);
  assert.deepEqual(StorageManager.getWaybills(), []); // сервер вернул пусто — на экране тоже пусто
});

test('фоновое обновление не дёргает экран, если данные не изменились', () => {
  StorageManager.setCurrentUser(user);
  StorageManager.replaceWaybills([waybill('a')]);
  const before = events.filter((e) => e.type === 'coffee-storage-change').length;
  StorageManager.replaceWaybills([waybill('a')]);
  assert.equal(events.filter((e) => e.type === 'coffee-storage-change').length, before);
  StorageManager.replaceWaybills([{ ...waybill('a'), status: 'dispatched' }]);
  assert.equal(events.filter((e) => e.type === 'coffee-storage-change').length, before + 1);
});

test('выход очищает кэш данных компании, но не черновики заявок', () => {
  StorageManager.setCurrentUser(user);
  StorageManager.replaceOrders([order('x')]);
  StorageManager.saveDraft('p', 'morning', { quantities: { a: 1 } });
  StorageManager.logout();
  assert.deepEqual(StorageManager.getOrders(), []);
  assert.equal(StorageManager.getCurrentUser(), null);
  assert.ok(StorageManager.getDraft('p', 'morning'));
});

test('removeOrder убирает только указанную заявку', () => {
  StorageManager.setCurrentUser(user);
  StorageManager.saveOrder(order('keep'));
  StorageManager.saveOrder(order('drop'));
  StorageManager.removeOrder('drop');
  assert.deepEqual(StorageManager.getOrders().map((o) => o.id), ['keep']);
});
