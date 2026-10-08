/** Список «Заявки кофейни» отрисовывается как задумано: статусы, этапы, действия с черновиком. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MyOrdersPanel } from '../src/components/supervisor/MyOrdersPanel.tsx';
import { buildOrderList } from '../src/utils/orderProgress.ts';

const order = (over: Record<string, unknown>): any => ({
  id: 'ord-1-ab12c', pointId: 'p1', pointName: 'P', slotId: 'morning', date: '2026-10-05', status: 'submitted', idempotencyKey: 'k',
  items: [{ productId: 'a', quantity: 3 }, { productId: 'b', quantity: 4 }], createdAt: '2026-10-05T07:00:00.000Z', updatedAt: '2026-10-05T07:00:00.000Z',
  submittedAt: '2026-10-05T07:00:00.000Z', createdBy: 'x', ...over,
});
const render = (orders: any[], waybills: any[] = [], props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    <MyOrdersPanel entries={buildOrderList(orders, waybills, 'p1', '2026-10-05')} today="2026-10-05" currentSlotId="morning" onOpenSlot={() => {}} onDeleteDraft={() => {}} {...props} />,
  );

test('пустой список объясняет, что здесь появится', () => {
  const html = render([]);
  assert.match(html, /Заявки кофейни/);
  assert.match(html, /Заявок пока нет/);
});

test('отправленная заявка видна со статусом «Отправлена» и номером', () => {
  const html = render([order({})]);
  assert.match(html, /Заявка № AB12C/);
  assert.match(html, />Отправлена</);
  assert.match(html, /2 поз\. · 7 ед\./);
  assert.ok(!/Удалить черновик/.test(html)); // отправленную заявку удалить нельзя
});

test('заявка в сборке показывает «Собирается», а доставленная — подсказку про приёмку', () => {
  const sent = order({ status: 'aggregated' });
  assert.match(render([sent], [{ orderId: sent.id, status: 'packing' }]), />Собирается</);
  const delivered = render([sent], [{ orderId: sent.id, status: 'dispatched', deliveredAt: '2026-10-05T09:00:00.000Z' }]);
  assert.match(delivered, />Доставлена</);
  assert.match(delivered, /Приёмка поставок/);
});

test('черновик: статус, «не отправлен», открыт в форме и удаление', () => {
  const draft = order({ id: 'ord-2-dr4ft', status: 'draft', submittedAt: undefined });
  const inForm = render([draft]);
  assert.match(inForm, />Черновик</);
  assert.match(inForm, /сохранён, но не отправлен/);
  assert.match(inForm, /Открыт в форме выше/);
  assert.match(inForm, /Удалить черновик/);

  const otherSlot = render([order({ id: 'ord-3-ev', status: 'draft', slotId: 'evening' })]);
  assert.match(otherSlot, /Открыть и продолжить/);

  const oldDraft = render([order({ id: 'ord-4-old', status: 'draft', date: '2026-10-01' })]);
  assert.match(oldDraft, /за 01\.10/);
  assert.ok(!/Открыть и продолжить/.test(oldDraft)); // вчерашний черновик можно только удалить
  assert.match(oldDraft, /Удалить черновик/);
});

test('только что отправленная заявка подсвечена', () => {
  const html = render([order({})], [], { highlightOrderId: 'ord-1-ab12c' });
  assert.match(html, /ring-amber-300/);
});
