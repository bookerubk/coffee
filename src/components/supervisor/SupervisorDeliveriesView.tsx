import React, { useState, useEffect } from 'react';
import {
  Waybill,
  WaybillItem,
  CoffeePoint,
  DiscrepancyReasonTransit,
  WaybillStatus,
} from '../../types';
import { StorageManager } from '../../services/storage';
import { ApiService } from '../../services/api';
import {
  Truck,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Camera,
  ChevronRight,
  ShieldAlert,
  Clock,
  User,
  Plus,
  Minus,
  Check,
} from 'lucide-react';

interface SupervisorDeliveriesViewProps {
  currentPoint: CoffeePoint;
  supervisorName: string;
}

const TRANSIT_REASONS: { id: DiscrepancyReasonTransit; label: string }[] = [
  { id: 'not_delivered', label: 'Не довезли' },
  { id: 'damaged', label: 'Повреждено при транспортировке' },
  { id: 'spoiled', label: 'Порча (нарушен температурный режим)' },
  { id: 'shortage', label: 'Недостача в опломбированном коробе' },
  { id: 'other', label: 'Другое (указать комментарий)' },
];

export const SupervisorDeliveriesView: React.FC<SupervisorDeliveriesViewProps> = ({
  currentPoint,
  supervisorName,
}) => {
  const [waybills, setWaybills] = useState<Waybill[]>([]);
  const [selectedWaybill, setSelectedWaybill] = useState<Waybill | null>(null);

  // Acceptance form state
  const [receivedValues, setReceivedValues] = useState<Record<string, number>>({});
  const [discrepancyReasons, setDiscrepancyReasons] = useState<Record<string, DiscrepancyReasonTransit>>({});
  const [discrepancyComments, setDiscrepancyComments] = useState<Record<string, string>>({});
  const [discrepancyPhotos, setDiscrepancyPhotos] = useState<Record<string, string>>({});

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Load waybills for this point
  const loadWaybills = () => {
    const all = StorageManager.getWaybills();
    const pointWaybills = all
      .filter((w) => w.pointId === currentPoint.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setWaybills(pointWaybills);
  };

  useEffect(() => {
    if (selectedWaybill) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
    return () => {
      document.body.classList.remove('modal-open');
    };
  }, [selectedWaybill]);

  useEffect(() => {
    loadWaybills();

    const handleStorage = () => loadWaybills();
    window.addEventListener('coffee-storage-change', handleStorage);
    return () => window.removeEventListener('coffee-storage-change', handleStorage);
  }, [currentPoint.id]);

  // Open waybill acceptance modal
  const openAcceptance = (wb: Waybill) => {
    setSelectedWaybill(wb);

    // Initialize "Принято" by default = "Отгружено" (Section 4.5)
    const initialReceived: Record<string, number> = {};
    const initialReasons: Record<string, DiscrepancyReasonTransit> = {};
    const initialComments: Record<string, string> = {};
    const initialPhotos: Record<string, string> = {};

    wb.items.forEach((item) => {
      initialReceived[item.productId] =
        item.receivedQuantity !== undefined ? item.receivedQuantity : item.dispatchedQuantity;
      if (item.receiveDiscrepancyReason) {
        initialReasons[item.productId] = item.receiveDiscrepancyReason;
      }
      if (item.receiveDiscrepancyComment) {
        initialComments[item.productId] = item.receiveDiscrepancyComment;
      }
      if (item.receiveDiscrepancyPhoto) {
        initialPhotos[item.productId] = item.receiveDiscrepancyPhoto;
      }
    });

    setReceivedValues(initialReceived);
    setDiscrepancyReasons(initialReasons);
    setDiscrepancyComments(initialComments);
    setDiscrepancyPhotos(initialPhotos);
  };

  // Stepper handlers for "Принято"
  const handleReceivedChange = (productId: string, delta: number) => {
    setReceivedValues((prev) => {
      const cur = prev[productId] !== undefined ? prev[productId] : 0;
      return { ...prev, [productId]: Math.max(0, cur + delta) };
    });
  };

  const handleReceivedInput = (productId: string, valStr: string) => {
    const clean = valStr.replace(/\D/g, '');
    const num = clean === '' ? 0 : parseInt(clean, 10);
    setReceivedValues((prev) => ({ ...prev, [productId]: Math.max(0, num) }));
  };

  // Photo upload handler
  const handlePhotoUpload = (productId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setDiscrepancyPhotos((prev) => ({ ...prev, [productId]: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  // Validation: Section 4.5: "Кнопка «Принять поставку» блокируется, пока не заполнены причины по всем расхождениям"
  const validateForm = (): { isValid: boolean; errors: string[] } => {
    if (!selectedWaybill) return { isValid: false, errors: [] };

    const errors: string[] = [];

    for (const item of selectedWaybill.items) {
      const dispatched = item.dispatchedQuantity;
      const received = receivedValues[item.productId] !== undefined ? receivedValues[item.productId] : dispatched;

      // Discrepancy occurred in transit
      if (dispatched !== received) {
        const reason = discrepancyReasons[item.productId];
        if (!reason) {
          errors.push(`Укажите причину расхождения для "${item.productName}"`);
        } else if (reason === 'other' && (!discrepancyComments[item.productId] || !discrepancyComments[item.productId].trim())) {
          errors.push(`Для позиции "${item.productName}" при выборе «Другое» обязателен комментарий`);
        }
      }
    }

    return { isValid: errors.length === 0, errors };
  };

  const { isValid, errors } = validateForm();

  // Submit Acceptance
  const handleConfirmAcceptance = async () => {
    if (!selectedWaybill || !isValid) return;

    setIsSubmitting(true);
    try {
      const payloadItems = selectedWaybill.items.map((it) => {
        const rec = receivedValues[it.productId] !== undefined ? receivedValues[it.productId] : it.dispatchedQuantity;
        return {
          productId: it.productId,
          receivedQuantity: rec,
          receiveDiscrepancyReason: rec !== it.dispatchedQuantity ? discrepancyReasons[it.productId] : undefined,
          receiveDiscrepancyComment: rec !== it.dispatchedQuantity ? discrepancyComments[it.productId] : undefined,
          receiveDiscrepancyPhoto: rec !== it.dispatchedQuantity ? discrepancyPhotos[it.productId] : undefined,
        };
      });

      const updated = await ApiService.receiveWaybill(selectedWaybill.id, payloadItems, supervisorName);

      setSelectedWaybill(null);
      loadWaybills();
      setStatusMessage({
        message:
          updated.status === 'received_with_discrepancies'
            ? 'Поставка принята с фиксацией расхождений. Акт передан администратору.'
            : 'Поставка успешно принята без расхождений!',
        type: 'success',
      });
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      setStatusMessage({ message: err.message || 'Ошибка сохранения приёмки', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Администратор может принять поставку и без подтверждения водителя (сервер это разрешает)
  const isAdminUser = StorageManager.getCurrentUser()?.role === 'admin';
  const isAwaitingDriver = (wb: Waybill) => Boolean(wb.awaitingDeliveryConfirmation) && !isAdminUser;

  const getStatusBadge = (status: WaybillStatus, wb?: Waybill) => {
    if (status === 'dispatched' && wb) {
      if (isAwaitingDriver(wb)) {
        return <span className="px-2.5 py-1 bg-amber-100 text-amber-800 rounded-md text-xs font-semibold">В пути (ждём водителя)</span>;
      }
      if (wb.deliveredAt) {
        return <span className="px-2.5 py-1 bg-blue-100 text-blue-800 rounded-md text-xs font-semibold animate-pulse">Доставлено (ожидает приёмки)</span>;
      }
    }
    switch (status) {
      case 'formed':
        return <span className="px-2.5 py-1 bg-stone-100 text-stone-700 rounded-md text-xs font-medium">Сформирована</span>;
      case 'packing':
        return <span className="px-2.5 py-1 bg-amber-100 text-amber-800 rounded-md text-xs font-medium">Собирается на складе</span>;
      case 'dispatched':
        return <span className="px-2.5 py-1 bg-blue-100 text-blue-800 rounded-md text-xs font-semibold animate-pulse">В пути (ожидает приёмки)</span>;
      case 'received':
        return <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-md text-xs font-semibold">Принята без расхождений</span>;
      case 'received_with_discrepancies':
        return <span className="px-2.5 py-1 bg-rose-100 text-rose-800 rounded-md text-xs font-semibold">Принята с расхождениями</span>;
    }
  };

  return (
    <div className="space-y-6">
      {statusMessage && (
        <div
          className={`p-4 rounded-xl border flex items-center gap-3 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
              : 'bg-rose-50 border-rose-200 text-rose-950'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
          )}
          <span className="text-sm font-medium">{statusMessage.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="bg-white rounded-2xl p-5 border border-stone-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md">
              {currentPoint.name}
            </span>
            <span className="text-xs text-stone-500">Приёмка поставок</span>
          </div>
          <h2 className="text-xl font-bold text-stone-900 mt-1">Ожидаемые и поступившие поставки</h2>
        </div>
        <div className="text-xs text-stone-500 flex items-center gap-2">
          <Truck className="w-4 h-4 text-amber-600" />
          <span>Всего накладных: {waybills.length}</span>
        </div>
      </div>

      {/* Waybills List */}
      {waybills.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-stone-200 shadow-sm space-y-3">
          <div className="w-12 h-12 rounded-full bg-stone-100 text-stone-400 mx-auto flex items-center justify-center">
            <Truck className="w-6 h-6" />
          </div>
          <h3 className="font-semibold text-stone-800">Поставок пока нет</h3>
          <p className="text-xs text-stone-500 max-w-sm mx-auto">
            Когда производство соберёт и отгрузит заявку по этой точке, здесь появится электронная накладная для сверки.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {waybills.map((wb) => {
            const isDispatched = wb.status === 'dispatched';
            const isProcessed = wb.status === 'received' || wb.status === 'received_with_discrepancies';

            return (
              <div
                key={wb.id}
                className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm hover:border-stone-300 transition-all flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-stone-800">{wb.id}</span>
                        <span className="text-xs text-stone-500">
                          {wb.slotId === 'morning' ? '☀️ Утренний слот' : '🌙 Вечерний слот'}
                        </span>
                      </div>
                      <p className="text-xs text-stone-400 mt-0.5">Дата: {wb.date}</p>
                    </div>
                    {getStatusBadge(wb.status, wb)}
                  </div>

                  <div className="bg-stone-50 rounded-xl p-3 space-y-1.5 text-xs text-stone-600">
                    <div className="flex items-center justify-between">
                      <span>Позиций в накладной:</span>
                      <span className="font-semibold text-stone-900">{wb.items.length}</span>
                    </div>
                    {wb.driverName && (
                      <div className="flex items-center justify-between">
                        <span>Водитель / транспорт:</span>
                        <span className="font-medium text-stone-800">{wb.driverName}</span>
                      </div>
                    )}
                    {wb.dispatchedAt && (
                      <div className="flex items-center justify-between">
                        <span>Отгружено с производства:</span>
                        <span className="font-medium text-stone-800">
                          {new Date(wb.dispatchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    )}
                    {wb.deliveredAt && (
                      <div className="flex items-center justify-between">
                        <span>Доставку подтвердил водитель:</span>
                        <span className="font-medium text-stone-800">
                          {new Date(wb.deliveredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    )}
                    {isAwaitingDriver(wb) && (
                      <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] leading-4 text-amber-900">
                        Водитель ещё не подтвердил доставку. Приёмка станет доступна сразу после его подтверждения.
                      </p>
                    )}
                    {wb.receivedAt && (
                      <div className="flex items-center justify-between">
                        <span>Принято на точке:</span>
                        <span className="font-medium text-stone-800">
                          {new Date(wb.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({wb.receivedBy})
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-end">
                  <button
                    onClick={() => openAcceptance(wb)}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer ${
                      isDispatched && !isAwaitingDriver(wb)
                        ? 'bg-amber-700 hover:bg-amber-800 text-white shadow-sm'
                        : 'bg-stone-100 hover:bg-stone-200 text-stone-800'
                    }`}
                  >
                    <span>{isDispatched && !isAwaitingDriver(wb) ? 'Сверить и принять поставку' : 'Просмотреть накладную'}</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Acceptance Modal (Section 4.5) */}
      {selectedWaybill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-stone-950/70 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl border border-stone-200 w-full max-w-3xl my-auto sm:my-8 overflow-hidden flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-stone-200 flex items-center justify-between bg-stone-50">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-stone-900">{selectedWaybill.id}</span>
                  <span className="text-xs text-stone-500">| {selectedWaybill.pointName}</span>
                </div>
                <h3 className="text-sm sm:text-base font-bold text-stone-900 mt-0.5">
                  Приёмка поставки: сверка позиций по факту
                </h3>
              </div>
              <button
                onClick={() => setSelectedWaybill(null)}
                className="p-2 text-stone-400 hover:text-stone-600 rounded-lg hover:bg-stone-200 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
              {isAwaitingDriver(selectedWaybill) && (
                <div role="alert" className="p-3 bg-amber-100 border border-amber-300 rounded-xl text-xs text-amber-950">
                  <span className="font-semibold">Приёмка пока недоступна.</span> Водитель ещё не подтвердил доставку.
                  Как только он подтвердит её в своём приложении, здесь появится кнопка «Принять поставку на точку».
                </div>
              )}
              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-amber-900">
                <span className="font-semibold">Инструкция приёмки:</span> Поле «Принято» по умолчанию заполнено
                количеством отгрузки. Измените значение только у тех позиций, где выявлено расхождение. При
                любом несовпадении обязательно укажите причину!
              </div>

              {/* Items Table */}
              <div className="space-y-3">
                {selectedWaybill.items.map((item) => {
                  const dispatched = item.dispatchedQuantity;
                  const received =
                    receivedValues[item.productId] !== undefined ? receivedValues[item.productId] : dispatched;
                  const hasDiscrepancy = dispatched !== received;
                  const reason = discrepancyReasons[item.productId];
                  const isReadonly =
                    selectedWaybill.status === 'received' ||
                    selectedWaybill.status === 'received_with_discrepancies';

                  return (
                    <div
                      key={item.productId}
                      className={`p-4 rounded-xl border transition-all ${
                        hasDiscrepancy
                          ? 'border-amber-400 bg-amber-50/30'
                          : 'border-stone-200 bg-white'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-mono text-stone-400">{item.sku}</span>
                            <span className="text-[11px] px-1.5 py-0.5 bg-stone-100 text-stone-600 rounded">
                              {item.unit}
                            </span>
                          </div>
                          <h4 className="font-semibold text-stone-900 text-sm mt-0.5">{item.productName}</h4>
                          <div className="flex items-center gap-4 text-xs text-stone-500 mt-1">
                            <span>Заказано: <b>{item.orderedQuantity}</b></span>
                            <span>Отгружено заводом: <b className="text-stone-800">{dispatched}</b></span>
                          </div>
                          {item.dispatchDiscrepancyReason && (
                            <p className="text-[11px] text-amber-800 mt-1">
                              🏭 Примечание производства: {item.dispatchDiscrepancyReason}
                            </p>
                          )}
                        </div>

                        {/* Received Quantity Stepper */}
                        <div className="flex items-center justify-between sm:justify-start gap-3 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-stone-100">
                          <span className="text-xs font-semibold text-stone-700">Принято:</span>
                          {!isReadonly ? (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                disabled={received <= 0}
                                onClick={() => handleReceivedChange(item.productId, -1)}
                                className="w-8 h-8 rounded-lg bg-stone-100 hover:bg-stone-200 active:bg-stone-300 disabled:opacity-30 flex items-center justify-center text-stone-700 cursor-pointer"
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={received}
                                onChange={(e) => handleReceivedInput(item.productId, e.target.value)}
                                className={`w-14 h-8 text-center font-bold text-sm rounded-lg border ${
                                  hasDiscrepancy
                                    ? 'border-amber-500 bg-amber-50 text-amber-950 font-extrabold'
                                    : 'border-stone-200 bg-white text-stone-800'
                                }`}
                              />
                              <button
                                type="button"
                                onClick={() => handleReceivedChange(item.productId, 1)}
                                className="w-8 h-8 rounded-lg bg-amber-600 hover:bg-amber-700 active:bg-amber-800 flex items-center justify-center text-white cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <span className="px-3 py-1 bg-stone-100 rounded-lg font-bold text-sm text-stone-900">
                              {received} {item.unit}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Discrepancy Form Block (Required per Section 4.5) */}
                      {hasDiscrepancy && (
                        <div className="mt-3 pt-3 border-t border-amber-200/80 space-y-3">
                          <div className="flex items-center gap-2 text-xs font-semibold text-amber-900">
                            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                            <span>
                              Расхождение в доставке: {received > dispatched ? `+${received - dispatched}` : received - dispatched} {item.unit}.
                              Обязательно выберите причину:
                            </span>
                          </div>

                          {!isReadonly ? (
                            <>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {TRANSIT_REASONS.map((r) => (
                                  <label
                                    key={r.id}
                                    className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                                      reason === r.id
                                        ? 'bg-amber-100 border-amber-400 text-amber-950 font-semibold'
                                        : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50'
                                    }`}
                                  >
                                    <input
                                      type="radio"
                                      name={`reason-${item.productId}`}
                                      checked={reason === r.id}
                                      onChange={() =>
                                        setDiscrepancyReasons((prev) => ({ ...prev, [item.productId]: r.id }))
                                      }
                                      className="accent-amber-700"
                                    />
                                    <span>{r.label}</span>
                                  </label>
                                ))}
                              </div>

                              {/* Comment box */}
                              <div>
                                <textarea
                                  placeholder={
                                    reason === 'other'
                                      ? 'Обязательный комментарий к причине «Другое»...'
                                      : 'Дополнительный комментарий (необязательно)...'
                                  }
                                  value={discrepancyComments[item.productId] || ''}
                                  onChange={(e) =>
                                    setDiscrepancyComments((prev) => ({
                                      ...prev,
                                      [item.productId]: e.target.value,
                                    }))
                                  }
                                  rows={2}
                                  className={`w-full p-2 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-600 ${
                                    reason === 'other' && !discrepancyComments[item.productId]
                                      ? 'border-rose-400 bg-rose-50/30'
                                      : 'border-stone-200'
                                  }`}
                                />
                              </div>

                              {/* Photo Attachment (Optional per Section 4.5) */}
                              <div className="flex flex-wrap items-center gap-2.5">
                                <label className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg text-xs font-medium cursor-pointer transition-colors shrink-0">
                                  <Camera className="w-3.5 h-3.5 text-stone-600" />
                                  <span>{discrepancyPhotos[item.productId] ? 'Заменить фото' : 'Прикрепить фото брака / тары'}</span>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => handlePhotoUpload(item.productId, e)}
                                  />
                                </label>
                                {discrepancyPhotos[item.productId] && (
                                  <div className="flex items-center gap-2">
                                    <img
                                      src={discrepancyPhotos[item.productId]}
                                      alt="Фото расхождения"
                                      className="w-8 h-8 rounded object-cover border border-amber-300"
                                    />
                                    <span className="text-[11px] text-emerald-700 font-medium">Фото прикреплено</span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setDiscrepancyPhotos((prev) => {
                                          const copy = { ...prev };
                                          delete copy[item.productId];
                                          return copy;
                                        })
                                      }
                                      className="text-stone-400 hover:text-stone-600 text-xs ml-1 cursor-pointer"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                )}
                              </div>
                            </>
                          ) : (
                            <div className="text-xs space-y-1">
                              <p className="text-stone-700">
                                <b>Причина:</b> {TRANSIT_REASONS.find((r) => r.id === item.receiveDiscrepancyReason)?.label || item.receiveDiscrepancyReason}
                              </p>
                              {item.receiveDiscrepancyComment && (
                                <p className="text-stone-600"><b>Комментарий:</b> {item.receiveDiscrepancyComment}</p>
                              )}
                              {item.receiveDiscrepancyPhoto && (
                                <img
                                  src={item.receiveDiscrepancyPhoto}
                                  alt="Фото расхождения"
                                  className="w-20 h-20 rounded-lg object-cover border mt-1"
                                />
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Validation errors warning */}
              {errors.length > 0 && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-800">
                    <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>Для завершения приёмки устраните замечания:</span>
                  </div>
                  <ul className="text-xs text-rose-700 list-disc list-inside space-y-0.5">
                    {errors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-stone-200 bg-stone-50 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setSelectedWaybill(null)}
                className="w-full sm:w-auto px-4 py-2 text-xs font-medium text-stone-600 hover:text-stone-800 text-center cursor-pointer"
              >
                Закрыть
              </button>

              {selectedWaybill.status === 'dispatched' && !isAwaitingDriver(selectedWaybill) && (
                <button
                  type="button"
                  disabled={!isValid || isSubmitting}
                  onClick={handleConfirmAcceptance}
                  className="w-full sm:w-auto px-6 py-2.5 bg-amber-700 hover:bg-amber-800 active:bg-amber-900 disabled:opacity-40 disabled:pointer-events-none text-white font-semibold text-xs rounded-xl shadow transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Принять поставку на точку</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
