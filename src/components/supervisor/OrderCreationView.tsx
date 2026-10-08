import React, { useState, useEffect, useRef, useMemo, useId } from 'react';
import {
  ProductItem,
  ShiftOrder,
  SlotId,
  SlotConfig,
  SaveState,
  CoffeePoint,
  Waybill,
} from '../../types';
import { StorageManager } from '../../services/storage';
import { ApiService, getSlotDeadlineDetails, getOperationalTimeParts, syncServerTime } from '../../services/api';
import { SavingOverlayModal } from './SavingOverlayModal';
import { useVisualViewport } from '../../hooks/useVisualViewport';
import { MyOrdersPanel } from './MyOrdersPanel';
import { buildOrderList, shortOrderNumber } from '../../utils/orderProgress';
import { resolveDraftAdoption } from '../../utils/draftAdoption';
import {
  Plus,
  Minus,
  Clock,
  AlertCircle,
  Save,
  Send,
  Search,
  CheckCircle,
  DownloadCloud,
  Lock,
  Sparkles,
} from 'lucide-react';

// Верхняя граница количества одной позиции (совпадает с проверкой на сервере)
const MAX_ORDER_QUANTITY = 1_000_000;

interface OrderCreationViewProps {
  currentPoint: CoffeePoint;
  currentSlotId: SlotId;
  onSlotChange: (slot: SlotId) => void;
  supervisorName: string;
}

export const OrderCreationView: React.FC<OrderCreationViewProps> = ({
  currentPoint,
  currentSlotId,
  onSlotChange,
  supervisorName,
}) => {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [selectedCategory, setSelectedCategory] = useState<string>('Все');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const viewport = useVisualViewport(isCatalogOpen);

  // Заявки и накладные кофейни (для списка «Заявки кофейни» и подгрузки черновика)
  const [orders, setOrders] = useState<ShiftOrder[]>(() => StorageManager.getOrders());
  const [waybills, setWaybills] = useState<Waybill[]>(() => StorageManager.getWaybills());
  // Постоянное подтверждение последнего действия — вместо исчезающего через 4 секунды всплывающего окна
  const [lastAction, setLastAction] = useState<{ kind: 'draft' | 'submitted'; orderId: string; at: string } | null>(null);
  const [highlightOrderId, setHighlightOrderId] = useState<string | null>(null);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const adoptedDraftRef = useRef<string>('');

  // Пока каталог открыт, страница под ним не прокручивается
  useEffect(() => {
    if (!isCatalogOpen) return;
    document.body.classList.add('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, [isCatalogOpen]);

  // Critical Section 4.2 State Machine
  const [saveState, setSaveState] = useState<SaveState>('IDLE');
  const [saveErrorMessage, setSaveErrorMessage] = useState<string>('');
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => generateUUID());

  // Auto-save state
  const [lastAutoSavedAt, setLastAutoSavedAt] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);

  // Local backup / restore detection
  const [localBackupData, setLocalBackupData] = useState<any | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: 'info' | 'success' } | null>(null);

  // Timeout controller ref
  const abortControllerRef = useRef<AbortController | null>(null);
  const timeoutIdRef = useRef<any>(null);
  // Что именно пользователь пытался сделать (черновик или отправка) — нужно для «Повторить»
  const lastSubmitIsDraftRef = useRef<boolean>(false);

  // Актуальные значения формы для эффектов (в замыкании эффекта они могут оказаться устаревшими)
  const quantitiesRef = useRef(quantities);
  quantitiesRef.current = quantities;
  const hasUnsavedChangesRef = useRef(hasUnsavedChanges);
  hasUnsavedChangesRef.current = hasUnsavedChanges;

  // Slots state synchronized with storage and API
  const [slots, setSlots] = useState<SlotConfig[]>(() => StorageManager.getSlots());
  const [clockTick, setClockTick] = useState<number>(0);

  // Sync server time and listen to storage updates
  useEffect(() => {
    syncServerTime();
    const handleStorage = () => {
      setSlots(StorageManager.getSlots());
      // Каталог приходит с сервера уже после первой отрисовки — обновляем и его
      setProducts(StorageManager.getProducts().filter((p) => !p.archived));
      setOrders(StorageManager.getOrders());
      setWaybills(StorageManager.getWaybills());
    };
    window.addEventListener('coffee-storage-change', handleStorage);
    const interval = setInterval(() => {
      setClockTick((t) => t + 1);
    }, 1000);
    return () => {
      window.removeEventListener('coffee-storage-change', handleStorage);
      clearInterval(interval);
    };
  }, []);

  const currentSlot = useMemo(() => {
    return slots.find((s) => s.id === currentSlotId) || slots[0];
  }, [slots, currentSlotId]);

  // Real-time server-synced deadline details
  const deadlineDetails = useMemo(() => {
    return getSlotDeadlineDetails(currentSlotId, slots);
  }, [currentSlotId, slots, clockTick]);

  const isDeadlinePassed = deadlineDetails.isPassed;

  // Текущая дата — по операционному часовому поясу (так же, как дата заказа при отправке)
  const todayDate = useMemo(() => getOperationalTimeParts().dateString, [clockTick]);

  // Generate UUID helper
  function generateUUID(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `key-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  // Load products & local backup proposal
  useEffect(() => {
    adoptedDraftRef.current = '';
    const prods = StorageManager.getProducts().filter((p) => !p.archived);
    setProducts(prods);

    // Check if an emergency backup exists from previous failed save
    const backup = StorageManager.getLocalBackup(currentPoint.id, currentSlotId);
    if (backup && backup.items && backup.items.length > 0) {
      setLocalBackupData(backup);
    } else {
      setLocalBackupData(null);
    }

    // Check normal draft
    const draft = StorageManager.getDraft(currentPoint.id, currentSlotId);
    if (draft && draft.quantities) {
      quantitiesRef.current = draft.quantities; // эффект подгрузки серверного черновика читает актуальное значение
      hasUnsavedChangesRef.current = false;
      setQuantities(draft.quantities);
      setLastAutoSavedAt(draft.savedAt ? new Date(draft.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null);
    } else {
      // Initialize with zeros
      const initial: Record<string, number> = {};
      prods.forEach((p) => {
        initial[p.id] = 0;
      });
      quantitiesRef.current = initial;
      hasUnsavedChangesRef.current = false;
      setQuantities(initial);
    }

    // Refresh idempotency key for this fresh order session
    setIdempotencyKey(generateUUID());
  }, [currentPoint.id, currentSlotId]);

  // Черновик, сохранённый на сервере, подгружается в форму при каждом открытии (раньше он нигде не показывался,
  // а при возвращении на экран форма оказывалась пустой, и повторная отправка создавала дубль).
  useEffect(() => {
    const draft = orders.find(
      (o) => o.status === 'draft' && o.pointId === currentPoint.id && o.slotId === currentSlotId && o.date === todayDate,
    );
    if (!draft || products.length === 0) return;
    const stamp = `${draft.id}:${draft.updatedAt}`;
    if (adoptedDraftRef.current === stamp) return;
    adoptedDraftRef.current = stamp;

    const adoption = resolveDraftAdoption({
      draft,
      local: StorageManager.getDraft(currentPoint.id, currentSlotId),
      formUntouched: !hasUnsavedChangesRef.current && Object.values(quantitiesRef.current).every((q) => !q),
      productIds: products.map((p) => p.id),
    });
    // Ключ всегда берём у черновика: отправка по нему превратит его в заявку, а не создаст вторую
    if (adoption.idempotencyKey) setIdempotencyKey(adoption.idempotencyKey);
    if (adoption.quantities) {
      setQuantities(adoption.quantities);
      setLastAutoSavedAt(new Date(draft.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }
  }, [orders, products, currentPoint.id, currentSlotId, todayDate]);

  // Periodic Auto-save every 6 seconds (Section 4.1)
  useEffect(() => {
    if (isDeadlinePassed || saveState !== 'IDLE') return;

    const timer = setInterval(() => {
      if (hasUnsavedChanges) {
        StorageManager.saveDraft(currentPoint.id, currentSlotId, {
          quantities,
          pointId: currentPoint.id,
          slotId: currentSlotId,
        });
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setLastAutoSavedAt(timeStr);
        setHasUnsavedChanges(false);
      }
    }, 6000);

    return () => clearInterval(timer);
  }, [quantities, hasUnsavedChanges, isDeadlinePassed, saveState, currentPoint.id, currentSlotId]);

  // Handle Stepper (+ and -) strictly whole integers >= 0
  const handleQuantityChange = (productId: string, delta: number) => {
    if (isDeadlinePassed || saveState !== 'IDLE') return;

    setQuantities((prev) => {
      const current = prev[productId] || 0;
      const next = Math.min(MAX_ORDER_QUANTITY, Math.max(0, Math.floor(current + delta)));
      return { ...prev, [productId]: next };
    });
    setHasUnsavedChanges(true);
  };

  const handleDirectInput = (productId: string, valStr: string) => {
    if (isDeadlinePassed || saveState !== 'IDLE') return;

    const sanitized = valStr.replace(/\D/g, ''); // strip non-digits
    const val = sanitized === '' ? 0 : parseInt(sanitized, 10);
    setQuantities((prev) => ({
      ...prev,
      [productId]: Math.min(MAX_ORDER_QUANTITY, Math.max(0, val)),
    }));
    setHasUnsavedChanges(true);
  };

  // Repeat Previous Order (Section 4.1)
  const handleRepeatPreviousOrder = async () => {
    if (isDeadlinePassed || saveState !== 'IDLE') return;

    const prevOrder = await ApiService.getPreviousOrder(currentPoint.id);
    if (!prevOrder || !prevOrder.items || prevOrder.items.length === 0) {
      setNotification({
        message: 'Предыдущих подтверждённых заказов для этой точки пока нет.',
        type: 'info',
      });
      setTimeout(() => setNotification(null), 3000);
      return;
    }

    const updated: Record<string, number> = { ...quantities };
    prevOrder.items.forEach((it) => {
      updated[it.productId] = it.quantity;
    });

    setQuantities(updated);
    setHasUnsavedChanges(true);
    setNotification({
      message: `Заказ успешно заполнен по образцу заявки от ${new Date(prevOrder.submittedAt || prevOrder.createdAt).toLocaleDateString('ru-RU')}`,
      type: 'success',
    });
    setTimeout(() => setNotification(null), 4000);
  };

  // Restore local emergency backup
  const handleRestoreLocalBackup = () => {
    if (!localBackupData) return;
    const restored: Record<string, number> = {};
    if (localBackupData.quantities) {
      Object.assign(restored, localBackupData.quantities);
    } else if (localBackupData.items) {
      localBackupData.items.forEach((it: any) => {
        restored[it.productId] = it.quantity;
      });
    }
    setQuantities(restored);
    setHasUnsavedChanges(true);
    setLocalBackupData(null);
    setNotification({
      message: 'Данные из локальной копии успешно восстановлены в форму.',
      type: 'success',
    });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleDismissLocalBackup = () => {
    StorageManager.clearLocalBackup(currentPoint.id, currentSlotId);
    setLocalBackupData(null);
  };

  // Prepare submission payload
  const buildPayloadItems = () => {
    const items = [];
    for (const prod of products) {
      const q = quantities[prod.id] || 0;
      if (q > 0) {
        items.push({
          productId: prod.id,
          sku: prod.sku,
          name: prod.name,
          unit: prod.unit,
          category: prod.category,
          quantity: q,
        });
      }
    }
    return items;
  };

  // Section 4.2: Critical Save / Submit Handler
  const executeSubmission = async (isDraft: boolean) => {
    lastSubmitIsDraftRef.current = isDraft;
    // 1. Immediately (synchronously, before await) activate blocking overlay & disable buttons
    setSaveState('SAVING');
    setSaveErrorMessage('');

    // Abort controller with strict 12s timeout (within required 10-15s window)
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Guaranteed timeout safeguard
    timeoutIdRef.current = setTimeout(() => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    }, 12000);

    const payloadItems = buildPayloadItems();
    // Дата заказа — по операционному часовому поясу (МСК), а не по UTC и часам устройства:
    // ночью (00:00–03:00 МСК) UTC-дата ещё «вчерашняя», и вечерние заявки попадали не в тот день.
    const today = getOperationalTimeParts().dateString;

    try {
      const response = await ApiService.submitOrder(
        {
          idempotencyKey, // same UUID reused on retry!
          pointId: currentPoint.id,
          pointName: currentPoint.name,
          slotId: currentSlotId,
          date: today,
          items: payloadItems,
          createdBy: supervisorName,
          isDraft,
        },
        controller.signal
      );

      clearTimeout(timeoutIdRef.current);

      if (response.success) {
        const saved = response.order;
        setSaveState('SUCCESS');
        setHasUnsavedChanges(false);
        setLastAction({ kind: isDraft ? 'draft' : 'submitted', orderId: saved.id, at: new Date().toISOString() });
        setHighlightOrderId(saved.id);
        setTimeout(() => setHighlightOrderId((cur) => (cur === saved.id ? null : cur)), 8000);

        if (isDraft) {
          // Форма остаётся заполненной; локальная копия совпадает с серверной, ключ — как у черновика
          StorageManager.saveDraft(currentPoint.id, currentSlotId, { quantities, pointId: currentPoint.id, slotId: currentSlotId });
          if (saved.idempotencyKey) setIdempotencyKey(saved.idempotencyKey);
        }

        // Success: green check animation for 1.2s -> then reset the form (только после отправки)
        setTimeout(() => {
          setSaveState('IDLE');
          if (!isDraft) {
            const reset: Record<string, number> = {};
            products.forEach((p) => (reset[p.id] = 0));
            setQuantities(reset);
            setIdempotencyKey(generateUUID());
            // Показываем заявку в списке со статусом, а не оставляем «пустую форму»
            document.getElementById('my-orders')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 1200);
      }
    } catch (err: any) {
      clearTimeout(timeoutIdRef.current);
      console.error('Submission failed:', err);
      // Force error state and unblock user interaction within modal
      setSaveState('ERROR');
      setSaveErrorMessage(err.message || 'Ошибка сети при обращении к серверу. Проверьте соединение.');
    }
  };

  // Action: Retry with SAME idempotency key (Section 4.2)
  const handleRetry = () => {
    // Раньше «Повторить» после неудачного сохранения черновика отправляла заявку как финальную
    executeSubmission(lastSubmitIsDraftRef.current);
  };

  // Action: Save locally to localStorage (Section 4.2)
  const handleSaveLocally = () => {
    const payloadItems = buildPayloadItems();
    const saved = StorageManager.saveLocalBackup(currentPoint.id, currentSlotId, {
      idempotencyKey,
      pointId: currentPoint.id,
      slotId: currentSlotId,
      quantities,
      items: payloadItems,
    });
    setSaveState('IDLE');
    setNotification({
      message: saved
        ? 'Заявка сохранена в локальное хранилище браузера. Вы сможете отправить её, когда восстановится связь.'
        : 'Не удалось сохранить заявку в браузере (хранилище недоступно или переполнено). Не закрывайте страницу и повторите отправку.',
      type: 'info',
    });
    setTimeout(() => setNotification(null), 5000);
  };

  // Список «Заявки кофейни»: черновики и заявки в работе, с этапом каждой
  const orderEntries = useMemo(
    () => buildOrderList(orders, waybills, currentPoint.id, todayDate),
    [orders, waybills, currentPoint.id, todayDate],
  );

  const handleDeleteDraft = async (order: ShiftOrder) => {
    if (!window.confirm('Удалить черновик? Это действие нельзя отменить.')) return;
    setBusyOrderId(order.id);
    try {
      await ApiService.deleteDraftOrder(order.id);
      if (order.slotId === currentSlotId && order.date === todayDate) {
        // Это был черновик из открытой формы — очищаем и её, чтобы удалённое не «воскресло» при сохранении
        const cleared: Record<string, number> = {};
        products.forEach((p) => (cleared[p.id] = 0));
        setQuantities(cleared);
        setHasUnsavedChanges(false);
        setLastAutoSavedAt(null);
        StorageManager.clearDraft(currentPoint.id, currentSlotId);
        setIdempotencyKey(generateUUID());
        setLastAction(null);
      }
    } catch (err: any) {
      setNotification({ message: err?.message || 'Не удалось удалить черновик.', type: 'info' });
      setTimeout(() => setNotification(null), 4000);
    } finally {
      setBusyOrderId(null);
    }
  };

  // Categories list
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => set.add(p.category));
    return ['Все', ...Array.from(set)];
  }, [products]);

  // Filtered products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchCat = selectedCategory === 'Все' || p.category === selectedCategory;
      const matchSearch =
        searchQuery.trim() === '' ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [products, selectedCategory, searchQuery]);

  // Order summary metrics
  const totalPositions = useMemo(() => {
    return Object.values(quantities).filter((q) => q > 0).length;
  }, [quantities]);

  const totalItemsCount = useMemo(() => {
    return Object.values(quantities).reduce((acc, q) => acc + q, 0);
  }, [quantities]);

  return (
    <div className="space-y-6 pb-28">
      {/* Saving Overlay (Synchronous, Section 4.2) */}
      <SavingOverlayModal
        state={saveState}
        errorMessage={saveErrorMessage}
        onRetry={handleRetry}
        onSaveLocally={handleSaveLocally}
        onCloseError={() => setSaveState('IDLE')}
      />

      {/* Floating Notification */}
      {notification && (
        <div className="fixed top-20 right-4 z-40 max-w-md animate-in slide-in-from-top-4 duration-300">
          <div
            className={`p-4 rounded-xl shadow-xl border flex items-start gap-3 ${
              notification.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                : 'bg-amber-50 border-amber-200 text-amber-950'
            }`}
          >
            {notification.type === 'success' ? (
              <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            )}
            <p className="text-sm font-medium">{notification.message}</p>
          </div>
        </div>
      )}

      {/* Emergency Local Backup Proposal (Section 4.2) */}
      {localBackupData && (
        <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-amber-200/80 rounded-xl text-amber-800 shrink-0">
              <DownloadCloud className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-semibold text-amber-950 text-sm">
                Обнаружен сохранённый на устройстве черновик
              </h4>
              <p className="text-xs text-amber-800 mt-0.5">
                Копия от {new Date(localBackupData.backupAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.
                Вы можете восстановить заполненные позиции или сбросить их.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleRestoreLocalBackup}
              className="px-3.5 py-1.5 bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              Восстановить
            </button>
            <button
              onClick={handleDismissLocalBackup}
              className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-medium rounded-lg transition-colors cursor-pointer"
            >
              Удалить копию
            </button>
          </div>
        </div>
      )}

      {/* Slot Selector & Deadline Header */}
      <div className="bg-white rounded-2xl p-5 border border-stone-200 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md">
                {currentPoint.name}
              </span>
              <span className="text-xs text-stone-500">Смена: {supervisorName}</span>
            </div>
            <h2 className="text-xl font-bold text-stone-900 mt-1">Формирование заявки</h2>
          </div>

          {/* Slot Toggle: Утро / Вечер */}
          <div className="flex items-center p-1 bg-stone-100 rounded-xl w-full sm:w-auto">
            {slots.map((s) => (
              <button
                key={s.id}
                onClick={() => onSlotChange(s.id)}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-lg transition-all cursor-pointer ${
                  currentSlotId === s.id
                    ? 'bg-white text-stone-900 shadow-sm font-semibold'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <span>{s.id === 'morning' ? '☀️ Утро' : '🌙 Вечер'}</span>
                <span className="text-[11px] sm:text-xs text-stone-400">до {s.deadlineTime}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Slot Deadline Info & Alert */}
        <div
          className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border text-sm transition-all ${
            isDeadlinePassed
              ? 'bg-rose-50 border-rose-200 text-rose-950'
              : 'bg-stone-50 border-stone-200 text-stone-800'
          }`}
        >
          <div className="flex items-center gap-3">
            {isDeadlinePassed ? (
              <div className="w-8 h-8 rounded-lg bg-rose-100 flex items-center justify-center text-rose-700 shrink-0">
                <Lock className="w-4 h-4" />
              </div>
            ) : (
              <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-800 shrink-0">
                <Clock className="w-4 h-4" />
              </div>
            )}
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-xs sm:text-sm">
                  {isDeadlinePassed ? 'Дедлайн слота истёк' : `Дедлайн приёма: ${deadlineDetails.deadlineTime}`}
                </span>
                <span className="text-xs text-stone-500 font-normal">
                  (план доставки: {deadlineDetails.deliveryTime})
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-stone-500 mt-0.5">
                <span>🕒 Время сервера: <strong>{deadlineDetails.serverTimeFormatted}</strong></span>
                <span className="px-1.5 py-0.2 bg-stone-200 text-stone-700 rounded text-[10px] font-medium">
                  {deadlineDetails.timezoneLabel}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:items-end gap-1 text-xs">
            {isDeadlinePassed ? (
              <div className="flex flex-col sm:items-end">
                <span className="font-bold text-rose-700">Заявка заблокирована для редактирования</span>
                {deadlineDetails.isSimulated ? (
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[11px] text-amber-800 bg-amber-100 px-2 py-0.5 rounded font-medium">
                      Включена симуляция в DevToolbar
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        StorageManager.setForceDeadlinePassed(false);
                        setClockTick((t) => t + 1);
                      }}
                      className="text-[11px] text-rose-800 underline hover:text-rose-950 font-semibold cursor-pointer"
                    >
                      Снять блокировку
                    </button>
                  </div>
                ) : (
                  <span className="text-[11px] text-rose-600">
                    Истёк в {deadlineDetails.deadlineTime} ({deadlineDetails.timezoneLabel})
                  </span>
                )}
              </div>
            ) : (
              <div className="flex flex-col sm:items-end">
                <div className="flex items-center gap-1.5 text-emerald-800 font-semibold">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>Приём заказов открыт</span>
                </div>
                <span className="text-[11px] text-stone-500">
                  Осталось: <strong className="text-amber-800">{deadlineDetails.remainingText}</strong>
                </span>
              </div>
            )}
          </div>
        </div>

        {lastAutoSavedAt && (
          <p className="border-t border-stone-100 pt-3 text-sm text-stone-500">
            Автосохранено на этом устройстве в {lastAutoSavedAt}. На сервер черновик попадает по кнопке «Сохранить черновик».
          </p>
        )}
      </div>

      {/* Подтверждение последнего действия: остаётся на экране, пока его не закроют */}
      {lastAction && (
        <div
          role="status"
          className={`flex items-start justify-between gap-3 rounded-2xl border p-4 ${
            lastAction.kind === 'submitted' ? 'border-emerald-300 bg-emerald-50 text-emerald-950' : 'border-sky-300 bg-sky-50 text-sky-950'
          }`}
        >
          <div className="min-w-0 text-sm leading-6">
            {lastAction.kind === 'submitted' ? (
              <>
                <p className="font-bold">
                  ✅ Заявка № {shortOrderNumber(lastAction.orderId)} отправлена в цех в{' '}
                  {new Date(lastAction.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                </p>
                <p>
                  Статус: «Отправлена». Дальше он будет меняться сам: «Принята цехом» → «Собирается» → «В пути» → «Доставлена» → «Принята».
                  Следите за ним в списке{' '}
                  <a href="#my-orders" onClick={(e) => { e.preventDefault(); document.getElementById('my-orders')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} className="font-semibold underline">«Заявки кофейни»</a>.
                </p>
              </>
            ) : (
              <>
                <p className="font-bold">
                  💾 Черновик сохранён в {new Date(lastAction.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                </p>
                <p>
                  В цех он ещё <strong>не отправлен</strong>. Форма осталась заполненной, а черновик лежит в списке{' '}
                  <a href="#my-orders" onClick={(e) => { e.preventDefault(); document.getElementById('my-orders')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} className="font-semibold underline">«Заявки кофейни»</a>{' '}
                  ниже — его можно открыть позже. Когда будете готовы, нажмите «Отправить заказ».
                </p>
              </>
            )}
          </div>
          <button type="button" onClick={() => setLastAction(null)} className="shrink-0 rounded-lg p-1.5 text-current opacity-60 hover:opacity-100" aria-label="Закрыть сообщение">✕</button>
        </div>
      )}

      <section className="space-y-3" aria-labelledby="order-items-heading">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 id="order-items-heading" className="text-lg font-bold text-stone-900">Номенклатура заказа</h3>
            <p className="text-sm text-stone-500">Добавьте только нужные позиции, чтобы сформировать заявку.</p>
          </div>
          <button
            type="button"
            onClick={() => setIsCatalogOpen(true)}
            disabled={isDeadlinePassed || saveState !== 'IDLE'}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-700 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-800 disabled:pointer-events-none disabled:opacity-40"
          >
            <Plus className="w-4 h-4" />
            Добавить номенклатуру
          </button>
        </div>

        {totalPositions === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-5 py-10 text-center text-sm text-stone-500">
            В заказе пока нет позиций. Нажмите «Добавить номенклатуру».
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {products.filter((product) => (quantities[product.id] || 0) > 0).map((product) => {
              const qty = quantities[product.id] || 0;
              return (
                <div key={product.id} className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-stone-900 truncate">{product.name}</p>
                    <p className="mt-1 text-xs text-stone-500">{product.sku} · {product.unit}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button type="button" onClick={() => handleQuantityChange(product.id, -1)} className="flex size-9 items-center justify-center rounded-lg bg-white text-stone-700 shadow-sm" aria-label={`Уменьшить ${product.name}`}><Minus className="w-4 h-4" /></button>
                    <span className="min-w-10 text-center text-base font-bold text-amber-950">{qty}</span>
                    <button type="button" onClick={() => handleQuantityChange(product.id, 1)} className="flex size-9 items-center justify-center rounded-lg bg-amber-600 text-white shadow-sm" aria-label={`Увеличить ${product.name}`}><Plus className="w-4 h-4" /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <MyOrdersPanel
        entries={orderEntries}
        today={todayDate}
        currentSlotId={currentSlotId}
        highlightOrderId={highlightOrderId}
        onOpenSlot={onSlotChange}
        onDeleteDraft={handleDeleteDraft}
        busyOrderId={busyOrderId}
      />

      {isCatalogOpen && (
        <div
          className="fixed inset-x-0 top-[var(--vv-top)] z-50 flex h-[var(--vv-height)] justify-center bg-stone-950/45 sm:inset-0 sm:top-0 sm:h-auto sm:items-center sm:p-6"
          style={{ '--vv-top': `${viewport.offsetTop}px`, '--vv-height': `${viewport.height}px` } as React.CSSProperties}
          role="dialog"
          aria-modal="true"
          aria-labelledby="catalog-title"
        >
          {/* На телефоне окно занимает всю ВИДИМУЮ область (клавиатура её уменьшает, а не перекрывает) */}
          <div className="flex h-full w-full max-w-3xl flex-col bg-stone-50 shadow-2xl sm:h-auto sm:max-h-[90vh] sm:rounded-2xl">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-stone-200 bg-white px-4 py-3 sm:px-5 sm:py-4">
              <div className="min-w-0">
                <h2 id="catalog-title" className="text-base font-bold text-stone-900 sm:text-lg">Выберите номенклатуру</h2>
                {!viewport.keyboardOpen && <p className="text-xs text-stone-500 sm:text-sm">Количество можно изменить после добавления.</p>}
              </div>
              <button type="button" onClick={() => setIsCatalogOpen(false)} className="shrink-0 rounded-lg bg-stone-100 px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-200">Готово</button>
            </div>

            {/* Поиск и категории закреплены вверху и не прокручиваются вместе со списком */}
            <div className="shrink-0 space-y-2 border-b border-stone-200 bg-white px-4 py-3 shadow-sm sm:px-5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} // «Поиск» на клавиатуре убирает её, и виден весь список
                  enterKeyHint="search"
                  autoComplete="off"
                  placeholder="Поиск по названию или SKU"
                  className="w-full rounded-lg border border-stone-200 bg-stone-50 py-2.5 pl-9 pr-3 text-base outline-none focus:ring-2 focus:ring-amber-600 sm:text-sm"
                />
              </div>
              <div className="flex gap-2 overflow-x-auto pb-0.5">
                {categories.map((cat) => <button key={cat} type="button" onClick={() => setSelectedCategory(cat)} className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium ${selectedCategory === cat ? 'bg-amber-800 text-white' : 'bg-white text-stone-600 border border-stone-200'}`}>{cat}</button>)}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5">
              {filteredProducts.length === 0 ? (
                <p className="py-8 text-center text-sm text-stone-500">
                  {products.length === 0 ? 'В справочнике пока нет номенклатуры. Её добавляет администратор.' : 'Ничего не найдено. Измените запрос или категорию.'}
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {filteredProducts.map((product) => <button key={product.id} type="button" onClick={() => { if (!(quantities[product.id] || 0)) handleQuantityChange(product.id, 1); }} className={`flex items-center justify-between gap-3 rounded-xl border p-4 text-left transition-colors ${quantities[product.id] ? 'border-amber-300 bg-amber-50' : 'border-stone-200 bg-white hover:border-amber-300'}`}><span className="min-w-0"><span className="block font-semibold text-stone-900">{product.name}</span><span className="mt-1 block text-xs text-stone-500">{product.sku} · {product.unit}</span></span><span className="shrink-0 text-sm font-bold text-amber-800">{quantities[product.id] ? 'Добавлено' : 'Добавить'}</span></button>)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sticky Bottom Order Summary & Submission Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-stone-200 shadow-lg px-4 py-3">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Summary counts */}
          <div className="flex items-center gap-4">
            <div>
              <div className="text-[11px] text-stone-500 uppercase tracking-wider font-semibold">Итого к заказу</div>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-extrabold text-stone-900">{totalItemsCount}</span>
                <span className="text-xs text-stone-500">ед. ({totalPositions} позиций)</span>
              </div>
            </div>
            <div className="hidden md:block h-8 w-px bg-stone-200"></div>
            <div className="hidden md:flex flex-col text-xs text-stone-500">
              <span>Слот: <b>{currentSlot.name}</b></span>
              <span>Точка: <b>{currentPoint.name}</b></span>
            </div>
          </div>

          {/* Action buttons with synchronous button lock on first tap (Section 4.2) */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isDeadlinePassed || totalPositions === 0 || saveState !== 'IDLE'}
              onClick={() => executeSubmission(true)}
              className="flex-1 sm:flex-none px-4 py-2.5 bg-stone-100 hover:bg-stone-200 active:bg-stone-300 disabled:opacity-40 disabled:pointer-events-none text-stone-700 font-medium text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Save className="w-4 h-4 text-stone-500" />
              <span>Сохранить черновик</span>
            </button>

            <button
              type="button"
              disabled={isDeadlinePassed || totalPositions === 0 || saveState !== 'IDLE'}
              onClick={() => executeSubmission(false)}
              className="flex-1 sm:flex-none px-6 py-2.5 bg-amber-700 hover:bg-amber-800 active:bg-amber-900 disabled:opacity-40 disabled:pointer-events-none text-white font-semibold text-sm rounded-xl shadow-md hover:shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>Отправить заказ</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
