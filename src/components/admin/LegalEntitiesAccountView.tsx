import React, { useState, useEffect, useMemo } from 'react';
import { LegalEntity, CoffeePoint, Workshop, Driver } from '../../types';
import { StorageManager } from '../../services/storage';
import { ApiService } from '../../services/api';
import {
  Building2,
  MapPin,
  Factory,
  Truck,
  Plus,
  Edit2,
  Copy,
  Check,
  Search,
  ExternalLink,
  Phone,
  Mail,
  User,
  ShieldAlert,
  ChevronRight,
  ArrowLeft,
  X,
  CreditCard,
  Hash,
  Briefcase,
  AlertCircle,
  Snowflake,
  Coffee,
} from 'lucide-react';

interface LegalEntitiesAccountViewProps {
  onNavigateToPoint?: (pointId: string) => void;
}

export const LegalEntitiesAccountView: React.FC<LegalEntitiesAccountViewProps> = () => {
  const [legalEntities, setLegalEntities] = useState<LegalEntity[]>([]);
  const [points, setPoints] = useState<CoffeePoint[]>([]);
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'archived'>('active');

  // Selected Entity for 360° Account View
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [activeAccountTab, setActiveAccountTab] = useState<'overview' | 'cafes' | 'workshops' | 'drivers'>('overview');

  // Modals
  const [isEditingEntity, setIsEditingEntity] = useState(false);
  const [entityFormData, setEntityFormData] = useState<Partial<LegalEntity>>({});
  const [copiedNotification, setCopiedNotification] = useState<string | null>(null);

  // Link Modals
  const [isLinkShopOpen, setIsLinkShopOpen] = useState(false);
  const [selectedShopToLink, setSelectedShopToLink] = useState('');

  const [isLinkWorkshopOpen, setIsLinkWorkshopOpen] = useState(false);
  const [selectedWorkshopToLink, setSelectedWorkshopToLink] = useState('');

  const [isLinkDriverOpen, setIsLinkDriverOpen] = useState(false);
  const [selectedDriverToLink, setSelectedDriverToLink] = useState('');

  // Quick Create Modals
  const [quickCreateType, setQuickCreateType] = useState<'cafe' | 'workshop' | 'driver' | null>(null);
  const [quickCafeName, setQuickCafeName] = useState('');
  const [quickCafeAddress, setQuickCafeAddress] = useState('');
  const [quickCafeWorkshopId, setQuickCafeWorkshopId] = useState('');

  const [quickWorkshopName, setQuickWorkshopName] = useState('');
  const [quickWorkshopAddress, setQuickWorkshopAddress] = useState('');
  const [quickWorkshopChief, setQuickWorkshopChief] = useState('');
  const [quickWorkshopPhone, setQuickWorkshopPhone] = useState('');

  const [quickDriverName, setQuickDriverName] = useState('');
  const [quickDriverPhone, setQuickDriverPhone] = useState('');
  const [quickDriverVehicle, setQuickDriverVehicle] = useState('');
  const [quickDriverPlate, setQuickDriverPlate] = useState('');
  const [quickDriverFridge, setQuickDriverFridge] = useState(false);
  const [quickDriverWorkshopId, setQuickDriverWorkshopId] = useState('');

  const loadAllData = async () => {
    try {
      const data = await ApiService.getHandbooks();
      setLegalEntities(data.legalEntities || StorageManager.getLegalEntities());
      setPoints(data.points || StorageManager.getPoints());
      setWorkshops(data.workshops || StorageManager.getWorkshops());
      setDrivers(data.drivers || StorageManager.getDrivers());
    } catch {
      setLegalEntities(StorageManager.getLegalEntities());
      setPoints(StorageManager.getPoints());
      setWorkshops(StorageManager.getWorkshops());
      setDrivers(StorageManager.getDrivers());
    }
  };

  const isAnyModalOpen = Boolean(
    isEditingEntity || isLinkShopOpen || isLinkWorkshopOpen || isLinkDriverOpen || quickCreateType
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
    loadAllData();
    const handleStorageChange = () => {
      // Synchronize with local storage mirror without re-invoking network API
      setLegalEntities(StorageManager.getLegalEntities());
      setPoints(StorageManager.getPoints());
      setWorkshops(StorageManager.getWorkshops());
      setDrivers(StorageManager.getDrivers());
    };
    window.addEventListener('coffee-storage-change', handleStorageChange);
    return () => window.removeEventListener('coffee-storage-change', handleStorageChange);
  }, []);

  const selectedEntity = useMemo(() => {
    return legalEntities.find((le) => le.id === selectedEntityId) || null;
  }, [legalEntities, selectedEntityId]);

  // Filtered legal entities
  const filteredEntities = useMemo(() => {
    return legalEntities.filter((le) => {
      const matchesSearch =
        le.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        le.shortName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        le.inn.includes(searchQuery) ||
        le.directorName.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'active'
          ? !le.archived
          : le.archived;

      return matchesSearch && matchesStatus;
    });
  }, [legalEntities, searchQuery, statusFilter]);

  // Related entities for current selected entity
  const entityPoints = useMemo(() => {
    if (!selectedEntityId) return [];
    return points.filter((p) => p.legalEntityId === selectedEntityId);
  }, [points, selectedEntityId]);

  const entityWorkshops = useMemo(() => {
    if (!selectedEntityId) return [];
    return workshops.filter((w) => w.legalEntityId === selectedEntityId);
  }, [workshops, selectedEntityId]);

  const entityDrivers = useMemo(() => {
    if (!selectedEntityId) return [];
    return drivers.filter((d) => d.legalEntityId === selectedEntityId);
  }, [drivers, selectedEntityId]);

  // Open Edit Form for new or existing
  const handleOpenEntityForm = (entity?: LegalEntity) => {
    if (entity) {
      setEntityFormData({ ...entity });
    } else {
      setEntityFormData({
        id: `le-${Date.now().toString(36)}`,
        name: '',
        shortName: '',
        inn: '',
        kpp: '',
        ogrn: '',
        legalAddress: '',
        actualAddress: '',
        bankName: '',
        bik: '',
        checkingAccount: '',
        correspondentAccount: '',
        directorName: '',
        phone: '',
        email: '',
        taxSystem: 'УСН (Доходы - Расходы, 15%)',
        source: 'manual',
        external_id: '',
        archived: false,
      });
    }
    setIsEditingEntity(true);
  };

  const handleSaveEntity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entityFormData.name || !entityFormData.inn || !entityFormData.legalAddress) {
      alert('Пожалуйста, заполните обязательные поля: Полное наименование, ИНН и Юридический адрес.');
      return;
    }

    const payload: LegalEntity = {
      id: entityFormData.id || `le-${Date.now().toString(36)}`,
      name: entityFormData.name.trim(),
      shortName: entityFormData.shortName?.trim() || entityFormData.name.trim(),
      inn: entityFormData.inn.trim(),
      kpp: entityFormData.kpp?.trim() || '',
      ogrn: entityFormData.ogrn?.trim() || '',
      legalAddress: entityFormData.legalAddress.trim(),
      actualAddress: entityFormData.actualAddress?.trim() || entityFormData.legalAddress.trim(),
      bankName: entityFormData.bankName?.trim() || '',
      bik: entityFormData.bik?.trim() || '',
      checkingAccount: entityFormData.checkingAccount?.trim() || '',
      correspondentAccount: entityFormData.correspondentAccount?.trim() || '',
      directorName: entityFormData.directorName?.trim() || '',
      phone: entityFormData.phone?.trim() || '',
      email: entityFormData.email?.trim() || '',
      taxSystem: entityFormData.taxSystem || 'УСН (Доходы - Расходы, 15%)',
      source: entityFormData.source || 'manual',
      external_id: entityFormData.external_id || '',
      archived: entityFormData.archived || false,
    };

    await ApiService.saveLegalEntity(payload);
    setIsEditingEntity(false);
    loadAllData();
    if (!selectedEntityId) {
      setSelectedEntityId(payload.id);
    }
  };

  // Toggle entity archive
  const handleToggleArchiveEntity = async (entity: LegalEntity) => {
    const updated: LegalEntity = {
      ...entity,
      archived: !entity.archived,
    };
    await ApiService.saveLegalEntity(updated);
    loadAllData();
  };

  // Copy full requisition card to clipboard
  const handleCopyRequisites = (entity: LegalEntity) => {
    const text = `РЕКВИЗИТЫ ОРГАНИЗАЦИИ:
${entity.name}
Сокращенное наименование: ${entity.shortName}
ИНН: ${entity.inn}
КПП: ${entity.kpp || '—'}
ОГРН / ОГРНИП: ${entity.ogrn || '—'}
Система налогообложения: ${entity.taxSystem}
Юридический адрес: ${entity.legalAddress}
Фактический адрес: ${entity.actualAddress}
Руководитель: ${entity.directorName}
Телефон: ${entity.phone}
Email: ${entity.email}

Банковские реквизиты:
Банк: ${entity.bankName}
БИК: ${entity.bik}
Р/счет: ${entity.checkingAccount}
Корр. счет: ${entity.correspondentAccount}`;

    navigator.clipboard.writeText(text);
    setCopiedNotification('Реквизиты скопированы в буфер обмена');
    setTimeout(() => setCopiedNotification(null), 3000);
  };

  // Link existing point to this entity
  const handleLinkPoint = async () => {
    if (!selectedEntityId || !selectedShopToLink) return;
    const pt = points.find((p) => p.id === selectedShopToLink);
    if (!pt) return;

    const updatedPt: CoffeePoint = {
      ...pt,
      legalEntityId: selectedEntityId,
    };
    await ApiService.savePoint(updatedPt);
    setIsLinkShopOpen(false);
    setSelectedShopToLink('');
    loadAllData();
  };

  // Unlink point from this entity
  const handleUnlinkPoint = async (pointId: string) => {
    if (!confirm('Отвязать кофейню от данного юридического лица?')) return;
    const pt = points.find((p) => p.id === pointId);
    if (!pt) return;

    const updatedPt: CoffeePoint = {
      ...pt,
      legalEntityId: '',
    };
    await ApiService.savePoint(updatedPt);
    loadAllData();
  };

  // Link existing workshop to this entity
  const handleLinkWorkshop = async () => {
    if (!selectedEntityId || !selectedWorkshopToLink) return;
    const ws = workshops.find((w) => w.id === selectedWorkshopToLink);
    if (!ws) return;

    const updatedWs: Workshop = {
      ...ws,
      legalEntityId: selectedEntityId,
    };
    await ApiService.saveWorkshop(updatedWs);
    setIsLinkWorkshopOpen(false);
    setSelectedWorkshopToLink('');
    loadAllData();
  };

  // Unlink workshop from this entity
  const handleUnlinkWorkshop = async (workshopId: string) => {
    if (!confirm('Отвязать производственный цех от данного юридического лица?')) return;
    const ws = workshops.find((w) => w.id === workshopId);
    if (!ws) return;

    const updatedWs: Workshop = {
      ...ws,
      legalEntityId: '',
    };
    await ApiService.saveWorkshop(updatedWs);
    loadAllData();
  };

  // Link existing driver to this entity
  const handleLinkDriver = async () => {
    if (!selectedEntityId || !selectedDriverToLink) return;
    const drv = drivers.find((d) => d.id === selectedDriverToLink);
    if (!drv) return;

    const updatedDrv: Driver = {
      ...drv,
      legalEntityId: selectedEntityId,
    };
    await ApiService.saveDriver(updatedDrv);
    setIsLinkDriverOpen(false);
    setSelectedDriverToLink('');
    loadAllData();
  };

  // Unlink driver from this entity
  const handleUnlinkDriver = async (driverId: string) => {
    if (!confirm('Отвязать водителя доставки от данного юридического лица?')) return;
    const drv = drivers.find((d) => d.id === driverId);
    if (!drv) return;

    const updatedDrv: Driver = {
      ...drv,
      legalEntityId: '',
    };
    await ApiService.saveDriver(updatedDrv);
    loadAllData();
  };

  // Quick Create Handlers
  const handleQuickCreateCafe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickCafeName.trim() || !quickCafeAddress.trim() || !selectedEntityId) return;

    const newPoint: CoffeePoint = {
      id: `point-${Date.now().toString(36)}`,
      name: quickCafeName.trim(),
      address: quickCafeAddress.trim(),
      legalEntityId: selectedEntityId,
      assignedWorkshopId: quickCafeWorkshopId || '',
      assignedEmployeeIds: [],
      source: 'manual',
      external_id: `EXT-LE-${Date.now().toString().slice(-4)}`,
      archived: false,
    };

    await ApiService.savePoint(newPoint);
    setQuickCreateType(null);
    setQuickCafeName('');
    setQuickCafeAddress('');
    setQuickCafeWorkshopId('');
    loadAllData();
  };

  const handleQuickCreateWorkshop = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickWorkshopName.trim() || !quickWorkshopAddress.trim() || !selectedEntityId) return;

    const newWorkshop: Workshop = {
      id: `ws-${Date.now().toString(36)}`,
      name: quickWorkshopName.trim(),
      legalEntityId: selectedEntityId,
      address: quickWorkshopAddress.trim(),
      chiefName: quickWorkshopChief.trim(),
      phone: quickWorkshopPhone.trim(),
      capacity: 'Полнофункциональный цех',
      source: 'manual',
      external_id: `WS-LE-${Date.now().toString().slice(-4)}`,
      archived: false,
    };

    await ApiService.saveWorkshop(newWorkshop);
    setQuickCreateType(null);
    setQuickWorkshopName('');
    setQuickWorkshopAddress('');
    setQuickWorkshopChief('');
    setQuickWorkshopPhone('');
    loadAllData();
  };

  const handleQuickCreateDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickDriverName.trim() || !quickDriverPhone.trim() || !selectedEntityId) return;

    const newDriver: Driver = {
      id: `drv-${Date.now().toString(36)}`,
      name: quickDriverName.trim(),
      phone: quickDriverPhone.trim(),
      legalEntityId: selectedEntityId,
      assignedWorkshopId: quickDriverWorkshopId || '',
      vehicleModel: quickDriverVehicle.trim() || 'Фургон',
      licensePlate: quickDriverPlate.trim() || 'А000АА 777',
      hasRefrigerator: quickDriverFridge,
      status: 'active',
      archived: false,
    };

    await ApiService.saveDriver(newDriver);
    setQuickCreateType(null);
    setQuickDriverName('');
    setQuickDriverPhone('');
    setQuickDriverVehicle('');
    setQuickDriverPlate('');
    setQuickDriverFridge(false);
    setQuickDriverWorkshopId('');
    loadAllData();
  };

  // Helper names
  const getWorkshopName = (wsId?: string) => {
    if (!wsId) return 'Не назначен';
    const ws = workshops.find((w) => w.id === wsId);
    return ws ? ws.name : wsId;
  };

  const getEntityName = (leId?: string) => {
    if (!leId) return 'Не привязано';
    const le = legalEntities.find((e) => e.id === leId);
    return le ? le.shortName : leId;
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {copiedNotification && (
        <div className="fixed bottom-6 right-6 z-50 bg-stone-900 text-white text-xs px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 animate-fade-in border border-stone-700">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{copiedNotification}</span>
        </div>
      )}

      {/* Main Top Header */}
      <div className="bg-white rounded-2xl p-5 border border-stone-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" />
              Организационная структура • Юридические лица
            </span>
          </div>
          <h2 className="text-xl font-bold text-stone-900 mt-1">
            Аккаунты юридических лиц и привязка объектов
          </h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Управление юридическими лицами (ООО, ИП), реквизитами, налогообложением и сквозное связывание
            кофеен сети, производственных цехов и водителей доставки.
          </p>
        </div>

        <button
          onClick={() => handleOpenEntityForm()}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-800 hover:bg-amber-900 text-white rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Зарегистрировать юрлицо</span>
        </button>
      </div>

      {/* VIEW 1: 360° DETAILED ACCOUNT VIEW */}
      {selectedEntity ? (
        <div className="space-y-6 animate-fade-in">
          {/* Breadcrumbs & Top actions */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setSelectedEntityId(null)}
              className="flex items-center gap-1.5 text-xs font-semibold text-stone-600 hover:text-stone-900 bg-white px-3 py-1.5 rounded-xl border border-stone-200 shadow-xs cursor-pointer transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Ко всем юридическим лицам</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleCopyRequisites(selectedEntity)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-semibold border border-stone-200 cursor-pointer transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Скопировать реквизиты</span>
              </button>

              <button
                onClick={() => handleOpenEntityForm(selectedEntity)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 rounded-xl text-xs font-semibold border border-amber-200 cursor-pointer transition-colors"
              >
                <Edit2 className="w-3.5 h-3.5 text-amber-700" />
                <span>Редактировать карточку</span>
              </button>
            </div>
          </div>

          {/* Account Profile Card */}
          <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-stone-100">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-amber-900 text-amber-100 flex items-center justify-center font-bold text-xl shadow-sm shrink-0">
                  {selectedEntity.shortName.startsWith('ИП') ? 'ИП' : 'ООО'}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-xl font-extrabold text-stone-900">
                      {selectedEntity.name}
                    </h3>
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                        selectedEntity.archived
                          ? 'bg-stone-100 text-stone-500'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {selectedEntity.archived ? 'В архиве' : 'Активно'}
                    </span>
                    <span className="text-[11px] font-semibold px-2 py-0.5 bg-amber-50 text-amber-900 border border-amber-200 rounded-full">
                      {selectedEntity.taxSystem}
                    </span>
                  </div>

                  <p className="text-xs text-stone-500 mt-1 flex items-center gap-3 flex-wrap">
                    <span>
                      ИНН: <strong className="text-stone-800 font-mono">{selectedEntity.inn}</strong>
                    </span>
                    {selectedEntity.kpp && (
                      <span>
                        КПП: <strong className="text-stone-800 font-mono">{selectedEntity.kpp}</strong>
                      </span>
                    )}
                    {selectedEntity.ogrn && (
                      <span>
                        ОГРН: <strong className="text-stone-800 font-mono">{selectedEntity.ogrn}</strong>
                      </span>
                    )}
                    {selectedEntity.directorName && (
                      <span>
                        Руководитель: <strong className="text-stone-800">{selectedEntity.directorName}</strong>
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {/* Linked Counters */}
              <div className="flex items-center gap-3">
                <div
                  onClick={() => setActiveAccountTab('cafes')}
                  className="bg-stone-50 hover:bg-stone-100 p-3 rounded-xl border border-stone-200 text-center min-w-[90px] cursor-pointer transition-colors"
                >
                  <div className="flex items-center justify-center text-amber-700 mb-1">
                    <Coffee className="w-4 h-4" />
                  </div>
                  <div className="text-lg font-bold text-stone-900">{entityPoints.length}</div>
                  <div className="text-[10px] text-stone-500 font-medium">Кофеен сети</div>
                </div>

                <div
                  onClick={() => setActiveAccountTab('workshops')}
                  className="bg-stone-50 hover:bg-stone-100 p-3 rounded-xl border border-stone-200 text-center min-w-[90px] cursor-pointer transition-colors"
                >
                  <div className="flex items-center justify-center text-amber-700 mb-1">
                    <Factory className="w-4 h-4" />
                  </div>
                  <div className="text-lg font-bold text-stone-900">{entityWorkshops.length}</div>
                  <div className="text-[10px] text-stone-500 font-medium">Цехов выпечки</div>
                </div>

                <div
                  onClick={() => setActiveAccountTab('drivers')}
                  className="bg-stone-50 hover:bg-stone-100 p-3 rounded-xl border border-stone-200 text-center min-w-[90px] cursor-pointer transition-colors"
                >
                  <div className="flex items-center justify-center text-amber-700 mb-1">
                    <Truck className="w-4 h-4" />
                  </div>
                  <div className="text-lg font-bold text-stone-900">{entityDrivers.length}</div>
                  <div className="text-[10px] text-stone-500 font-medium">Водителей</div>
                </div>
              </div>
            </div>

            {/* Navigation Tabs inside Account */}
            <div className="flex items-center gap-2 mt-4 border-b border-stone-200 pb-2 overflow-x-auto no-scrollbar">
              <button
                onClick={() => setActiveAccountTab('overview')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  activeAccountTab === 'overview'
                    ? 'bg-stone-900 text-white shadow-xs'
                    : 'text-stone-600 hover:bg-stone-100'
                }`}
              >
                📋 Карточка и реквизиты
              </button>

              <button
                onClick={() => setActiveAccountTab('cafes')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  activeAccountTab === 'cafes'
                    ? 'bg-amber-800 text-white shadow-xs'
                    : 'text-stone-600 hover:bg-stone-100'
                }`}
              >
                <Coffee className="w-3.5 h-3.5" />
                <span>Привязанные кофейни ({entityPoints.length})</span>
              </button>

              <button
                onClick={() => setActiveAccountTab('workshops')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  activeAccountTab === 'workshops'
                    ? 'bg-amber-800 text-white shadow-xs'
                    : 'text-stone-600 hover:bg-stone-100'
                }`}
              >
                <Factory className="w-3.5 h-3.5" />
                <span>Производственные цеха ({entityWorkshops.length})</span>
              </button>

              <button
                onClick={() => setActiveAccountTab('drivers')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  activeAccountTab === 'drivers'
                    ? 'bg-amber-800 text-white shadow-xs'
                    : 'text-stone-600 hover:bg-stone-100'
                }`}
              >
                <Truck className="w-3.5 h-3.5" />
                <span>Водители доставки ({entityDrivers.length})</span>
              </button>
            </div>

            {/* TAB 1: REQUISITES OVERVIEW */}
            {activeAccountTab === 'overview' && (
              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* General & Legal Details */}
                <details className="group bg-stone-50 p-5 rounded-2xl border border-stone-200">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-bold uppercase tracking-wider text-stone-700">
                    <span className="flex items-center gap-2"><Building2 className="w-4 h-4 text-amber-800" />Юридические реквизиты и адреса</span>
                    <span className="text-stone-400 transition-transform group-open:rotate-180">⌄</span>
                  </summary>

                  <div className="mt-4 space-y-2 text-xs">
                    <div>
                      <span className="text-stone-400 block text-[10px]">Полное наименование:</span>
                      <span className="font-semibold text-stone-900">{selectedEntity.name}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div>
                        <span className="text-stone-400 block text-[10px]">ИНН:</span>
                        <span className="font-mono font-bold text-stone-900">{selectedEntity.inn}</span>
                      </div>
                      <div>
                        <span className="text-stone-400 block text-[10px]">КПП:</span>
                        <span className="font-mono text-stone-900">{selectedEntity.kpp || '—'}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-stone-400 block text-[10px]">ОГРН / ОГРНИП:</span>
                        <span className="font-mono text-stone-900">{selectedEntity.ogrn || '—'}</span>
                      </div>
                      <div>
                        <span className="text-stone-400 block text-[10px]">Система налогообложения:</span>
                        <span className="font-medium text-stone-900">{selectedEntity.taxSystem}</span>
                      </div>
                    </div>

                    <div className="pt-1">
                      <span className="text-stone-400 block text-[10px]">Юридический адрес:</span>
                      <span className="text-stone-800">{selectedEntity.legalAddress}</span>
                    </div>

                    <div>
                      <span className="text-stone-400 block text-[10px]">Фактический адрес:</span>
                      <span className="text-stone-800">{selectedEntity.actualAddress || selectedEntity.legalAddress}</span>
                    </div>
                  </div>
                </details>

                {/* Bank Details & Contacts */}
                <details className="group bg-stone-50 p-5 rounded-2xl border border-stone-200">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-bold uppercase tracking-wider text-stone-700">
                    <span className="flex items-center gap-2"><CreditCard className="w-4 h-4 text-amber-800" />Банковские счета и контакты</span>
                    <span className="text-stone-400 transition-transform group-open:rotate-180">⌄</span>
                  </summary>

                  <div className="mt-4 space-y-2 text-xs">
                    <div>
                      <span className="text-stone-400 block text-[10px]">Банк:</span>
                      <span className="font-semibold text-stone-900">{selectedEntity.bankName || 'Не указан'}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-stone-400 block text-[10px]">БИК банка:</span>
                        <span className="font-mono text-stone-900">{selectedEntity.bik || '—'}</span>
                      </div>
                      <div>
                        <span className="text-stone-400 block text-[10px]">Корр. счет:</span>
                        <span className="font-mono text-stone-900">{selectedEntity.correspondentAccount || '—'}</span>
                      </div>
                    </div>

                    <div>
                      <span className="text-stone-400 block text-[10px]">Расчетный счет:</span>
                      <span className="font-mono font-bold text-amber-950 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 block mt-0.5">
                        {selectedEntity.checkingAccount || '—'}
                      </span>
                    </div>

                    <div className="border-t border-stone-200 pt-2 grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-stone-400 block text-[10px]">Телефон бухгалтерии:</span>
                        <span className="font-medium text-stone-900">{selectedEntity.phone || '—'}</span>
                      </div>
                      <div>
                        <span className="text-stone-400 block text-[10px]">Email для документов:</span>
                        <span className="font-medium text-stone-900">{selectedEntity.email || '—'}</span>
                      </div>
                    </div>

                    <div>
                      <span className="text-stone-400 block text-[10px]">Интеграция с 1С / ERP:</span>
                      <span className="text-[11px] text-stone-600 font-mono">
                        {selectedEntity.external_id ? `ID: ${selectedEntity.external_id} (${selectedEntity.source})` : 'Ручной ввод'}
                      </span>
                    </div>
                  </div>
                </details>
              </div>
            )}

            {/* TAB 2: LINKED CAFES */}
            {activeAccountTab === 'cafes' && (
              <div className="mt-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-stone-900">
                      Кофейни сети, оформленные на {selectedEntity.shortName}
                    </h4>
                    <p className="text-xs text-stone-500">
                      Заявки этих кофеен формируются от данного юрлица, а поставки отгружаются по накладным.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsLinkShopOpen(true)}
                      className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl text-xs font-bold border border-stone-200 cursor-pointer transition-colors"
                    >
                      + Привязать существующую
                    </button>
                    <button
                      onClick={() => {
                        setQuickCreateType('cafe');
                        setQuickCafeWorkshopId(entityWorkshops[0]?.id || workshops[0]?.id || '');
                      }}
                      className="px-3 py-1.5 bg-amber-800 hover:bg-amber-900 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer transition-colors"
                    >
                      + Новая кофейня
                    </button>
                  </div>
                </div>

                {entityPoints.length === 0 ? (
                  <div className="bg-stone-50 border border-dashed border-stone-300 rounded-2xl p-8 text-center">
                    <Coffee className="w-8 h-8 text-stone-400 mx-auto mb-2" />
                    <h5 className="text-sm font-semibold text-stone-800">Нет привязанных кофеен</h5>
                    <p className="text-xs text-stone-500 mt-1 max-w-md mx-auto">
                      Вы можете привязать уже существующую кофейню сети к этому юрлицу или быстро зарегистрировать новую.
                    </p>
                    <div className="mt-4 flex items-center justify-center gap-2">
                      <button
                        onClick={() => setIsLinkShopOpen(true)}
                        className="px-3 py-1.5 bg-white text-stone-700 border border-stone-300 rounded-lg text-xs font-semibold cursor-pointer"
                      >
                        Привязать из списка
                      </button>
                      <button
                        onClick={() => setQuickCreateType('cafe')}
                        className="px-3 py-1.5 bg-amber-800 text-white rounded-lg text-xs font-semibold cursor-pointer"
                      >
                        Создать кофейню
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {entityPoints.map((pt) => {
                      const assignedWorkshop = workshops.find((w) => w.id === pt.assignedWorkshopId);
                      return (
                        <div
                          key={pt.id}
                          className="bg-white border border-stone-200 rounded-2xl p-4 shadow-xs flex flex-col justify-between"
                        >
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                  {pt.id}
                                </span>
                                <h5 className="font-bold text-stone-900 text-sm mt-1">{pt.name}</h5>
                              </div>
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  pt.archived ? 'bg-stone-100 text-stone-500' : 'bg-emerald-50 text-emerald-700'
                                }`}
                              >
                                {pt.archived ? 'В архиве' : 'Работает'}
                              </span>
                            </div>

                            <p className="text-xs text-stone-600 mt-2 flex items-center gap-1.5">
                              <MapPin className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                              <span>{pt.address}</span>
                            </p>

                            <div className="mt-3 pt-3 border-t border-stone-100 text-xs">
                              <span className="text-[10px] text-stone-400 block">Закрепленный цех снабжения:</span>
                              <span className="font-semibold text-stone-800 flex items-center gap-1 mt-0.5">
                                <Factory className="w-3 h-3 text-amber-800" />
                                {assignedWorkshop ? assignedWorkshop.name : 'Цех не назначен'}
                              </span>
                            </div>
                          </div>

                          <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-xs">
                            <span className="text-[10px] text-stone-400">
                              Внешний код: {pt.external_id || 'manual'}
                            </span>
                            <button
                              onClick={() => handleUnlinkPoint(pt.id)}
                              className="text-rose-600 hover:text-rose-800 font-semibold text-[11px] cursor-pointer"
                            >
                              Отвязать
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: LINKED WORKSHOPS */}
            {activeAccountTab === 'workshops' && (
              <div className="mt-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-stone-900">
                      Производственные цеха и кухни {selectedEntity.shortName}
                    </h4>
                    <p className="text-xs text-stone-500">
                      Цеха, где выпекаются круассаны, обжаривается кофе и комплектуются сводные заказы.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsLinkWorkshopOpen(true)}
                      className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl text-xs font-bold border border-stone-200 cursor-pointer transition-colors"
                    >
                      + Привязать существующий
                    </button>
                    <button
                      onClick={() => setQuickCreateType('workshop')}
                      className="px-3 py-1.5 bg-amber-800 hover:bg-amber-900 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer transition-colors"
                    >
                      + Новый цех
                    </button>
                  </div>
                </div>

                {entityWorkshops.length === 0 ? (
                  <div className="bg-stone-50 border border-dashed border-stone-300 rounded-2xl p-8 text-center">
                    <Factory className="w-8 h-8 text-stone-400 mx-auto mb-2" />
                    <h5 className="text-sm font-semibold text-stone-800">Нет закрепленных цехов</h5>
                    <p className="text-xs text-stone-500 mt-1 max-w-md mx-auto">
                      Вы можете привязать цех из имеющихся или добавить новый производственный объект.
                    </p>
                    <div className="mt-4 flex items-center justify-center gap-2">
                      <button
                        onClick={() => setIsLinkWorkshopOpen(true)}
                        className="px-3 py-1.5 bg-white text-stone-700 border border-stone-300 rounded-lg text-xs font-semibold cursor-pointer"
                      >
                        Привязать цех
                      </button>
                      <button
                        onClick={() => setQuickCreateType('workshop')}
                        className="px-3 py-1.5 bg-amber-800 text-white rounded-lg text-xs font-semibold cursor-pointer"
                      >
                        Создать цех
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {entityWorkshops.map((ws) => {
                      const servedPoints = points.filter((p) => p.assignedWorkshopId === ws.id);
                      return (
                        <div
                          key={ws.id}
                          className="bg-white border border-stone-200 rounded-2xl p-4 shadow-xs flex flex-col justify-between"
                        >
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                  {ws.id}
                                </span>
                                <h5 className="font-bold text-stone-900 text-sm mt-1">{ws.name}</h5>
                              </div>
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  ws.archived ? 'bg-stone-100 text-stone-500' : 'bg-emerald-50 text-emerald-700'
                                }`}
                              >
                                {ws.archived ? 'В архиве' : 'Активен'}
                              </span>
                            </div>

                            <p className="text-xs text-stone-600 mt-2 flex items-center gap-1.5">
                              <MapPin className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                              <span>{ws.address}</span>
                            </p>

                            <div className="mt-3 pt-3 border-t border-stone-100 grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <span className="text-[10px] text-stone-400 block">Зав. производством:</span>
                                <span className="font-semibold text-stone-800">{ws.chiefName || '—'}</span>
                              </div>
                              <div>
                                <span className="text-[10px] text-stone-400 block">Телефон цеха:</span>
                                <span className="font-medium text-stone-800">{ws.phone || '—'}</span>
                              </div>
                            </div>

                            <div className="mt-2 text-xs">
                              <span className="text-[10px] text-stone-400 block">Мощность:</span>
                              <span className="text-stone-700 font-medium">{ws.capacity || 'Стандарт'}</span>
                            </div>

                            <div className="mt-2 text-xs">
                              <span className="text-[10px] text-stone-400 block">Снабжает кофеен:</span>
                              <span className="font-bold text-amber-800">{servedPoints.length} точек</span>
                            </div>
                          </div>

                          <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-xs">
                            <span className="text-[10px] text-stone-400 font-mono">
                              1C: {ws.external_id || 'manual'}
                            </span>
                            <button
                              onClick={() => handleUnlinkWorkshop(ws.id)}
                              className="text-rose-600 hover:text-rose-800 font-semibold text-[11px] cursor-pointer"
                            >
                              Отвязать
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: LINKED DRIVERS */}
            {activeAccountTab === 'drivers' && (
              <div className="mt-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-stone-900">
                      Водители логистической цепочки {selectedEntity.shortName}
                    </h4>
                    <p className="text-xs text-stone-500">
                      Водители, доставляющие выпечку и сырье из цехов в кофейни с соблюдением температурных режимов.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsLinkDriverOpen(true)}
                      className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl text-xs font-bold border border-stone-200 cursor-pointer transition-colors"
                    >
                      + Привязать водителя
                    </button>
                    <button
                      onClick={() => {
                        setQuickCreateType('driver');
                        setQuickDriverWorkshopId(entityWorkshops[0]?.id || workshops[0]?.id || '');
                      }}
                      className="px-3 py-1.5 bg-amber-800 hover:bg-amber-900 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer transition-colors"
                    >
                      + Новый водитель
                    </button>
                  </div>
                </div>

                {entityDrivers.length === 0 ? (
                  <div className="bg-stone-50 border border-dashed border-stone-300 rounded-2xl p-8 text-center">
                    <Truck className="w-8 h-8 text-stone-400 mx-auto mb-2" />
                    <h5 className="text-sm font-semibold text-stone-800">Нет привязанных водителей</h5>
                    <p className="text-xs text-stone-500 mt-1 max-w-md mx-auto">
                      Привяжите водителей для формирования путевых накладных и назначения рейсов доставки.
                    </p>
                    <div className="mt-4 flex items-center justify-center gap-2">
                      <button
                        onClick={() => setIsLinkDriverOpen(true)}
                        className="px-3 py-1.5 bg-white text-stone-700 border border-stone-300 rounded-lg text-xs font-semibold cursor-pointer"
                      >
                        Привязать из базы
                      </button>
                      <button
                        onClick={() => setQuickCreateType('driver')}
                        className="px-3 py-1.5 bg-amber-800 text-white rounded-lg text-xs font-semibold cursor-pointer"
                      >
                        Добавить водителя
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {entityDrivers.map((drv) => {
                      const ws = workshops.find((w) => w.id === drv.assignedWorkshopId);
                      return (
                        <div
                          key={drv.id}
                          className="bg-white border border-stone-200 rounded-2xl p-4 shadow-xs flex flex-col justify-between"
                        >
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                  {drv.id}
                                </span>
                                <h5 className="font-bold text-stone-900 text-sm mt-1">{drv.name}</h5>
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
                                {drv.status === 'on_route'
                                  ? 'В рейсе'
                                  : drv.status === 'day_off'
                                  ? 'Выходной'
                                  : 'На смене'}
                              </span>
                            </div>

                            <p className="text-xs text-stone-600 mt-2 flex items-center gap-1.5">
                              <Phone className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                              <span>{drv.phone}</span>
                            </p>

                            <div className="mt-3 pt-3 border-t border-stone-100 grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <span className="text-[10px] text-stone-400 block">Автомобиль:</span>
                                <span className="font-semibold text-stone-800">{drv.vehicleModel}</span>
                                <span className="text-[10px] font-mono text-stone-500 block">{drv.licensePlate}</span>
                              </div>

                              <div>
                                <span className="text-[10px] text-stone-400 block">Кузов / Температура:</span>
                                {drv.hasRefrigerator ? (
                                  <span className="text-[10px] font-bold text-sky-800 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200 inline-flex items-center gap-1 mt-0.5">
                                    <Snowflake className="w-3 h-3 text-sky-600" />
                                    Рефрижератор
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-medium text-stone-600 bg-stone-100 px-1.5 py-0.5 rounded inline-block mt-0.5">
                                    Изотерм / Фургон
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="mt-2 text-xs">
                              <span className="text-[10px] text-stone-400 block">Закреплен за цехом:</span>
                              <span className="font-semibold text-stone-800 flex items-center gap-1 mt-0.5">
                                <Factory className="w-3 h-3 text-amber-800" />
                                {ws ? ws.name : 'Не назначен'}
                              </span>
                            </div>
                          </div>

                          <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-xs">
                            <span className="text-[10px] text-stone-400">
                              {drv.archived ? 'В архиве' : 'Активен'}
                            </span>
                            <button
                              onClick={() => handleUnlinkDriver(drv.id)}
                              className="text-rose-600 hover:text-rose-800 font-semibold text-[11px] cursor-pointer"
                            >
                              Отвязать
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* VIEW 2: LIST OF ALL LEGAL ENTITIES */
        <div className="space-y-4">
          {/* Search & Filters */}
          <div className="bg-white rounded-2xl p-4 border border-stone-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск по названию, ИНН, директору..."
                className="w-full bg-stone-50 border border-stone-200 rounded-xl pl-9 pr-3 py-2 text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-800 focus:bg-white"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <button
                onClick={() => setStatusFilter('active')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  statusFilter === 'active'
                    ? 'bg-amber-800 text-white'
                    : 'text-stone-600 hover:bg-stone-100'
                }`}
              >
                Действующие ({legalEntities.filter((e) => !e.archived).length})
              </button>
              <button
                onClick={() => setStatusFilter('archived')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  statusFilter === 'archived'
                    ? 'bg-amber-800 text-white'
                    : 'text-stone-600 hover:bg-stone-100'
                }`}
              >
                Архив ({legalEntities.filter((e) => e.archived).length})
              </button>
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  statusFilter === 'all'
                    ? 'bg-amber-800 text-white'
                    : 'text-stone-600 hover:bg-stone-100'
                }`}
              >
                Все ({legalEntities.length})
              </button>
            </div>
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredEntities.map((entity) => {
              const shopCount = points.filter((p) => p.legalEntityId === entity.id).length;
              const workshopCount = workshops.filter((w) => w.legalEntityId === entity.id).length;
              const driverCount = drivers.filter((d) => d.legalEntityId === entity.id).length;

              return (
                <div
                  key={entity.id}
                  className={`bg-white rounded-2xl border transition-all duration-200 shadow-sm hover:shadow-md flex flex-col justify-between overflow-hidden ${
                    entity.archived ? 'border-stone-200 opacity-70' : 'border-stone-200 hover:border-amber-300'
                  }`}
                >
                  <div className="p-5">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-xl bg-amber-900 text-amber-100 font-bold flex items-center justify-center text-sm shadow-xs shrink-0">
                          {entity.shortName.startsWith('ИП') ? 'ИП' : 'ООО'}
                        </div>
                        <div>
                          <h4 className="font-bold text-stone-900 text-sm leading-snug line-clamp-1">
                            {entity.shortName}
                          </h4>
                          <span className="text-[10px] text-stone-400 block line-clamp-1">{entity.name}</span>
                        </div>
                      </div>

                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                          entity.archived
                            ? 'bg-stone-100 text-stone-500'
                            : 'bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        {entity.archived ? 'Архив' : 'Активно'}
                      </span>
                    </div>

                    {/* Tax & INN */}
                    <div className="mt-3 flex items-center gap-2 text-xs">
                      <span className="font-mono text-stone-800 bg-stone-100 px-2 py-0.5 rounded text-[11px] font-semibold">
                        ИНН {entity.inn}
                      </span>
                      <span className="text-[10px] text-amber-900 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 line-clamp-1">
                        {entity.taxSystem}
                      </span>
                    </div>

                    {/* Addresses & Director */}
                    <div className="mt-3 space-y-1.5 text-xs text-stone-600">
                      <p className="flex items-center gap-1.5 line-clamp-1">
                        <MapPin className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                        <span className="line-clamp-1">{entity.legalAddress}</span>
                      </p>
                      {entity.directorName && (
                        <p className="flex items-center gap-1.5 line-clamp-1">
                          <User className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                          <span className="line-clamp-1">{entity.directorName}</span>
                        </p>
                      )}
                    </div>

                    {/* Linked Entity Badges */}
                    <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-3">
                        <div
                          title="Привязанные кофейни сети"
                          className="flex items-center gap-1 text-stone-700 font-semibold"
                        >
                          <Coffee className="w-3.5 h-3.5 text-amber-700" />
                          <span>{shopCount}</span>
                        </div>

                        <div
                          title="Привязанные цеха производства"
                          className="flex items-center gap-1 text-stone-700 font-semibold"
                        >
                          <Factory className="w-3.5 h-3.5 text-amber-700" />
                          <span>{workshopCount}</span>
                        </div>

                        <div
                          title="Водители логистики"
                          className="flex items-center gap-1 text-stone-700 font-semibold"
                        >
                          <Truck className="w-3.5 h-3.5 text-amber-700" />
                          <span>{driverCount}</span>
                        </div>
                      </div>

                      <span className="text-[10px] text-stone-400 font-mono">
                        {entity.external_id || 'manual'}
                      </span>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="bg-stone-50 px-5 py-3 border-t border-stone-100 flex items-center justify-between gap-2">
                    <button
                      onClick={() => handleCopyRequisites(entity)}
                      className="p-1.5 text-stone-500 hover:text-stone-800 hover:bg-stone-200 rounded-lg transition-colors cursor-pointer"
                      title="Скопировать реквизиты"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => handleOpenEntityForm(entity)}
                      className="p-1.5 text-stone-500 hover:text-amber-800 hover:bg-stone-200 rounded-lg transition-colors cursor-pointer"
                      title="Редактировать реквизиты"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => {
                        setSelectedEntityId(entity.id);
                        setActiveAccountTab('overview');
                      }}
                      className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-amber-800 hover:bg-amber-900 text-white rounded-xl text-xs font-bold shadow-2xs transition-colors cursor-pointer"
                    >
                      <span>Открыть аккаунт</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MODAL 1: CREATE / EDIT LEGAL ENTITY FORM */}
      {isEditingEntity && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full p-4 sm:p-6 my-auto sm:my-8 border border-stone-200 max-h-[90vh] overflow-y-auto overflow-x-hidden">
            <div className="flex items-center justify-between pb-4 border-b border-stone-200">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold shrink-0">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-stone-900">
                    {entityFormData.id && legalEntities.some((e) => e.id === entityFormData.id)
                      ? 'Редактирование профиля юрлица'
                      : 'Регистрация нового юридического лица'}
                  </h3>
                  <p className="text-xs text-stone-500">
                    Реквизиты для генерации накладных, бухгалтерского учета и договоров с точками
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsEditingEntity(false)}
                className="text-stone-400 hover:text-stone-700 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEntity} className="mt-5 space-y-6">
              {/* Block 1: Main Requisites */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1.5 mb-3">
                  <Hash className="w-3.5 h-3.5" />
                  1. Основные реквизиты организации
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Полное наименование организации <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="ООО «Арома Холдинг» или ИП Иванов Иван Иванович"
                      value={entityFormData.name || ''}
                      onChange={(e) => setEntityFormData({ ...entityFormData, name: e.target.value })}
                      className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-xs text-stone-900 focus:ring-2 focus:ring-amber-800 focus:bg-white outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Краткое наименование <span className="text-stone-400">(для чеков и накладных)</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Арома Холдинг"
                      value={entityFormData.shortName || ''}
                      onChange={(e) => setEntityFormData({ ...entityFormData, shortName: e.target.value })}
                      className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-xs text-stone-900 focus:ring-2 focus:ring-amber-800 focus:bg-white outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Система налогообложения <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={entityFormData.taxSystem || 'УСН (Доходы - Расходы, 15%)'}
                      onChange={(e) => setEntityFormData({ ...entityFormData, taxSystem: e.target.value })}
                      className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-xs text-stone-900 focus:ring-2 focus:ring-amber-800 focus:bg-white outline-none"
                    >
                      <option value="УСН (Доходы - Расходы, 15%)">УСН (Доходы минус Расходы, 15%)</option>
                      <option value="УСН (Доходы, 6%)">УСН (Доходы, 6%)</option>
                      <option value="ОСНО (с НДС 20%)">ОСНО (Общая система с НДС 20%)</option>
                      <option value="Патент (ПСН) + УСН Доходы">Патент (ПСН) + УСН Доходы</option>
                      <option value="Патент (ПСН)">Патент (ПСН)</option>
                      <option value="ЕСХН">ЕСХН</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      ИНН (10 или 12 цифр) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="7701984210"
                      maxLength={12}
                      value={entityFormData.inn || ''}
                      onChange={(e) => setEntityFormData({ ...entityFormData, inn: e.target.value.replace(/\D/g, '') })}
                      className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-xs font-mono text-stone-900 focus:ring-2 focus:ring-amber-800 focus:bg-white outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      КПП (9 цифр, для юрлиц)
                    </label>
                    <input
                      type="text"
                      placeholder="770101001"
                      maxLength={9}
                      value={entityFormData.kpp || ''}
                      onChange={(e) => setEntityFormData({ ...entityFormData, kpp: e.target.value.replace(/\D/g, '') })}
                      className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-xs font-mono text-stone-900 focus:ring-2 focus:ring-amber-800 focus:bg-white outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      ОГРН / ОГРНИП
                    </label>
                    <input
                      type="text"
                      placeholder="1187746123456"
                      maxLength={15}
                      value={entityFormData.ogrn || ''}
                      onChange={(e) => setEntityFormData({ ...entityFormData, ogrn: e.target.value.replace(/\D/g, '') })}
                      className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-xs font-mono text-stone-900 focus:ring-2 focus:ring-amber-800 focus:bg-white outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      ФИО Генерального директора / ИП
                    </label>
                    <input
                      type="text"
                      placeholder="Воронов Сергей Александрович"
                      value={entityFormData.directorName || ''}
                      onChange={(e) => setEntityFormData({ ...entityFormData, directorName: e.target.value })}
                      className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-xs text-stone-900 focus:ring-2 focus:ring-amber-800 focus:bg-white outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Block 2: Addresses & Contacts */}
              <div className="pt-4 border-t border-stone-100">
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1.5 mb-3">
                  <MapPin className="w-3.5 h-3.5" />
                  2. Адреса и контактные данные
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Юридический адрес <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="101000, г. Москва, ул. Тверская, д. 12"
                      value={entityFormData.legalAddress || ''}
                      onChange={(e) => setEntityFormData({ ...entityFormData, legalAddress: e.target.value })}
                      className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-xs text-stone-900 focus:ring-2 focus:ring-amber-800 focus:bg-white outline-none"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Фактический адрес <span className="text-stone-400">(если отличается)</span>
                    </label>
                    <input
                      type="text"
                      placeholder="101000, г. Москва, пер. Кривоколенный, д. 9"
                      value={entityFormData.actualAddress || ''}
                      onChange={(e) => setEntityFormData({ ...entityFormData, actualAddress: e.target.value })}
                      className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-xs text-stone-900 focus:ring-2 focus:ring-amber-800 focus:bg-white outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Контактный телефон бухгалтерии
                    </label>
                    <input
                      type="text"
                      placeholder="+7 (495) 789-01-23"
                      value={entityFormData.phone || ''}
                      onChange={(e) => setEntityFormData({ ...entityFormData, phone: e.target.value })}
                      className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-xs text-stone-900 focus:ring-2 focus:ring-amber-800 focus:bg-white outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Email для счетов и ЭДО
                    </label>
                    <input
                      type="email"
                      placeholder="buh@aroma-coffee.ru"
                      value={entityFormData.email || ''}
                      onChange={(e) => setEntityFormData({ ...entityFormData, email: e.target.value })}
                      className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-xs text-stone-900 focus:ring-2 focus:ring-amber-800 focus:bg-white outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Block 3: Bank Details */}
              <div className="pt-4 border-t border-stone-100">
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1.5 mb-3">
                  <CreditCard className="w-3.5 h-3.5" />
                  3. Банковские реквизиты
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Наименование банка
                    </label>
                    <input
                      type="text"
                      placeholder="ПАО «Сбербанк» г. Москва"
                      value={entityFormData.bankName || ''}
                      onChange={(e) => setEntityFormData({ ...entityFormData, bankName: e.target.value })}
                      className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-xs text-stone-900 focus:ring-2 focus:ring-amber-800 focus:bg-white outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      БИК банка (9 цифр)
                    </label>
                    <input
                      type="text"
                      placeholder="044525225"
                      maxLength={9}
                      value={entityFormData.bik || ''}
                      onChange={(e) => setEntityFormData({ ...entityFormData, bik: e.target.value.replace(/\D/g, '') })}
                      className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-xs font-mono text-stone-900 focus:ring-2 focus:ring-amber-800 focus:bg-white outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Корреспондентский счет (20 цифр)
                    </label>
                    <input
                      type="text"
                      placeholder="30101810400000000225"
                      maxLength={20}
                      value={entityFormData.correspondentAccount || ''}
                      onChange={(e) => setEntityFormData({ ...entityFormData, correspondentAccount: e.target.value.replace(/\D/g, '') })}
                      className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-xs font-mono text-stone-900 focus:ring-2 focus:ring-amber-800 focus:bg-white outline-none"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Расчетный счет (20 цифр)
                    </label>
                    <input
                      type="text"
                      placeholder="40702810438000123456"
                      maxLength={20}
                      value={entityFormData.checkingAccount || ''}
                      onChange={(e) => setEntityFormData({ ...entityFormData, checkingAccount: e.target.value.replace(/\D/g, '') })}
                      className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-xs font-mono text-stone-900 focus:ring-2 focus:ring-amber-800 focus:bg-white outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Block 4: Status and Integrations */}
              <div className="pt-4 border-t border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="entityArchived"
                    checked={entityFormData.archived || false}
                    onChange={(e) => setEntityFormData({ ...entityFormData, archived: e.target.checked })}
                    className="w-4 h-4 rounded text-amber-800 focus:ring-amber-800 cursor-pointer shrink-0"
                  />
                  <label htmlFor="entityArchived" className="text-xs text-stone-700 font-medium cursor-pointer">
                    Поместить в архив (скрыть из активных списков)
                  </label>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <span className="text-[11px] text-stone-400 shrink-0">Внешний код 1С:</span>
                  <input
                    type="text"
                    placeholder="1C-ORG-001"
                    value={entityFormData.external_id || ''}
                    onChange={(e) => setEntityFormData({ ...entityFormData, external_id: e.target.value })}
                    className="w-full sm:w-32 bg-stone-50 border border-stone-300 rounded-lg px-2 py-1 text-xs font-mono text-stone-900"
                  />
                </div>
              </div>

              {/* Modal Action Buttons */}
              <div className="pt-5 border-t border-stone-200 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsEditingEntity(false)}
                  className="w-full sm:w-auto px-4 py-2 border border-stone-300 text-stone-700 hover:bg-stone-100 rounded-xl text-xs font-semibold text-center cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="w-full sm:w-auto px-5 py-2.5 bg-amber-800 hover:bg-amber-900 text-white rounded-xl text-xs font-bold shadow-sm text-center cursor-pointer"
                >
                  Сохранить в PostgreSQL
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: LINK EXISTING POINT TO CURRENT ENTITY */}
      {isLinkShopOpen && selectedEntity && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-4 sm:p-6 border border-stone-200 my-auto max-h-[90vh] overflow-y-auto overflow-x-hidden">
            <h4 className="text-sm font-bold text-stone-900">
              Привязать кофейню к {selectedEntity.shortName}
            </h4>
            <p className="text-xs text-stone-500 mt-1">
              Выберите точку из сети, чтобы перевести её на обслуживание под данным юридическим лицом.
            </p>

            <div className="mt-4">
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Выберите кофейню сети:
              </label>
              <select
                value={selectedShopToLink}
                onChange={(e) => setSelectedShopToLink(e.target.value)}
                className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-xs text-stone-900 focus:ring-2 focus:ring-amber-800 outline-none truncate"
              >
                <option value="">-- Выберите кофейню --</option>
                {points.map((p) => {
                  const currentLe = legalEntities.find((e) => e.id === p.legalEntityId);
                  return (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.address}) — сейчас: {currentLe ? currentLe.shortName : 'Без юрлица'}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="mt-6 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2">
              <button
                onClick={() => setIsLinkShopOpen(false)}
                className="w-full sm:w-auto px-3 py-2 border border-stone-300 text-stone-700 text-xs font-semibold rounded-lg text-center cursor-pointer"
              >
                Отмена
              </button>
              <button
                disabled={!selectedShopToLink}
                onClick={handleLinkPoint}
                className="w-full sm:w-auto px-4 py-2 bg-amber-800 disabled:opacity-50 text-white text-xs font-bold rounded-lg text-center cursor-pointer"
              >
                Привязать кофейню
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: LINK EXISTING WORKSHOP TO CURRENT ENTITY */}
      {isLinkWorkshopOpen && selectedEntity && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-4 sm:p-6 border border-stone-200 my-auto max-h-[90vh] overflow-y-auto overflow-x-hidden">
            <h4 className="text-sm font-bold text-stone-900">
              Привязать цех производства к {selectedEntity.shortName}
            </h4>
            <p className="text-xs text-stone-500 mt-1">
              Выберите производственный объект для закрепления за этим юридическим лицом.
            </p>

            <div className="mt-4">
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Выберите производственный цех:
              </label>
              <select
                value={selectedWorkshopToLink}
                onChange={(e) => setSelectedWorkshopToLink(e.target.value)}
                className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-xs text-stone-900 focus:ring-2 focus:ring-amber-800 outline-none truncate"
              >
                <option value="">-- Выберите цех --</option>
                {workshops.map((w) => {
                  const currentLe = legalEntities.find((e) => e.id === w.legalEntityId);
                  return (
                    <option key={w.id} value={w.id}>
                      {w.name} — сейчас: {currentLe ? currentLe.shortName : 'Без юрлица'}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="mt-6 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2">
              <button
                onClick={() => setIsLinkWorkshopOpen(false)}
                className="w-full sm:w-auto px-3 py-2 border border-stone-300 text-stone-700 text-xs font-semibold rounded-lg text-center cursor-pointer"
              >
                Отмена
              </button>
              <button
                disabled={!selectedWorkshopToLink}
                onClick={handleLinkWorkshop}
                className="w-full sm:w-auto px-4 py-2 bg-amber-800 disabled:opacity-50 text-white text-xs font-bold rounded-lg text-center cursor-pointer"
              >
                Привязать цех
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: LINK EXISTING DRIVER TO CURRENT ENTITY */}
      {isLinkDriverOpen && selectedEntity && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-4 sm:p-6 border border-stone-200 my-auto max-h-[90vh] overflow-y-auto overflow-x-hidden">
            <h4 className="text-sm font-bold text-stone-900">
              Привязать водителя доставки к {selectedEntity.shortName}
            </h4>
            <p className="text-xs text-stone-500 mt-1">
              Выберите водителя для включения в логистическую цепочку организации.
            </p>

            <div className="mt-4">
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Выберите водителя:
              </label>
              <select
                value={selectedDriverToLink}
                onChange={(e) => setSelectedDriverToLink(e.target.value)}
                className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-xs text-stone-900 focus:ring-2 focus:ring-amber-800 outline-none truncate"
              >
                <option value="">-- Выберите водителя --</option>
                {drivers.map((d) => {
                  const currentLe = legalEntities.find((e) => e.id === d.legalEntityId);
                  return (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.vehicleModel}, {d.licensePlate}) — сейчас: {currentLe ? currentLe.shortName : 'Без юрлица'}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="mt-6 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2">
              <button
                onClick={() => setIsLinkDriverOpen(false)}
                className="w-full sm:w-auto px-3 py-2 border border-stone-300 text-stone-700 text-xs font-semibold rounded-lg text-center cursor-pointer"
              >
                Отмена
              </button>
              <button
                disabled={!selectedDriverToLink}
                onClick={handleLinkDriver}
                className="w-full sm:w-auto px-4 py-2 bg-amber-800 disabled:opacity-50 text-white text-xs font-bold rounded-lg text-center cursor-pointer"
              >
                Привязать водителя
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: QUICK CREATE FOR CURRENT ENTITY */}
      {quickCreateType && selectedEntity && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-4 sm:p-6 border border-stone-200 my-auto max-h-[90vh] overflow-y-auto overflow-x-hidden">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <h4 className="text-sm font-bold text-stone-900">
                {quickCreateType === 'cafe' && `Новая кофейня для ${selectedEntity.shortName}`}
                {quickCreateType === 'workshop' && `Новый цех для ${selectedEntity.shortName}`}
                {quickCreateType === 'driver' && `Новый водитель для ${selectedEntity.shortName}`}
              </h4>
              <button
                onClick={() => setQuickCreateType(null)}
                className="text-stone-400 hover:text-stone-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {quickCreateType === 'cafe' && (
              <form onSubmit={handleQuickCreateCafe} className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Название кофейни <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Кофейня №5 (Арбат Новый)"
                    value={quickCafeName}
                    onChange={(e) => setQuickCafeName(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-xs text-stone-900 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Фактический адрес точки <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="ул. Новый Арбат, д. 15"
                    value={quickCafeAddress}
                    onChange={(e) => setQuickCafeAddress(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-xs text-stone-900 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Закрепленный цех снабжения
                  </label>
                  <select
                    value={quickCafeWorkshopId}
                    onChange={(e) => setQuickCafeWorkshopId(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-xs text-stone-900 outline-none"
                  >
                    <option value="">-- Не назначен --</option>
                    {workshops.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="pt-3 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setQuickCreateType(null)}
                    className="w-full sm:w-auto px-3 py-2 border border-stone-300 text-xs rounded-lg text-center cursor-pointer"
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    className="w-full sm:w-auto px-4 py-2 bg-amber-800 text-white text-xs font-bold rounded-lg text-center cursor-pointer"
                  >
                    Создать кофейню
                  </button>
                </div>
              </form>
            )}

            {quickCreateType === 'workshop' && (
              <form onSubmit={handleQuickCreateWorkshop} className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Название производственного цеха <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Пекарня и кондитерский цех (Юг)"
                    value={quickWorkshopName}
                    onChange={(e) => setQuickWorkshopName(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-xs text-stone-900 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Адрес производства <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="г. Москва, Варшавское шоссе, д. 42"
                    value={quickWorkshopAddress}
                    onChange={(e) => setQuickWorkshopAddress(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-xs text-stone-900 outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Зав. производством
                    </label>
                    <input
                      type="text"
                      placeholder="Иванов И.И."
                      value={quickWorkshopChief}
                      onChange={(e) => setQuickWorkshopChief(e.target.value)}
                      className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-xs text-stone-900 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Телефон цеха
                    </label>
                    <input
                      type="text"
                      placeholder="+7 (495) 000-00-00"
                      value={quickWorkshopPhone}
                      onChange={(e) => setQuickWorkshopPhone(e.target.value)}
                      className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-xs text-stone-900 outline-none"
                    />
                  </div>
                </div>

                <div className="pt-3 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setQuickCreateType(null)}
                    className="w-full sm:w-auto px-3 py-2 border border-stone-300 text-xs rounded-lg text-center cursor-pointer"
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    className="w-full sm:w-auto px-4 py-2 bg-amber-800 text-white text-xs font-bold rounded-lg text-center cursor-pointer"
                  >
                    Создать цех
                  </button>
                </div>
              </form>
            )}

            {quickCreateType === 'driver' && (
              <form onSubmit={handleQuickCreateDriver} className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    ФИО Водителя <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Сергей Николаев"
                    value={quickDriverName}
                    onChange={(e) => setQuickDriverName(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-xs text-stone-900 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Телефон водителя <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="+7 (999) 111-22-33"
                    value={quickDriverPhone}
                    onChange={(e) => setQuickDriverPhone(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-xs text-stone-900 outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Модель авто
                    </label>
                    <input
                      type="text"
                      placeholder="ГАЗель NEXT"
                      value={quickDriverVehicle}
                      onChange={(e) => setQuickDriverVehicle(e.target.value)}
                      className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-xs text-stone-900 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Гос. номер
                    </label>
                    <input
                      type="text"
                      placeholder="В123ОР 777"
                      value={quickDriverPlate}
                      onChange={(e) => setQuickDriverPlate(e.target.value)}
                      className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-xs text-stone-900 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Закрепленный цех отгрузки
                  </label>
                  <select
                    value={quickDriverWorkshopId}
                    onChange={(e) => setQuickDriverWorkshopId(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-xs text-stone-900 outline-none"
                  >
                    <option value="">-- Выберите цех --</option>
                    {workshops.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="pt-1 flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="fridgeCheck"
                    checked={quickDriverFridge}
                    onChange={(e) => setQuickDriverFridge(e.target.checked)}
                    className="w-4 h-4 rounded text-amber-800"
                  />
                  <label htmlFor="fridgeCheck" className="text-xs text-stone-700 font-medium cursor-pointer">
                    Изотермический фургон с рефрижератором (+2...+4 °C)
                  </label>
                </div>

                <div className="pt-3 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setQuickCreateType(null)}
                    className="w-full sm:w-auto px-3 py-2 border border-stone-300 text-xs rounded-lg text-center cursor-pointer"
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    className="w-full sm:w-auto px-4 py-2 bg-amber-800 text-white text-xs font-bold rounded-lg text-center cursor-pointer"
                  >
                    Добавить водителя
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
