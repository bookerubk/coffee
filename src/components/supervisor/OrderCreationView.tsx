import React, { useState, useEffect, useRef, useMemo, useId } from 'react';
import {
  ProductItem,
  ShiftOrder,
  SlotId,
  SlotConfig,
  SaveState,
  CoffeePoint,
} from '../../types';
import { StorageManager } from '../../services/storage';
import { ApiService, isSlotDeadlinePassed, getSlotDeadlineDetails, syncServerTime } from '../../services/api';
import { SavingOverlayModal } from './SavingOverlayModal';
import {
  Plus,
  Minus,
  RotateCcw,
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

  // Slots state synchronized with storage and API
  const [slots, setSlots] = useState<SlotConfig[]>(() => StorageManager.getSlots());
  const [clockTick, setClockTick] = useState<number>(0);

  // Sync server time and listen to storage updates
  useEffect(() => {
    syncServerTime();
    const handleStorage = () => {
      setSlots(StorageManager.getSlots());
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

  // Generate UUID helper
  function generateUUID(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `key-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  // Load products & local backup proposal
  useEffect(() => {
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
      setQuantities(draft.quantities);
      setLastAutoSavedAt(draft.savedAt ? new Date(draft.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null);
    } else {
      // Initialize with zeros
      const initial: Record<string, number> = {};
      prods.forEach((p) => {
        initial[p.id] = 0;
      });
      setQuantities(initial);
    }

    // Refresh idempotency key for this fresh order session
    setIdempotencyKey(generateUUID());
  }, [currentPoint.id, currentSlotId]);

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
      const next = Math.max(0, Math.floor(current + delta));
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
      [productId]: Math.max(0, val),
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
    const today = new Date().toISOString().split('T')[0];

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
        setSaveState('SUCCESS');
        setHasUnsavedChanges(false);

        // Success: green check animation for 1.2s -> then reset or notify
        setTimeout(() => {
          setSaveState('IDLE');
          if (!isDraft) {
            // Reset form quantities and generate fresh idempotency key
            const reset: Record<string, number> = {};
            products.forEach((p) => (reset[p.id] = 0));
            setQuantities(reset);
            setIdempotencyKey(generateUUID());
            setNotification({
              message: 'Заказ успешно отправлен на производство! Накладная появится в разделе отгрузок.',
              type: 'success',
            });
          } else {
            setNotification({
              message: 'Черновик надёжно сохранён в базе данных.',
              type: 'success',
            });
          }
          setTimeout(() => setNotification(null), 4000);
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
    executeSubmission(false);
  };

  // Action: Save locally to localStorage (Section 4.2)
  const handleSaveLocally = () => {
    const payloadItems = buildPayloadItems();
    StorageManager.saveLocalBackup(currentPoint.id, currentSlotId, {
      idempotencyKey,
      pointId: currentPoint.id,
      slotId: currentSlotId,
      quantities,
      items: payloadItems,
    });
    setSaveState('IDLE');
    setNotification({
      message: 'Заявка сохранена в локальное хранилище браузера. Вы сможете отправить её, когда восстановится связь.',
      type: 'info',
    });
    setTimeout(() => setNotification(null), 5000);
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

        {/* Quick Toolbar: Repeat Last Order & Autosave Indicator */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-stone-100">
          <button
            type="button"
            disabled={isDeadlinePassed || saveState !== 'IDLE'}
            onClick={handleRepeatPreviousOrder}
            className="flex items-center gap-2 px-3 py-1.5 bg-stone-100 hover:bg-stone-200 active:bg-stone-300 disabled:opacity-50 disabled:pointer-events-none text-stone-800 text-xs font-medium rounded-lg transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-stone-600" />
            <span>Повторить прошлый заказ</span>
          </button>

          <div className="flex items-center gap-3 text-xs text-stone-500">
            {lastAutoSavedAt && (
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>Черновик автосохранён в {lastAutoSavedAt}</span>
              </div>
            )}
            <span className="text-stone-300">|</span>
            <span className="font-mono text-[11px] text-stone-400">Ключ: {idempotencyKey.slice(0, 10)}…</span>
          </div>
        </div>
      </div>

      {/* Catalog Filtering & Search */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 max-w-full">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`shrink-0 whitespace-nowrap px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-amber-800 text-white shadow-sm'
                    : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-64 shrink-0">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Поиск по названию или SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-white border border-stone-200 rounded-lg text-xs placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent"
            />
          </div>
        </div>

        {/* Catalog Items Grid (Card with Stepper + / - per Section 4.1) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredProducts.map((product) => {
            const qty = quantities[product.id] || 0;
            const isSelected = qty > 0;

            return (
              <div
                key={product.id}
                className={`p-4 rounded-xl border transition-all flex flex-col justify-between ${
                  isSelected
                    ? 'bg-amber-50/50 border-amber-300 shadow-sm'
                    : 'bg-white border-stone-200 hover:border-stone-300'
                } ${isDeadlinePassed ? 'opacity-70' : ''}`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[11px] font-mono font-medium text-stone-400 uppercase">
                      {product.sku}
                    </span>
                    <span className="text-[11px] px-2 py-0.5 bg-stone-100 text-stone-600 rounded-md font-medium">
                      {product.unit}
                    </span>
                  </div>
                  <h3 className="font-semibold text-stone-900 text-sm mt-1 leading-snug">
                    {product.name}
                  </h3>
                  <p className="text-[11px] text-stone-500 mt-0.5">{product.category}</p>
                </div>

                {/* Stepper (+ / -) Section 4.1: Strictly no dropdowns, whole non-negative integers */}
                <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between">
                  <span className="text-xs text-stone-500 font-medium">Заказ:</span>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={isDeadlinePassed || qty <= 0 || saveState !== 'IDLE'}
                      onClick={() => handleQuantityChange(product.id, -1)}
                      className="w-8 h-8 rounded-lg bg-stone-100 hover:bg-stone-200 active:bg-stone-300 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center text-stone-700 transition-colors cursor-pointer"
                      title="Уменьшить на 1"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>

                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      disabled={isDeadlinePassed || saveState !== 'IDLE'}
                      value={qty}
                      onChange={(e) => handleDirectInput(product.id, e.target.value)}
                      className={`w-14 h-8 text-center font-bold text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-amber-600 ${
                        isSelected
                          ? 'border-amber-400 bg-white text-amber-950 ring-1 ring-amber-300'
                          : 'border-stone-200 bg-stone-50 text-stone-700'
                      }`}
                    />

                    <button
                      type="button"
                      disabled={isDeadlinePassed || saveState !== 'IDLE'}
                      onClick={() => handleQuantityChange(product.id, 1)}
                      className="w-8 h-8 rounded-lg bg-amber-600 hover:bg-amber-700 active:bg-amber-800 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center text-white transition-colors cursor-pointer"
                      title="Увеличить на 1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

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
