/**
 * Правила видимости данных по ролям. Чистые функции без обращения к БД —
 * справочники (точки, водители) передаются параметрами.
 *
 *  - admin: всё в рамках своего аккаунта;
 *  - production_operator: заказы/накладные своего цеха;
 *  - shift_supervisor: только свои кофейни;
 *  - driver: только свои накладные.
 */
import type { AuthUser } from './types.ts';

export interface AccessContext {
  points: any[];
  drivers: any[];
}

/** Кофейни старшего смены: закреплённая за ним + те, где он указан в assignedEmployeeIds. */
export function supervisorPointIds(user: AuthUser, points: any[]): Set<string> {
  const ids = new Set<string>();
  if (user.pointId) ids.add(user.pointId);
  for (const point of points) {
    if (Array.isArray(point.assignedEmployeeIds) && point.assignedEmployeeIds.includes(user.id)) ids.add(point.id);
  }
  return ids;
}

/**
 * Кофейни цеха оператора. null — ограничения нет: у оператора не указан цех или за цехом
 * не закреплено ни одной кофейни (так же ведёт себя интерфейс).
 */
export function operatorPointIds(user: AuthUser, points: any[]): Set<string> | null {
  if (!user.workshopId) return null;
  const ids = new Set<string>(points.filter((p) => p.assignedWorkshopId === user.workshopId).map((p) => p.id));
  return ids.size > 0 ? ids : null;
}

export function resolveDriverId(user: AuthUser, drivers: any[]): string | undefined {
  if (user.driverId) return user.driverId;
  const name = user.name.trim().toLowerCase();
  return drivers.find((d) => String(d.name).trim().toLowerCase() === name)?.id;
}

export function canAccessPoint(user: AuthUser, pointId: string, ctx: AccessContext): boolean {
  switch (user.role) {
    case 'admin':
      return true;
    case 'production_operator': {
      const ids = operatorPointIds(user, ctx.points);
      return !ids || ids.has(pointId);
    }
    case 'shift_supervisor':
      return supervisorPointIds(user, ctx.points).has(pointId);
    default:
      return false;
  }
}

export function canAccessOrder(user: AuthUser, order: { pointId: string }, ctx: AccessContext): boolean {
  if (user.role === 'driver') return false;
  return canAccessPoint(user, order.pointId, ctx);
}

export function canAccessWaybill(
  user: AuthUser,
  waybill: { pointId: string; workshopId?: string; driverId?: string; driverName?: string },
  ctx: AccessContext,
): boolean {
  switch (user.role) {
    case 'admin':
      return true;
    case 'production_operator': {
      if (!user.workshopId) return true;
      if (waybill.workshopId) return waybill.workshopId === user.workshopId;
      const ids = operatorPointIds(user, ctx.points);
      return !ids || ids.has(waybill.pointId);
    }
    case 'shift_supervisor':
      return supervisorPointIds(user, ctx.points).has(waybill.pointId);
    case 'driver': {
      const driverId = resolveDriverId(user, ctx.drivers);
      if (driverId && waybill.driverId === driverId) return true;
      // Накладные без driverId: имя водителя записано как «ФИО (авто госномер)»
      const me = user.name.trim().toLowerCase();
      const assigned = (waybill.driverName || '').trim().toLowerCase();
      return !waybill.driverId && !!assigned && (assigned === me || assigned.startsWith(`${me} (`));
    }
    default:
      return false;
  }
}

/**
 * Нужно ли подтверждение доставки водителем, прежде чем кофейня сможет принять поставку.
 * Нужно, только если у накладной есть водитель, который реально может это подтвердить — то есть
 * существует действующая учётная запись водителя, которой накладная доступна. Если водитель указан
 * просто текстом (без учётной записи) или рейса нет вовсе, ждать подтверждения было бы не от кого,
 * и приёмка не блокируется.
 */
export function requiresDeliveryConfirmation(
  waybill: { pointId: string; workshopId?: string; driverId?: string; driverName?: string },
  employees: { id: string; name: string; role: string; driverId?: string; archived?: boolean }[],
  ctx: AccessContext,
): boolean {
  return employees.some(
    (e) =>
      e.role === 'driver' &&
      !e.archived &&
      canAccessWaybill({ id: e.id, accountId: '', name: e.name, role: 'driver', driverId: e.driverId }, waybill, ctx),
  );
}
