import React, { useState, useEffect, useMemo } from 'react';
import { DiscrepancyRecord, CoffeePoint, SlotId } from '../../types';
import { StorageManager } from '../../services/storage';
import {
  ShieldAlert,
  AlertTriangle,
  Truck,
  Factory,
  Filter,
  CheckCircle,
  FileSpreadsheet,
  Search,
  ExternalLink,
  ChevronDown,
} from 'lucide-react';

export const DiscrepanciesView: React.FC = () => {
  const [discrepancies, setDiscrepancies] = useState<DiscrepancyRecord[]>([]);
  const [points, setPoints] = useState<CoffeePoint[]>([]);
  const [selectedPointId, setSelectedPointId] = useState<string>('all');
  const [selectedStage, setSelectedStage] = useState<'all' | 'production' | 'transit'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  const loadData = () => {
    setDiscrepancies(StorageManager.getDiscrepancies());
    setPoints(StorageManager.getPoints());
  };

  useEffect(() => {
    if (selectedPhoto) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
    return () => {
      document.body.classList.remove('modal-open');
    };
  }, [selectedPhoto]);

  useEffect(() => {
    loadData();
    const handleStorage = () => loadData();
    window.addEventListener('coffee-storage-change', handleStorage);
    return () => window.removeEventListener('coffee-storage-change', handleStorage);
  }, []);

  const filtered = useMemo(() => {
    return discrepancies.filter((d) => {
      const matchPoint = selectedPointId === 'all' || d.pointId === selectedPointId;
      const matchStage =
        selectedStage === 'all' || d.stage === selectedStage || d.stage === 'both';
      const matchSearch =
        searchQuery === '' ||
        d.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.waybillId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.pointName.toLowerCase().includes(searchQuery.toLowerCase());
      return matchPoint && matchStage && matchSearch;
    });
  }, [discrepancies, selectedPointId, selectedStage, searchQuery]);

  // Aggregate metrics
  const productionDiscrepanciesCount = useMemo(() => {
    return discrepancies.filter((d) => d.orderedQuantity !== d.dispatchedQuantity).length;
  }, [discrepancies]);

  const transitDiscrepanciesCount = useMemo(() => {
    return discrepancies.filter((d) => d.dispatchedQuantity !== d.receivedQuantity).length;
  }, [discrepancies]);

  const getTransitReasonLabel = (reason?: string) => {
    switch (reason) {
      case 'not_delivered':
        return 'Не довезли';
      case 'damaged':
        return 'Повреждено при доставке';
      case 'spoiled':
        return 'Порча (температура)';
      case 'shortage':
        return 'Недостача в опломбированном коробе';
      case 'other':
        return 'Другое';
      default:
        return reason || 'Не указана';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl p-5 border border-stone-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-rose-800 bg-rose-100 px-2 py-0.5 rounded-md">
              Служба контроля качества и аудита
            </span>
          </div>
          <h2 className="text-xl font-bold text-stone-900 mt-1">
            Сводка расхождений: Заказано / Отгружено / Принято
          </h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Контроль цепочки поставок: производство (цех) и логистика (транспортировка).
          </p>
        </div>
      </div>

      {/* KPI Cards (Section 4.6) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-amber-100 text-amber-800 rounded-xl">
            <Factory className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-stone-500 font-medium">Расхождения производства</div>
            <div className="text-2xl font-extrabold text-stone-900 mt-0.5">
              {productionDiscrepanciesCount}
            </div>
            <div className="text-[11px] text-amber-700">Заказано ≠ Отгружено</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-rose-100 text-rose-800 rounded-xl">
            <Truck className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-stone-500 font-medium">Расхождения в пути</div>
            <div className="text-2xl font-extrabold text-stone-900 mt-0.5">
              {transitDiscrepanciesCount}
            </div>
            <div className="text-[11px] text-rose-700">Отгружено ≠ Принято</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-100 text-emerald-800 rounded-xl">
            <CheckCircle className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-stone-500 font-medium">Всего зафиксировано актов</div>
            <div className="text-2xl font-extrabold text-stone-900 mt-0.5">
              {discrepancies.length}
            </div>
            <div className="text-[11px] text-emerald-700">Все расхождения зафиксированы</div>
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white rounded-2xl p-4 border border-stone-200 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* Point Filter */}
          <select
            value={selectedPointId}
            onChange={(e) => setSelectedPointId(e.target.value)}
            className="w-full sm:w-auto bg-stone-50 border border-stone-200 rounded-xl px-3 py-1.5 text-xs text-stone-700 font-medium focus:outline-none focus:ring-2 focus:ring-amber-600"
          >
            <option value="all">Все кофейни</option>
            {points.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {/* Stage Filter */}
          <div className="flex items-center p-1 bg-stone-100 rounded-xl text-xs w-full sm:w-auto">
            <button
              onClick={() => setSelectedStage('all')}
              className={`flex-1 sm:flex-none px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer text-center ${
                selectedStage === 'all' ? 'bg-white text-stone-900 shadow-sm font-semibold' : 'text-stone-600'
              }`}
            >
              Все
            </button>
            <button
              onClick={() => setSelectedStage('production')}
              className={`flex-1 sm:flex-none px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer text-center ${
                selectedStage === 'production' ? 'bg-white text-stone-900 shadow-sm font-semibold' : 'text-stone-600'
              }`}
            >
              🏭 Цех
            </button>
            <button
              onClick={() => setSelectedStage('transit')}
              className={`flex-1 sm:flex-none px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer text-center ${
                selectedStage === 'transit' ? 'bg-white text-stone-900 shadow-sm font-semibold' : 'text-stone-600'
              }`}
            >
              🚚 Доставка
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Поиск по товару, накладной, точке..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-3 py-1.5 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-600 w-full"
          />
        </div>
      </div>

      {/* Discrepancies Table (Section 4.6) */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-stone-500 text-xs space-y-2">
            <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto" />
            <h4 className="font-bold text-stone-800">Расхождений по заданным фильтрам не обнаружено</h4>
            <p className="text-stone-400">Все позиции доставлены и приняты строго по заявке.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-stone-100/70 border-b border-stone-200 text-stone-600 uppercase font-semibold text-[11px]">
                <tr>
                  <th className="py-3 px-4">Накладная / Дата</th>
                  <th className="py-3 px-3">Кофейня</th>
                  <th className="py-3 px-3">Товар / SKU</th>
                  <th className="py-3 px-3 text-center">Заказано</th>
                  <th className="py-3 px-3 text-center">Отгружено (Цех)</th>
                  <th className="py-3 px-3 text-center">Принято (Точка)</th>
                  <th className="py-3 px-4">Анализ и причина</th>
                  <th className="py-3 px-3 text-center">Фото</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filtered.map((row) => {
                  const prodDiff = row.dispatchedQuantity - row.orderedQuantity;
                  const transitDiff = row.receivedQuantity - row.dispatchedQuantity;

                  return (
                    <tr key={row.id} className="hover:bg-stone-50/70 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-mono font-bold text-stone-900">{row.waybillId}</div>
                        <div className="text-[10px] text-stone-400">
                          {row.date} ({row.slotId === 'morning' ? 'Утро' : 'Вечер'})
                        </div>
                      </td>
                      <td className="py-3 px-3 font-medium text-stone-800">{row.pointName}</td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-stone-900">{row.productName}</div>
                        <div className="text-[10px] font-mono text-stone-400">{row.sku}</div>
                      </td>
                      <td className="py-3 px-3 text-center font-bold text-stone-700">
                        {row.orderedQuantity} {row.unit}
                      </td>

                      {/* Production fact */}
                      <td className="py-3 px-3 text-center">
                        <div
                          className={`inline-block px-2 py-0.5 rounded font-bold ${
                            prodDiff !== 0
                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                              : 'text-stone-800'
                          }`}
                        >
                          {row.dispatchedQuantity} {row.unit}
                          {prodDiff !== 0 && (
                            <span className="text-[10px] block font-semibold text-amber-700">
                              {prodDiff > 0 ? `+${prodDiff}` : prodDiff}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Store receipt fact */}
                      <td className="py-3 px-3 text-center">
                        <div
                          className={`inline-block px-2 py-0.5 rounded font-bold ${
                            transitDiff !== 0
                              ? 'bg-rose-100 text-rose-900 border border-rose-300'
                              : 'text-stone-800'
                          }`}
                        >
                          {row.receivedQuantity} {row.unit}
                          {transitDiff !== 0 && (
                            <span className="text-[10px] block font-semibold text-rose-700">
                              {transitDiff > 0 ? `+${transitDiff}` : transitDiff}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Discrepancy analysis */}
                      <td className="py-3 px-4 max-w-xs space-y-1">
                        {prodDiff !== 0 && (
                          <div className="text-[11px] text-amber-900 bg-amber-50/70 p-1.5 rounded border border-amber-200">
                            <b>🏭 Производство:</b> {row.productionReason || 'Причина не указана'}
                          </div>
                        )}
                        {transitDiff !== 0 && (
                          <div className="text-[11px] text-rose-900 bg-rose-50/70 p-1.5 rounded border border-rose-200">
                            <b>🚚 В пути:</b> {getTransitReasonLabel(row.transitReason)}
                            {row.transitComment && <span> — «{row.transitComment}»</span>}
                          </div>
                        )}
                      </td>

                      {/* Photo preview */}
                      <td className="py-3 px-3 text-center">
                        {row.transitPhoto ? (
                          <button
                            onClick={() => setSelectedPhoto(row.transitPhoto || null)}
                            className="p-1 rounded hover:bg-stone-100 transition-colors cursor-pointer"
                            title="Открыть фото расхождения"
                          >
                            <img
                              src={row.transitPhoto}
                              alt="Акт"
                              className="w-8 h-8 rounded object-cover border border-stone-300"
                            />
                          </button>
                        ) : (
                          <span className="text-stone-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Photo Modal */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-950/80 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-4 max-w-lg w-full space-y-3 my-auto">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-stone-900 text-sm">Фотофиксация расхождения при приёмке</h4>
              <button
                onClick={() => setSelectedPhoto(null)}
                className="text-stone-400 hover:text-stone-600 text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>
            <img src={selectedPhoto} alt="Фото расхождения" className="w-full rounded-xl object-contain max-h-[70vh]" />
          </div>
        </div>
      )}
    </div>
  );
};
