import React, { useState, useEffect, useMemo } from 'react';
import { UserRole, SlotId, CoffeePoint, UserSession } from './types';
import { StorageManager } from './services/storage';
import { ApiService } from './services/api';
import { Header } from './components/Header';
import { LoginPage } from './components/auth/LoginPage';
import { OrderCreationView } from './components/supervisor/OrderCreationView';
import { SupervisorDeliveriesView } from './components/supervisor/SupervisorDeliveriesView';
import { AggregatedOrdersView } from './components/operator/AggregatedOrdersView';
import { WaybillsManagementView } from './components/operator/WaybillsManagementView';
import { DriverWorkspaceView } from './components/driver/DriverWorkspaceView';
import { DiscrepanciesView } from './components/admin/DiscrepanciesView';
import { DirectoriesView } from './components/admin/DirectoriesView';
import { LegalEntitiesAccountView } from './components/admin/LegalEntitiesAccountView';

export default function App() {
  // Current user session & authentication
  const [currentUser, setCurrentUser] = useState<UserSession | null>(() =>
    StorageManager.getCurrentUser()
  );

  const [currentRole, setCurrentRole] = useState<UserRole>(() => {
    const user = StorageManager.getCurrentUser();
    return user ? user.role : 'shift_supervisor';
  });

  const [activeSubView, setActiveSubView] = useState<string>(() => {
    const user = StorageManager.getCurrentUser();
    if (!user) return 'order';
    if (user.role === 'admin') return 'legal_entities';
    if (user.role === 'production_operator') return 'summary';
    if (user.role === 'driver') return 'deliveries';
    return 'order';
  });

  const [points, setPoints] = useState<CoffeePoint[]>(() => StorageManager.getPoints());
  const [currentPoint, setCurrentPoint] = useState<CoffeePoint>(() => {
    const user = StorageManager.getCurrentUser();
    const list = StorageManager.getPoints();
    if (user && user.pointId) {
      const match = list.find((p) => p.id === user.pointId);
      if (match) return match;
    }
    return (
      list[0] || {
        id: 'point-1',
        name: 'Кофейня №1 (Центральная)',
        address: 'ул. Тверская, 12',
        assignedEmployeeIds: [],
        source: 'manual',
        external_id: 'EXT-LOC-001',
        archived: false,
      }
    );
  });

  const [currentSlotId, setCurrentSlotId] = useState<SlotId>('morning');

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

  const loadAccountData = async () => {
    try {
      const data = await ApiService.getHandbooks();
      if (data.points && data.points.length > 0) {
        setPoints(data.points);
        // Sync current point if needed
        const user = StorageManager.getCurrentUser();
        if (user && user.pointId) {
          const match = data.points.find((p: CoffeePoint) => p.id === user.pointId);
          if (match) setCurrentPoint(match);
        } else if (data.points[0]) {
          setCurrentPoint((prev) => data.points.find((p: CoffeePoint) => p.id === prev.id) || data.points[0]);
        }
      }
      await Promise.all([ApiService.getOrders(), ApiService.getWaybills()]);
      checkPendingAggregation();
    } catch (e) {
      console.warn('Backend sync failed, using storage:', e);
      checkPendingAggregation();
    }
  };

  useEffect(() => {
    loadAccountData();

    const handleStorage = () => {
      setPoints(StorageManager.getPoints());
      checkPendingAggregation();
    };
    window.addEventListener('coffee-storage-change', handleStorage);
    return () => window.removeEventListener('coffee-storage-change', handleStorage);
  }, [currentUser?.accountId]);

  // Handle successful login
  const handleLogin = (session: UserSession) => {
    setCurrentUser(session);
    setCurrentRole(session.role);
    StorageManager.setCurrentUser(session);
    StorageManager.setActiveAccountId(session.accountId);

    if (session.role === 'admin') {
      setActiveSubView('legal_entities');
    } else if (session.role === 'production_operator') {
      setActiveSubView('summary');
    } else if (session.role === 'driver') {
      setActiveSubView('deliveries');
    } else {
      setActiveSubView('order');
    }

    // Set point if supervisor
    if (session.pointId) {
      const list = StorageManager.getPoints();
      const match = list.find((p) => p.id === session.pointId);
      if (match) setCurrentPoint(match);
    }

    loadAccountData();
  };

  const handleLogout = () => {
    StorageManager.logout();
    setCurrentUser(null);
  };

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
  if (!currentUser) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-stone-100 flex flex-col text-stone-900 font-sans selection:bg-amber-200">
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
      />

      {/* Main Workspace Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6 pb-28 sm:pb-20">
        {/* SHIFT SUPERVISOR / BARISTA WORKSPACE (Restricted to assigned cafe) */}
        {currentRole === 'shift_supervisor' && (
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
