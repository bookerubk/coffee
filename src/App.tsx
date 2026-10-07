import React, { useState, useEffect, useMemo, useRef } from 'react';
import { UserRole, SlotId, CoffeePoint, UserSession } from './types';
import { StorageManager } from './services/storage';
import { ApiService } from './services/api';
import { Header } from './components/Header';
import { LoginPage } from './components/auth/LoginPage';
import { ChangePasswordModal } from './components/auth/ChangePasswordModal';
import { defaultViewFor } from './navigation';
import { BlockingSaveOverlay } from './components/BlockingSaveOverlay';
import { OrderCreationView } from './components/supervisor/OrderCreationView';
import { SupervisorDeliveriesView } from './components/supervisor/SupervisorDeliveriesView';
import { AggregatedOrdersView } from './components/operator/AggregatedOrdersView';
import { WaybillsManagementView } from './components/operator/WaybillsManagementView';
import { DriverWorkspaceView } from './components/driver/DriverWorkspaceView';
import { DiscrepanciesView } from './components/admin/DiscrepanciesView';
import { DirectoriesView } from './components/admin/DirectoriesView';
import { LegalEntitiesAccountView } from './components/admin/LegalEntitiesAccountView';

/** Заглушка «кофейня не выбрана»: пока в БД нет кофеен, вместо неё не подставляется демо-точка. */
const NO_POINT: CoffeePoint = {
  id: '',
  name: '',
  address: '',
  assignedEmployeeIds: [],
  source: 'manual',
  external_id: '',
  archived: false,
};

/** Фоновое обновление данных: заказы и накладные меняют разные люди (водитель, цех, кофейня). */
const BACKGROUND_SYNC_MS = 60_000;
const MIN_SYNC_GAP_MS = 10_000;

export default function App() {
  // Current user session & authentication
  // Источник истины о входе — сервер (HttpOnly-cookie). Локально хранится лишь копия профиля,
  // поэтому пользователь считается вошедшим только после проверки сессии на сервере.
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [loginNotice, setLoginNotice] = useState<string | undefined>();
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const currentUserRef = useRef<UserSession | null>(null);
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  const [currentRole, setCurrentRole] = useState<UserRole>(() => {
    const user = StorageManager.getCurrentUser();
    return user ? user.role : 'shift_supervisor';
  });

  const [activeSubView, setActiveSubView] = useState<string>(() => defaultViewFor(StorageManager.getCurrentUser()?.role ?? 'shift_supervisor'));

  const [points, setPoints] = useState<CoffeePoint[]>(() => StorageManager.getPoints());
  const [currentPoint, setCurrentPoint] = useState<CoffeePoint>(() => {
    const user = StorageManager.getCurrentUser();
    const list = StorageManager.getPoints();
    if (user && user.pointId) {
      const match = list.find((p) => p.id === user.pointId);
      if (match) return match;
    }
    return list[0] ?? NO_POINT;
  });

  const [currentSlotId, setCurrentSlotId] = useState<SlotId>('morning');

  // Ошибки сохранения на сервере (ApiService.save* больше не глотают их молча)
  const [syncError, setSyncError] = useState<string | null>(null);
  useEffect(() => {
    const handleSyncError = (event: Event) => {
      setSyncError((event as CustomEvent).detail?.message || 'Ошибка синхронизации с сервером.');
    };
    window.addEventListener('coffee-sync-error', handleSyncError);
    return () => window.removeEventListener('coffee-sync-error', handleSyncError);
  }, []);

  // Восстановление сессии при запуске
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await ApiService.fetchSession();
      if (cancelled) return;
      if (result === 'offline') {
        // Сервер недоступен: работаем с локальной копией профиля (аварийный режим кофейни без интернета).
        // Записи на сервер при этом всё равно потребуют действующей сессии.
        const cached = StorageManager.getCurrentUser();
        if (cached) handleLogin(cached);
      } else if (result) {
        handleLogin(result);
      } else {
        StorageManager.logout(); // сессии нет — стираем устаревший локальный профиль и кэш
      }
      setAuthChecked(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Сервер ответил 401: сессия истекла, отозвана (смена пароля, архивация) — возвращаем на вход
  useEffect(() => {
    const handleExpired = () => {
      if (!currentUserRef.current) return;
      endSession('Сессия завершена. Войдите снова.');
    };
    window.addEventListener('coffee-auth-expired', handleExpired);
    return () => window.removeEventListener('coffee-auth-expired', handleExpired);
  }, []);

  // Check pending aggregations for operator notification badge
  const [hasNewAggregatedOrder, setHasNewAggregatedOrder] = useState<boolean>(false);

  const checkPendingAggregation = () => {
    const orders = StorageManager.getOrders();
    const waybills = StorageManager.getWaybills();

    // Submitted orders without waybill
    const pending = orders.some(
      (o) =>
        o.status === 'submitted' &&
        !waybills.some((w) => w.orderId === o.id)
    );
    setHasNewAggregatedOrder(pending);
  };

  const lastSyncRef = useRef(0);

  const loadAccountData = async () => {
    lastSyncRef.current = Date.now();
    try {
      const data = await ApiService.getHandbooks();
      // Сервер — источник истины: пустой список кофеен тоже применяется (раньше оставались старые/демо-данные)
      const list: CoffeePoint[] = Array.isArray(data.points) ? data.points : [];
      setPoints(list);
      const user = StorageManager.getCurrentUser();
      setCurrentPoint((prev) => {
        if (user && user.pointId) return list.find((p) => p.id === user.pointId) ?? NO_POINT;
        return list.find((p) => p.id === prev.id) ?? list[0] ?? NO_POINT;
      });
      await Promise.all([ApiService.getOrders(), ApiService.getWaybills()]);
      lastSyncRef.current = Date.now();
      checkPendingAggregation();
    } catch (e) {
      console.warn('Backend sync failed, using storage:', e);
      checkPendingAggregation();
    }
  };

  useEffect(() => {
    if (!currentUser) return;
    loadAccountData();

    const handleStorage = () => {
      setPoints(StorageManager.getPoints());
      checkPendingAggregation();
    };
    window.addEventListener('coffee-storage-change', handleStorage);
    return () => window.removeEventListener('coffee-storage-change', handleStorage);
  }, [currentUser?.id]);

  // Фоновое обновление: пока приложение открыто, подтягиваем изменения других сотрудников
  // (водитель подтвердил доставку, цех отгрузил, кофейня оформила заказ) — без перезагрузки страницы.
  useEffect(() => {
    if (!currentUser) return;
    const syncIfVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastSyncRef.current < MIN_SYNC_GAP_MS) return;
      void loadAccountData();
    };
    const timer = setInterval(syncIfVisible, BACKGROUND_SYNC_MS);
    document.addEventListener('visibilitychange', syncIfVisible);
    window.addEventListener('focus', syncIfVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', syncIfVisible);
      window.removeEventListener('focus', syncIfVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  // При переходе между разделами данные тоже обновляются
  useEffect(() => {
    if (!currentUser) return;
    if (Date.now() - lastSyncRef.current < MIN_SYNC_GAP_MS) return;
    void loadAccountData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSubView, currentRole]);

  // Handle successful login
  const handleLogin = (session: UserSession) => {
    currentUserRef.current = session;
    setLoginNotice(undefined);
    setCurrentUser(session);
    setCurrentRole(session.role);
    StorageManager.setCurrentUser(session);
    StorageManager.setActiveAccountId(session.accountId);

    setActiveSubView(defaultViewFor(session.role));

    // Set point if supervisor
    if (session.pointId) {
      const list = StorageManager.getPoints();
      setCurrentPoint(list.find((p) => p.id === session.pointId) ?? NO_POINT);
    }
  };

  const endSession = (notice?: string) => {
    ApiService.logout(); // сервер сбрасывает cookie
    StorageManager.logout(); // очищает профиль и кэш данных
    setShowPasswordModal(false);
    setCurrentUser(null);
    setLoginNotice(notice);
  };

  const handleLogout = () => endSession();

  // Supervisor name
  const currentSupervisorName = useMemo(() => {
    if (currentUser?.role === 'shift_supervisor') {
      return currentUser.name;
    }
    const employees = StorageManager.getEmployees();
    const emp = employees.find((e) => e.pointId === currentPoint.id && e.role === 'shift_supervisor');
    return emp ? emp.name : 'Старший смены';
  }, [currentUser, currentPoint.id]);

  // If not authenticated, render Login Page
  if (!authChecked) {
    return (
      <div className="grid min-h-screen place-items-center bg-stone-100 text-sm text-stone-500" role="status">
        Проверка доступа…
      </div>
    );
  }

  if (!currentUser) {
    return <LoginPage onLogin={handleLogin} notice={loginNotice} />;
  }

  return (
    <div className="min-h-screen bg-[#f4f5f2] flex flex-col text-slate-900 font-sans selection:bg-emerald-200">
      {syncError && (
        <div role="alert" className="sticky top-0 z-50 flex items-start justify-between gap-3 border-b border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <span>{syncError}</span>
          <button type="button" onClick={() => setSyncError(null)} className="shrink-0 font-bold text-rose-700 hover:text-rose-900" aria-label="Закрыть уведомление">
            ✕
          </button>
        </div>
      )}

      {showPasswordModal && <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />}

      <BlockingSaveOverlay />

      {/* Main Header with Role & Point switchers */}
      <Header
        currentRole={currentRole}
        onRoleChange={setCurrentRole}
        activeSubView={activeSubView}
        onSubViewChange={setActiveSubView}
        points={points.filter((p) => !p.archived)}
        currentPoint={currentPoint}
        onPointChange={setCurrentPoint}
        currentSlotId={currentSlotId}
        hasNewAggregatedOrder={hasNewAggregatedOrder}
        currentUser={currentUser}
        onLogout={handleLogout}
        onChangePassword={() => setShowPasswordModal(true)}
      />

      {/* Main Workspace Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6 pb-28 sm:pb-20">
        {/* SHIFT SUPERVISOR / BARISTA WORKSPACE (Restricted to assigned cafe) */}
        {currentRole === 'shift_supervisor' && !currentPoint.id && (
          <div className="mx-auto max-w-xl rounded-2xl border border-dashed border-stone-300 bg-white p-8 text-center">
            <h2 className="text-base font-bold text-stone-900">
              {currentUser.role === 'admin' ? 'В справочнике нет ни одной кофейни' : 'За вами не закреплена кофейня'}
            </h2>
            <p className="mt-2 text-sm leading-6 text-stone-500">
              {currentUser.role === 'admin'
                ? 'Добавьте кофейню в разделе «Справочники» — после этого здесь можно будет оформлять заявки.'
                : 'Обратитесь к администратору: он закрепит за вами кофейню в разделе «Справочники → Сотрудники».'}
            </p>
          </div>
        )}
        {currentRole === 'shift_supervisor' && !!currentPoint.id && (
          <>
            {activeSubView === 'order' && (
              <OrderCreationView
                currentPoint={currentPoint}
                currentSlotId={currentSlotId}
                onSlotChange={setCurrentSlotId}
                supervisorName={currentSupervisorName}
              />
            )}
            {activeSubView === 'deliveries' && (
              <SupervisorDeliveriesView
                currentPoint={currentPoint}
                supervisorName={currentSupervisorName}
              />
            )}
          </>
        )}

        {/* PRODUCTION OPERATOR WORKSPACE (Restricted to assigned workshop) */}
        {currentRole === 'production_operator' && (
          <>
            {activeSubView === 'summary' && (
              <AggregatedOrdersView
                onNavigateToWaybills={() => setActiveSubView('waybills')}
                workshopId={currentUser.workshopId}
                workshopName={currentUser.workshopName}
              />
            )}
            {activeSubView === 'waybills' && (
              <WaybillsManagementView
                operatorName={currentUser.name}
                workshopId={currentUser.workshopId}
                workshopName={currentUser.workshopName}
              />
            )}
          </>
        )}

        {/* DRIVER WORKSPACE (Restricted to driver's deliveries & route) */}
        {currentRole === 'driver' && (
          <DriverWorkspaceView currentUser={currentUser} />
        )}

        {/* ADMINISTRATOR WORKSPACE (Full access across the tenant account's database) */}
        {currentRole === 'admin' && (
          <>
            {activeSubView === 'legal_entities' && <LegalEntitiesAccountView />}
            {activeSubView === 'discrepancies' && <DiscrepanciesView />}
            {activeSubView === 'directories' && <DirectoriesView />}
          </>
        )}
      </main>
    </div>
  );
}
