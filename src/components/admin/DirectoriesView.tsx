import React, { useState, useEffect } from 'react';
import {
  CoffeePoint,
  ProductItem,
  Employee,
  SlotConfig,
  LegalEntity,
  Workshop,
  Driver,
} from '../../types';
import { StorageManager } from '../../services/storage';
import { ApiService } from '../../services/api';
import {
  BookOpen,
  MapPin,
  Coffee,
  Users,
  Clock,
  Plus,
  Archive,
  RotateCcw,
  Check,
  Edit2,
  Database,
  Tag,
  Building2,
  Factory,
  Truck,
  Snowflake,
  Phone,
  User,
} from 'lucide-react';

type DirectoryTab = 'points' | 'workshops' | 'drivers' | 'products' | 'employees' | 'slots';

export const DirectoriesView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<DirectoryTab>('points');
  const [points, setPoints] = useState<CoffeePoint[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [slots, setSlots] = useState<SlotConfig[]>([]);
  const [legalEntities, setLegalEntities] = useState<LegalEntity[]>([]);
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);

  // Modal form states
  const [editingPoint, setEditingPoint] = useState<CoffeePoint | null>(null);
  const [editingWorkshop, setEditingWorkshop] = useState<Workshop | null>(null);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [editingProduct, setEditingProduct] = useState<ProductItem | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [editingSlot, setEditingSlot] = useState<SlotConfig | null>(null);

  const loadData = async () => {
    try {
      const data = await ApiService.getHandbooks();
      setPoints(data.points || StorageManager.getPoints());
      setProducts(data.products || StorageManager.getProducts());
      setEmployees(data.employees || StorageManager.getEmployees());
      setSlots(data.slots || StorageManager.getSlots());
      setLegalEntities(data.legalEntities || StorageManager.getLegalEntities());
      setWorkshops(data.workshops || StorageManager.getWorkshops());
      setDrivers(data.drivers || StorageManager.getDrivers());
    } catch {
      setPoints(StorageManager.getPoints());
      setProducts(StorageManager.getProducts());
      setEmployees(StorageManager.getEmployees());
      setSlots(StorageManager.getSlots());
      setLegalEntities(StorageManager.getLegalEntities());
      setWorkshops(StorageManager.getWorkshops());
      setDrivers(StorageManager.getDrivers());
    }
  };

  const isAnyModalOpen = Boolean(
    editingPoint || editingWorkshop || editingDriver || editingProduct || editingEmployee || editingSlot
  );

  useEffect(() => {
    if (isAnyModalOpen) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
    return () => {
      document.body.classList.remove('modal-open');
    };
  }, [isAnyModalOpen]);

  useEffect(() => {
    loadData();
    const handleStorage = () => {
      // Synchronize with local storage mirror without re-invoking network API
      setPoints(StorageManager.getPoints());
      setProducts(StorageManager.getProducts());
      setEmployees(StorageManager.getEmployees());
      setSlots(StorageManager.getSlots());
      setLegalEntities(StorageManager.getLegalEntities());
      setWorkshops(StorageManager.getWorkshops());
      setDrivers(StorageManager.getDrivers());
    };
    window.addEventListener('coffee-storage-change', handleStorage);
    return () => window.removeEventListener('coffee-storage-change', handleStorage);
  }, []);

  // Save Point
  const handleSavePoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPoint) return;
    await ApiService.savePoint(editingPoint);
    setEditingPoint(null);
    loadData();
  };

  // Save Workshop
  const handleSaveWorkshop = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWorkshop) return;
    await ApiService.saveWorkshop(editingWorkshop);
    setEditingWorkshop(null);
    loadData();
  };

  // Save Driver
  const handleSaveDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDriver) return;
    await ApiService.saveDriver(editingDriver);
    setEditingDriver(null);
    loadData();
  };

  // Save Product
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    await ApiService.saveProduct(editingProduct);
    setEditingProduct(null);
    loadData();
  };

  // Save Employee
  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee) return;
    await ApiService.saveEmployee(editingEmployee);
    setEditingEmployee(null);
    loadData();
  };

  // Save Slot
  const handleSaveSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSlot) return;
    await ApiService.saveSlot(editingSlot);
    setEditingSlot(null);
    loadData();
  };

  // Helper names
  const getEntityName = (id?: string) => {
    if (!id) return 'Не привязано';
    const le = legalEntities.find((e) => e.id === id);
    return le ? le.shortName : id;
  };

  const getWorkshopName = (id?: string) => {
    if (!id) return 'Не назначен';
    const ws = workshops.find((w) => w.id === id);
    return ws ? ws.name : id;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl p-5 border border-stone-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md">
              Справочники и интеграции (1С / ERP)
            </span>
          </div>
          <h2 className="text-xl font-bold text-stone-900 mt-1">Нормативно-справочная информация (НСИ)</h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Управление точками кофеен, производственными цехами, водителями, каталогом SKU, сотрудниками и временными окнами слотов.
          </p>
        </div>
      </div>

      {/* Directory Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 max-w-full">
        <button
          onClick={() => setActiveTab('points')}
          className={`shrink-0 whitespace-nowrap flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeTab === 'points'
              ? 'bg-amber-800 text-white shadow-sm'
              : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
          }`}
        >
          <MapPin className="w-4 h-4 shrink-0" />
          <span>Точки кофеен ({points.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('workshops')}
          className={`shrink-0 whitespace-nowrap flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeTab === 'workshops'
              ? 'bg-amber-800 text-white shadow-sm'
              : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
          }`}
        >
          <Factory className="w-4 h-4 shrink-0" />
          <span>Цеха производства ({workshops.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('drivers')}
          className={`shrink-0 whitespace-nowrap flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeTab === 'drivers'
              ? 'bg-amber-800 text-white shadow-sm'
              : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
          }`}
        >
          <Truck className="w-4 h-4 shrink-0" />
          <span>Водители доставки ({drivers.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('products')}
          className={`shrink-0 whitespace-nowrap flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeTab === 'products'
              ? 'bg-amber-800 text-white shadow-sm'
              : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
          }`}
        >
          <Coffee className="w-4 h-4 shrink-0" />
          <span>Товары и SKU ({products.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('employees')}
          className={`shrink-0 whitespace-nowrap flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeTab === 'employees'
              ? 'bg-amber-800 text-white shadow-sm'
              : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
          }`}
        >
          <Users className="w-4 h-4 shrink-0" />
          <span>Сотрудники ({employees.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('slots')}
          className={`shrink-0 whitespace-nowrap flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeTab === 'slots'
              ? 'bg-amber-800 text-white shadow-sm'
              : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
          }`}
        >
          <Clock className="w-4 h-4 shrink-0" />
          <span>Временные слоты ({slots.length})</span>
        </button>
      </div>

      {/* 1. POINTS TAB */}
      {activeTab === 'points' && (
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden space-y-4 p-5">
          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <div>
              <h3 className="font-bold text-sm text-stone-900">Список кофеен сети</h3>
              <p className="text-xs text-stone-400">Точки заказа и приёмки поставок с привязкой к ЮрЛицу и Цеху</p>
            </div>
            <button
              onClick={() =>
                setEditingPoint({
                  id: `point-${Date.now()}`,
                  name: '',
                  address: '',
                  legalEntityId: legalEntities[0]?.id || '',
                  assignedWorkshopId: workshops[0]?.id || '',
                  assignedEmployeeIds: [],
                  source: 'manual',
                  external_id: `EXT-LOC-${Math.floor(100 + Math.random() * 900)}`,
                  archived: false,
                })
              }
              className="px-3.5 py-1.5 bg-amber-800 hover:bg-amber-900 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Добавить точку</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {points.map((pt) => (
              <div
                key={pt.id}
                className={`p-4 rounded-xl border flex flex-col justify-between ${
                  pt.archived ? 'bg-stone-50 border-stone-200 opacity-60' : 'bg-white border-stone-200 shadow-2xs'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-bold text-stone-900 text-sm">{pt.name}</h4>
                      <p className="text-xs text-stone-500 mt-0.5">{pt.address}</p>
                    </div>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                        pt.source === 'external' ? 'bg-blue-100 text-blue-800' : 'bg-stone-100 text-stone-600'
                      }`}
                    >
                      {pt.source === 'external' ? '1C/ERP' : 'Ручной'}
                    </span>
                  </div>

                  {/* Bindings: Legal Entity & Workshop */}
                  <div className="mt-3 pt-3 border-t border-stone-100 space-y-1 text-xs">
                    <div className="flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-amber-800 shrink-0" />
                      <span className="text-stone-400 text-[11px]">Юрлицо:</span>
                      <span className="font-semibold text-stone-800">
                        {getEntityName(pt.legalEntityId)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Factory className="w-3.5 h-3.5 text-amber-800 shrink-0" />
                      <span className="text-stone-400 text-[11px]">Цех снабжения:</span>
                      <span className="font-semibold text-stone-800">
                        {getWorkshopName(pt.assignedWorkshopId)}
                      </span>
                    </div>
                  </div>

                  <p className="text-[11px] font-mono text-stone-400 mt-2">ID: {pt.external_id || pt.id}</p>
                </div>

                <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between">
                  <span className="text-[11px] font-medium text-stone-500">
                    {pt.archived ? '⚠️ В архиве' : '✅ Активна'}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setEditingPoint(pt)}
                      className="p-1.5 text-stone-500 hover:text-stone-800 hover:bg-stone-100 rounded-lg cursor-pointer"
                      title="Редактировать"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        StorageManager.savePoint({ ...pt, archived: !pt.archived });
                        loadData();
                      }}
                      className={`px-2.5 py-1 text-xs rounded-lg font-medium cursor-pointer ${
                        pt.archived
                          ? 'bg-amber-100 text-amber-900 hover:bg-amber-200'
                          : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                      }`}
                    >
                      {pt.archived ? 'Разархивировать' : 'В архив'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. WORKSHOPS TAB */}
      {activeTab === 'workshops' && (
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden space-y-4 p-5">
          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <div>
              <h3 className="font-bold text-sm text-stone-900">Производственные цеха и кухни</h3>
              <p className="text-xs text-stone-400">Цеха производства выпечки, обжарки и комплектации сводных заказов</p>
            </div>
            <button
              onClick={() =>
                setEditingWorkshop({
                  id: `ws-${Date.now()}`,
                  name: '',
                  legalEntityId: legalEntities[0]?.id || '',
                  address: '',
                  chiefName: '',
                  phone: '',
                  capacity: '500 позиций/смену',
                  source: 'manual',
                  external_id: `WS-${Math.floor(100 + Math.random() * 900)}`,
                  archived: false,
                })
              }
              className="px-3.5 py-1.5 bg-amber-800 hover:bg-amber-900 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Добавить цех</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {workshops.map((ws) => {
              const linkedPoints = points.filter((p) => p.assignedWorkshopId === ws.id);
              return (
                <div
                  key={ws.id}
                  className={`p-4 rounded-xl border flex flex-col justify-between ${
                    ws.archived ? 'bg-stone-50 border-stone-200 opacity-60' : 'bg-white border-stone-200 shadow-2xs'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-bold text-stone-900 text-sm">{ws.name}</h4>
                        <p className="text-xs text-stone-500 mt-0.5">{ws.address}</p>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-stone-100 text-stone-600">
                        {ws.source === 'external' ? '1C/ERP' : 'Ручной'}
                      </span>
                    </div>

                    <div className="mt-3 pt-3 border-t border-stone-100 space-y-1 text-xs">
                      <div className="flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-amber-800 shrink-0" />
                        <span className="text-stone-400 text-[11px]">Юрлицо:</span>
                        <span className="font-semibold text-stone-800">
                          {getEntityName(ws.legalEntityId)}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
                        <div>
                          <span className="text-stone-400 block text-[10px]">Заведующий:</span>
                          <span className="font-medium text-stone-800">{ws.chiefName || '—'}</span>
                        </div>
                        <div>
                          <span className="text-stone-400 block text-[10px]">Телефон:</span>
                          <span className="font-medium text-stone-800">{ws.phone || '—'}</span>
                        </div>
                      </div>

                      <div className="pt-1 text-[11px]">
                        <span className="text-stone-400">Снабжает кофеен: </span>
                        <strong className="text-amber-800">{linkedPoints.length}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between">
                    <span className="text-[11px] font-medium text-stone-500">
                      {ws.archived ? '⚠️ В архиве' : '✅ Активен'}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setEditingWorkshop(ws)}
                        className="p-1.5 text-stone-500 hover:text-stone-800 hover:bg-stone-100 rounded-lg cursor-pointer"
                        title="Редактировать"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          StorageManager.saveWorkshop({ ...ws, archived: !ws.archived });
                          loadData();
                        }}
                        className={`px-2.5 py-1 text-xs rounded-lg font-medium cursor-pointer ${
                          ws.archived
                            ? 'bg-amber-100 text-amber-900 hover:bg-amber-200'
                            : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                        }`}
                      >
                        {ws.archived ? 'Разархивировать' : 'В архив'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. DRIVERS TAB */}
      {activeTab === 'drivers' && (
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden space-y-4 p-5">
          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <div>
              <h3 className="font-bold text-sm text-stone-900">Водители доставки</h3>
              <p className="text-xs text-stone-400">Водители, автомобили и температурные режимы доставки в кофейни</p>
            </div>
            <button
              onClick={() =>
                setEditingDriver({
                  id: `drv-${Date.now()}`,
                  name: '',
                  phone: '',
                  legalEntityId: legalEntities[0]?.id || '',
                  assignedWorkshopId: workshops[0]?.id || '',
                  vehicleModel: 'ГАЗель NEXT',
                  licensePlate: '',
                  hasRefrigerator: true,
                  status: 'active',
                  archived: false,
                })
              }
              className="px-3.5 py-1.5 bg-amber-800 hover:bg-amber-900 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Добавить водителя</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {drivers.map((drv) => (
              <div
                key={drv.id}
                className={`p-4 rounded-xl border flex flex-col justify-between ${
                  drv.archived ? 'bg-stone-50 border-stone-200 opacity-60' : 'bg-white border-stone-200 shadow-2xs'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-bold text-stone-900 text-sm">{drv.name}</h4>
                      <p className="text-xs text-stone-500 mt-0.5">{drv.phone}</p>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        drv.status === 'on_route'
                          ? 'bg-amber-100 text-amber-800'
                          : drv.status === 'day_off'
                          ? 'bg-stone-100 text-stone-600'
                          : 'bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      {drv.status === 'on_route' ? 'В рейсе' : drv.status === 'day_off' ? 'Выходной' : 'На линии'}
                    </span>
                  </div>

                  <div className="mt-3 pt-3 border-t border-stone-100 space-y-1 text-xs">
                    <div className="flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-amber-800 shrink-0" />
                      <span className="text-stone-400 text-[11px]">Юрлицо/перевозчик:</span>
                      <span className="font-semibold text-stone-800">
                        {getEntityName(drv.legalEntityId)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Factory className="w-3.5 h-3.5 text-amber-800 shrink-0" />
                      <span className="text-stone-400 text-[11px]">Цех отгрузки:</span>
                      <span className="font-semibold text-stone-800">
                        {getWorkshopName(drv.assignedWorkshopId)}
                      </span>
                    </div>

                    <div className="pt-1 flex items-center justify-between text-[11px]">
                      <span className="text-stone-700 font-medium">
                        {drv.vehicleModel} ({drv.licensePlate || 'б/н'})
                      </span>
                      {drv.hasRefrigerator ? (
                        <span className="text-[10px] font-bold text-sky-800 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200 flex items-center gap-1">
                          <Snowflake className="w-3 h-3 text-sky-600" />
                          Рефрижератор
                        </span>
                      ) : (
                        <span className="text-[10px] text-stone-500">Изотерм</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between">
                  <span className="text-[11px] font-medium text-stone-500">
                    {drv.archived ? '⚠️ В архиве' : '✅ Активен'}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setEditingDriver(drv)}
                      className="p-1.5 text-stone-500 hover:text-stone-800 hover:bg-stone-100 rounded-lg cursor-pointer"
                      title="Редактировать"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        StorageManager.saveDriver({ ...drv, archived: !drv.archived });
                        loadData();
                      }}
                      className={`px-2.5 py-1 text-xs rounded-lg font-medium cursor-pointer ${
                        drv.archived
                          ? 'bg-amber-100 text-amber-900 hover:bg-amber-200'
                          : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                      }`}
                    >
                      {drv.archived ? 'Разархивировать' : 'В архив'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. PRODUCTS TAB */}
      {activeTab === 'products' && (
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <div>
              <h3 className="font-bold text-sm text-stone-900">Номенклатурный справочник товаров (SKU)</h3>
              <p className="text-xs text-stone-400">Продукция собственного производства и сырьё</p>
            </div>
            <button
              onClick={() =>
                setEditingProduct({
                  id: `prod-${Date.now()}`,
                  sku: `SKU-${Math.floor(100 + Math.random() * 900)}`,
                  name: '',
                  unit: 'шт',
                  category: 'Свежая выпечка',
                  source: 'manual',
                  external_id: `EXT-PR-${Math.floor(100 + Math.random() * 900)}`,
                  archived: false,
                })
              }
              className="px-3.5 py-1.5 bg-amber-800 hover:bg-amber-900 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Добавить SKU</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-stone-200 text-stone-400 font-semibold bg-stone-50">
                  <th className="p-3">Артикул (SKU)</th>
                  <th className="p-3">Наименование позиции</th>
                  <th className="p-3">Категория</th>
                  <th className="p-3">Ед. изм.</th>
                  <th className="p-3">Источник</th>
                  <th className="p-3 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {products.map((p) => (
                  <tr
                    key={p.id}
                    className={`hover:bg-stone-50 ${p.archived ? 'opacity-50 line-through' : ''}`}
                  >
                    <td className="p-3 font-mono font-bold text-amber-800">{p.sku}</td>
                    <td className="p-3 font-medium text-stone-900">{p.name}</td>
                    <td className="p-3 text-stone-600">{p.category}</td>
                    <td className="p-3 text-stone-500">{p.unit}</td>
                    <td className="p-3">
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                          p.source === 'external' ? 'bg-blue-50 text-blue-700' : 'bg-stone-100 text-stone-600'
                        }`}
                      >
                        {p.source === 'external' ? '1C/ERP' : 'Ручной'}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setEditingProduct(p)}
                          className="p-1 text-stone-400 hover:text-stone-800 rounded cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            StorageManager.saveProduct({ ...p, archived: !p.archived });
                            loadData();
                          }}
                          className="text-[11px] font-medium text-stone-500 hover:text-stone-800 cursor-pointer"
                        >
                          {p.archived ? 'Восстановить' : 'Архивировать'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. EMPLOYEES TAB */}
      {activeTab === 'employees' && (
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <div>
              <h3 className="font-bold text-sm text-stone-900">Штат сотрудников сети</h3>
              <p className="text-xs text-stone-400">Старшие смены, операторы производства и администраторы</p>
            </div>
            <button
              onClick={() =>
                setEditingEmployee({
                  id: `emp-${Date.now()}`,
                  name: '',
                  role: 'shift_supervisor',
                  pointId: points[0]?.id || '',
                  phone: '',
                  archived: false,
                })
              }
              className="px-3.5 py-1.5 bg-amber-800 hover:bg-amber-900 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Добавить сотрудника</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {employees.map((emp) => {
              const assignedPoint = points.find((p) => p.id === emp.pointId);
              return (
                <div
                  key={emp.id}
                  className={`p-4 rounded-xl border flex flex-col justify-between ${
                    emp.archived ? 'bg-stone-50 border-stone-200 opacity-60' : 'bg-white border-stone-200'
                  }`}
                >
                  <div>
                    <h4 className="font-bold text-stone-900 text-sm">{emp.name}</h4>
                    <span className="inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                      {emp.role === 'shift_supervisor'
                        ? '☕ Старший смены'
                        : emp.role === 'production_operator'
                        ? '🏭 Оператор цеха'
                        : '🛡️ Администратор'}
                    </span>
                    {assignedPoint && (
                      <p className="text-xs text-stone-600 mt-2 flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-stone-400" />
                        <span>{assignedPoint.name}</span>
                      </p>
                    )}
                    {emp.phone && <p className="text-xs text-stone-400 mt-1">{emp.phone}</p>}
                  </div>

                  <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between">
                    <span className="text-[11px] font-medium text-stone-500">
                      {emp.archived ? '⚠️ Не активен' : '✅ В штате'}
                    </span>
                    <button
                      onClick={() => setEditingEmployee(emp)}
                      className="p-1 text-stone-500 hover:text-stone-800 rounded cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 6. SLOTS TAB */}
      {activeTab === 'slots' && (
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden p-5 space-y-4">
          <div className="pb-3 border-b border-stone-100">
            <h3 className="font-bold text-sm text-stone-900">График слотов поставок и дедлайны</h3>
            <p className="text-xs text-stone-400">
              Настройка времени блокировки заявок старших смен и расчётного времени доставки
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {slots.map((s) => (
              <div key={s.id} className="p-4 rounded-xl border border-stone-200 bg-white space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-stone-900 text-sm">{s.name}</h4>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                    Активен
                  </span>
                </div>
                <p className="text-xs text-stone-500">{s.description}</p>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-stone-100">
                  <div className="bg-stone-50 p-2.5 rounded-lg border border-stone-100">
                    <span className="text-[10px] text-stone-400 block font-medium">Дедлайн приёма:</span>
                    <span className="text-base font-bold font-mono text-rose-700">{s.deadlineTime}</span>
                  </div>
                  <div className="bg-stone-50 p-2.5 rounded-lg border border-stone-100">
                    <span className="text-[10px] text-stone-400 block font-medium">Время доставки:</span>
                    <span className="text-base font-bold font-mono text-stone-800">{s.deliveryTime}</span>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={() => setEditingSlot(s)}
                    className="w-full py-1.5 text-xs text-amber-800 bg-amber-50 hover:bg-amber-100 rounded-lg font-semibold border border-amber-200 cursor-pointer transition-colors"
                  >
                    Изменить время дедлайна
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit Point Modal */}
      {editingPoint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-950/70 backdrop-blur-sm">
          <form
            onSubmit={handleSavePoint}
            className="bg-white rounded-2xl max-w-md w-full p-4 sm:p-6 space-y-4 border border-stone-200 shadow-2xl max-h-[90vh] overflow-y-auto my-auto overflow-x-hidden"
          >
            <h4 className="font-bold text-stone-900 text-base">Точка кофейни</h4>
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-medium text-stone-700 block mb-1">Название кофейни:</label>
                <input
                  type="text"
                  required
                  value={editingPoint.name}
                  onChange={(e) => setEditingPoint({ ...editingPoint, name: e.target.value })}
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-600 outline-none"
                  placeholder="Кофейня №5 (Таганка)"
                />
              </div>

              <div>
                <label className="font-medium text-stone-700 block mb-1">Фактический адрес:</label>
                <input
                  type="text"
                  required
                  value={editingPoint.address}
                  onChange={(e) => setEditingPoint({ ...editingPoint, address: e.target.value })}
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-600 outline-none"
                  placeholder="ул. Земляной Вал, 33"
                />
              </div>

              <div>
                <label className="font-medium text-stone-700 block mb-1">Юридическое лицо:</label>
                <select
                  value={editingPoint.legalEntityId || ''}
                  onChange={(e) => setEditingPoint({ ...editingPoint, legalEntityId: e.target.value })}
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-600 outline-none bg-stone-50"
                >
                  <option value="">-- Не выбрано --</option>
                  {legalEntities.map((le) => (
                    <option key={le.id} value={le.id}>
                      {le.shortName} (ИНН {le.inn})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-medium text-stone-700 block mb-1">Закрепленный цех снабжения:</label>
                <select
                  value={editingPoint.assignedWorkshopId || ''}
                  onChange={(e) => setEditingPoint({ ...editingPoint, assignedWorkshopId: e.target.value })}
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-600 outline-none bg-stone-50"
                >
                  <option value="">-- Не выбран --</option>
                  {workshops.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-medium text-stone-700 block mb-1">External ID (для 1С/ERP):</label>
                <input
                  type="text"
                  value={editingPoint.external_id}
                  onChange={(e) => setEditingPoint({ ...editingPoint, external_id: e.target.value })}
                  className="w-full p-2 font-mono border rounded-lg focus:ring-2 focus:ring-amber-600 outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setEditingPoint(null)}
                className="px-4 py-2 text-xs text-stone-500 hover:text-stone-700 cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-amber-800 hover:bg-amber-900 text-white text-xs font-semibold rounded-xl cursor-pointer"
              >
                Сохранить
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Workshop Modal */}
      {editingWorkshop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-950/70 backdrop-blur-sm">
          <form
            onSubmit={handleSaveWorkshop}
            className="bg-white rounded-2xl max-w-md w-full p-4 sm:p-6 space-y-4 border border-stone-200 shadow-2xl max-h-[90vh] overflow-y-auto my-auto overflow-x-hidden"
          >
            <h4 className="font-bold text-stone-900 text-base">Производственный цех / Кухня</h4>
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-medium text-stone-700 block mb-1">Название цеха:</label>
                <input
                  type="text"
                  required
                  value={editingWorkshop.name}
                  onChange={(e) => setEditingWorkshop({ ...editingWorkshop, name: e.target.value })}
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-600 outline-none"
                  placeholder="Центральный кондитерский цех"
                />
              </div>

              <div>
                <label className="font-medium text-stone-700 block mb-1">Адрес производства:</label>
                <input
                  type="text"
                  required
                  value={editingWorkshop.address}
                  onChange={(e) => setEditingWorkshop({ ...editingWorkshop, address: e.target.value })}
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-600 outline-none"
                  placeholder="г. Москва, ул. Промышленная, 10"
                />
              </div>

              <div>
                <label className="font-medium text-stone-700 block mb-1">Юридическое лицо:</label>
                <select
                  value={editingWorkshop.legalEntityId || ''}
                  onChange={(e) => setEditingWorkshop({ ...editingWorkshop, legalEntityId: e.target.value })}
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-600 outline-none bg-stone-50"
                >
                  <option value="">-- Не выбрано --</option>
                  {legalEntities.map((le) => (
                    <option key={le.id} value={le.id}>
                      {le.shortName} (ИНН {le.inn})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-medium text-stone-700 block mb-1">Заведующий цехом:</label>
                  <input
                    type="text"
                    value={editingWorkshop.chiefName || ''}
                    onChange={(e) => setEditingWorkshop({ ...editingWorkshop, chiefName: e.target.value })}
                    className="w-full p-2 border rounded-lg outline-none"
                    placeholder="Иванов И.И."
                  />
                </div>
                <div>
                  <label className="font-medium text-stone-700 block mb-1">Телефон цеха:</label>
                  <input
                    type="text"
                    value={editingWorkshop.phone || ''}
                    onChange={(e) => setEditingWorkshop({ ...editingWorkshop, phone: e.target.value })}
                    className="w-full p-2 border rounded-lg outline-none"
                    placeholder="+7 (495) 000-00-00"
                  />
                </div>
              </div>

              <div>
                <label className="font-medium text-stone-700 block mb-1">Производственная мощность:</label>
                <input
                  type="text"
                  value={editingWorkshop.capacity || ''}
                  onChange={(e) => setEditingWorkshop({ ...editingWorkshop, capacity: e.target.value })}
                  className="w-full p-2 border rounded-lg outline-none"
                  placeholder="800 позиций выпечки в смену"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setEditingWorkshop(null)}
                className="px-4 py-2 text-xs text-stone-500 hover:text-stone-700 cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-amber-800 hover:bg-amber-900 text-white text-xs font-semibold rounded-xl cursor-pointer"
              >
                Сохранить
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Driver Modal */}
      {editingDriver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-950/70 backdrop-blur-sm">
          <form
            onSubmit={handleSaveDriver}
            className="bg-white rounded-2xl max-w-md w-full p-4 sm:p-6 space-y-4 border border-stone-200 shadow-2xl max-h-[90vh] overflow-y-auto my-auto overflow-x-hidden"
          >
            <h4 className="font-bold text-stone-900 text-base">Водитель доставки</h4>
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-medium text-stone-700 block mb-1">ФИО водителя:</label>
                <input
                  type="text"
                  required
                  value={editingDriver.name}
                  onChange={(e) => setEditingDriver({ ...editingDriver, name: e.target.value })}
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-600 outline-none"
                  placeholder="Михаил Васильев"
                />
              </div>

              <div>
                <label className="font-medium text-stone-700 block mb-1">Телефон:</label>
                <input
                  type="text"
                  required
                  value={editingDriver.phone}
                  onChange={(e) => setEditingDriver({ ...editingDriver, phone: e.target.value })}
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-600 outline-none"
                  placeholder="+7 (915) 000-00-00"
                />
              </div>

              <div>
                <label className="font-medium text-stone-700 block mb-1">Юридическое лицо (перевозчик):</label>
                <select
                  value={editingDriver.legalEntityId || ''}
                  onChange={(e) => setEditingDriver({ ...editingDriver, legalEntityId: e.target.value })}
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-600 outline-none bg-stone-50"
                >
                  <option value="">-- Не выбрано --</option>
                  {legalEntities.map((le) => (
                    <option key={le.id} value={le.id}>
                      {le.shortName} (ИНН {le.inn})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-medium text-stone-700 block mb-1">Закрепленный цех отгрузки:</label>
                <select
                  value={editingDriver.assignedWorkshopId || ''}
                  onChange={(e) => setEditingDriver({ ...editingDriver, assignedWorkshopId: e.target.value })}
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-600 outline-none bg-stone-50"
                >
                  <option value="">-- Не выбран --</option>
                  {workshops.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-medium text-stone-700 block mb-1">Модель автомобиля:</label>
                  <input
                    type="text"
                    value={editingDriver.vehicleModel}
                    onChange={(e) => setEditingDriver({ ...editingDriver, vehicleModel: e.target.value })}
                    className="w-full p-2 border rounded-lg outline-none"
                    placeholder="ГАЗель NEXT"
                  />
                </div>
                <div>
                  <label className="font-medium text-stone-700 block mb-1">Гос. номер:</label>
                  <input
                    type="text"
                    value={editingDriver.licensePlate}
                    onChange={(e) => setEditingDriver({ ...editingDriver, licensePlate: e.target.value })}
                    className="w-full p-2 font-mono border rounded-lg outline-none"
                    placeholder="В782ОК 777"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="driverFridgeModal"
                  checked={editingDriver.hasRefrigerator}
                  onChange={(e) => setEditingDriver({ ...editingDriver, hasRefrigerator: e.target.checked })}
                  className="w-4 h-4 rounded text-amber-800"
                />
                <label htmlFor="driverFridgeModal" className="text-xs text-stone-700 font-medium cursor-pointer">
                  Изотермический фургон с рефрижератором (+2...+4 °C)
                </label>
              </div>

              <div>
                <label className="font-medium text-stone-700 block mb-1">Текущий статус:</label>
                <select
                  value={editingDriver.status}
                  onChange={(e) => setEditingDriver({ ...editingDriver, status: e.target.value as any })}
                  className="w-full p-2 border rounded-lg outline-none bg-stone-50"
                >
                  <option value="active">На смене (активен)</option>
                  <option value="on_route">В рейсе</option>
                  <option value="day_off">Выходной</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setEditingDriver(null)}
                className="px-4 py-2 text-xs text-stone-500 hover:text-stone-700 cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-amber-800 hover:bg-amber-900 text-white text-xs font-semibold rounded-xl cursor-pointer"
              >
                Сохранить
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Product Modal */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-950/70 backdrop-blur-sm">
          <form
            onSubmit={handleSaveProduct}
            className="bg-white rounded-2xl max-w-md w-full p-4 sm:p-6 space-y-4 border border-stone-200 shadow-2xl max-h-[90vh] overflow-y-auto my-auto overflow-x-hidden"
          >
            <h4 className="font-bold text-stone-900 text-base">Товар / SKU</h4>
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-medium text-stone-700 block mb-1">Наименование:</label>
                <input
                  type="text"
                  required
                  value={editingProduct.name}
                  onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-600 outline-none"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-medium text-stone-700 block mb-1">Артикул (SKU):</label>
                  <input
                    type="text"
                    required
                    value={editingProduct.sku}
                    onChange={(e) => setEditingProduct({ ...editingProduct, sku: e.target.value })}
                    className="w-full p-2 font-mono border rounded-lg focus:ring-2 focus:ring-amber-600 outline-none"
                  />
                </div>
                <div>
                  <label className="font-medium text-stone-700 block mb-1">Ед. измерения:</label>
                  <input
                    type="text"
                    required
                    value={editingProduct.unit}
                    onChange={(e) => setEditingProduct({ ...editingProduct, unit: e.target.value })}
                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-600 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="font-medium text-stone-700 block mb-1">Категория:</label>
                <select
                  value={editingProduct.category}
                  onChange={(e) => setEditingProduct({ ...editingProduct, category: e.target.value })}
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-600 outline-none bg-stone-50"
                >
                  <option value="Свежая выпечка">Свежая выпечка</option>
                  <option value="Кофе и зерно">Кофе и зерно</option>
                  <option value="Молоко и альтернативы">Молоко и альтернативы</option>
                  <option value="Сиропы и расходники">Сиропы и расходники</option>
                </select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="px-4 py-2 text-xs text-stone-500 hover:text-stone-700 cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-amber-800 hover:bg-amber-900 text-white text-xs font-semibold rounded-xl cursor-pointer"
              >
                Сохранить
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Employee Modal */}
      {editingEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-950/70 backdrop-blur-sm">
          <form
            onSubmit={handleSaveEmployee}
            className="bg-white rounded-2xl max-w-md w-full p-4 sm:p-6 space-y-4 border border-stone-200 shadow-2xl max-h-[90vh] overflow-y-auto my-auto overflow-x-hidden"
          >
            <h4 className="font-bold text-stone-900 text-base">Сотрудник сети</h4>
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-medium text-stone-700 block mb-1">ФИО сотрудника:</label>
                <input
                  type="text"
                  required
                  value={editingEmployee.name}
                  onChange={(e) => setEditingEmployee({ ...editingEmployee, name: e.target.value })}
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-600 outline-none"
                />
              </div>
              <div>
                <label className="font-medium text-stone-700 block mb-1">Роль в системе:</label>
                <select
                  value={editingEmployee.role}
                  onChange={(e) => setEditingEmployee({ ...editingEmployee, role: e.target.value as any })}
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-600 outline-none bg-stone-50"
                >
                  <option value="shift_supervisor">Старший смены (кофейня)</option>
                  <option value="production_operator">Оператор производства (цех)</option>
                  <option value="admin">Администратор сети</option>
                </select>
              </div>
              {editingEmployee.role === 'shift_supervisor' && (
                <div>
                  <label className="font-medium text-stone-700 block mb-1">Привязка к кофейне:</label>
                  <select
                    value={editingEmployee.pointId || ''}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, pointId: e.target.value })}
                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-600 outline-none bg-stone-50"
                  >
                    <option value="">-- Без привязки --</option>
                    {points.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="font-medium text-stone-700 block mb-1">Телефон:</label>
                <input
                  type="text"
                  value={editingEmployee.phone || ''}
                  onChange={(e) => setEditingEmployee({ ...editingEmployee, phone: e.target.value })}
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-600 outline-none"
                  placeholder="+7 (999) 000-00-00"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setEditingEmployee(null)}
                className="px-4 py-2 text-xs text-stone-500 hover:text-stone-700 cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-amber-800 hover:bg-amber-900 text-white text-xs font-semibold rounded-xl cursor-pointer"
              >
                Сохранить
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Slot Modal */}
      {editingSlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-950/70 backdrop-blur-sm">
          <form
            onSubmit={handleSaveSlot}
            className="bg-white rounded-2xl max-w-md w-full p-4 sm:p-6 space-y-4 border border-stone-200 shadow-2xl max-h-[90vh] overflow-y-auto my-auto overflow-x-hidden"
          >
            <h4 className="font-bold text-stone-900 text-base">Настройка дедлайна слота</h4>
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-medium text-stone-700 block mb-1">Название слота:</label>
                <input
                  type="text"
                  required
                  value={editingSlot.name}
                  onChange={(e) => setEditingSlot({ ...editingSlot, name: e.target.value })}
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-600 outline-none"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-medium text-stone-700 block mb-1">Дедлайн приёма (ЧЧ:ММ):</label>
                  <input
                    type="time"
                    required
                    value={editingSlot.deadlineTime}
                    onChange={(e) => setEditingSlot({ ...editingSlot, deadlineTime: e.target.value })}
                    className="w-full p-2 border rounded-lg font-mono focus:ring-2 focus:ring-amber-600 outline-none"
                  />
                </div>
                <div>
                  <label className="font-medium text-stone-700 block mb-1">Время доставки (ЧЧ:ММ):</label>
                  <input
                    type="time"
                    required
                    value={editingSlot.deliveryTime}
                    onChange={(e) => setEditingSlot({ ...editingSlot, deliveryTime: e.target.value })}
                    className="w-full p-2 border rounded-lg font-mono focus:ring-2 focus:ring-amber-600 outline-none"
                  />
                </div>
              </div>

              <div className="p-2.5 bg-amber-50/80 border border-amber-200/80 rounded-xl text-[11px] text-amber-950 space-y-1">
                <div className="font-semibold flex items-center gap-1 text-amber-900">
                  <span>🕒 Операционный часовой пояс: МСК (UTC+3)</span>
                </div>
                <p className="text-stone-600 leading-relaxed">
                  Для вечернего слота время после полуночи (например, <strong>00:30</strong> или <strong>01:30</strong>) считается завершением вечерней смены (ночь). Заявки остаются открытыми в течение вечера и блокируются ровно при наступлении указанного времени.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setEditingSlot(null)}
                className="px-4 py-2 text-xs text-stone-500 hover:text-stone-700 cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-amber-800 hover:bg-amber-900 text-white text-xs font-semibold rounded-xl cursor-pointer"
              >
                Сохранить
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
