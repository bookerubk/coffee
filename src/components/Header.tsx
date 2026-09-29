import React, { useState, useEffect } from 'react';
import { UserRole, CoffeePoint, SlotId, UserSession } from '../types';
import { getOperationalTimeParts, syncServerTime } from '../services/api';
import {
  Coffee,
  Factory,
  ShieldCheck,
  MapPin,
  Clock,
  Layers,
  Truck,
  FileSpreadsheet,
  BookOpen,
  Bell,
  LogOut,
  User,
  Database,
} from 'lucide-react';

interface HeaderProps {
  currentRole: UserRole;
  onRoleChange: (role: UserRole) => void;
  activeSubView: string;
  onSubViewChange: (view: string) => void;
  points: CoffeePoint[];
  currentPoint: CoffeePoint;
  onPointChange: (point: CoffeePoint) => void;
  currentSlotId: SlotId;
  hasNewAggregatedOrder: boolean;
  currentUser: UserSession | null;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentRole,
  onRoleChange,
  activeSubView,
  onSubViewChange,
  points,
  currentPoint,
  onPointChange,
  currentSlotId,
  hasNewAggregatedOrder,
  currentUser,
  onLogout,
}) => {
  const isAdmin = currentUser?.role === 'admin';
  const [serverTime, setServerTime] = useState<string>('');

  useEffect(() => {
    syncServerTime();
    const update = () => {
      const parts = getOperationalTimeParts();
      setServerTime(parts.timeFormatted);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="bg-white border-b border-stone-200 sticky top-0 z-30 shadow-xs">
      {/* Top Main Bar */}
      <div className="max-w-7xl mx-auto px-4 pt-4 pb-3 sm:px-6 sm:pt-5 sm:pb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        {/* Brand */}
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-amber-800 text-amber-100 shadow-xs">
            <Coffee className="size-5 text-amber-200" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-base font-extrabold tracking-tight text-stone-900 sm:text-lg">
                Кофейня <span className="text-amber-800">→</span> Производство
              </h1>
              <span className="hidden rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-900 sm:inline">
                PWA
              </span>
            </div>
            <p className="mt-0.5 truncate text-xs text-stone-500">
              {currentUser?.accountName ? (
                <><span className="text-stone-400">Аккаунт</span> · <strong>{currentUser.accountName}</strong></>
              ) : (
                'Сквозной заказ · Сводный цех · Отгрузка'
              )}
            </p>
          </div>
        </div>

        {/* User Session & Logout Controls */}
        <div className="flex items-center gap-2 self-stretch md:self-auto">
          {/* Live Operational Server Clock Badge */}
          <div
            title="Время операционного сервера"
            className="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-2 text-xs text-stone-700 shadow-2xs md:flex-none"
          >
            <Clock className="size-4 shrink-0 text-amber-800" />
            <span className="font-mono font-bold tracking-tight text-stone-900">{serverTime || '--:--:--'}</span>
            <span className="hidden rounded border border-amber-200 bg-amber-100/80 px-1 py-0.5 font-sans text-[10px] font-semibold text-amber-900 sm:inline">МСК</span>
          </div>

          {currentUser && (
            <div className="min-w-0 flex flex-1 items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-2 text-xs md:flex-none">
              <div className="w-7 h-7 rounded-lg bg-amber-800 text-white flex items-center justify-center font-bold text-xs shrink-0">
                {currentUser.role === 'admin' ? (
                  <ShieldCheck className="w-4 h-4 text-amber-300" />
                ) : currentUser.role === 'shift_supervisor' ? (
                  <Coffee className="w-4 h-4 text-amber-200" />
                ) : currentUser.role === 'production_operator' ? (
                  <Factory className="w-4 h-4 text-amber-200" />
                ) : (
                  <Truck className="w-4 h-4 text-amber-200" />
                )}
              </div>

              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-stone-900">{currentUser.name}</span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-amber-100 text-amber-900">
                    {currentUser.role === 'admin' && 'Администратор'}
                    {currentUser.role === 'shift_supervisor' && 'Старший смены'}
                    {currentUser.role === 'production_operator' && 'Оператор цеха'}
                    {currentUser.role === 'driver' && 'Водитель'}
                  </span>
                </div>
                <div className="text-[10px] text-stone-500 line-clamp-1">
                  {currentUser.role === 'shift_supervisor' && `Закреплен: ${currentUser.pointName || currentPoint.name}`}
                  {currentUser.role === 'production_operator' && `Цех: ${currentUser.workshopName || 'Центральный кондитерский'}`}
                  {currentUser.role === 'driver' && `Авто: ${currentUser.vehicleModel || 'ГАЗель NEXT'} (${currentUser.licensePlate || 'В782ОК 777'})`}
                  {currentUser.role === 'admin' && 'Полный доступ ко всем объектам'}
                </div>
              </div>
            </div>
          )}

          {/* Role Selector Tabs (Visible only for Administrator for rapid testing & oversight) */}
          {isAdmin && (
            <div className="grid shrink-0 grid-cols-4 items-center gap-1 rounded-xl bg-stone-100 p-1">
              <button
                onClick={() => {
                  onRoleChange('admin');
                  onSubViewChange('legal_entities');
                }}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                  currentRole === 'admin'
                    ? 'bg-white text-stone-900 shadow-xs font-bold'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5 text-amber-800" />
                <span>Админ</span>
              </button>

              <button
                onClick={() => {
                  onRoleChange('shift_supervisor');
                  onSubViewChange('order');
                }}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                  currentRole === 'shift_supervisor'
                    ? 'bg-white text-stone-900 shadow-xs font-bold'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <Coffee className="w-3.5 h-3.5 text-amber-700" />
                <span>Кофейня</span>
              </button>

              <button
                onClick={() => {
                  onRoleChange('production_operator');
                  onSubViewChange('summary');
                }}
                className={`relative flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                  currentRole === 'production_operator'
                    ? 'bg-white text-stone-900 shadow-xs font-bold'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <Factory className="w-3.5 h-3.5 text-amber-800" />
                <span>Цех</span>
                {hasNewAggregatedOrder && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping"></span>
                )}
              </button>

              <button
                onClick={() => {
                  onRoleChange('driver');
                  onSubViewChange('deliveries');
                }}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                  currentRole === 'driver'
                    ? 'bg-white text-stone-900 shadow-xs font-bold'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <Truck className="w-3.5 h-3.5 text-amber-800" />
                <span>Водитель</span>
              </button>
            </div>
          )}

          {/* Switch User / Logout Button */}
          <button
            onClick={onLogout}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-stone-100 hover:bg-rose-50 hover:text-rose-700 text-stone-700 rounded-xl text-xs font-semibold border border-stone-200 transition-colors cursor-pointer"
            title="Выйти из рабочей области / Сменить аккаунт"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Сменить роль</span>
          </button>
        </div>
      </div>

      {/* Visual workspace shortcuts */}
      <div className="border-t border-slate-100 bg-[#f7f8f6] px-4 py-3">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-2 overflow-x-auto sm:flex sm:gap-3">
          <button onClick={() => onSubViewChange(currentRole === 'admin' ? 'legal_entities' : currentRole === 'production_operator' ? 'summary' : currentRole === 'driver' ? 'deliveries' : 'order')} className="workspace-tile workspace-tile-emerald">
            <span className="workspace-icon"><Layers aria-hidden="true" /></span>
            <span><strong>Рабочая область</strong><small>Текущие задачи</small></span>
          </button>
          <button onClick={() => onSubViewChange(currentRole === 'driver' ? 'deliveries' : currentRole === 'production_operator' ? 'waybills' : currentRole === 'admin' ? 'directories' : 'deliveries')} className="workspace-tile workspace-tile-violet">
            <span className="workspace-icon"><Truck aria-hidden="true" /></span>
            <span><strong>Операции</strong><small>Заказы и отгрузка</small></span>
          </button>
          <button onClick={() => onSubViewChange(currentRole === 'admin' ? 'discrepancies' : currentRole === 'production_operator' ? 'waybills' : 'deliveries')} className="workspace-tile workspace-tile-blue">
            <span className="workspace-icon"><FileSpreadsheet aria-hidden="true" /></span>
            <span><strong>Документы</strong><small>Проверка данных</small></span>
          </button>
          <button onClick={() => onSubViewChange(currentRole === 'admin' ? 'legal_entities' : 'order')} className="workspace-tile workspace-tile-rose">
            <span className="workspace-icon"><Database aria-hidden="true" /></span>
            <span><strong>Справочники</strong><small>Единый каталог</small></span>
          </button>
        </div>
      </div>

      {/* Role Sub-Navigation Bar */}
      <div className="bg-white border-t border-slate-100 px-4 py-2">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          {/* Sub tabs per role */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 sm:pb-0 max-w-full">
            {currentRole === 'shift_supervisor' && (
              <>
                <button
                  onClick={() => onSubViewChange('order')}
                  className={`shrink-0 whitespace-nowrap px-3 py-1.5 sm:py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    activeSubView === 'order'
                      ? 'bg-stone-900 text-white font-bold'
                      : 'text-stone-600 hover:bg-stone-200'
                  }`}
                >
                  📝 Создание заявки
                </button>
                <button
                  onClick={() => onSubViewChange('deliveries')}
                  className={`shrink-0 whitespace-nowrap px-3 py-1.5 sm:py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    activeSubView === 'deliveries'
                      ? 'bg-stone-900 text-white font-bold'
                      : 'text-stone-600 hover:bg-stone-200'
                  }`}
                >
                  🚚 Приёмка поставок (сверка)
                </button>
              </>
            )}

            {currentRole === 'production_operator' && (
              <>
                <button
                  onClick={() => onSubViewChange('summary')}
                  className={`shrink-0 whitespace-nowrap px-3 py-1.5 sm:py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    activeSubView === 'summary'
                      ? 'bg-stone-900 text-white font-bold'
                      : 'text-stone-600 hover:bg-stone-200'
                  }`}
                >
                  📦 Сводный заказ цеха
                </button>
                <button
                  onClick={() => onSubViewChange('waybills')}
                  className={`shrink-0 whitespace-nowrap px-3 py-1.5 sm:py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    activeSubView === 'waybills'
                      ? 'bg-stone-900 text-white font-bold'
                      : 'text-stone-600 hover:bg-stone-200'
                  }`}
                >
                  📋 Накладные отгрузки
                </button>
              </>
            )}

            {currentRole === 'driver' && (
              <button
                onClick={() => onSubViewChange('deliveries')}
                className="shrink-0 whitespace-nowrap px-3 py-1.5 sm:py-1 rounded-lg text-xs font-bold bg-amber-800 text-white"
              >
                🚚 Маршрутный лист и доставки
              </button>
            )}

            {currentRole === 'admin' && (
              <>
                <button
                  onClick={() => onSubViewChange('legal_entities')}
                  className={`shrink-0 whitespace-nowrap px-3 py-1.5 sm:py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    activeSubView === 'legal_entities'
                      ? 'bg-amber-800 text-white font-bold'
                      : 'text-stone-600 hover:bg-stone-200'
                  }`}
                >
                  🏢 Аккаунты юрлиц (привязка объектов)
                </button>
                <button
                  onClick={() => onSubViewChange('discrepancies')}
                  className={`shrink-0 whitespace-nowrap px-3 py-1.5 sm:py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    activeSubView === 'discrepancies'
                      ? 'bg-stone-900 text-white font-bold'
                      : 'text-stone-600 hover:bg-stone-200'
                  }`}
                >
                  📊 Сводка расхождений (3 точки контроля)
                </button>
                <button
                  onClick={() => onSubViewChange('directories')}
                  className={`shrink-0 whitespace-nowrap px-3 py-1.5 sm:py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    activeSubView === 'directories'
                      ? 'bg-stone-900 text-white font-bold'
                      : 'text-stone-600 hover:bg-stone-200'
                  }`}
                >
                  📚 Справочники НСИ (1С / ERP)
                </button>
              </>
            )}
          </div>

          {/* Point Switcher (Allowed for Admin, locked to assigned cafe for Shift Supervisor) */}
          {currentRole === 'shift_supervisor' && (
            <div className="flex items-center gap-2 text-xs shrink-0">
              <span className="text-stone-400 font-medium">Кофейня:</span>
              {isAdmin ? (
                <select
                  value={currentPoint.id}
                  onChange={(e) => {
                    const pt = points.find((p) => p.id === e.target.value);
                    if (pt) onPointChange(pt);
                  }}
                  className="max-w-full bg-white border border-stone-300 rounded-lg px-2.5 py-1 font-semibold text-stone-800 text-xs focus:ring-2 focus:ring-amber-600 outline-none cursor-pointer"
                >
                  {points.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="bg-amber-50 text-amber-900 border border-amber-200 rounded-lg px-2.5 py-1 font-bold text-xs flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-amber-700" />
                  {currentPoint.name}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
