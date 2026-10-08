import React, { useState, useEffect } from 'react';
import { Waybill, WaybillStatus, SlotId, CoffeePoint } from '../../types';
import { StorageManager } from '../../services/storage';
import { ApiService } from '../../services/api';
import {
  Truck,
  CheckCircle2,
  AlertCircle,
  FileText,
  Clock,
  Send,
  Boxes,
  Edit3,
  Check,
  User,
  AlertTriangle,
} from 'lucide-react';

interface WaybillsManagementViewProps {
  operatorName: string;
  workshopId?: string;
  workshopName?: string;
}

export const WaybillsManagementView: React.FC<WaybillsManagementViewProps> = ({
  operatorName,
  workshopId,
  workshopName,
}) => {
  const [waybills, setWaybills] = useState<Waybill[]>([]);
  const [selectedWaybill, setSelectedWaybill] = useState<Waybill | null>(null);

  // Накладная принята в кофейне или водитель уже подтвердил доставку: отгрузка и водитель фиксированы, окно — только просмотр.
  // (Сервер тоже отклоняет такие изменения — это защита и от обхода интерфейса.)
  const isReceivedWaybill =
    selectedWaybill?.status === 'received' || selectedWaybill?.status === 'received_with_discrepancies';
  const isLocked = isReceivedWaybill || Boolean(selectedWaybill?.deliveredAt);

  // Dispatch modal state
  const [dispatchedValues, setDispatchedValues] = useState<Record<string, number>>({});
  const [dispatchReasons, setDispatchReasons] = useState<Record<string, string>>({});
  const [driverName, setDriverName] = useState<string>('');
  const [driverId, setDriverId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadWaybills = () => {
    const all = StorageManager.getWaybills();
    const allPoints = StorageManager.getPoints();
    const workshopPointIds = workshopId
      ? new Set(allPoints.filter((p) => p.assignedWorkshopId === workshopId).map((p) => p.id))
      : null;

    // Раньше все ветки возвращали true, и фильтр по цеху не работал
    // (оператор видел накладные чужих цехов).
    const filtered = all.filter((w) => {
      if (!workshopId) return true;
      if (w.workshopId) return w.workshopId === workshopId;
      // Если за цехом не закреплено ни одной точки — показываем всё (как и сводный заказ)
      if (workshopPointIds && workshopPointIds.size > 0) return workshopPointIds.has(w.pointId);
      return true;
    });
    setWaybills(filtered);
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
  }, []);

  const openPackingModal = (wb: Waybill) => {
    setSelectedWaybill(wb);
    const initialDispatched: Record<string, number> = {};
    const initialReasons: Record<string, string> = {};

    wb.items.forEach((item) => {
      initialDispatched[item.productId] = item.dispatchedQuantity;
      if (item.dispatchDiscrepancyReason) {
        initialReasons[item.productId] = item.dispatchDiscrepancyReason;
      }
    });

    setDispatchedValues(initialDispatched);
    setDispatchReasons(initialReasons);
    // Водитель берётся из самой накладной: раньше выбор из предыдущей накладной
    // «переезжал» в следующую (имя и id водителя могли не совпадать)
    setDriverName(wb.driverName || '');
    setDriverId(wb.driverId || '');
    setErrorMsg(null);
  };

  const handleDispatchedInput = (productId: string, valStr: string) => {
    const clean = valStr.replace(/\D/g, '');
    const num = clean === '' ? 0 : parseInt(clean, 10);
    setDispatchedValues((prev) => ({ ...prev, [productId]: Math.max(0, num) }));
  };

  const handleDispatchedChange = (productId: string, delta: number) => {
    setDispatchedValues((prev) => {
      const cur = prev[productId] !== undefined ? prev[productId] : 0;
      return { ...prev, [productId]: Math.max(0, cur + delta) };
    });
  };

  // Section 4.4: Validation - If dispatched != ordered, reason is mandatory!
  const validateDispatch = (): { isValid: boolean; errors: string[] } => {
    if (!selectedWaybill) return { isValid: false, errors: [] };
    const errors: string[] = [];

    for (const item of selectedWaybill.items) {
      const disp =
        dispatchedValues[item.productId] !== undefined
          ? dispatchedValues[item.productId]
          : item.dispatchedQuantity;
      if (disp !== item.orderedQuantity) {
        const reason = dispatchReasons[item.productId];
        if (!reason || !reason.trim()) {
          errors.push(`Укажите причину расхождения для "${item.productName}"`);
        }
      }
    }

    return { isValid: errors.length === 0, errors };
  };

  const { isValid, errors } = validateDispatch();

  // Save dispatch & update status
  const handleSaveStatus = async (targetStatus: WaybillStatus) => {
    if (!selectedWaybill || !isValid) return;

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const itemsPayload = selectedWaybill.items.map((it) => ({
        productId: it.productId,
        dispatchedQuantity:
          dispatchedValues[it.productId] !== undefined
            ? dispatchedValues[it.productId]
            : it.dispatchedQuantity,
        dispatchDiscrepancyReason:
          dispatchedValues[it.productId] !== it.orderedQuantity
            ? dispatchReasons[it.productId]
            : undefined,
      }));

      await ApiService.updateWaybillDispatch(
        selectedWaybill.id,
        itemsPayload,
        targetStatus,
        operatorName,
        driverName,
        driverId || selectedWaybill.driverId,
        workshopId || selectedWaybill.workshopId,
        selectedWaybill.legalEntityId
      );

      loadWaybills();
      setSelectedWaybill(null);
      setSuccessMsg(
        targetStatus === 'dispatched'
          ? `Накладная ${selectedWaybill.id} успешно отгружена и передана водителю!`
          : `Накладная переведена в статус «${targetStatus === 'packing' ? 'Собирается' : 'Сформирована'}».`
      );
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Ошибка сохранения накладной');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: WaybillStatus) => {
    switch (status) {
      case 'formed':
        return (
          <span className="px-2.5 py-1 bg-stone-100 text-stone-700 rounded-md text-xs font-semibold">
            Сформирована
          </span>
        );
      case 'packing':
        return (
          <span className="px-2.5 py-1 bg-amber-100 text-amber-800 rounded-md text-xs font-semibold">
            Собирается в цеху
          </span>
        );
      case 'dispatched':
        return (
          <span className="px-2.5 py-1 bg-blue-100 text-blue-800 rounded-md text-xs font-semibold">
            Отгружена (в пути)
          </span>
        );
      case 'received':
        return (
          <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-md text-xs font-semibold">
            Принята на точке
          </span>
        );
      case 'received_with_discrepancies':
        return (
          <span className="px-2.5 py-1 bg-rose-100 text-rose-800 rounded-md text-xs font-semibold">
            Принята с расхождениями
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-950 rounded-xl flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span className="text-sm font-semibold">{successMsg}</span>
        </div>
      )}

      {/* Header */}
      <div className="bg-white rounded-2xl p-5 border border-stone-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md">
              Склад и Экспедиция
            </span>
            <span className="text-xs text-stone-500">Оператор: {operatorName}</span>
          </div>
          <h2 className="text-xl font-bold text-stone-900 mt-1">Накладные отгрузки по точкам</h2>
        </div>
        <div className="text-xs text-stone-500">
          Всего сформировано накладных: <b className="text-stone-900">{waybills.length}</b>
        </div>
      </div>

      {/* Waybills List */}
      {waybills.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-stone-200 shadow-sm space-y-3">
          <Boxes className="w-12 h-12 text-stone-300 mx-auto" />
          <h3 className="font-semibold text-stone-800">Накладных пока нет</h3>
          <p className="text-xs text-stone-500 max-w-sm mx-auto">
            Сформируйте накладные во вкладке «Сводный заказ», когда точки завершат подачу заявок на слот.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {waybills.map((wb) => {
            const hasDiscrepancy = wb.items.some(
              (i) => i.orderedQuantity !== i.dispatchedQuantity
            );
            const isFinished =
              wb.status === 'received' || wb.status === 'received_with_discrepancies';

            return (
              <div
                key={wb.id}
                className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm hover:border-stone-300 transition-all flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-stone-900">{wb.id}</span>
                        <span className="text-xs text-stone-500">
                          {wb.slotId === 'morning' ? '☀️ Утро' : '🌙 Вечер'}
                        </span>
                      </div>
                      <h4 className="font-bold text-stone-800 text-sm mt-1">{wb.pointName}</h4>
                      <p className="text-[11px] text-stone-400">Дата: {wb.date}</p>
                    </div>
                    {getStatusBadge(wb.status)}
                  </div>

                  <div className="bg-stone-50 rounded-xl p-3 text-xs space-y-1.5 text-stone-600">
                    <div className="flex items-center justify-between">
                      <span>Позиций в накладной:</span>
                      <span className="font-bold text-stone-800">{wb.items.length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Суммарно заказано:</span>
                      <span className="font-semibold text-stone-800">
                        {wb.items.reduce((acc, i) => acc + i.orderedQuantity, 0)} ед.
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Фактически отгружено:</span>
                      <span className="font-bold text-amber-900">
                        {wb.items.reduce((acc, i) => acc + i.dispatchedQuantity, 0)} ед.
                      </span>
                    </div>
                    {hasDiscrepancy && (
                      <div className="text-[11px] text-amber-800 font-medium pt-1 border-t border-stone-200/60">
                        ⚠️ Есть расхождение между заказом и сборкой
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between">
                  <span className="min-w-0 pr-2 text-[11px] text-stone-400">
                    {wb.driverName ? `Транспорт: ${wb.driverName}` : 'Транспорт не назначен'}
                    {wb.deliveredAt && (
                      <span className="block font-semibold text-emerald-700">
                        ✓ Доставку подтвердил водитель в {new Date(wb.deliveredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </span>
                  <button
                    onClick={() => openPackingModal(wb)}
                    className="px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>{isFinished || wb.deliveredAt ? 'Просмотреть накладную' : 'Собрать / Отгрузить'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Assembly & Dispatch Modal (Section 4.4) */}
      {selectedWaybill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-stone-950/70 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl border border-stone-200 w-full max-w-3xl my-auto sm:my-8 overflow-hidden flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="p-5 border-b border-stone-200 flex items-center justify-between bg-stone-50">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-stone-900">{selectedWaybill.id}</span>
                  <span className="text-xs text-stone-500">| {selectedWaybill.pointName}</span>
                </div>
                <h3 className="text-base font-bold text-stone-900 mt-0.5">
                  {isLocked ? 'Накладная (только просмотр)' : 'Комплектация и фиксация отгрузки'}
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
              {/* Driver and logistics info */}
              <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-stone-700">
                  <Truck className="w-4 h-4 text-amber-800 shrink-0" />
                  <span className="font-semibold">Водитель доставки / Авто:</span>
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                  <select
                    value={StorageManager.getDrivers().some((d) => `${d.name} (${d.vehicleModel} ${d.licensePlate})` === driverName) ? driverName : 'custom'}
                    onChange={(e) => {
                      if (e.target.value !== 'custom') {
                        setDriverName(e.target.value);
                        const drv = StorageManager.getDrivers().find((d) => `${d.name} (${d.vehicleModel} ${d.licensePlate})` === e.target.value);
                        if (drv) setDriverId(drv.id);
                      }
                    }}
                    disabled={isLocked}
                    aria-disabled={isLocked}
                    className="w-full sm:w-60 bg-white border border-stone-300 rounded-lg px-2.5 py-1.5 text-xs text-stone-800 font-medium focus:outline-none focus:ring-2 focus:ring-amber-600 truncate disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-500"
                  >
                    {StorageManager.getDrivers()
                      .filter((d) => !d.archived)
                      .map((d) => (
                        <option
                          key={d.id}
                          value={`${d.name} (${d.vehicleModel} ${d.licensePlate})`}
                        >
                          {d.name} — {d.vehicleModel} {d.licensePlate} {d.hasRefrigerator ? '❄️' : ''}
                        </option>
                      ))}
                    <option value="custom">-- Свой вариант --</option>
                  </select>

                  <input
                    type="text"
                    value={driverName}
                    onChange={(e) => setDriverName(e.target.value)}
                    placeholder="ФИО и авто..."
                    disabled={isLocked}
                    readOnly={isLocked}
                    className="w-full sm:w-44 bg-white border border-stone-300 rounded-lg px-2.5 py-1.5 text-xs text-stone-800 font-medium focus:outline-none focus:ring-2 focus:ring-amber-600 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-500"
                  />
                </div>
                {isLocked && (
                  <p className="w-full text-[11px] leading-4 text-stone-500 sm:basis-full">
                    🔒 {isReceivedWaybill
                      ? 'Поставка принята в кофейне — водителя и отгрузку изменить нельзя.'
                      : 'Водитель подтвердил доставку — водителя и отгрузку изменить нельзя.'}
                  </p>
                )}
              </div>

              {/* Items List */}
              <div className="space-y-3">
                {selectedWaybill.items.map((item) => {
                  const ordered = item.orderedQuantity;
                  const dispatched =
                    dispatchedValues[item.productId] !== undefined
                      ? dispatchedValues[item.productId]
                      : item.dispatchedQuantity;
                  const hasDiscrepancy = ordered !== dispatched;
                  const isReadonly = isLocked;

                  return (
                    <div
                      key={item.productId}
                      className={`p-4 rounded-xl border transition-all ${
                        hasDiscrepancy
                          ? 'border-amber-400 bg-amber-50/20'
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
                          <p className="text-xs text-stone-500 mt-1">
                            Точка заказала: <b className="text-stone-800">{ordered} {item.unit}</b>
                          </p>
                        </div>

                        {/* Dispatched quantity input */}
                        <div className="flex items-center justify-between sm:justify-start gap-3 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-stone-100">
                          <span className="text-xs font-semibold text-stone-700">Факт отгрузки:</span>
                          {!isReadonly ? (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                disabled={dispatched <= 0}
                                onClick={() => handleDispatchedChange(item.productId, -1)}
                                className="w-8 h-8 rounded-lg bg-stone-100 hover:bg-stone-200 active:bg-stone-300 disabled:opacity-30 flex items-center justify-center text-stone-700 cursor-pointer"
                              >
                                -
                              </button>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={dispatched}
                                onChange={(e) => handleDispatchedInput(item.productId, e.target.value)}
                                className={`w-14 h-8 text-center font-bold text-sm rounded-lg border ${
                                  hasDiscrepancy
                                    ? 'border-amber-500 bg-amber-50 text-amber-950 font-extrabold'
                                    : 'border-stone-200 bg-white text-stone-800'
                                }`}
                              />
                              <button
                                type="button"
                                onClick={() => handleDispatchedChange(item.productId, 1)}
                                className="w-8 h-8 rounded-lg bg-amber-600 hover:bg-amber-700 active:bg-amber-800 flex items-center justify-center text-white cursor-pointer"
                              >
                                +
                              </button>
                            </div>
                          ) : (
                            <span className="px-3 py-1 bg-stone-100 rounded-lg font-bold text-sm text-stone-900">
                              {dispatched} {item.unit}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Mandatory Comment for production discrepancy (Section 4.4) */}
                      {hasDiscrepancy && (
                        <div className="mt-3 pt-3 border-t border-amber-200 space-y-1.5">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
                            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                            <span>
                              Расхождение производства ({dispatched > ordered ? `+${dispatched - ordered}` : dispatched - ordered} {item.unit}).
                              Обязательно укажите причину:
                            </span>
                          </div>

                          {!isReadonly ? (
                            <input
                              type="text"
                              placeholder="Причина расхождения (например: брак партии, не хватило сырья, остаток перенесён)..."
                              value={dispatchReasons[item.productId] || ''}
                              onChange={(e) =>
                                setDispatchReasons((prev) => ({ ...prev, [item.productId]: e.target.value }))
                              }
                              className={`w-full max-w-full p-2 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-600 ${
                                !dispatchReasons[item.productId]?.trim()
                                  ? 'border-rose-400 bg-rose-50/20'
                                  : 'border-stone-200 bg-white'
                              }`}
                            />
                          ) : (
                            <p className="text-xs text-stone-700">
                              <b>Причина:</b> {item.dispatchDiscrepancyReason}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Errors alert */}
              {errors.length > 0 && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-800">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>Для отгрузки заполните все причины расхождений:</span>
                  </div>
                  <ul className="text-xs text-rose-700 list-disc list-inside space-y-0.5">
                    {errors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Modal Footer with Status Transitions */}
            <div className="p-4 border-t border-stone-200 bg-stone-50 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setSelectedWaybill(null)}
                className="w-full sm:w-auto px-4 py-2 text-xs font-medium text-stone-600 hover:text-stone-800 text-center cursor-pointer"
              >
                Закрыть
              </button>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                {selectedWaybill.status === 'formed' && (
                  <button
                    type="button"
                    disabled={!isValid || isSubmitting}
                    onClick={() => handleSaveStatus('packing')}
                    className="w-full sm:w-auto px-4 py-2 bg-stone-200 hover:bg-stone-300 text-stone-800 text-xs font-semibold rounded-xl transition-colors cursor-pointer text-center"
                  >
                    Перевести в сборку
                  </button>
                )}

                {!isLocked && (
                    <button
                      type="button"
                      disabled={!isValid || isSubmitting}
                      onClick={() => handleSaveStatus('dispatched')}
                      className="w-full sm:w-auto px-5 py-2.5 bg-amber-700 hover:bg-amber-800 active:bg-amber-900 disabled:opacity-40 disabled:pointer-events-none text-white text-xs font-semibold rounded-xl shadow transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5 shrink-0" />
                      <span>Зафиксировать факт и отгрузить</span>
                    </button>
                  )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
