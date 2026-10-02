export type Role = 'shift_supervisor' | 'production_operator' | 'admin' | 'driver';

export const ROLES: readonly Role[] = ['shift_supervisor', 'production_operator', 'admin', 'driver'];

/** Аутентифицированный пользователь. Берётся из БД на каждом запросе, а не из токена. */
export interface AuthUser {
  id: string;
  accountId: string;
  name: string;
  role: Role;
  email?: string;
  pointId?: string;
  workshopId?: string;
  driverId?: string;
  phone?: string;
}
