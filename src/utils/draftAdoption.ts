import type { ShiftOrder } from '../types';

export interface LocalDraftSnapshot {
  quantities?: Record<string, number>;
  savedAt?: string;
}

export interface DraftAdoption {
  /** Ключ идемпотентности черновика: отправка по нему превратит черновик в заявку, а не создаст вторую. */
  idempotencyKey?: string;
  /** Количества для формы; undefined — форму не трогаем. */
  quantities?: Record<string, number>;
}

/**
 * Решает, что делать с черновиком, сохранённым на сервере, когда открывается форма заявки.
 *  - Ключ черновика берём всегда.
 *  - Позиции подставляем в форму, только если форма ещё не тронута и локальная копия на устройстве не новее серверной:
 *    несохранённые правки пользователя и более свежий автосохранённый вариант затирать нельзя.
 */
export function resolveDraftAdoption(args: {
  draft: Pick<ShiftOrder, 'items' | 'updatedAt' | 'idempotencyKey'>;
  local: LocalDraftSnapshot | null | undefined;
  formUntouched: boolean;
  productIds: string[];
}): DraftAdoption {
  const { draft, local, formUntouched, productIds } = args;
  const result: DraftAdoption = { idempotencyKey: draft.idempotencyKey || undefined };

  const localHasItems = !!local?.quantities && Object.values(local.quantities).some((q) => q > 0);
  const localIsNewer = localHasItems && !!local?.savedAt && new Date(local.savedAt).getTime() > new Date(draft.updatedAt).getTime();
  if (localIsNewer || !formUntouched) return result;

  const quantities: Record<string, number> = {};
  const known = new Set(productIds);
  productIds.forEach((id) => (quantities[id] = 0));
  draft.items.forEach((it) => {
    if (known.has(it.productId)) quantities[it.productId] = it.quantity; // позиции, которых уже нет в каталоге, пропускаем
  });
  result.quantities = quantities;
  return result;
}
