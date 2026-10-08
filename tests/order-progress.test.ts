import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ORDER_STAGES, buildOrderList, deriveOrderProgress, findWaybillForOrder, shortOrderNumber } from '../src/utils/orderProgress.ts';
import { resolveDraftAdoption } from '../src/utils/draftAdoption.ts';

const order = (over: Record<string, unknown> = {}): any => ({
  id: 'ord-1759999999999-ab12c', pointId: 'p1', pointName: 'P', slotId: 'morning', date: '2026-10-05', status: 'submitted',
  items: [{ productId: 'a', quantity: 3 }], createdAt: '2026-10-05T07:00:00.000Z', updatedAt: '2026-10-05T07:00:00.000Z', createdBy: 'x', idempotencyKey: 'k', ...over,
});
const waybill = (over: Record<string, unknown> = {}): any => ({ id: 'WB-1', orderId: 'ord-1759999999999-ab12c', pointId: 'p1', status: 'formed', items: [], ...over });

test('этап заявки: от черновика до приёмки', () => {
  const cases: [any, any, string, number | null][] = [
    [order({ status: 'draft' }), undefined, 'Черновик', null],
    [order({ status: 'submitted' }), undefined, 'Отправлена', 0],
    [order({ status: 'aggregated' }), undefined, 'Принята цехом', 1],
    [order({ status: 'aggregated' }), waybill({ status: 'formed' }), 'Принята цехом', 1],
    [order({ status: 'aggregated' }), waybill({ status: 'packing' }), 'Собирается', 2],
    [order({ status: 'aggregated' }), waybill({ status: 'dispatched' }), 'В пути', 3],
    [order({ status: 'aggregated' }), waybill({ status: 'dispatched', deliveredAt: '2026-10-05T09:00:00.000Z' }), 'Доставлена', 4],
    [order({ status: 'aggregated' }), waybill({ status: 'received' }), 'Принята', 5],
    [order({ status: 'aggregated' }), waybill({ status: 'received_with_discrepancies' }), 'Принята с расхождениями', 5],
  ];
  for (const [o, w, label, stage] of cases) {
    const p = deriveOrderProgress(o, w);
    assert.equal(p.label, label);
    assert.equal(p.stage, stage);
    assert.ok(p.hint.length > 10);
  }
  assert.equal(ORDER_STAGES.length, 6);
});

test('номер заявки: короткий и читаемый', () => {
  assert.equal(shortOrderNumber('ord-1759999999999-ab12c'), 'AB12C');
  assert.equal(shortOrderNumber('x'), 'X');
  assert.equal(findWaybillForOrder({ id: 'o1' }, [{ orderId: 'o2' }, { orderId: 'o1', n: 1 } as any])?.['n' as never], 1);
});

test('список заявок: своя кофейня, черновики и заявки в работе всегда, принятые — только за сегодня, свежие выше', () => {
  const orders = [
    order({ id: 'ord-1-draftold', status: 'draft', date: '2026-10-01', updatedAt: '2026-10-01T08:00:00.000Z', createdAt: '2026-10-01T08:00:00.000Z' }),
    order({ id: 'ord-2-sent', status: 'submitted', submittedAt: '2026-10-05T07:30:00.000Z' }),
    order({ id: 'ord-3-work', status: 'aggregated', date: '2026-10-04', submittedAt: '2026-10-04T07:30:00.000Z' }),
    order({ id: 'ord-4-doneold', status: 'aggregated', date: '2026-10-03', submittedAt: '2026-10-03T07:30:00.000Z' }),
    order({ id: 'ord-5-donetoday', status: 'aggregated', submittedAt: '2026-10-05T06:00:00.000Z' }),
    order({ id: 'ord-6-other', pointId: 'p2', status: 'submitted' }),
  ];
  const waybills = [
    waybill({ orderId: 'ord-3-work', status: 'packing' }),
    waybill({ orderId: 'ord-4-doneold', status: 'received' }),
    waybill({ orderId: 'ord-5-donetoday', status: 'received' }),
  ];
  const list = buildOrderList(orders, waybills, 'p1', '2026-10-05');
  assert.deepEqual(list.map((e) => e.order.id), ['ord-2-sent', 'ord-5-donetoday', 'ord-3-work', 'ord-1-draftold']);
  assert.equal(buildOrderList(orders, waybills, 'p1', '2026-10-05', 2).length, 2);
});

test('подгрузка черновика: ключ берём всегда, позиции — только в нетронутую форму без более свежей локальной копии', () => {
  const draft = { items: [{ productId: 'a', quantity: 5 }, { productId: 'gone', quantity: 1 }], updatedAt: '2026-10-05T10:00:00.000Z', idempotencyKey: 'K1' } as any;
  const base = { draft, productIds: ['a', 'b'] };

  const fresh = resolveDraftAdoption({ ...base, local: null, formUntouched: true });
  assert.equal(fresh.idempotencyKey, 'K1');
  assert.deepEqual(fresh.quantities, { a: 5, b: 0 }); // позиции, которых нет в каталоге, пропущены

  const touched = resolveDraftAdoption({ ...base, local: null, formUntouched: false });
  assert.equal(touched.idempotencyKey, 'K1');
  assert.equal(touched.quantities, undefined); // правки пользователя не затираем

  const localNewer = resolveDraftAdoption({ ...base, local: { quantities: { a: 9 }, savedAt: '2026-10-05T10:05:00.000Z' }, formUntouched: true });
  assert.equal(localNewer.quantities, undefined);
  assert.equal(localNewer.idempotencyKey, 'K1');

  const localOlder = resolveDraftAdoption({ ...base, local: { quantities: { a: 9 }, savedAt: '2026-10-05T09:00:00.000Z' }, formUntouched: true });
  assert.deepEqual(localOlder.quantities, { a: 5, b: 0 });

  const localEmpty = resolveDraftAdoption({ ...base, local: { quantities: { a: 0 }, savedAt: '2026-10-05T11:00:00.000Z' }, formUntouched: true });
  assert.deepEqual(localEmpty.quantities, { a: 5, b: 0 }); // пустая локальная копия не считается «более свежей работой»
});
