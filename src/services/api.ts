import {
  ShiftOrder,
  Waybill,
  WaybillStatus,
  SlotId,
  OrderItem,
  CoffeePoint,
  ProductItem,
  Employee,
  SlotConfig,
  LegalEntity,
  Workshop,
  Driver,
  TenantAccount,
} from '../types';
import { StorageManager } from './storage';

export interface SubmitOrderPayload {
  idempotencyKey: string;
  orderId?: string;
  pointId: string;
  pointName: string;
  slotId: SlotId;
  date: string;
  items: OrderItem[];
  createdBy: string;
  isDraft?: boolean;
  accountId?: string;
}

export class ApiError extends Error {
  isTimeout: boolean;
  constructor(message: string, isTimeout = false) {
    super(message);
    this.name = 'ApiError';
    this.isTimeout = isTimeout;
  }
}

/**
 * Returns common headers with active tenant account isolation
 */
function getApiHeaders(extra?: Record<string, string>): Record<string, string> {
  const accountId = StorageManager.getActiveAccountId();
  return {
    'Content-Type': 'application/json',
    'x-account-id': accountId,
    ...(extra || {}),
  };
}

/**
 * Server time sync state
 */
let serverClockOffsetMs = 0;
let lastServerSyncTimestamp = 0;
let activeOperationalTimezone = 'Europe/Moscow';
let activeTimezoneLabel = 'МСК (UTC+3)';

export interface ServerTimeInfo {
  serverDate: Date;
  timeFormatted: string;
  dateFormatted: string;
  timezone: string;
  timezoneLabel: string;
}

/**
 * Sync server clock offset
 */
export async function syncServerTime(tz = 'Europe/Moscow'): Promise<ServerTimeInfo> {
  try {
    const start = Date.now();
    const res = await fetch(`/api/time?tz=${encodeURIComponent(tz)}`);
    if (res.ok) {
      const data = await res.json();
      const roundTrip = Date.now() - start;
      // Estimate server clock difference
      serverClockOffsetMs = (data.timestamp + Math.round(roundTrip / 2)) - Date.now();
      lastServerSyncTimestamp = Date.now();
      activeOperationalTimezone = data.timezone || tz;
      activeTimezoneLabel = data.timezoneLabel || 'МСК (UTC+3)';
      return {
        serverDate: new Date(Date.now() + serverClockOffsetMs),
        timeFormatted: data.timeFormatted,
        dateFormatted: data.dateFormatted,
        timezone: activeOperationalTimezone,
        timezoneLabel: activeTimezoneLabel,
      };
    }
  } catch (e) {
    console.warn('Could not sync server time:', e);
  }

  const now = new Date(Date.now() + serverClockOffsetMs);
  return {
    serverDate: now,
    timeFormatted: now.toLocaleTimeString('ru-RU', { timeZone: tz }),
    dateFormatted: now.toISOString().substring(0, 10),
    timezone: tz,
    timezoneLabel: activeTimezoneLabel,
  };
}

// Initial sync triggered once on module load
if (typeof window !== 'undefined') {
  syncServerTime().catch(() => {});
}

/**
 * Returns current server time as a Date object
 */
export function getServerNow(): Date {
  return new Date(Date.now() + serverClockOffsetMs);
}

/**
 * Returns current time parts in the operational timezone (MSK / Europe/Moscow)
 */
export function getOperationalTimeParts(tz = activeOperationalTimezone) {
  const now = getServerNow();
  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const getPart = (type: string) => Number(parts.find((p) => p.type === type)?.value || '0');

    const hours = getPart('hour');
    const minutes = getPart('minute');
    const seconds = getPart('second');
    const year = getPart('year');
    const month = getPart('month');
    const day = getPart('day');

    return {
      hours,
      minutes,
      seconds,
      totalMinutes: hours * 60 + minutes,
      dateString: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      timeFormatted: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
    };
  } catch {
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    return {
      hours,
      minutes,
      seconds,
      totalMinutes: hours * 60 + minutes,
      dateString: now.toISOString().substring(0, 10),
      timeFormatted: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
    };
  }
}

/**
 * Rich details about a slot deadline in the operational timezone
 */
export interface SlotDeadlineDetails {
  isPassed: boolean;
  isSimulated: boolean;
  slot: SlotConfig | undefined;
  deadlineTime: string;
  deliveryTime: string;
  serverTimeFormatted: string;
  serverDateFormatted: string;
  timezoneLabel: string;
  remainingMinutes: number;
  remainingText: string;
}

export function getSlotDeadlineDetails(slotId: SlotId, customSlots?: SlotConfig[]): SlotDeadlineDetails {
  const slots = customSlots || StorageManager.getSlots();
  const slot = slots.find((s) => s.id === slotId) || slots[0];
  const isSimulated = StorageManager.getForceDeadlinePassed();

  const opTime = getOperationalTimeParts(activeOperationalTimezone);
  const deadlineTime = slot?.deadlineTime || (slotId === 'morning' ? '07:30' : '16:30');
  const deliveryTime = slot?.deliveryTime || (slotId === 'morning' ? '09:00' : '18:30');

  const [dHours, dMinutes] = deadlineTime.split(':').map(Number);
  const deadlineTotalMinutes = dHours * 60 + dMinutes;
  const nowTotalMinutes = opTime.totalMinutes;

  let isPassed = false;
  let remainingMinutes = 0;

  if (isSimulated) {
    isPassed = true;
    remainingMinutes = 0;
  } else if (!slot || !slot.isActive) {
    isPassed = true;
    remainingMinutes = 0;
  } else if (slotId === 'morning') {
    // Morning slot (typically 07:30 deadline)
    if (opTime.hours < 12) {
      if (nowTotalMinutes > deadlineTotalMinutes) {
        isPassed = true;
        remainingMinutes = 0;
      } else {
        isPassed = false;
        remainingMinutes = deadlineTotalMinutes - nowTotalMinutes;
      }
    } else {
      // Afternoon / evening: today's morning delivery has already taken place
      isPassed = true;
      remainingMinutes = 0;
    }
  } else {
    // Evening slot
    const isPastMidnightDeadline = dHours < 6; // e.g. 00:30, 01:00, 01:30

    if (isPastMidnightDeadline) {
      // Case 1: Deadline is after midnight (e.g. 00:30 at night)
      if (opTime.hours >= 12) {
        // Afternoon or evening (12:00 - 23:59): Deadline is tonight after midnight
        isPassed = false;
        // Remaining = minutes until 24:00 + minutes past midnight
        remainingMinutes = (24 * 60 - nowTotalMinutes) + deadlineTotalMinutes;
      } else if (opTime.hours < 6) {
        // Already past midnight (00:00 - 05:59)
        if (nowTotalMinutes > deadlineTotalMinutes) {
          isPassed = true;
          remainingMinutes = 0;
        } else {
          isPassed = false;
          remainingMinutes = deadlineTotalMinutes - nowTotalMinutes;
        }
      } else {
        // Daytime morning (06:00 - 11:59): previous night's shift ended
        isPassed = true;
        remainingMinutes = 0;
      }
    } else {
      // Case 2: Deadline is standard evening hour before midnight (e.g. 16:30, 20:00, 23:30)
      if (opTime.hours < 6) {
        isPassed = true;
        remainingMinutes = 0;
      } else {
        if (nowTotalMinutes > deadlineTotalMinutes) {
          isPassed = true;
          remainingMinutes = 0;
        } else {
          isPassed = false;
          remainingMinutes = deadlineTotalMinutes - nowTotalMinutes;
        }
      }
    }
  }

  let remainingText = '';
  if (remainingMinutes > 60) {
    const hrs = Math.floor(remainingMinutes / 60);
    const mins = remainingMinutes % 60;
    remainingText = `${hrs} ч. ${mins > 0 ? `${mins} мин.` : ''}`.trim();
  } else if (remainingMinutes > 0) {
    remainingText = `${remainingMinutes} мин.`;
  } else {
    remainingText = 'дедлайн истёк';
  }

  return {
    isPassed,
    isSimulated,
    slot,
    deadlineTime,
    deliveryTime,
    serverTimeFormatted: opTime.timeFormatted,
    serverDateFormatted: opTime.dateString,
    timezoneLabel: activeTimezoneLabel,
    remainingMinutes,
    remainingText,
  };
}

/**
 * Checks if current time is past the slot deadline
 */
export function isSlotDeadlinePassed(slotId: SlotId, forceOverride?: boolean, customSlots?: SlotConfig[]): boolean {
  if (forceOverride !== undefined) return forceOverride;
  if (StorageManager.getForceDeadlinePassed()) return true;

  const info = getSlotDeadlineDetails(slotId, customSlots);
  return info.isPassed;
}

// In-flight deduplication and short caching for getHandbooks to prevent request storms
let handbooksInFlight: Promise<any> | null = null;
let lastHandbooksFetchTime = 0;
let lastHandbooksData: any = null;

/**
 * Full-Stack API Service communicating with YDB backend (with multi-tenant isolation)
 */
export const ApiService = {
  /**
   * Fetch Tenant Accounts (multi-tenant databases)
   */
  async getTenantAccounts(): Promise<TenantAccount[]> {
    try {
      const res = await fetch('/api/accounts', { headers: getApiHeaders() });
      if (res.ok) {
        const list: TenantAccount[] = await res.json();
        list.forEach((a) => StorageManager.saveTenantAccount(a));
        return list;
      }
    } catch (e) {
      console.warn('Falling back to local tenant accounts:', e);
    }
    return StorageManager.getTenantAccounts();
  },

  /**
   * Register a new Tenant Account (Isolated Database)
   */
  async createTenantAccount(account: TenantAccount): Promise<TenantAccount> {
    const res = await fetch('/api/accounts', {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify(account),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ApiError(err.error || 'Ошибка создания аккаунта компании в YDB');
    }
    StorageManager.saveTenantAccount(account);
    return account;
  },

  /**
   * Submit or save shift order to YDB with idempotency and timeout protection
   */
  async submitOrder(
    payload: SubmitOrderPayload,
    abortSignal?: AbortSignal
  ): Promise<{ success: boolean; order: ShiftOrder; isDuplicate?: boolean }> {
    // 1. Simulation controls from Dev toolbar
    const shouldFail = StorageManager.getSimulateError();
    const shouldTimeout = StorageManager.getSimulateTimeout();

    // 2. Client-side integer validation
    for (const it of payload.items) {
      if (!Number.isInteger(it.quantity) || it.quantity < 0) {
        throw new ApiError(`Количество товара "${it.name}" должно быть целым неотрицательным числом.`);
      }
    }

    // 3. Validate deadline
    if (!payload.isDraft && isSlotDeadlinePassed(payload.slotId)) {
      throw new ApiError('Дедлайн подачи заявок для данного слота уже наступил. Приём закрыт.');
    }

    // If simulate timeout is active, sleep longer than abortSignal to trigger timeout
    if (shouldTimeout) {
      await new Promise<void>((_, reject) => {
        const timer = setTimeout(() => {
          reject(new ApiError('Таймаут запроса к YDB (превышено 12 сек). Проверьте соединение.', true));
        }, 13000);
        abortSignal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new ApiError('Таймаут запроса к серверу (превышено 12 сек).', true));
        });
      });
    }

    if (shouldFail) {
      await new Promise((r) => setTimeout(r, 600));
      throw new ApiError('Сетевая ошибка: сервер недоступен (503 Service Unavailable). Проверьте связь с сетью.');
    }

    try {
      const accountId = StorageManager.getActiveAccountId();
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify({ ...payload, accountId }),
        signal: abortSignal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new ApiError(errorData.error || `Ошибка сервера (${response.status})`);
      }

      const data = await response.json();
      const order = data.order;

      // Synchronize cache
      StorageManager.saveOrder(order);
      StorageManager.recordIdempotencyKey(payload.idempotencyKey, order.id);

      if (!payload.isDraft) {
        StorageManager.clearDraft(payload.pointId, payload.slotId);
        StorageManager.clearLocalBackup(payload.pointId, payload.slotId);
      }

      return { success: true, order, isDuplicate: data.isDuplicate };
    } catch (err: any) {
      if (err.name === 'AbortError' || err.isTimeout) {
        throw new ApiError('Таймаут запроса к YDB (превышено 12 сек).', true);
      }
      throw err;
    }
  },

  /**
   * Fetch all orders from YDB (scoped to active account)
   */
  async getOrders(): Promise<ShiftOrder[]> {
    try {
      const res = await fetch('/api/orders', { headers: getApiHeaders() });
      if (res.ok) {
        const orders: ShiftOrder[] = await res.json();
        // Update local mirror
        orders.forEach((o) => StorageManager.saveOrder(o));
        return orders;
      }
    } catch (e) {
      console.warn('Using local cache for orders:', e);
    }
    return StorageManager.getOrders();
  },

  /**
   * Fetch previous order for repetition
   */
  async getPreviousOrder(pointId: string): Promise<ShiftOrder | null> {
    try {
      const res = await fetch(`/api/orders/previous/${pointId}`, { headers: getApiHeaders() });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn('Falling back to local cache for previous order:', e);
    }
    const orders = StorageManager.getOrders();
    const pointOrders = orders
      .filter((o) => o.pointId === pointId && o.status !== 'draft')
      .sort((a, b) => new Date(b.submittedAt || b.createdAt).getTime() - new Date(a.submittedAt || a.createdAt).getTime());
    return pointOrders[0] || null;
  },

  /**
   * Generate waybills in YDB
   */
  async generateWaybillsForSlot(date: string, slotId: SlotId): Promise<Waybill[]> {
    const res = await fetch('/api/waybills/generate', {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify({ date, slotId, accountId: StorageManager.getActiveAccountId() }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ApiError(err.error || 'Ошибка формирования накладных в YDB');
    }

    const waybills: Waybill[] = await res.json();
    waybills.forEach((wb) => StorageManager.saveWaybill(wb));
    return waybills;
  },

  /**
   * Update dispatch in YDB
   */
  async updateWaybillDispatch(
    waybillId: string,
    items: {
      productId: string;
      dispatchedQuantity: number;
      dispatchDiscrepancyReason?: string;
    }[],
    newStatus: WaybillStatus,
    operatorName: string,
    driverName?: string,
    driverId?: string,
    workshopId?: string,
    legalEntityId?: string
  ): Promise<Waybill> {
    const res = await fetch(`/api/waybills/${waybillId}/dispatch`, {
      method: 'PUT',
      headers: getApiHeaders(),
      body: JSON.stringify({
        items,
        newStatus,
        operatorName,
        driverName,
        driverId,
        workshopId,
        legalEntityId,
        accountId: StorageManager.getActiveAccountId(),
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ApiError(err.error || 'Ошибка сохранения отгрузки в YDB');
    }

    const waybill: Waybill = await res.json();
    StorageManager.saveWaybill(waybill);
    return waybill;
  },

  /**
   * Update Waybill status by Driver (e.g. accepted on route, delivered)
   */
  async updateDriverWaybillStatus(
    waybillId: string,
    status: WaybillStatus,
    driverName?: string,
    driverId?: string
  ): Promise<Waybill> {
    const res = await fetch(`/api/waybills/${waybillId}/driver-status`, {
      method: 'PUT',
      headers: getApiHeaders(),
      body: JSON.stringify({
        status,
        driverName,
        driverId,
        accountId: StorageManager.getActiveAccountId(),
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ApiError(err.error || 'Ошибка обновления статуса рейса водителем');
    }

    const waybill: Waybill = await res.json();
    StorageManager.saveWaybill(waybill);
    return waybill;
  },

  /**
   * Receive waybill and save in YDB
   */
  async receiveWaybill(
    waybillId: string,
    items: {
      productId: string;
      receivedQuantity: number;
      receiveDiscrepancyReason?: any;
      receiveDiscrepancyComment?: string;
      receiveDiscrepancyPhoto?: string;
    }[],
    supervisorName: string
  ): Promise<Waybill> {
    const res = await fetch(`/api/waybills/${waybillId}/receive`, {
      method: 'PUT',
      headers: getApiHeaders(),
      body: JSON.stringify({
        items,
        supervisorName,
        accountId: StorageManager.getActiveAccountId(),
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ApiError(err.error || 'Ошибка приёмки поставки в YDB');
    }

    const waybill: Waybill = await res.json();
    StorageManager.saveWaybill(waybill);
    return waybill;
  },

  /**
   * Sync and fetch all handbooks from YDB (scoped to active account)
   */
  async getHandbooks() {
    const now = Date.now();
    // Return cached handbooks if fetched within 3 seconds to avoid burst storms
    if (lastHandbooksData && now - lastHandbooksFetchTime < 3000) {
      return lastHandbooksData;
    }

    // Deduplicate in-flight requests
    if (handbooksInFlight) {
      return handbooksInFlight;
    }

    handbooksInFlight = (async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);
        const res = await fetch('/api/handbooks', {
          headers: getApiHeaders(),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          // Sync local storage in bulk without triggering event loops
          StorageManager.syncHandbooks(data);
          lastHandbooksFetchTime = Date.now();
          lastHandbooksData = data;
          return data;
        }
      } catch (e: any) {
        if (e.name !== 'AbortError') {
          console.warn('Falling back to local handbooks:', e?.message || e);
        }
      } finally {
        handbooksInFlight = null;
      }

      return {
        points: StorageManager.getPoints(),
        products: StorageManager.getProducts(),
        employees: StorageManager.getEmployees(),
        slots: StorageManager.getSlots(),
        legalEntities: StorageManager.getLegalEntities(),
        workshops: StorageManager.getWorkshops(),
        drivers: StorageManager.getDrivers(),
        accounts: StorageManager.getTenantAccounts(),
      };
    })();

    return handbooksInFlight;
  },

  /**
   * Save Legal Entity to YDB
   */
  async saveLegalEntity(entity: LegalEntity) {
    try {
      const accountId = StorageManager.getActiveAccountId();
      await fetch('/api/legal-entities', {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify({ ...entity, accountId }),
      });
    } catch (e) {
      console.error(e);
    }
    StorageManager.saveLegalEntity(entity);
  },

  /**
   * Save Workshop to YDB
   */
  async saveWorkshop(workshop: Workshop) {
    try {
      const accountId = StorageManager.getActiveAccountId();
      await fetch('/api/workshops', {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify({ ...workshop, accountId }),
      });
    } catch (e) {
      console.error(e);
    }
    StorageManager.saveWorkshop(workshop);
  },

  /**
   * Save Driver to YDB
   */
  async saveDriver(driver: Driver) {
    try {
      const accountId = StorageManager.getActiveAccountId();
      await fetch('/api/drivers', {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify({ ...driver, accountId }),
      });
    } catch (e) {
      console.error(e);
    }
    StorageManager.saveDriver(driver);
  },

  /**
   * Save Point to YDB
   */
  async savePoint(point: CoffeePoint) {
    try {
      const accountId = StorageManager.getActiveAccountId();
      await fetch('/api/points', {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify({ ...point, accountId }),
      });
    } catch (e) {
      console.error(e);
    }
    StorageManager.savePoint(point);
  },

  /**
   * Save Product to YDB
   */
  async saveProduct(prod: ProductItem) {
    try {
      const accountId = StorageManager.getActiveAccountId();
      await fetch('/api/products', {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify({ ...prod, accountId }),
      });
    } catch (e) {
      console.error(e);
    }
    StorageManager.saveProduct(prod);
  },

  /**
   * Save Employee to YDB
   */
  async saveEmployee(emp: Employee) {
    try {
      const accountId = StorageManager.getActiveAccountId();
      await fetch('/api/employees', {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify({ ...emp, accountId }),
      });
    } catch (e) {
      console.error(e);
    }
    StorageManager.saveEmployee(emp);
  },

  /**
   * Save Slot to YDB
   */
  async saveSlot(slot: SlotConfig) {
    try {
      const accountId = StorageManager.getActiveAccountId();
      await fetch('/api/slots', {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify({ ...slot, accountId }),
      });
    } catch (e) {
      console.error(e);
    }
    StorageManager.saveSlot(slot);
  },

  /**
   * Sync all waybills from YDB (scoped to active account)
   */
  async getWaybills(): Promise<Waybill[]> {
    try {
      const res = await fetch('/api/waybills', { headers: getApiHeaders() });
      if (res.ok) {
        const waybills: Waybill[] = await res.json();
        waybills.forEach((w) => StorageManager.saveWaybill(w));
        return waybills;
      }
    } catch (e) {
      console.warn('Falling back to local waybills:', e);
    }
    return StorageManager.getWaybills();
  },
};
