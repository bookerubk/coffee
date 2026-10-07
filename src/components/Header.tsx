import React, { useState, useEffect } from 'react';
import { UserRole, CoffeePoint, SlotId, UserSession } from '../types';
import { getOperationalTimeParts, syncServerTime } from '../services/api';
import { defaultViewFor, getWorkspaceTiles } from '../navigation';
import type { TileIcon } from '../navigation';
import {
  Coffee,
  Factory,
  ShieldCheck,
  MapPin,
  Layers,
  Truck,
  FileSpreadsheet,
  LogOut,
  KeyRound,
  Database,
} from 'lucide-react';

const TILE_ICONS: Record<TileIcon, React.ElementType> = {
  layers: Layers,
  database: Database,
  file: FileSpreadsheet,
  truck: Truck,
  factory: Factory,
  coffee: Coffee,
};

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
  onChangePassword?: () => void;
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
  onChangePassword,
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
            {onChangePassword && (
              <button onClick={onChangePassword} className="grid size-9 place-items-center rounded-xl border border-stone-200 bg-stone-50 text-stone-700 transition-colors hover:bg-amber-50 hover:text-amber-800" title="Сменить пароль">
                <KeyRound className="size-4" />
                <span className="sr-only">Сменить пароль</span>
              </button>
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
            <div className="grid min-w-0 flex-1 grid-cols-4 items-stretch gap-1 rounded-xl bg-stone-200/70 p-1">
              {[['admin', 'Админ', ShieldCheck], ['shift_supervisor', 'Кофейня', Coffee], ['production_operator', 'Цех', Factory], ['driver', 'Водитель', Truck]].map(([role, label, Icon]) => (
                <button key={role as string} onClick={() => { onRoleChange(role as UserRole); onSubViewChange(defaultViewFor(role as UserRole)); }} className={`flex min-w-0 items-center justify-center gap-1 rounded-lg px-1.5 py-2 text-[11px] font-semibold leading-tight transition-all sm:px-2 sm:text-xs ${currentRole === role ? 'bg-white text-stone-900 shadow-xs font-bold' : 'text-stone-600 hover:text-stone-900'}`}>
                  <Icon className="hidden size-3.5 shrink-0 sm:block" />
                  <span className="whitespace-nowrap">{label as string}</span>
                  {role === 'production_operator' && hasNewAggregatedOrder && <span className="size-1.5 shrink-0 rounded-full bg-amber-500" aria-label="Есть новые заказы" />}
                </button>
              ))}
            </div>
          ) : <div className="flex-1" />}
          <div className="flex shrink-0 items-center gap-1.5 border-l border-stone-300 pl-3 text-xs text-stone-600 sm:pl-4" title="Время операционного сервера">
            <span className="size-2 shrink-0 rounded-full bg-emerald-600" aria-hidden="true" />
            <span className="hidden font-medium sm:inline">Смена:</span>
            <span className="font-mono font-bold tabular-nums text-stone-900">{serverTime || '--:--:--'}</span>
          </div>
        </div>
      </div>

      {/* Единственное меню: плитки по ролям. Раньше под ними дублировалась строка вкладок с теми же разделами. */}
      <nav aria-label="Разделы" className="border-t border-slate-100 bg-[#f7f8f6] px-4 py-3">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-2 sm:flex sm:gap-3">
          {getWorkspaceTiles(currentRole).map((tile) => {
            const Icon = TILE_ICONS[tile.icon];
            const isActive = activeSubView === tile.view;
            return (
              <button
                key={tile.view}
                type="button"
                onClick={() => onSubViewChange(tile.view)}
                aria-current={isActive ? 'page' : undefined}
                className={`workspace-tile workspace-tile-${tile.color}${isActive ? ' workspace-tile-active' : ''}`}
              >
                <span className="workspace-icon"><Icon aria-hidden="true" /></span>
                <span>
                  <strong>{tile.title}</strong>
                  <small>{tile.subtitle}</small>
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Кофейня: администратор выбирает любую, старший смены видит свою (закреплена за ним) */}
      {currentRole === 'shift_supervisor' && (
        <div className="border-t border-slate-100 bg-white px-4 py-2">
          <div className="mx-auto flex max-w-7xl items-center gap-2 text-xs">
            <span className="shrink-0 font-medium text-stone-400">Кофейня:</span>
            {isAdmin ? (
              <select
                value={currentPoint.id}
                onChange={(e) => {
                  const pt = points.find((p) => p.id === e.target.value);
                  if (pt) onPointChange(pt);
                }}
                className="min-w-0 max-w-full cursor-pointer rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-xs font-semibold text-stone-800 outline-none focus:ring-2 focus:ring-amber-600"
              >
                {points.length === 0 && <option value="">Нет кофеен</option>}
                {points.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="flex min-w-0 items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-900">
                <MapPin className="size-3 shrink-0 text-amber-700" />
                <span className="truncate">{currentPoint.name || 'Не назначена'}</span>
              </span>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
