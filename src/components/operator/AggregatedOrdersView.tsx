import React, { useState, useEffect, useMemo } from 'react';
import { ShiftOrder, SlotId, ProductItem, CoffeePoint, Waybill } from '../../types';
import { StorageManager } from '../../services/storage';
import { ApiService } from '../../services/api';
import {
  Layers,
  FileCheck,
  Building2,
  Calendar,
  Clock,
  Sparkles,
  ArrowRight,
  CheckCircle,
  Truck,
  Package,
} from 'lucide-react';

interface AggregatedOrdersViewProps {
  onNavigateToWaybills: () => void;
  workshopId?: string;
  workshopName?: string;
}

export const AggregatedOrdersView: React.FC<AggregatedOrdersViewProps> = ({
  onNavigateToWaybills,
  workshopId,
  workshopName,
}) => {
  const [selectedSlot, setSelectedSlot] = useState<SlotId>('morning');
  const [selectedDate, setSelectedDate] = useState<string>(
    () => new Date().toISOString().split('T')[0]
  );
  const [orders, setOrders] = useState<ShiftOrder[]>([]);
  const [points, setPoints] = useState<CoffeePoint[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [waybills, setWaybills] = useState<Waybill[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  const loadData = () => {
    setOrders(StorageManager.getOrders());
    setPoints(StorageManager.getPoints());
    setProducts(StorageManager.getProducts());
    setWaybills(StorageManager.getWaybills());
  };

  useEffect(() => {
    loadData();
    const handleStorage = () => loadData();
    window.addEventListener('coffee-storage-change', handleStorage);
    return () => window.removeEventListener('coffee-storage-change', handleStorage);
  }, []);

  // Filter points assigned to this workshop if operator is scoped
  const workshopPoints = useMemo(() => {
    if (!workshopId) return points;
    const filtered = points.filter((p) => p.assignedWorkshopId === workshopId);
    return filtered.length > 0 ? filtered : points;
  }, [points, workshopId]);

  const workshopPointIds = useMemo(
    () => new Set(workshopPoints.map((p) => p.id)),
    [workshopPoints]
  );

  // Filter relevant orders for this date and slot
  const slotOrders = useMemo(() => {
    return orders.filter(
      (o) =>
        o.date === selectedDate &&
        o.slotId === selectedSlot &&
        o.status !== 'draft' &&
        (!workshopId || workshopPointIds.has(o.pointId))
    );
  }, [orders, selectedDate, selectedSlot, workshopId, workshopPointIds]);

  // Points that have submitted orders
  const submittedPointIds = useMemo(() => {
    return new Set(slotOrders.map((o) => o.pointId));
  }, [slotOrders]);

  // Check if waybills already generated
  const existingSlotWaybills = useMemo(() => {
    return waybills.filter((w) => w.date === selectedDate && w.slotId === selectedSlot);
  }, [waybills, selectedDate, selectedSlot]);

  // Aggregation breakdown per SKU
  const aggregatedRows = useMemo(() => {
    const map: Record<
      string,
      {
        product: ProductItem;
        totalOrdered: number;
        byPoint: Record<string, number>;
      }
    > = {};

    slotOrders.forEach((ord) => {
      ord.items.forEach((item) => {
        if (!map[item.productId]) {
          const prod = products.find((p) => p.id === item.productId) || {
            id: item.productId,
            name: item.name,
            sku: item.sku,
            unit: item.unit,
            category: item.category,
            source: 'manual',
            external_id: '',
            archived: false,
          };
          map[item.productId] = {
            product: prod,
            totalOrdered: 0,
            byPoint: {},
          };
        }
        map[item.productId].totalOrdered += item.quantity;
        map[item.productId].byPoint[ord.pointId] =
          (map[item.productId].byPoint[ord.pointId] || 0) + item.quantity;
      });
    });

    return Object.values(map).sort((a, b) => b.totalOrdered - a.totalOrdered);
  }, [slotOrders, products]);

  // Generate Waybills from aggregated orders
  const handleGenerateWaybills = async () => {
    setIsGenerating(true);
    try {
      const generated = await ApiService.generateWaybillsForSlot(selectedDate, selectedSlot);
      loadData();
      setNotification(`Сформировано ${generated.length} накладных по точкам! Переходим к комплектации.`);
      setTimeout(() => {
        setNotification(null);
        onNavigateToWaybills();
      }, 1500);
    } catch (err: any) {
      alert(err.message || 'Ошибка генерации накладных');
    } finally {
      setIsGenerating(false);
    }
  };

  const slots = StorageManager.getSlots();
  const activePoints = workshopPoints.filter((p) => !p.archived);

  return (
    <div className="space-y-6">
      {notification && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-950 rounded-xl flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
          <span className="text-sm font-semibold">{notification}</span>
        </div>
      )}

      {/* Header with Slot Selector and Date */}
      <div className="bg-white rounded-2xl p-5 border border-stone-200 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md">
                {workshopName ? `Цех: ${workshopName}` : 'Производственный цех'}
              </span>
              {slotOrders.length > 0 && existingSlotWaybills.length === 0 && (
                <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-300 px-2 py-0.5 rounded-md animate-pulse">
                  Новый сводный заказ
                </span>
              )}
            </div>
            <h2 className="text-xl font-bold text-stone-900 mt-1">Сводный заказ на производство</h2>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full md:w-auto">
            {/* Date selector */}
            <div className="flex items-center gap-2 bg-stone-50 border border-stone-200 rounded-xl px-3 py-1.5 text-xs text-stone-700 w-full sm:w-auto justify-between sm:justify-start">
              <div className="flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5 text-stone-500" />
                <span className="text-stone-400 sm:hidden">Дата:</span>
              </div>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent font-medium focus:outline-none cursor-pointer text-right sm:text-left"
              />
            </div>

            {/* Slot buttons */}
            <div className="flex items-center p-1 bg-stone-100 rounded-xl w-full sm:w-auto">
              {slots.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedSlot(s.id)}
                  className={`flex-1 sm:flex-none px-3 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer text-center ${
                    selectedSlot === s.id
                      ? 'bg-white text-stone-900 shadow-sm font-bold'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  {s.id === 'morning' ? '☀️ Утро' : '🌙 Вечер'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Status of Points Submissions */}
        <div className="pt-3 border-t border-stone-100">
          <div className="text-xs font-semibold text-stone-500 mb-2">Статус подачи заявок по точкам:</div>
          <div className="flex flex-wrap gap-2">
            {activePoints.map((pt) => {
              const hasSubmitted = submittedPointIds.has(pt.id);
              return (
                <div
                  key={pt.id}
                  className={`px-3 py-1.5 rounded-lg border text-xs flex items-center gap-1.5 ${
                    hasSubmitted
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-medium'
                      : 'bg-stone-50 border-stone-200 text-stone-400'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${hasSubmitted ? 'bg-emerald-500' : 'bg-stone-300'}`}
                  ></span>
                  <span>{pt.name}</span>
                  {hasSubmitted && <span className="text-[10px] text-emerald-700 font-bold">✓ Заявка есть</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Aggregated Orders Table (Section 4.3) */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-stone-50/50">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-amber-700 shrink-0" />
            <div>
              <h3 className="font-bold text-stone-900 text-sm">Суммарная потребность цеха (Сводный заказ)</h3>
              <p className="text-xs text-stone-500">
                Заявок получено: {slotOrders.length} из {activePoints.length} точек
              </p>
            </div>
          </div>

          {slotOrders.length > 0 && (
            <button
              onClick={handleGenerateWaybills}
              disabled={isGenerating}
              className="w-full sm:w-auto px-4 py-2 bg-amber-700 hover:bg-amber-800 active:bg-amber-900 text-white font-semibold text-xs rounded-xl shadow transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <FileCheck className="w-4 h-4 shrink-0" />
              <span>
                {existingSlotWaybills.length > 0
                  ? 'Обновить накладные по точкам'
                  : 'Сформировать накладные по точкам'}
              </span>
            </button>
          )}
        </div>

        {aggregatedRows.length === 0 ? (
          <div className="p-12 text-center text-stone-500 text-xs space-y-2">
            <Layers className="w-10 h-10 text-stone-300 mx-auto" />
            <p className="font-medium text-stone-700">Заявок на этот слот пока не поступало</p>
            <p className="text-stone-400">
              Старшие смен формируют заявки до наступления дедлайна слота.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-stone-100/70 border-b border-stone-200 text-stone-600 uppercase font-semibold text-[11px]">
                <tr>
                  <th className="py-3 px-4">SKU / Товар</th>
                  <th className="py-3 px-3">Категория</th>
                  <th className="py-3 px-3 text-center bg-amber-100/50 text-amber-950 font-bold">
                    Итого к производству
                  </th>
                  {activePoints.map((pt) => (
                    <th key={pt.id} className="py-3 px-3 text-center whitespace-nowrap">
                      {pt.name.split(' (')[0]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {aggregatedRows.map((row) => (
                  <tr key={row.product.id} className="hover:bg-stone-50/80 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-bold text-stone-900">{row.product.name}</div>
                      <div className="text-[10px] font-mono text-stone-400">{row.product.sku}</div>
                    </td>
                    <td className="py-3 px-3 text-stone-500">{row.product.category}</td>
                    <td className="py-3 px-3 text-center bg-amber-50/50">
                      <span className="font-extrabold text-amber-950 text-sm">
                        {row.totalOrdered}
                      </span>{' '}
                      <span className="text-[10px] text-stone-500">{row.product.unit}</span>
                    </td>
                    {activePoints.map((pt) => {
                      const qty = row.byPoint[pt.id] || 0;
                      return (
                        <td key={pt.id} className="py-3 px-3 text-center">
                          {qty > 0 ? (
                            <span className="font-bold text-stone-800">{qty}</span>
                          ) : (
                            <span className="text-stone-300">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Shortcut banner to Waybills if generated */}
      {existingSlotWaybills.length > 0 && (
        <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-2xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Truck className="w-5 h-5 text-amber-700" />
            <div>
              <h4 className="font-bold text-xs text-amber-950">
                Для этого слота уже создано {existingSlotWaybills.length} накладных
              </h4>
              <p className="text-[11px] text-amber-800">
                Перейдите во вкладку «Накладные отгрузки», чтобы зафиксировать фактически собранное количество и отправить водителя.
              </p>
            </div>
          </div>
          <button
            onClick={onNavigateToWaybills}
            className="px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
          >
            <span>К накладным</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
