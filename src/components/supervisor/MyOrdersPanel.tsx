import React from 'react';
import { ClipboardList, Pencil, Trash2 } from 'lucide-react';
import type { ShiftOrder, SlotId, Waybill } from '../../types';
import { ORDER_STAGES, shortOrderNumber } from '../../utils/orderProgress';
import type { OrderListEntry, ProgressTone } from '../../utils/orderProgress';

const TONE_CLASSES: Record<ProgressTone, { chip: string; bar: string }> = {
  gray: { chip: 'bg-stone-100 text-stone-700 border-stone-200', bar: 'bg-stone-400' },
  blue: { chip: 'bg-sky-100 text-sky-900 border-sky-200', bar: 'bg-sky-500' },
  amber: { chip: 'bg-amber-100 text-amber-900 border-amber-200', bar: 'bg-amber-500' },
  violet: { chip: 'bg-violet-100 text-violet-900 border-violet-200', bar: 'bg-violet-500' },
  emerald: { chip: 'bg-emerald-100 text-emerald-900 border-emerald-200', bar: 'bg-emerald-500' },
  rose: { chip: 'bg-rose-100 text-rose-900 border-rose-200', bar: 'bg-rose-500' },
};

const SLOT_LABELS: Record<SlotId, string> = { morning: '☀️ Утро', evening: '🌙 Вечер' };

const formatTime = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '');
const formatDate = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });

interface MyOrdersPanelProps {
  entries: OrderListEntry<ShiftOrder, Waybill>[];
  today: string;
  currentSlotId: SlotId;
  highlightOrderId?: string | null;
  /** Открыть слот, к которому относится черновик (форма сама подгрузит черновик). */
  onOpenSlot: (slotId: SlotId) => void;
  onDeleteDraft: (order: ShiftOrder) => void;
  /** Идентификатор записи, над которой сейчас идёт операция. */
  busyOrderId?: string | null;
}

/**
 * «Заявки кофейни»: что уже отправлено, на каком этапе (отправлена → принята цехом → собирается → в пути →
 * доставлена → принята) и где лежат черновики. Раньше после «Отправить заказ» форма просто очищалась,
 * а черновик нигде не был виден.
 */
export const MyOrdersPanel: React.FC<MyOrdersPanelProps> = ({ entries, today, currentSlotId, highlightOrderId, onOpenSlot, onDeleteDraft, busyOrderId }) => (
  <section id="my-orders" className="space-y-3" aria-labelledby="my-orders-heading">
    <div>
      <h3 id="my-orders-heading" className="flex items-center gap-2 text-lg font-bold text-stone-900">
        <ClipboardList className="size-5 text-amber-800" aria-hidden="true" />
        Заявки кофейни
      </h3>
      <p className="text-sm text-stone-500">Здесь видно, на каком этапе каждая заявка, и лежат черновики — до того, как поставка уедет из цеха и будет принята.</p>
    </div>

    {entries.length === 0 ? (
      <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-5 py-8 text-center text-sm text-stone-500">
        Заявок пока нет. Отправленная заявка появится здесь со статусом «Отправлена», черновик — со статусом «Черновик».
      </div>
    ) : (
      <ul className="space-y-2.5">
        {entries.map(({ order, progress }) => {
          const tone = TONE_CLASSES[progress.tone];
          const isDraft = order.status === 'draft';
          const isToday = order.date === today;
          const units = order.items.reduce((sum, it) => sum + it.quantity, 0);
          const isOpenInForm = isDraft && isToday && order.slotId === currentSlotId;
          return (
            <li
              key={order.id}
              data-order-id={order.id}
              className={`rounded-2xl border bg-white p-4 shadow-sm transition-shadow ${highlightOrderId === order.id ? 'border-amber-400 ring-2 ring-amber-300' : 'border-stone-200'}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-stone-900">
                    {isDraft ? 'Черновик' : `Заявка № ${shortOrderNumber(order.id)}`}
                    <span className="ml-2 text-xs font-medium text-stone-500">
                      {SLOT_LABELS[order.slotId]}
                      {!isToday && ` · за ${formatDate(order.date)}`}
                      {` · ${formatTime(isDraft ? order.updatedAt : order.submittedAt || order.createdAt)}`}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-stone-500">
                    {order.items.length} поз. · {units} ед.
                    {isDraft && ' · сохранён, но не отправлен'}
                  </p>
                </div>
                <span className={`shrink-0 rounded-lg border px-2.5 py-1 text-xs font-bold ${tone.chip}`}>{progress.label}</span>
              </div>

              {progress.stage !== null && (
                <div className="mt-3" aria-label={`Этап заявки: ${progress.label}`}>
                  <div className="flex gap-1" role="presentation">
                    {ORDER_STAGES.map((stage, index) => (
                      <span key={stage} title={stage} className={`h-1.5 flex-1 rounded-full ${index <= progress.stage! ? tone.bar : 'bg-stone-200'}`} />
                    ))}
                  </div>
                  <div className="mt-1 hidden justify-between text-[10px] text-stone-400 sm:flex">
                    {ORDER_STAGES.map((stage, index) => (
                      <span key={stage} className={index === progress.stage ? 'font-bold text-stone-700' : ''}>{stage}</span>
                    ))}
                  </div>
                </div>
              )}

              <p className="mt-2 text-xs leading-5 text-stone-600">{progress.hint}</p>

              {isDraft && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {isToday && (
                    isOpenInForm ? (
                      <span className="text-xs font-semibold text-emerald-700">✓ Открыт в форме выше</span>
                    ) : (
                      <button type="button" onClick={() => onOpenSlot(order.slotId)} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800">
                        <Pencil className="size-3.5" aria-hidden="true" />
                        Открыть и продолжить
                      </button>
                    )
                  )}
                  <button
                    type="button"
                    disabled={busyOrderId === order.id}
                    onClick={() => onDeleteDraft(order)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-stone-100 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-rose-50 hover:text-rose-800 disabled:opacity-50"
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    Удалить черновик
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    )}
  </section>
);

export default MyOrdersPanel;
