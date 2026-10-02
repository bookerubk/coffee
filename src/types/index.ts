export type UserRole = 'shift_supervisor' | 'production_operator' | 'admin' | 'driver';

export type SlotId = 'morning' | 'evening';

export type WaybillStatus = 
  | 'formed'                      // Сформирована
  | 'packing'                     // Собирается
  | 'dispatched'                  // Отгружена (в пути)
  | 'received'                    // Принята
  | 'received_with_discrepancies';// Принята с расхождениями

export type DiscrepancyReasonTransit = 
  | 'not_delivered' // Не довезли
  | 'damaged'       // Повреждено
  | 'spoiled'       // Порча
  | 'shortage'      // Недостача
  | 'other';        // Другое

export interface TenantAccount {
  id: string; // e.g. "acc-aroma", "acc-nordic"
  name: string; // e.g. "ООО «Арома Холдинг»"
  dbSchema: string; // e.g. "db_aroma_prod"
  inn: string;
  adminEmail: string;
  adminName: string;
  description: string;
  createdAt?: string;
}

export interface UserSession {
  id: string;
  name: string;
  role: UserRole;
  accountId: string;
  accountName: string;
  dbSchema: string;
  pointId?: string; // For shift_supervisor: restricted strictly to this cafe
  pointName?: string;
  workshopId?: string; // For production_operator: restricted strictly to this workshop
  workshopName?: string;
  driverId?: string; // For driver: restricted strictly to this driver's orders
  vehicleModel?: string;
  licensePlate?: string;
  phone?: string;
  email?: string;
}

export interface LegalEntity {
  id: string;
  accountId?: string;
  name: string;
  shortName: string;
  inn: string;
  kpp: string;
  ogrn: string;
  legalAddress: string;
  actualAddress: string;
  bankName: string;
  bik: string;
  checkingAccount: string;
  correspondentAccount: string;
  directorName: string;
  phone: string;
  email: string;
  taxSystem: string;
  source: 'manual' | 'external';
  external_id: string;
  archived: boolean;
  createdAt?: string;
}

export interface Workshop {
  id: string;
  accountId?: string;
  name: string;
  legalEntityId: string;
  address: string;
  chiefName: string;
  phone: string;
  capacity?: string;
  source: 'manual' | 'external';
  external_id: string;
  archived: boolean;
  createdAt?: string;
}

export interface Driver {
  id: string;
  accountId?: string;
  name: string;
  phone: string;
  legalEntityId: string;
  assignedWorkshopId: string;
  vehicleModel: string;
  licensePlate: string;
  hasRefrigerator: boolean;
  status: 'active' | 'on_route' | 'day_off';
  archived: boolean;
  createdAt?: string;
}

export interface CoffeePoint {
  id: string;
  accountId?: string;
  name: string;
  address: string;
  legalEntityId?: string;
  assignedWorkshopId?: string;
  assignedEmployeeIds: string[];
  source: 'manual' | 'external';
  external_id: string;
  archived: boolean;
}

export interface ProductItem {
  id: string;
  accountId?: string;
  sku: string;
  name: string;
  unit: string; // шт, кг, л, уп
  category: string;
  source: 'manual' | 'external';
  external_id: string;
  archived: boolean;
}

export interface Employee {
  id: string;
  accountId?: string;
  name: string;
  role: UserRole;
  pointId?: string;
  workshopId?: string;
  driverId?: string;
  phone?: string;
  email?: string;
  /** Задан ли пароль для входа (сам пароль и его хэш клиенту не передаются). */
  hasPassword?: boolean;
  archived: boolean;
}

export interface SlotConfig {
  id: SlotId;
  accountId?: string;
  name: string;
  deadlineTime: string; // e.g. "07:30"
  deliveryTime: string; // e.g. "09:00"
  description: string;
  isActive: boolean;
}

export interface OrderItem {
  productId: string;
  sku: string;
  name: string;
  unit: string;
  category: string;
  quantity: number;
}

export interface ShiftOrder {
  id: string;
  accountId?: string;
  idempotencyKey: string;
  pointId: string;
  pointName: string;
  slotId: SlotId;
  date: string; // YYYY-MM-DD
  status: 'draft' | 'submitted' | 'aggregated';
  items: OrderItem[];
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  createdBy: string;
}

export interface WaybillItem {
  productId: string;
  sku: string;
  productName: string;
  unit: string;
  category: string;
  orderedQuantity: number;
  dispatchedQuantity: number;
  dispatchDiscrepancyReason?: string;
  receivedQuantity?: number;
  receiveDiscrepancyReason?: DiscrepancyReasonTransit;
  receiveDiscrepancyComment?: string;
  receiveDiscrepancyPhoto?: string;
}

export interface Waybill {
  id: string;
  accountId?: string;
  orderId: string;
  pointId: string;
  pointName: string;
  date: string;
  slotId: SlotId;
  status: WaybillStatus;
  items: WaybillItem[];
  createdAt: string;
  dispatchedAt?: string;
  dispatchedBy?: string;
  receivedAt?: string;
  receivedBy?: string;
  driverName?: string;
  driverId?: string;
  workshopId?: string;
  legalEntityId?: string;
}

export interface DiscrepancyRecord {
  id: string;
  waybillId: string;
  pointId: string;
  pointName: string;
  date: string;
  slotId: SlotId;
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  orderedQuantity: number;
  dispatchedQuantity: number;
  receivedQuantity: number;
  stage: 'production' | 'transit' | 'both';
  productionReason?: string;
  transitReason?: DiscrepancyReasonTransit;
  transitComment?: string;
  transitPhoto?: string;
  resolved: boolean;
}

export type SaveState = 'IDLE' | 'SAVING' | 'SUCCESS' | 'ERROR';
