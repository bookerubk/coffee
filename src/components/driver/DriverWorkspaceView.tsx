import React, { useState, useEffect } from 'react';
import { Waybill, WaybillStatus, UserSession, Driver } from '../../types';
import { StorageManager } from '../../services/storage';
import { ApiService } from '../../services/api';
import {
  Truck,
  CheckCircle2,
  Clock,
  MapPin,
  Factory,
  Coffee,
  Snowflake,
  Phone,
  AlertCircle,
  Package,
  Navigation,
  Check,
  ShieldCheck,
} from 'lucide-react';

interface DriverWorkspaceViewProps {
  currentUser: UserSession;
}

export const DriverWorkspaceView: React.FC<DriverWorkspaceViewProps> = ({ currentUser }) => {
  const [waybills, setWaybills] = useState<Waybill[]>([]);
  const [driverProfile, setDriverProfile] = useState<Driver | null>(null);
  const [activeFilter, setActiveFilter] = useState<'active' | 'completed' | 'all'>('active');
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const loadData = () => {
    const allWaybills = StorageManager.getWaybills();
    // Filter by this driver's name or driverId
    const myWaybills = allWaybills.filter((w) => {
      if (currentUser.driverId && w.driverId === currentUser.driverId) return true;
      if (w.driverName && w.driverName.toLowerCase().includes(currentUser.name.toLowerCase().split(' ')[0])) return true;
      return false;
    });
    setWaybills(myWaybills.length > 0 ? myWaybills : allWaybills); // Fall back to all if none specifically assigned yet for demo

    const drivers = StorageManager.getDrivers();
    const prof = drivers.find((d) => d.id === currentUser.driverId || d.name.toLowerCase().includes(currentUser.name.toLowerCase().split(' ')[0]));
    setDriverProfile(prof || null);
  };

  useEffect(() => {
    loadData();
    const handleStorage = () => loadData();
    window.addEventListener('coffee-storage-change', handleStorage);
    return () => window.removeEventListener('coffee-storage-change', handleStorage);
  }, [currentUser]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const handleUpdateStatus = async (waybillId: string, newStatus: WaybillStatus) => {
    setIsUpdating(waybillId);
    try {
      await ApiService.updateDriverWaybillStatus(
        waybillId,
        newStatus,
        driverProfile ? `${driverProfile.name} (${driverProfile.vehicleModel} ${driverProfile.licensePlate})` : currentUser.name,
        currentUser.driverId
      );
      showToast(newStatus === 'dispatched' ? 'Рейс начат: груз в пути к кофейне' : 'Груз доставлен в кофейню');
      loadData();
    } catch (err: any) {
      alert(err.message || 'Ошибка обновления статуса');
    } finally {
      setIsUpdating(null);
    }
  };

  const handleToggleDriverStatus = async (newStatus: 'active' | 'on_route' | 'day_off') => {
    if (!driverProfile) return;
    const updated: Driver = {
      ...driverProfile,
      status: newStatus,
    };
    await ApiService.saveDriver(updated);
    setDriverProfile(updated);
    showToast(`Статус смены изменен: ${newStatus === 'active' ? 'На смене' : newStatus === 'on_route' ? 'В рейсе' : 'Выходной'}`);
  };

  const filteredWaybills = waybills.filter((w) => {
    if (activeFilter === 'active') return w.status === 'formed' || w.status === 'packing' || w.status === 'dispatched';
    if (activeFilter === 'completed') return w.status === 'received' || w.status === 'received_with_discrepancies';
    return true;
  });

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-stone-900 text-white text-xs px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 border border-stone-700">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Driver Workspace Header */}
      <div className="bg-white rounded-2xl p-5 border border-stone-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-800 text-amber-100 flex items-center justify-center font-bold text-xl shadow-xs shrink-0">
            <Truck className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md">
                Рабочая область водителя
              </span>
              {driverProfile?.hasRefrigerator && (
                <span className="text-[11px] font-bold text-sky-800 bg-sky-50 px-2 py-0.5 rounded-md border border-sky-200 flex items-center gap-1">
                  <Snowflake className="w-3 h-3 text-sky-600" />
                  Рефрижератор (+2...+4 °C)
                </span>
              )}
            </div>
            <h2 className="text-xl font-extrabold text-stone-900 mt-1">{currentUser.name}</h2>
            <p className="text-xs text-stone-500 mt-0.5 flex items-center gap-3 flex-wrap">
              <span>Автомобиль: <strong className="text-stone-800">{currentUser.vehicleModel || driverProfile?.vehicleModel || 'ГАЗель NEXT'}</strong></span>
              <span>Госномер: <strong className="font-mono text-stone-800">{currentUser.licensePlate || driverProfile?.licensePlate || 'В782ОК 777'}</strong></span>
              <span>Телефон: <strong className="text-stone-800">{currentUser.phone || driverProfile?.phone || '+7 (915) 333-22-11'}</strong></span>
            </p>
          </div>
        </div>

        {/* Driver Shift Status Buttons */}
        <div className="flex items-center gap-1.5 bg-stone-100 p-1.5 rounded-xl self-start md:self-auto overflow-x-auto no-scrollbar max-w-full">
          <button
            onClick={() => handleToggleDriverStatus('active')}
            className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              driverProfile?.status === 'active' || !driverProfile?.status
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            🟢 На смене
          </button>
          <button
            onClick={() => handleToggleDriverStatus('on_route')}
            className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              driverProfile?.status === 'on_route'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            🚚 В рейсе
          </button>
          <button
            onClick={() => handleToggleDriverStatus('day_off')}
            className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              driverProfile?.status === 'day_off'
                ? 'bg-stone-700 text-white shadow-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            ⏸️ Выходной
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 max-w-full">
          <button
            onClick={() => setActiveFilter('active')}
            className={`shrink-0 whitespace-nowrap px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeFilter === 'active'
                ? 'bg-amber-800 text-white shadow-xs'
                : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
            }`}
          >
            Активные рейсы ({waybills.filter((w) => w.status === 'formed' || w.status === 'packing' || w.status === 'dispatched').length})
          </button>
          <button
            onClick={() => setActiveFilter('completed')}
            className={`shrink-0 whitespace-nowrap px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeFilter === 'completed'
                ? 'bg-amber-800 text-white shadow-xs'
                : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
            }`}
          >
            Завершённые доставки ({waybills.filter((w) => w.status === 'received' || w.status === 'received_with_discrepancies').length})
          </button>
          <button
            onClick={() => setActiveFilter('all')}
            className={`shrink-0 whitespace-nowrap px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeFilter === 'all'
                ? 'bg-amber-800 text-white shadow-xs'
                : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
            }`}
          >
            Все рейсы ({waybills.length})
          </button>
        </div>

        <span className="text-xs text-stone-400 font-medium">
          Аккаунт: <strong className="text-stone-700">{currentUser.accountName}</strong>
        </span>
      </div>

      {/* Deliveries List */}
      {filteredWaybills.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-stone-300 p-12 text-center">
          <Truck className="w-10 h-10 text-stone-400 mx-auto mb-2" />
          <h4 className="text-base font-bold text-stone-800">Нет назначенных рейсов</h4>
          <p className="text-xs text-stone-500 mt-1 max-w-md mx-auto">
            Когда оператор цеха сформирует накладную и назначит отгрузку, она сразу появится в вашем маршрутном листе.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredWaybills.map((wb) => {
            const totalItems = wb.items.reduce((acc, it) => acc + (it.dispatchedQuantity || it.orderedQuantity), 0);
            const isDispatched = wb.status === 'dispatched';
            const isCompleted = wb.status === 'received' || wb.status === 'received_with_discrepancies';

            return (
              <div
                key={wb.id}
                className={`bg-white rounded-2xl border p-5 shadow-sm transition-all ${
                  isDispatched ? 'border-amber-400 bg-amber-50/10' : 'border-stone-200'
                }`}
              >
                {/* Waybill Card Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-stone-100">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${
                      isDispatched ? 'bg-amber-100 text-amber-800' : isCompleted ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-100 text-stone-700'
                    }`}>
                      {isDispatched ? <Navigation className="w-5 h-5 animate-pulse" /> : isCompleted ? <Check className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-extrabold text-stone-900">{wb.id}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider bg-stone-100 text-stone-600">
                          {wb.slotId === 'morning' ? 'Утренний слот' : 'Вечерний слот'}
                        </span>
                      </div>
                      <span className="text-xs text-stone-500 font-medium">Дата поставки: {wb.date}</span>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div>
                    <span
                      className={`text-xs font-bold px-3 py-1 rounded-full inline-flex items-center gap-1.5 ${
                        wb.status === 'formed'
                          ? 'bg-stone-100 text-stone-700'
                          : wb.status === 'packing'
                          ? 'bg-amber-100 text-amber-800'
                          : wb.status === 'dispatched'
                          ? 'bg-amber-500 text-white font-extrabold shadow-2xs'
                          : wb.status === 'received'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {wb.status === 'formed' && 'Сформирована (ждет сборки)'}
                      {wb.status === 'packing' && 'Собирается в цехе'}
                      {wb.status === 'dispatched' && '🚚 В пути к кофейне'}
                      {wb.status === 'received' && '✅ Принята кофейней'}
                      {wb.status === 'received_with_discrepancies' && '⚠️ Принята с расхождениями'}
                    </span>
                  </div>
                </div>

                {/* Route Information: Workshop -> Coffee Shop */}
                <div className="py-4 grid grid-cols-1 md:grid-cols-2 gap-4 border-b border-stone-100 text-xs">
                  {/* From: Workshop */}
                  <div className="bg-stone-50 p-3 rounded-xl border border-stone-200">
                    <span className="text-[10px] text-stone-400 uppercase font-bold flex items-center gap-1 mb-1">
                      <Factory className="w-3.5 h-3.5 text-amber-800" />
                      Пункт отправления (Цех):
                    </span>
                    <h5 className="font-bold text-stone-900 text-sm">Центральный кондитерский цех</h5>
                    <p className="text-stone-600 mt-0.5">г. Москва, ул. Грайвороновская, д. 20</p>
                    <p className="text-stone-500 mt-1 flex items-center gap-1 font-mono">
                      <Phone className="w-3 h-3" />
                      +7 (495) 321-45-67 (Павел Архипов)
                    </p>
                  </div>

                  {/* To: Coffee Shop */}
                  <div className="bg-amber-50/50 p-3 rounded-xl border border-amber-200">
                    <span className="text-[10px] text-amber-800 uppercase font-bold flex items-center gap-1 mb-1">
                      <Coffee className="w-3.5 h-3.5 text-amber-800" />
                      Пункт назначения (Кофейня):
                    </span>
                    <h5 className="font-bold text-stone-900 text-sm">{wb.pointName}</h5>
                    <p className="text-stone-700 mt-0.5 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                      <span>{wb.pointName.includes('Арбат') ? 'ул. Старый Арбат, д. 28' : wb.pointName.includes('Тверская') ? 'ул. Тверская, д. 12' : 'Пресненская наб., 8'}</span>
                    </p>
                    <p className="text-stone-500 mt-1 flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      Старший смены: {wb.receivedBy || 'Дежурный бариста'}
                    </p>
                  </div>
                </div>

                {/* Items Summary in Waybill */}
                <div className="py-3 text-xs">
                  <div className="flex items-center justify-between text-stone-500 mb-2">
                    <span className="font-semibold text-stone-700 flex items-center gap-1">
                      <Package className="w-3.5 h-3.5 text-amber-800" />
                      Груз: {wb.items.length} позиций ({totalItems} единиц товара)
                    </span>
                    <span className="text-[11px] text-stone-400">Соблюдайте температурный режим</span>
                  </div>

                  <div className="bg-stone-50 rounded-xl p-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {wb.items.map((it) => (
                      <div key={it.productId} className="text-stone-800">
                        <span className="font-bold text-amber-900">{it.dispatchedQuantity || it.orderedQuantity} {it.unit}</span>
                        <span className="text-[11px] text-stone-600 block line-clamp-1">{it.productName}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Driver Action Buttons */}
                <div className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-xs text-stone-400">
                    {wb.dispatchedAt && `Отгружен из цеха: ${new Date(wb.dispatchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                    {wb.receivedAt && ` • Принят в кофейне: ${new Date(wb.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                  </div>

                  <div className="flex items-center gap-2">
                    {wb.status === 'packing' && (
                      <button
                        disabled={isUpdating === wb.id}
                        onClick={() => handleUpdateStatus(wb.id, 'dispatched')}
                        className="px-4 py-2 bg-amber-800 hover:bg-amber-900 text-white rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <Truck className="w-4 h-4" />
                        <span>Принял груз в цехе → Выехал</span>
                      </button>
                    )}

                    {wb.status === 'dispatched' && (
                      <button
                        disabled={isUpdating === wb.id}
                        onClick={() => showToast('Вы прибыли в кофейню. Старший смены сверяет и подтверждает приёмку.')}
                        className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Прибыл в кофейню (Передать на приёмку)</span>
                      </button>
                    )}

                    {isCompleted && (
                      <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200 flex items-center gap-1.5">
                        <Check className="w-4 h-4" />
                        Поставка успешно сдана старшему смены
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
