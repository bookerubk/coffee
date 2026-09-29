import React, { useState, useEffect } from 'react';
import { UserSession, UserRole, TenantAccount, CoffeePoint, Workshop, Driver, Employee } from '../../types';
import { StorageManager } from '../../services/storage';
import { ApiService } from '../../services/api';
import {
  Coffee,
  Factory,
  ShieldCheck,
  Truck,
  Building2,
  Database,
  Lock,
  ArrowRight,
  Plus,
  Check,
  User,
  MapPin,
  KeyRound,
  Sparkles,
} from 'lucide-react';

interface LoginPageProps {
  onLogin: (session: UserSession) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const [accounts, setAccounts] = useState<TenantAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('acc-aroma');
  const [selectedRole, setSelectedRole] = useState<UserRole>('admin');

  // Handbook data for selected account
  const [points, setPoints] = useState<CoffeePoint[]>([]);
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  // Selected specific identities
  const [selectedPointId, setSelectedPointId] = useState<string>('');
  const [selectedWorkshopId, setSelectedWorkshopId] = useState<string>('');
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');
  const [customPassword, setCustomPassword] = useState<string>('••••••••');

  // New Account Modal
  const [isNewAccountModalOpen, setIsNewAccountModalOpen] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountInn, setNewAccountInn] = useState('');
  const [newAccountAdminEmail, setNewAccountAdminEmail] = useState('');
  const [newAccountAdminName, setNewAccountAdminName] = useState('');
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);

  // Load accounts and handbook data for active account
  const loadAccountData = async (accId: string) => {
    StorageManager.setActiveAccountId(accId);
    try {
      const data = await ApiService.getHandbooks();
      if (data.accounts && data.accounts.length > 0) {
        setAccounts(data.accounts);
      } else {
        setAccounts(StorageManager.getTenantAccounts());
      }
      setPoints(data.points || StorageManager.getPoints());
      setWorkshops(data.workshops || StorageManager.getWorkshops());
      setDrivers(data.drivers || StorageManager.getDrivers());
      setEmployees(data.employees || StorageManager.getEmployees());

      // Auto-select first items
      if (data.points && data.points.length > 0) setSelectedPointId(data.points[0].id);
      if (data.workshops && data.workshops.length > 0) setSelectedWorkshopId(data.workshops[0].id);
      if (data.drivers && data.drivers.length > 0) setSelectedDriverId(data.drivers[0].id);
    } catch {
      setAccounts(StorageManager.getTenantAccounts());
      setPoints(StorageManager.getPoints());
      setWorkshops(StorageManager.getWorkshops());
      setDrivers(StorageManager.getDrivers());
      setEmployees(StorageManager.getEmployees());
    }
  };

  useEffect(() => {
    loadAccountData(selectedAccountId);
  }, [selectedAccountId]);

  useEffect(() => {
    if (isNewAccountModalOpen) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
    return () => {
      document.body.classList.remove('modal-open');
    };
  }, [isNewAccountModalOpen]);

  const activeAccount = accounts.find((a) => a.id === selectedAccountId) || accounts[0] || {
    id: 'acc-aroma',
    name: 'Сеть кофеен «Арома Холдинг»',
    dbSchema: 'db_aroma_prod',
    inn: '7701984210',
    adminEmail: 'admin@aroma-coffee.ru',
    adminName: 'Сергей Воронов',
    description: 'Основная база данных сети',
  };

  const handlePerformLogin = () => {
    let session: UserSession;

    if (selectedRole === 'admin') {
      session = {
        id: `user-admin-${Date.now()}`,
        name: activeAccount.adminName || 'Главный администратор',
        role: 'admin',
        accountId: activeAccount.id,
        accountName: activeAccount.name,
        dbSchema: activeAccount.dbSchema,
        email: activeAccount.adminEmail,
      };
    } else if (selectedRole === 'shift_supervisor') {
      const pt = points.find((p) => p.id === selectedPointId) || points[0];
      const emp = employees.find((e) => e.pointId === pt?.id && e.role === 'shift_supervisor');
      session = {
        id: `user-barista-${Date.now()}`,
        name: emp ? emp.name : 'Старший смены',
        role: 'shift_supervisor',
        accountId: activeAccount.id,
        accountName: activeAccount.name,
        dbSchema: activeAccount.dbSchema,
        pointId: pt ? pt.id : 'point-1',
        pointName: pt ? pt.name : 'Кофейня сети',
      };
    } else if (selectedRole === 'production_operator') {
      const ws = workshops.find((w) => w.id === selectedWorkshopId) || workshops[0];
      session = {
        id: `user-operator-${Date.now()}`,
        name: ws?.chiefName || 'Павел Архипов',
        role: 'production_operator',
        accountId: activeAccount.id,
        accountName: activeAccount.name,
        dbSchema: activeAccount.dbSchema,
        workshopId: ws ? ws.id : 'ws-1',
        workshopName: ws ? ws.name : 'Производственный цех',
      };
    } else {
      // Driver
      const drv = drivers.find((d) => d.id === selectedDriverId) || drivers[0];
      session = {
        id: `user-driver-${Date.now()}`,
        name: drv ? drv.name : 'Михаил Васильев',
        role: 'driver',
        accountId: activeAccount.id,
        accountName: activeAccount.name,
        dbSchema: activeAccount.dbSchema,
        driverId: drv ? drv.id : 'drv-1',
        vehicleModel: drv ? drv.vehicleModel : 'ГАЗель NEXT',
        licensePlate: drv ? drv.licensePlate : 'В782ОК 777',
        phone: drv ? drv.phone : '+7 (915) 333-22-11',
      };
    }

    StorageManager.setCurrentUser(session);
    StorageManager.setActiveAccountId(session.accountId);
    onLogin(session);
  };

  const handleQuickLogin = (demoType: 'admin_aroma' | 'admin_nordic' | 'barista_tverskaya' | 'operator_ws1' | 'driver_mikhail' | 'driver_nordic') => {
    let session: UserSession;

    if (demoType === 'admin_aroma') {
      session = {
        id: 'demo-admin-aroma',
        name: 'Сергей Воронов',
        role: 'admin',
        accountId: 'acc-aroma',
        accountName: 'Сеть кофеен «Арома Холдинг»',
        dbSchema: 'db_aroma_prod',
        email: 'admin@aroma-coffee.ru',
      };
    } else if (demoType === 'admin_nordic') {
      session = {
        id: 'demo-admin-nordic',
        name: 'Алексей Смирнов',
        role: 'admin',
        accountId: 'acc-nordic',
        accountName: 'Сеть кофеен «Север Кофе» (Изолированная БД)',
        dbSchema: 'db_nordic_prod',
        email: 'admin@nordic-coffee.ru',
      };
    } else if (demoType === 'barista_tverskaya') {
      session = {
        id: 'demo-barista-tverskaya',
        name: 'Анна Белова',
        role: 'shift_supervisor',
        accountId: 'acc-aroma',
        accountName: 'Сеть кофеен «Арома Холдинг»',
        dbSchema: 'db_aroma_prod',
        pointId: 'point-1',
        pointName: 'Кофейня №1 (Центральная, ул. Тверская, 12)',
      };
    } else if (demoType === 'operator_ws1') {
      session = {
        id: 'demo-operator-ws1',
        name: 'Павел Архипов',
        role: 'production_operator',
        accountId: 'acc-aroma',
        accountName: 'Сеть кофеен «Арома Холдинг»',
        dbSchema: 'db_aroma_prod',
        workshopId: 'ws-1',
        workshopName: 'Центральный кондитерский цех (Текстильщики)',
      };
    } else if (demoType === 'driver_mikhail') {
      session = {
        id: 'demo-driver-mikhail',
        name: 'Михаил Васильев',
        role: 'driver',
        accountId: 'acc-aroma',
        accountName: 'Сеть кофеен «Арома Холдинг»',
        dbSchema: 'db_aroma_prod',
        driverId: 'drv-1',
        vehicleModel: 'ГАЗель NEXT (Изотерм)',
        licensePlate: 'В782ОК 777',
        phone: '+7 (915) 333-22-11',
      };
    } else {
      session = {
        id: 'demo-driver-nordic',
        name: 'Роман Кузнецов',
        role: 'driver',
        accountId: 'acc-nordic',
        accountName: 'Сеть кофеен «Север Кофе» (Изолированная БД)',
        dbSchema: 'db_nordic_prod',
        driverId: 'drv-nordic-1',
        vehicleModel: 'Volkswagen Crafter',
        licensePlate: 'О123РР 178',
        phone: '+7 (921) 555-44-33',
      };
    }

    StorageManager.setCurrentUser(session);
    StorageManager.setActiveAccountId(session.accountId);
    onLogin(session);
  };

  const handleCreateNewAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccountName.trim()) return;

    setIsCreatingAccount(true);
    const newId = `acc-${Date.now().toString(36)}`;
    const newAcc: TenantAccount = {
      id: newId,
      name: newAccountName.trim(),
      dbSchema: `db_${newId.replace(/-/g, '_')}_tenant`,
      inn: newAccountInn.trim() || '7700000000',
      adminEmail: newAccountAdminEmail.trim() || 'admin@company.ru',
      adminName: newAccountAdminName.trim() || 'Администратор сети',
      description: 'Изолированная база данных компании',
    };

    try {
      await ApiService.createTenantAccount(newAcc);
      setAccounts((prev) => [...prev, newAcc]);
      setSelectedAccountId(newAcc.id);
      setIsNewAccountModalOpen(false);
      setNewAccountName('');
      setNewAccountInn('');
      setNewAccountAdminEmail('');
      setNewAccountAdminName('');
    } catch (err: any) {
      alert(err.message || 'Ошибка создания аккаунта');
    } finally {
      setIsCreatingAccount(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-100 flex flex-col justify-center items-center p-4 sm:p-6 text-stone-900 selection:bg-amber-200">
      {/* Brand Header */}
      <div className="text-center mb-6 max-w-md">
        <div className="w-14 h-14 bg-amber-800 text-amber-100 rounded-2xl flex items-center justify-center font-bold text-2xl mx-auto shadow-md mb-3">
          <Coffee className="w-7 h-7" />
        </div>
        <div className="flex items-center justify-center gap-2">
          <h1 className="text-2xl font-black text-stone-900 tracking-tight">
            Кофейня <span className="text-amber-800">→</span> Производство
          </h1>
          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-amber-100 text-amber-900 rounded">
            PWA
          </span>
        </div>
        <p className="text-xs text-stone-500 mt-1">
          Вход в рабочую область • Изолированная база данных компании (Cloud SQL PostgreSQL)
        </p>
      </div>

      {/* Main Login Card */}
      <div className="bg-white rounded-3xl border border-stone-200 shadow-xl max-w-xl w-full p-4 sm:p-8 space-y-6 overflow-hidden">
        {/* Quick 1-Click Demo Login Bar */}
        <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-3 sm:p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-700 shrink-0" />
              Быстрый вход для проверки (в 1 клик):
            </span>
            <span className="text-[10px] text-amber-800 bg-amber-100 font-bold px-2 py-0.5 rounded-md">
              Демо-доступ
            </span>
          </div>

          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => handleQuickLogin('admin_aroma')}
              className="p-2.5 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-left transition-all cursor-pointer shadow-xs"
            >
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="text-[11px] font-bold leading-tight line-clamp-1">Админ Арома</span>
              </div>
              <span className="text-[9px] text-stone-400 block mt-0.5 font-mono truncate">db_aroma_prod (Все)</span>
            </button>

            <button
              type="button"
              onClick={() => handleQuickLogin('admin_nordic')}
              className="p-2.5 bg-sky-950 hover:bg-sky-900 text-white rounded-xl text-left transition-all cursor-pointer shadow-xs"
            >
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span className="text-[11px] font-bold leading-tight line-clamp-1">Админ Север Кофе</span>
              </div>
              <span className="text-[9px] text-sky-300 block mt-0.5 font-mono truncate">db_nordic_prod (Изолир.)</span>
            </button>

            <button
              type="button"
              onClick={() => handleQuickLogin('driver_mikhail')}
              className="p-2.5 bg-amber-800 hover:bg-amber-900 text-white rounded-xl text-left transition-all cursor-pointer shadow-xs"
            >
              <div className="flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                <span className="text-[11px] font-bold leading-tight line-clamp-1">Водитель Михаил</span>
              </div>
              <span className="text-[9px] text-amber-200 block mt-0.5 truncate">ГАЗель В782ОК</span>
            </button>

            <button
              type="button"
              onClick={() => handleQuickLogin('operator_ws1')}
              className="p-2.5 bg-amber-800 hover:bg-amber-900 text-white rounded-xl text-left transition-all cursor-pointer shadow-xs"
            >
              <div className="flex items-center gap-1.5">
                <Factory className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                <span className="text-[11px] font-bold leading-tight line-clamp-1">Мастер Цеха №1</span>
              </div>
              <span className="text-[9px] text-amber-200 block mt-0.5 truncate">Сводка выпечки</span>
            </button>

            <button
              type="button"
              onClick={() => handleQuickLogin('barista_tverskaya')}
              className="p-2.5 bg-amber-800 hover:bg-amber-900 text-white rounded-xl text-left transition-all cursor-pointer shadow-xs"
            >
              <div className="flex items-center gap-1.5">
                <Coffee className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                <span className="text-[11px] font-bold leading-tight line-clamp-1">Бариста Тверская</span>
              </div>
              <span className="text-[9px] text-amber-200 block mt-0.5 truncate">Кофейня №1</span>
            </button>

            <button
              type="button"
              onClick={() => handleQuickLogin('driver_nordic')}
              className="p-2.5 bg-sky-900 hover:bg-sky-800 text-white rounded-xl text-left transition-all cursor-pointer shadow-xs"
            >
              <div className="flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5 text-sky-300 shrink-0" />
                <span className="text-[11px] font-bold leading-tight line-clamp-1">Водитель Роман</span>
              </div>
              <span className="text-[9px] text-sky-200 block mt-0.5 truncate">VW Crafter О123РР</span>
            </button>
          </div>
        </div>

        {/* Step 1: Company Account & Database Selection */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 shrink-0" />
              1. Выбор аккаунта компании и базы данных
            </label>
            <button
              onClick={() => setIsNewAccountModalOpen(true)}
              className="text-[11px] font-bold text-amber-800 hover:text-amber-900 flex items-center gap-1 cursor-pointer self-start sm:self-auto"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Создать новый аккаунт</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {accounts.map((acc) => {
              const isSelected = acc.id === selectedAccountId;
              return (
                <div
                  key={acc.id}
                  onClick={() => setSelectedAccountId(acc.id)}
                  className={`p-3.5 rounded-2xl border text-left cursor-pointer transition-all ${
                    isSelected
                      ? 'border-amber-800 bg-amber-50/50 shadow-xs'
                      : 'border-stone-200 hover:border-stone-300 bg-stone-50/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <h4 className="font-bold text-xs text-stone-900 line-clamp-1">{acc.name}</h4>
                    {isSelected && <Check className="w-3.5 h-3.5 text-amber-800 shrink-0 mt-0.5" />}
                  </div>
                  <span className="text-[10px] font-mono text-stone-500 block mt-1">
                    БД: <strong className="text-amber-900">{acc.dbSchema}</strong>
                  </span>
                  <span className="text-[10px] text-stone-400 block line-clamp-1 mt-0.5">
                    {acc.adminName} (ИНН {acc.inn})
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Step 2: Role Selection Tabs */}
        <div className="space-y-3 pt-4 border-t border-stone-100">
          <label className="text-xs font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1.5">
            <User className="w-3.5 h-3.5" />
            2. Выберите рабочую роль сотрудника
          </label>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => setSelectedRole('admin')}
              className={`p-3 rounded-2xl border text-center flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                selectedRole === 'admin'
                  ? 'bg-stone-900 text-white border-stone-900 shadow-sm'
                  : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
              }`}
            >
              <ShieldCheck className="w-5 h-5 text-amber-400" />
              <span className="text-[11px] font-bold">Администратор</span>
              <span className="text-[9px] opacity-70">Все объекты БД</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedRole('shift_supervisor')}
              className={`p-3 rounded-2xl border text-center flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                selectedRole === 'shift_supervisor'
                  ? 'bg-amber-800 text-white border-amber-800 shadow-sm'
                  : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
              }`}
            >
              <Coffee className="w-5 h-5 text-amber-300" />
              <span className="text-[11px] font-bold">Старший смены</span>
              <span className="text-[9px] opacity-70">Только кофейня</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedRole('production_operator')}
              className={`p-3 rounded-2xl border text-center flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                selectedRole === 'production_operator'
                  ? 'bg-amber-800 text-white border-amber-800 shadow-sm'
                  : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
              }`}
            >
              <Factory className="w-5 h-5 text-amber-300" />
              <span className="text-[11px] font-bold">Оператор цеха</span>
              <span className="text-[9px] opacity-70">Сводный цех</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedRole('driver')}
              className={`p-3 rounded-2xl border text-center flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                selectedRole === 'driver'
                  ? 'bg-amber-800 text-white border-amber-800 shadow-sm'
                  : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
              }`}
            >
              <Truck className="w-5 h-5 text-amber-300" />
              <span className="text-[11px] font-bold">Водитель</span>
              <span className="text-[9px] opacity-70">Свои рейсы</span>
            </button>
          </div>
        </div>

        {/* Step 3: Identity & Object Assignment */}
        <div className="space-y-4 pt-4 border-t border-stone-100 text-xs">
          {/* Admin Info */}
          {selectedRole === 'admin' && (
            <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200 space-y-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-800" />
                <h5 className="font-bold text-stone-900">Кабинет администратора аккаунта</h5>
              </div>
              <p className="text-stone-600 text-[11px]">
                Вход под учетной записью управляющего: <strong>{activeAccount.adminName}</strong> ({activeAccount.adminEmail}).
                Вам доступно сквозное управление всеми кофейнями, цехами, водителями, аккаунтами юрлиц и фиксация расхождений в изолированной базе <strong>{activeAccount.dbSchema}</strong>.
              </p>
            </div>
          )}

          {/* Shift Supervisor Specific Cafe Selection */}
          {selectedRole === 'shift_supervisor' && (
            <div className="space-y-2">
              <label className="font-semibold text-stone-700 block">
                Выберите кофейню сети (рабочая зона сотрудника):
              </label>
              <select
                value={selectedPointId}
                onChange={(e) => setSelectedPointId(e.target.value)}
                className="w-full bg-stone-50 border border-stone-300 rounded-xl p-2.5 text-xs text-stone-900 font-medium focus:ring-2 focus:ring-amber-800 outline-none"
              >
                {points.map((p) => {
                  const emp = employees.find((e) => e.pointId === p.id && e.role === 'shift_supervisor');
                  return (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.address}) {emp ? `— ${emp.name}` : ''}
                    </option>
                  );
                })}
              </select>
              <span className="text-[10px] text-stone-400 block">
                🔒 После входа сотрудник видит <strong>ТОЛЬКО</strong> заказы и поставки своей кофейни.
              </span>
            </div>
          )}

          {/* Production Operator Workshop Selection */}
          {selectedRole === 'production_operator' && (
            <div className="space-y-2">
              <label className="font-semibold text-stone-700 block">
                Выберите производственный цех:
              </label>
              <select
                value={selectedWorkshopId}
                onChange={(e) => setSelectedWorkshopId(e.target.value)}
                className="w-full bg-stone-50 border border-stone-300 rounded-xl p-2.5 text-xs text-stone-900 font-medium focus:ring-2 focus:ring-amber-800 outline-none"
              >
                {workshops.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.chiefName || 'Зав. производством'})
                  </option>
                ))}
              </select>
              <span className="text-[10px] text-stone-400 block">
                🔒 Оператор видит <strong>ТОЛЬКО</strong> сводные заявки и накладные для точек своего цеха.
              </span>
            </div>
          )}

          {/* Driver Selection */}
          {selectedRole === 'driver' && (
            <div className="space-y-2">
              <label className="font-semibold text-stone-700 block">
                Выберите водителя доставки:
              </label>
              <select
                value={selectedDriverId}
                onChange={(e) => setSelectedDriverId(e.target.value)}
                className="w-full bg-stone-50 border border-stone-300 rounded-xl p-2.5 text-xs text-stone-900 font-medium focus:ring-2 focus:ring-amber-800 outline-none"
              >
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} — {d.vehicleModel} ({d.licensePlate}) {d.hasRefrigerator ? '❄️ Рефрижератор' : ''}
                  </option>
                ))}
              </select>
              <span className="text-[10px] text-stone-400 block">
                🔒 Водитель видит <strong>ТОЛЬКО</strong> назначенные ему рейсы и путевые накладные.
              </span>
            </div>
          )}

          {/* Password field with Quick Demo mode */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-stone-700">Пароль / PIN-код смены:</label>
              <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded">
                ✓ Демо-доступ включён
              </span>
            </div>
            <div className="relative">
              <input
                type="password"
                value={customPassword}
                onChange={(e) => setCustomPassword(e.target.value)}
                className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-xs font-mono text-stone-900 focus:ring-2 focus:ring-amber-800 outline-none"
              />
              <KeyRound className="w-4 h-4 text-stone-400 absolute right-3 top-2.5" />
            </div>
          </div>
        </div>

        {/* Submit Login Button */}
        <button
          onClick={handlePerformLogin}
          className="w-full py-3 bg-amber-800 hover:bg-amber-900 active:bg-amber-950 text-white rounded-2xl text-xs font-bold shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
        >
          <span>Войти в рабочую область</span>
          <ArrowRight className="w-4 h-4" />
        </button>

        {/* Footer info about multi-tenancy */}
        <div className="text-center pt-2 text-[11px] text-stone-400">
          Аккаунт: <strong className="text-stone-700">{activeAccount.name}</strong> • База данных:{' '}
          <code className="text-amber-800 font-bold">{activeAccount.dbSchema}</code>
        </div>
      </div>

      {/* MODAL: REGISTER NEW COMPANY ACCOUNT (ISOLATED DATABASE) */}
      {isNewAccountModalOpen && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-4 sm:p-6 border border-stone-200 my-auto max-h-[90vh] overflow-y-auto overflow-x-hidden">
            <div className="flex items-center gap-2.5 pb-4 border-b border-stone-100">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold shrink-0">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-stone-900 text-sm">Создание аккаунта компании</h3>
                <p className="text-[11px] text-stone-500">
                  Выделение изолированной базы данных PostgreSQL для новой сети
                </p>
              </div>
            </div>

            <form onSubmit={handleCreateNewAccount} className="mt-4 space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-stone-700 mb-1">
                  Название сети / компании <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Сеть кофеен «Кофе Хаус Групп»"
                  value={newAccountName}
                  onChange={(e) => setNewAccountName(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-300 rounded-xl p-2.5 text-xs outline-none focus:ring-2 focus:ring-amber-800"
                />
              </div>

              <div>
                <label className="block font-semibold text-stone-700 mb-1">
                  ИНН организации
                </label>
                <input
                  type="text"
                  placeholder="7705123456"
                  value={newAccountInn}
                  onChange={(e) => setNewAccountInn(e.target.value.replace(/\D/g, ''))}
                  className="w-full bg-stone-50 border border-stone-300 rounded-xl p-2.5 text-xs font-mono outline-none focus:ring-2 focus:ring-amber-800"
                />
              </div>

              <div>
                <label className="block font-semibold text-stone-700 mb-1">
                  ФИО Главного администратора
                </label>
                <input
                  type="text"
                  placeholder="Иванов Андрей Сергеевич"
                  value={newAccountAdminName}
                  onChange={(e) => setNewAccountAdminName(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-300 rounded-xl p-2.5 text-xs outline-none focus:ring-2 focus:ring-amber-800"
                />
              </div>

              <div>
                <label className="block font-semibold text-stone-700 mb-1">
                  Email для входа администратора
                </label>
                <input
                  type="email"
                  placeholder="admin@coffee-house.ru"
                  value={newAccountAdminEmail}
                  onChange={(e) => setNewAccountAdminEmail(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-300 rounded-xl p-2.5 text-xs outline-none focus:ring-2 focus:ring-amber-800"
                />
              </div>

              <div className="pt-3 border-t border-stone-100 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewAccountModalOpen(false)}
                  className="w-full sm:w-auto px-3.5 py-2 text-stone-600 hover:text-stone-800 text-xs font-semibold rounded-xl text-center cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isCreatingAccount}
                  className="w-full sm:w-auto px-4 py-2 bg-amber-800 hover:bg-amber-900 text-white text-xs font-bold rounded-xl shadow-xs text-center cursor-pointer disabled:opacity-50"
                >
                  {isCreatingAccount ? 'Создание БД...' : 'Создать аккаунт и базу данных'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
