import React, { useState, useEffect } from 'react';
import { UserRole, CoffeePoint, SlotId, UserSession } from '../types';
import { getOperationalTimeParts, syncServerTime } from '../services/api';
import {
  Coffee,
  Factory,
  ShieldCheck,
  MapPin,
  Layers,
  Truck,
  FileSpreadsheet,
  LogOut,
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
      {/* Global header: brand and account actions only */}
      <div className="border-b border-stone-100 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-amber-800 text-amber-100 shadow-xs">
              <Coffee className="size-5 text-amber-200" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-extrabold tracking-tight text-stone-900 sm:text-lg">
                Кофейня <span className="text-amber-800">→</span> Производство
              </h1>
              <p className="truncate text-xs text-stone-500">
                {currentUser?.accountName ? <><span className="text-stone-400">Аккаунт</span> · <strong>{currentUser.accountName}</strong></> : 'Сквозной заказ · Сводный цех · Отгрузка'}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {currentUser && (
              <div className="hidden items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-2 text-xs sm:flex">
                <div className="grid size-7 place-items-center rounded-lg bg-amber-800 text-white">
                  {currentUser.role === 'admin' ? <ShieldCheck className="size-4 text-amber-300" /> : currentUser.role === 'shift_supervisor' ? <Coffee className="size-4 text-amber-200" /> : currentUser.role === 'production_operator' ? <Factory className="size-4 text-amber-200" /> : <Truck className="size-4 text-amber-200" />}
                </div>
                <div className="max-w-40">
                  <div className="truncate font-bold text-stone-900">{currentUser.name}</div>
                  <div className="truncate text-[10px] text-stone-500">{currentUser.role === 'admin' ? 'Администратор' : currentUser.role === 'shift_supervisor' ? 'Старший смены' : currentUser.role === 'production_operator' ? 'Оператор цеха' : 'Водитель'}</div>
                </div>
              </div>
            )}
            <button onClick={onLogout} className="grid size-9 place-items-center rounded-xl border border-stone-200 bg-stone-50 text-stone-700 transition-colors hover:bg-rose-50 hover:text-rose-700" title="Выйти">
              <LogOut className="size-4" />
              <span className="sr-only">Выйти</span>
            </button>
          </div>
        </div>
      </div>

      {/* Work toolbar: role tabs and shift status stay on one contained row */}
      <div className="border-b border-stone-200 bg-stone-50">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2 sm:px-6">
          {isAdmin ? (
            <div className="flex min-w-0 flex-1 items-center gap-1 rounded-xl bg-stone-200/70 p-1">
              {[['admin', 'Админ', ShieldCheck], ['shift_supervisor', 'Кофейня', Coffee], ['production_operator', 'Цех', Factory], ['driver', 'Водитель', Truck]].map(([role, label, Icon]) => (
                <button key={role as string} onClick={() => { onRoleChange(role as UserRole); onSubViewChange(role === 'admin' ? 'legal_entities' : role === 'shift_supervisor' ? 'order' : role === 'production_operator' ? 'summary' : 'deliveries'); }} className={`flex min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs font-semibold transition-all ${currentRole === role ? 'bg-white text-stone-900 shadow-xs font-bold' : 'text-stone-600 hover:text-stone-900'}`}>
                  <Icon className="hidden size-3.5 shrink-0 sm:block" />
                  <span className="truncate">{label as string}</span>
                  {role === 'production_operator' && hasNewAggregatedOrder && <span className="size-1.5 shrink-0 rounded-full bg-amber-500" />}
                </button>
              ))}
            </div>
          ) : <div className="flex-1" />}
          <div className="flex shrink-0 items-center gap-1.5 rounded-lg px-1 text-xs text-stone-600" title="Время операционного сервера">
            <span className="size-2 rounded-full bg-emerald-600" />
            <span className="hidden font-medium sm:inline">Смена:</span>
            <span className="font-mono font-bold text-stone-900">{serverTime || '--:--:--'}</span>
          </div>
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
