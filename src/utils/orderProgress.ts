import type { ShiftOrder, Waybill } from '../types';

/**
 * Этап заявки для кофейни: от черновика до приёмки на точке.
 * Заявка сама знает только «черновик / отправлена / в сводном заказе»; дальнейшее видно по её накладной.
 */
export type ProgressTone = 'gray' | 'blue' | 'amber' | 'violet' | 'emerald' | 'rose';

export interface OrderProgress {
  /** Номер этапа 0..5 (для полоски прогресса) или null у черновика. */
  stage: number | null;
  label: string;
  hint: string;
  tone: ProgressTone;
}

export const ORDER_STAGES = ['Отправлена', 'Принята цехом', 'Собирается', 'В пути', 'Доставлена', 'Принята'] as const;

type WaybillProgressFields = Pick<Waybill, 'status' | 'deliveredAt'>;

export function deriveOrderProgress(order: Pick<ShiftOrder, 'status'>, waybill?: WaybillProgressFields | null): OrderProgress {
  if (order.status === 'draft') {
    return { stage: null, label: 'Черновик', hint: 'Не отправлен в цех. Его можно изменить и отправить до дедлайна слота.', tone: 'gray' };
  }
  if (order.status === 'submitted') {
    return { stage: 0, label: 'Отправлена', hint: 'Передана в цех, ждёт формирования накладной. Изменить заявку уже нельзя.', tone: 'blue' };
  }
  // aggregated: заявка включена в сводный заказ цеха — дальше состояние показывает накладная
  switch (waybill?.status) {
    case undefined:
    case 'formed':
      return { stage: 1, label: 'Принята цехом', hint: 'Накладная сформирована, цех готовится к сборке.', tone: 'blue' };
    case 'packing':
      return { stage: 2, label: 'Собирается', hint: 'Цех собирает вашу поставку.', tone: 'amber' };
    case 'dispatched':
      return waybill.deliveredAt
        ? { stage: 4, label: 'Доставлена', hint: 'Водитель подтвердил доставку. Примите поставку в разделе «Приёмка поставок».', tone: 'emerald' }
        : { stage: 3, label: 'В пути', hint: 'Поставка выехала из цеха. Водитель подтвердит доставку по приезде.', tone: 'violet' };
    case 'received':
      return { stage: 5, label: 'Принята', hint: 'Поставка принята на точке.', tone: 'emerald' };
    case 'received_with_discrepancies':
      return { stage: 5, label: 'Принята с расхождениями', hint: 'Поставка принята, при приёмке отмечены расхождения.', tone: 'rose' };
    default:
      return { stage: 1, label: 'Принята цехом', hint: 'Заявка в работе у цеха.', tone: 'blue' };
  }
}

/** Накладная заявки (по одной на заявку). */
export function findWaybillForOrder<T extends { orderId: string }>(order: { id: string }, waybills: T[]): T | undefined {
  return waybills.find((w) => w.orderId === order.id);
}

/** Короткий номер для разговора с цехом: «ord-1759999999999-ab12c» → «AB12C». */
export function shortOrderNumber(orderId: string): string {
  const tail = orderId.split('-').pop() || orderId;
  return tail.slice(-5).toUpperCase();
}

export function isOrderFinished(progress: OrderProgress): boolean {
  return progress.stage === 5;
}

export interface OrderListEntry<O extends ShiftOrder = ShiftOrder, W extends Waybill = Waybill> {
  order: O;
  waybill?: W;
  progress: OrderProgress;
}

/**
 * Что показывать в списке заявок кофейни: черновики и заявки в работе без ограничения по дате
 * (их нельзя «потерять»), плюс принятые за сегодня. Свежие выше.
 */
export function buildOrderList<O extends ShiftOrder, W extends Waybill>(
  orders: O[],
  waybills: W[],
  pointId: string,
  today: string,
  limit = 15,
): OrderListEntry<O, W>[] {
  return orders
    .filter((o) => o.pointId === pointId)
    .map((order) => {
      const waybill = findWaybillForOrder(order, waybills);
      return { order, waybill, progress: deriveOrderProgress(order, waybill) };
    })
    .filter((e) => !isOrderFinished(e.progress) || e.order.date === today)
    .sort((a, b) => (b.order.submittedAt || b.order.updatedAt || b.order.createdAt).localeCompare(a.order.submittedAt || a.order.updatedAt || a.order.createdAt))
    .slice(0, limit);
}
