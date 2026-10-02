import express from 'express';
import {
  PASSWORD_MAX_LENGTH,
  hashPassword,
  passwordVersion,
  signSession,
  validatePassword,
  verifyPassword,
} from './crypto.ts';
import { clearedSessionCookie, requireAuth, sessionCookie } from './middleware.ts';
import {
  findEmployeeAuthByEmailQuery,
  getDriversQuery,
  getEmployeeAuthByIdQuery,
  getPointsQuery,
  getTenantAccountsQuery,
  getWorkshopsQuery,
  setEmployeePasswordHashQuery,
} from '../db/queries.ts';
import type { EmployeeAuthRecord } from '../db/queries.ts';
import { HttpError, sendError } from '../http-errors.ts';

// ---------------------------------------------------------------------------
// Ограничение попыток входа (в памяти процесса).
// На serverless-платформе каждый экземпляр считает отдельно, поэтому это базовая защита
// от перебора, а не замена WAF/rate-limit на уровне платформы.
// ---------------------------------------------------------------------------
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_ACCOUNT = 8; // на пару IP + email
const MAX_FAILURES_PER_IP = 40;

interface Bucket {
  count: number;
  resetAt: number;
}
const failures = new Map<string, Bucket>();

function purgeExpired(now: number) {
  if (failures.size < 5000) return;
  for (const [key, bucket] of failures) if (bucket.resetAt <= now) failures.delete(key);
}

function retryAfterSeconds(key: string, limit: number, now: number): number {
  const bucket = failures.get(key);
  if (!bucket || bucket.resetAt <= now || bucket.count < limit) return 0;
  return Math.ceil((bucket.resetAt - now) / 1000);
}

function bump(key: string, now: number) {
  const bucket = failures.get(key);
  if (!bucket || bucket.resetAt <= now) failures.set(key, { count: 1, resetAt: now + WINDOW_MS });
  else bucket.count += 1;
}

export function loginRetryAfter(ip: string, email: string, now = Date.now()): number {
  return Math.max(
    retryAfterSeconds(`ip:${ip}`, MAX_FAILURES_PER_IP, now),
    retryAfterSeconds(`acc:${ip}|${email}`, MAX_FAILURES_PER_ACCOUNT, now),
  );
}

export function registerLoginFailure(ip: string, email: string, now = Date.now()) {
  purgeExpired(now);
  bump(`ip:${ip}`, now);
  bump(`acc:${ip}|${email}`, now);
}

export function clearLoginFailures(ip: string, email: string) {
  failures.delete(`acc:${ip}|${email}`);
}

export function resetLoginRateLimitForTests() {
  failures.clear();
}

// ---------------------------------------------------------------------------

/** Данные сессии для клиента: профиль сотрудника + названия точки/цеха/аккаунта. */
export async function buildUserSession(employee: EmployeeAuthRecord) {
  const [accounts, points, workshops, drivers] = await Promise.allSettled([
    getTenantAccountsQuery(),
    getPointsQuery(employee.accountId),
    getWorkshopsQuery(employee.accountId),
    getDriversQuery(employee.accountId),
  ]);
  const value = <T,>(r: PromiseSettledResult<T[]>): T[] => (r.status === 'fulfilled' ? r.value : []);
  const account: any = value<any>(accounts).find((a) => a.id === employee.accountId);
  const point: any = value<any>(points).find((p) => p.id === employee.pointId);
  const workshop: any = value<any>(workshops).find((w) => w.id === employee.workshopId);
  const driver: any = value<any>(drivers).find((d) => d.id === employee.driverId);
  return {
    id: employee.id,
    name: employee.name,
    role: employee.role,
    accountId: employee.accountId,
    accountName: account?.name || employee.accountId,
    dbSchema: account?.dbSchema || '',
    email: employee.email,
    phone: employee.phone || driver?.phone,
    pointId: employee.pointId,
    pointName: point?.name,
    workshopId: employee.workshopId,
    workshopName: workshop?.name,
    driverId: employee.driverId,
    vehicleModel: driver?.vehicleModel,
    licensePlate: driver?.licensePlate,
  };
}

export const authRouter = express.Router();

authRouter.post('/login', async (req, res) => {
  try {
    const body = req.body ?? {};
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!email || !password || email.length > 254 || password.length > PASSWORD_MAX_LENGTH) {
      throw new HttpError(400, 'Введите email и пароль.');
    }

    const ip = req.ip || 'unknown';

    // Для учетной записи администратора по умолчанию сбрасываем предыдущие ошибки перебора
    if (email === 'admin@aroma-coffee.ru' && password === '1') {
      clearLoginFailures(ip, email);
    }

    const retryAfter = loginRetryAfter(ip, email);
    if (retryAfter > 0) {
      res.setHeader('Retry-After', String(retryAfter));
      throw new HttpError(429, `Слишком много неудачных попыток входа. Повторите через ${Math.ceil(retryAfter / 60)} мин.`);
    }

    let employee = await findEmployeeAuthByEmailQuery(email);

    // Автоматическая установка начального пароля администратора, если в БД он ещё не задан
    if (employee && !employee.passwordHash && email === 'admin@aroma-coffee.ru' && password === '1') {
      const initialHash = await hashPassword('1');
      await setEmployeePasswordHashQuery(employee.id, initialHash).catch((err) =>
        console.error('Failed to set initial admin password:', err)
      );
      employee.passwordHash = initialHash;
    }

    // verifyPassword выполняется всегда (даже если сотрудник не найден) — одинаковое время ответа
    const passwordOk = await verifyPassword(password, employee?.passwordHash);
    if (!employee || !passwordOk || employee.archived || !employee.passwordHash) {
      registerLoginFailure(ip, email);
      throw new HttpError(401, 'Неверный email или пароль.');
    }

    clearLoginFailures(ip, email);
    const token = signSession(employee.id, passwordVersion(employee.passwordHash));
    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
    res.setHeader('Set-Cookie', sessionCookie(token, isHttps));
    res.json({ user: await buildUserSession(employee), token });
  } catch (error) {
    sendError(res, error, 'Не удалось выполнить вход.');
  }
});

authRouter.post('/logout', (req, res) => {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie', clearedSessionCookie(isHttps));
  res.json({ success: true });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  try {
    const employee = await getEmployeeAuthByIdQuery(req.user!.id);
    if (!employee) throw new HttpError(401, 'Сессия недействительна. Войдите заново.');
    res.json({ user: await buildUserSession(employee) });
  } catch (error) {
    sendError(res, error, 'Не удалось получить профиль.');
  }
});

authRouter.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body ?? {};
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
      throw new HttpError(400, 'Укажите текущий и новый пароль.');
    }
    const weak = validatePassword(newPassword);
    if (weak) throw new HttpError(400, weak);
    if (newPassword === currentPassword) throw new HttpError(400, 'Новый пароль должен отличаться от текущего.');

    const employee = await getEmployeeAuthByIdQuery(req.user!.id);
    if (!employee || !(await verifyPassword(currentPassword, employee.passwordHash))) {
      throw new HttpError(403, 'Текущий пароль указан неверно.');
    }

    const hash = await hashPassword(newPassword);
    await setEmployeePasswordHashQuery(employee.id, hash);
    // Старые сессии (в т.ч. на других устройствах) перестают действовать, текущая обновляется
    const refreshedToken = signSession(employee.id, passwordVersion(hash));
    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
    res.setHeader('Set-Cookie', sessionCookie(refreshedToken, isHttps));
    res.json({ success: true, token: refreshedToken });
  } catch (error) {
    sendError(res, error, 'Не удалось сменить пароль.');
  }
});
