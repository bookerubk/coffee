import {
  CoffeePoint,
  ProductItem,
  Employee,
  SlotConfig,
  ShiftOrder,
  Waybill,
  DiscrepancyRecord,
  LegalEntity,
  Workshop,
  Driver,
  TenantAccount,
  UserSession,
} from '../types';
import {
  INITIAL_POINTS,
  INITIAL_PRODUCTS,
  INITIAL_EMPLOYEES,
  INITIAL_SLOTS,
  INITIAL_ORDERS,
  INITIAL_WAYBILLS,
  INITIAL_LEGAL_ENTITIES,
  INITIAL_WORKSHOPS,
  INITIAL_DRIVERS,
} from './mockData';

export const INITIAL_TENANT_ACCOUNTS: TenantAccount[] = [
  {
    id: 'acc-aroma',
    name: 'Сеть кофеен «Арома Холдинг»',
    dbSchema: 'db_aroma_prod',
    inn: '7701984210',
    adminEmail: 'admin@aroma-coffee.ru',
    adminName: 'Сергей Воронов',
    description: 'Основная сеть кофеен и пекарен Москвы (Тверская, Арбат, Сити, Патриаршие)',
  },
  {
    id: 'acc-nordic',
    name: 'Сеть кофеен «Север Кофе» (Изолированная БД)',
    dbSchema: 'db_nordic_prod',
    inn: '7802345678',
    adminEmail: 'admin@nordic-coffee.ru',
    adminName: 'Алексей Смирнов',
    description: 'Отдельный независимый аккаунт со своей базой данных: цех Север, 2 кофейни, свой парк доставки',
  },
];

const STORAGE_KEYS = {
  LEGACY_AUTH_TOKEN: 'coffee_app_auth_token_v1', // больше не используется, только для очистки
  USER_SESSION: 'coffee_app_user_session_v1',
  ACTIVE_ACCOUNT_ID: 'coffee_app_active_account_id_v1',
  TENANT_ACCOUNTS: 'coffee_app_tenant_accounts_v1',
  POINTS: 'coffee_app_points_v1',
  PRODUCTS: 'coffee_app_products_v1',
  EMPLOYEES: 'coffee_app_employees_v1',
  SLOTS: 'coffee_app_slots_v1',
  ORDERS: 'coffee_app_orders_v1',
  WAYBILLS: 'coffee_app_waybills_v1',
  LEGAL_ENTITIES: 'coffee_app_legal_entities_v1',
  WORKSHOPS: 'coffee_app_workshops_v1',
  DRIVERS: 'coffee_app_drivers_v1',
  IDEMPOTENCY_LOG: 'coffee_app_idempotency_log_v1',
  FORCE_DEADLINE_PASSED: 'coffee_app_force_deadline_passed',
  SIMULATE_NETWORK_ERROR: 'coffee_app_sim_error',
  SIMULATE_TIMEOUT: 'coffee_app_sim_timeout',
};

function getStoredItem<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return defaultValue;
  try {
    const item = localStorage.getItem(key);
    if (!item) return defaultValue;
    return JSON.parse(item) as T;
  } catch (e) {
    console.error(`Error reading ${key} from storage`, e);
    return defaultValue;
  }
}

function setStoredItem<T>(key: string, value: T, notify = true): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    if (notify) {
      window.dispatchEvent(new CustomEvent('coffee-storage-change', { detail: { key } }));
    }
  } catch (e) {
    console.error(`Error writing ${key} to storage`, e);
  }
}

// Storage Manager
export const StorageManager = {
  // Sync all handbooks in one atomic update without event storm
  syncHandbooks(data: {
    points?: CoffeePoint[];
    products?: ProductItem[];
    employees?: Employee[];
    slots?: SlotConfig[];
    legalEntities?: LegalEntity[];
    workshops?: Workshop[];
    drivers?: Driver[];
    accounts?: TenantAccount[];
  }): void {
    if (data.points && Array.isArray(data.points)) setStoredItem(STORAGE_KEYS.POINTS, data.points, false);
    if (data.products && Array.isArray(data.products)) setStoredItem(STORAGE_KEYS.PRODUCTS, data.products, false);
    if (data.employees && Array.isArray(data.employees)) setStoredItem(STORAGE_KEYS.EMPLOYEES, data.employees, false);
    if (data.slots && Array.isArray(data.slots)) setStoredItem(STORAGE_KEYS.SLOTS, data.slots, false);
    if (data.legalEntities && Array.isArray(data.legalEntities)) setStoredItem(STORAGE_KEYS.LEGAL_ENTITIES, data.legalEntities, false);
    if (data.workshops && Array.isArray(data.workshops)) setStoredItem(STORAGE_KEYS.WORKSHOPS, data.workshops, false);
    if (data.drivers && Array.isArray(data.drivers)) setStoredItem(STORAGE_KEYS.DRIVERS, data.drivers, false);
    if (data.accounts && Array.isArray(data.accounts)) setStoredItem(STORAGE_KEYS.TENANT_ACCOUNTS, data.accounts, false);
    // Single consolidated notification
    window.dispatchEvent(new CustomEvent('coffee-storage-change', { detail: { key: 'handbooks_sync', source: 'sync' } }));
  },
  // User Session & Authentication
  /** Прежняя версия хранила токен сессии в localStorage (доступен любому скрипту на странице) — стираем. */
  purgeLegacyAuthToken(): void {
    try {
      localStorage.removeItem(STORAGE_KEYS.LEGACY_AUTH_TOKEN);
    } catch {
      /* хранилище недоступно */
    }
  },
  getCurrentUser(): UserSession | null {
    return getStoredItem<UserSession | null>(STORAGE_KEYS.USER_SESSION, null);
  },
  setCurrentUser(user: UserSession | null): void {
    setStoredItem(STORAGE_KEYS.USER_SESSION, user);
    if (user && user.accountId) {
      this.setActiveAccountId(user.accountId);
    }
  },
  /**
   * Выход: очищаем профиль и кэш данных компании, чтобы следующий пользователь этого браузера
   * не увидел чужие заказы и справочники. Черновики и аварийные копии неотправленных заявок
   * (coffee_draft_* / coffee_emergency_backup_*) сохраняются — это не данные для просмотра,
   * а защита от потери введённого.
   */
  logout(): void {
    setStoredItem(STORAGE_KEYS.USER_SESSION, null);
    const dataKeys = [
      STORAGE_KEYS.LEGACY_AUTH_TOKEN,
      STORAGE_KEYS.ACTIVE_ACCOUNT_ID,
      STORAGE_KEYS.TENANT_ACCOUNTS,
      STORAGE_KEYS.POINTS,
      STORAGE_KEYS.PRODUCTS,
      STORAGE_KEYS.EMPLOYEES,
      STORAGE_KEYS.SLOTS,
      STORAGE_KEYS.ORDERS,
      STORAGE_KEYS.WAYBILLS,
      STORAGE_KEYS.LEGAL_ENTITIES,
      STORAGE_KEYS.WORKSHOPS,
      STORAGE_KEYS.DRIVERS,
    ];
    try {
      dataKeys.forEach((key) => localStorage.removeItem(key));
    } catch {
      /* хранилище недоступно */
    }
  },

  // Multi-tenant Database Account Scope
  getActiveAccountId(): string {
    const user = this.getCurrentUser();
    if (user && user.accountId) return user.accountId;
    return getStoredItem<string>(STORAGE_KEYS.ACTIVE_ACCOUNT_ID, 'acc-aroma');
  },
  setActiveAccountId(id: string): void {
    setStoredItem(STORAGE_KEYS.ACTIVE_ACCOUNT_ID, id);
  },
  getTenantAccounts(): TenantAccount[] {
    return getStoredItem<TenantAccount[]>(STORAGE_KEYS.TENANT_ACCOUNTS, INITIAL_TENANT_ACCOUNTS);
  },
  saveTenantAccount(account: TenantAccount): void {
    const list = this.getTenantAccounts();
    const idx = list.findIndex((a) => a.id === account.id);
    if (idx >= 0) {
      list[idx] = account;
    } else {
      list.push(account);
    }
    setStoredItem(STORAGE_KEYS.TENANT_ACCOUNTS, list);
  },

  // Legal Entities
  getLegalEntities(): LegalEntity[] {
    return getStoredItem<LegalEntity[]>(STORAGE_KEYS.LEGAL_ENTITIES, INITIAL_LEGAL_ENTITIES);
  },
  saveLegalEntity(entity: LegalEntity): void {
    const list = this.getLegalEntities();
    const idx = list.findIndex((e) => e.id === entity.id);
    if (idx >= 0) {
      list[idx] = entity;
    } else {
      list.push(entity);
    }
    setStoredItem(STORAGE_KEYS.LEGAL_ENTITIES, list);
  },

  // Workshops
  getWorkshops(): Workshop[] {
    return getStoredItem<Workshop[]>(STORAGE_KEYS.WORKSHOPS, INITIAL_WORKSHOPS);
  },
  saveWorkshop(workshop: Workshop): void {
    const list = this.getWorkshops();
    const idx = list.findIndex((w) => w.id === workshop.id);
    if (idx >= 0) {
      list[idx] = workshop;
    } else {
      list.push(workshop);
    }
    setStoredItem(STORAGE_KEYS.WORKSHOPS, list);
  },

  // Drivers
  getDrivers(): Driver[] {
    return getStoredItem<Driver[]>(STORAGE_KEYS.DRIVERS, INITIAL_DRIVERS);
  },
  saveDriver(driver: Driver): void {
    const list = this.getDrivers();
    const idx = list.findIndex((d) => d.id === driver.id);
    if (idx >= 0) {
      list[idx] = driver;
    } else {
      list.push(driver);
    }
    setStoredItem(STORAGE_KEYS.DRIVERS, list);
  },

  // Points
  getPoints(): CoffeePoint[] {
    return getStoredItem<CoffeePoint[]>(STORAGE_KEYS.POINTS, INITIAL_POINTS);
  },
  savePoint(point: CoffeePoint): void {
    const points = this.getPoints();
    const idx = points.findIndex((p) => p.id === point.id);
    if (idx >= 0) {
      points[idx] = point;
    } else {
      points.push(point);
    }
    setStoredItem(STORAGE_KEYS.POINTS, points);
  },

  // Products
  getProducts(): ProductItem[] {
    return getStoredItem<ProductItem[]>(STORAGE_KEYS.PRODUCTS, INITIAL_PRODUCTS);
  },
  saveProduct(product: ProductItem): void {
    const products = this.getProducts();
    const idx = products.findIndex((p) => p.id === product.id);
    if (idx >= 0) {
      products[idx] = product;
    } else {
      products.push(product);
    }
    setStoredItem(STORAGE_KEYS.PRODUCTS, products);
  },

  // Employees
  getEmployees(): Employee[] {
    return getStoredItem<Employee[]>(STORAGE_KEYS.EMPLOYEES, INITIAL_EMPLOYEES);
  },
  saveEmployee(employee: Employee): void {
    const employees = this.getEmployees();
    const idx = employees.findIndex((e) => e.id === employee.id);
    if (idx >= 0) {
      employees[idx] = employee;
    } else {
      employees.push(employee);
    }
    setStoredItem(STORAGE_KEYS.EMPLOYEES, employees);
  },

  // Slots
  getSlots(): SlotConfig[] {
    const stored = getStoredItem<SlotConfig[]>(STORAGE_KEYS.SLOTS, INITIAL_SLOTS);
    const map = new Map<string, SlotConfig>();
    INITIAL_SLOTS.forEach((s) => map.set(s.id, { ...s }));
    (stored || []).forEach((s) => {
      if (s && s.id) map.set(s.id, { ...map.get(s.id), ...s });
    });
    return Array.from(map.values());
  },
  saveSlot(slot: SlotConfig): void {
    const slots = this.getSlots();
    const idx = slots.findIndex((s) => s.id === slot.id);
    if (idx >= 0) {
      slots[idx] = slot;
    } else {
      slots.push(slot);
    }
    setStoredItem(STORAGE_KEYS.SLOTS, slots, true);
  },

  // Orders
  // Кэш в localStorage общий для всех аккаунтов, поэтому при чтении отбираем записи
  // активного аккаунта (демо-данные без accountId относятся к 'acc-aroma').
  getOrders(): ShiftOrder[] {
    const accountId = this.getActiveAccountId();
    return getStoredItem<ShiftOrder[]>(STORAGE_KEYS.ORDERS, INITIAL_ORDERS).filter(
      (o) => (o.accountId || 'acc-aroma') === accountId
    );
  },
  saveOrder(order: ShiftOrder): void {
    const orders = getStoredItem<ShiftOrder[]>(STORAGE_KEYS.ORDERS, INITIAL_ORDERS);
    const idx = orders.findIndex((o) => o.id === order.id);
    if (idx >= 0) {
      orders[idx] = order;
    } else {
      orders.push(order);
    }
    setStoredItem(STORAGE_KEYS.ORDERS, orders);
  },

  // Waybills
  getWaybills(): Waybill[] {
    const accountId = this.getActiveAccountId();
    return getStoredItem<Waybill[]>(STORAGE_KEYS.WAYBILLS, INITIAL_WAYBILLS).filter(
      (w) => (w.accountId || 'acc-aroma') === accountId
    );
  },
  saveWaybill(waybill: Waybill): void {
    const waybills = getStoredItem<Waybill[]>(STORAGE_KEYS.WAYBILLS, INITIAL_WAYBILLS);
    const idx = waybills.findIndex((w) => w.id === waybill.id);
    if (idx >= 0) {
      waybills[idx] = waybill;
    } else {
      waybills.push(waybill);
    }
    setStoredItem(STORAGE_KEYS.WAYBILLS, waybills);
  },

  // Idempotency log: map of idempotencyKey -> result
  hasIdempotencyKey(key: string): boolean {
    const log = getStoredItem<Record<string, string>>(STORAGE_KEYS.IDEMPOTENCY_LOG, {});
    return !!log[key];
  },
  recordIdempotencyKey(key: string, orderId: string): void {
    const log = getStoredItem<Record<string, string>>(STORAGE_KEYS.IDEMPOTENCY_LOG, {});
    log[key] = orderId;
    setStoredItem(STORAGE_KEYS.IDEMPOTENCY_LOG, log);
  },

  // Drafts
  getDraft(pointId: string, slotId: string) {
    const key = `coffee_draft_${pointId}_${slotId}`;
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  },
  saveDraft(pointId: string, slotId: string, data: any): void {
    const key = `coffee_draft_${pointId}_${slotId}`;
    try {
      localStorage.setItem(key, JSON.stringify({ ...data, savedAt: new Date().toISOString() }));
    } catch (e) {
      // Переполнение хранилища / приватный режим — не должно ронять интерфейс
      console.error('Не удалось сохранить черновик локально', e);
    }
  },
  clearDraft(pointId: string, slotId: string): void {
    const key = `coffee_draft_${pointId}_${slotId}`;
    try {
      localStorage.removeItem(key);
    } catch {
      /* хранилище недоступно */
    }
  },

  // Local Emergency Backups (from Section 4.2 "Сохранить локально")
  getLocalBackup(pointId: string, slotId: string) {
    const key = `coffee_emergency_backup_${pointId}_${slotId}`;
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  },
  saveLocalBackup(pointId: string, slotId: string, data: any): boolean {
    const key = `coffee_emergency_backup_${pointId}_${slotId}`;
    try {
      localStorage.setItem(
        key,
        JSON.stringify({
          ...data,
          backupAt: new Date().toISOString(),
        })
      );
      return true;
    } catch (e) {
      console.error('Не удалось сохранить аварийную копию заявки', e);
      return false;
    }
  },
  clearLocalBackup(pointId: string, slotId: string): void {
    const key = `coffee_emergency_backup_${pointId}_${slotId}`;
    try {
      localStorage.removeItem(key);
    } catch {
      /* хранилище недоступно */
    }
  },

  // Testing Toggles
  getSimulateError(): boolean {
    return getStoredItem<boolean>(STORAGE_KEYS.SIMULATE_NETWORK_ERROR, false);
  },
  setSimulateError(val: boolean): void {
    setStoredItem(STORAGE_KEYS.SIMULATE_NETWORK_ERROR, val);
  },

  getSimulateTimeout(): boolean {
    return getStoredItem<boolean>(STORAGE_KEYS.SIMULATE_TIMEOUT, false);
  },
  setSimulateTimeout(val: boolean): void {
    setStoredItem(STORAGE_KEYS.SIMULATE_TIMEOUT, val);
  },

  getForceDeadlinePassed(): boolean {
    return getStoredItem<boolean>(STORAGE_KEYS.FORCE_DEADLINE_PASSED, false);
  },
  setForceDeadlinePassed(val: boolean): void {
    setStoredItem(STORAGE_KEYS.FORCE_DEADLINE_PASSED, val);
  },

  // Reset to default seed
  resetAll(): void {
    localStorage.clear();
    setStoredItem(STORAGE_KEYS.LEGAL_ENTITIES, INITIAL_LEGAL_ENTITIES);
    setStoredItem(STORAGE_KEYS.WORKSHOPS, INITIAL_WORKSHOPS);
    setStoredItem(STORAGE_KEYS.DRIVERS, INITIAL_DRIVERS);
    setStoredItem(STORAGE_KEYS.POINTS, INITIAL_POINTS);
    setStoredItem(STORAGE_KEYS.PRODUCTS, INITIAL_PRODUCTS);
    setStoredItem(STORAGE_KEYS.EMPLOYEES, INITIAL_EMPLOYEES);
    setStoredItem(STORAGE_KEYS.SLOTS, INITIAL_SLOTS);
    setStoredItem(STORAGE_KEYS.ORDERS, INITIAL_ORDERS);
    setStoredItem(STORAGE_KEYS.WAYBILLS, INITIAL_WAYBILLS);
    window.location.reload();
  },

  // Calculate all Discrepancy records from waybills
  getDiscrepancies(): DiscrepancyRecord[] {
    const waybills = this.getWaybills();
    const records: DiscrepancyRecord[] = [];

    for (const wb of waybills) {
      for (const item of wb.items) {
        const prodDiff = item.orderedQuantity !== item.dispatchedQuantity;
        const transitDiff =
          item.receivedQuantity !== undefined && item.dispatchedQuantity !== item.receivedQuantity;

        if (prodDiff || transitDiff) {
          let stage: 'production' | 'transit' | 'both' = 'production';
          if (prodDiff && transitDiff) stage = 'both';
          else if (transitDiff) stage = 'transit';

          records.push({
            id: `${wb.id}-${item.productId}`,
            waybillId: wb.id,
            pointId: wb.pointId,
            pointName: wb.pointName,
            date: wb.date,
            slotId: wb.slotId,
            productId: item.productId,
            productName: item.productName,
            sku: item.sku,
            unit: item.unit,
            orderedQuantity: item.orderedQuantity,
            dispatchedQuantity: item.dispatchedQuantity,
            receivedQuantity: item.receivedQuantity !== undefined ? item.receivedQuantity : item.dispatchedQuantity,
            stage,
            productionReason: item.dispatchDiscrepancyReason,
            transitReason: item.receiveDiscrepancyReason,
            transitComment: item.receiveDiscrepancyComment,
            transitPhoto: item.receiveDiscrepancyPhoto,
            resolved: wb.status === 'received' || wb.status === 'received_with_discrepancies',
          });
        }
      }
    }

    return records;
  },
};
