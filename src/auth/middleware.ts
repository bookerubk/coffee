import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { SESSION_COOKIE, SESSION_TTL_SECONDS, passwordVersion, verifySession } from './crypto.ts';
import { getEmployeeAuthByIdQuery } from '../db/queries.ts';
import type { EmployeeAuthRecord } from '../db/queries.ts';
import { ROLES } from './types.ts';
import type { AuthUser, Role } from './types.ts';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!header) return result;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    if (!name) continue;
    try {
      result[name] = decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      /* битое значение cookie игнорируем */
    }
  }
  return result;
}

export function sessionCookie(token: string, secure: boolean): string {
  // HttpOnly — токен недоступен JavaScript (защита от кражи через XSS);
  // SameSite=Lax — cookie не отправляется с чужих сайтов при POST/PUT (защита от CSRF).
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure ? '; Secure' : ''}`;
}

export function clearedSessionCookie(secure: boolean): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}

export const securityHeaders: RequestHandler = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
};

/**
 * Дополнительная защита от CSRF: запросы, изменяющие данные, принимаются, только если
 * заголовок Origin (когда он есть) указывает на этот же хост.
 */
export const sameOriginGuard: RequestHandler = (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const origin = req.headers.origin;
  if (!origin) return next();
  const forwardedHost = (req.headers['x-forwarded-host'] as string | undefined)?.split(',')[0]?.trim();
  const host = forwardedHost || req.headers.host;
  try {
    if (new URL(origin).host === host) return next();
  } catch {
    /* некорректный Origin — отклоняем ниже */
  }
  res.status(403).json({ error: 'Запрос с чужого источника отклонён.', code: 'forbidden' });
};

export function toAuthUser(employee: EmployeeAuthRecord): AuthUser {
  return {
    id: employee.id,
    accountId: employee.accountId,
    name: employee.name,
    role: employee.role as Role,
    email: employee.email,
    pointId: employee.pointId,
    workshopId: employee.workshopId,
    driverId: employee.driverId,
    phone: employee.phone,
  };
}

/**
 * Проверяет сессию и загружает сотрудника из БД. Роль, аккаунт и привязки берутся из БД на
 * каждом запросе, поэтому смена роли, архивация сотрудника или смена пароля действуют сразу.
 */
export const requireAuth: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    const payload = verifySession(token);
    if (!payload) {
      return res.status(401).json({ error: 'Требуется вход в систему.', code: 'unauthorized' });
    }
    const employee = await getEmployeeAuthByIdQuery(payload.sub);
    if (
      !employee ||
      employee.archived ||
      !employee.passwordHash ||
      passwordVersion(employee.passwordHash) !== payload.pv ||
      !ROLES.includes(employee.role as Role)
    ) {
      res.setHeader('Set-Cookie', clearedSessionCookie(req.secure));
      return res.status(401).json({ error: 'Сессия недействительна. Войдите заново.', code: 'unauthorized' });
    }
    req.user = toAuthUser(employee);
    next();
  } catch (error) {
    next(error);
  }
};

export function requireRole(...roles: Role[]): RequestHandler {
  return (req, res, next) => {
    if (req.user && roles.includes(req.user.role)) return next();
    res.status(403).json({ error: 'Недостаточно прав для этого действия.', code: 'forbidden' });
  };
}
