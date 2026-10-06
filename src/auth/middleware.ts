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

/** HTTPS напрямую или через reverse-proxy (nginx, Vercel, Cloud Run выставляют X-Forwarded-Proto). */
export function isHttps(req: Request): boolean {
  return req.secure || req.headers['x-forwarded-proto'] === 'https';
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

/**
 * Режим «встроенного предпросмотра» (iframe в AI Studio и т.п.) — только для разработки.
 * Требует ALLOW_EMBEDDED_PREVIEW=true и ИГНОРИРУЕТСЯ при NODE_ENV=production: в боевой среде cookie
 * всегда SameSite=Lax, а встраивание сайта в чужие страницы запрещено.
 */
export function embeddedPreviewEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ALLOW_EMBEDDED_PREVIEW === 'true' && env.NODE_ENV !== 'production';
}

function cookieAttributes(secure: boolean): string {
  // Для iframe нужен SameSite=None; Secure; Partitioned (CHIPS: cookie изолирована по сайту-родителю).
  if (embeddedPreviewEnabled()) return 'SameSite=None; Secure; Partitioned';
  // HttpOnly — токен недоступен JavaScript (защита от кражи через XSS);
  // SameSite=Lax — cookie не отправляется с чужих сайтов при POST/PUT (защита от CSRF).
  return `SameSite=Lax${secure ? '; Secure' : ''}`;
}

export function sessionCookie(token: string, secure: boolean): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; ${cookieAttributes(secure)}; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearedSessionCookie(secure: boolean): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; ${cookieAttributes(secure)}; Max-Age=0`;
}

export const securityHeaders: RequestHandler = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  if (!embeddedPreviewEnabled()) {
    // Запрет встраивания сайта в чужие страницы (защита от кликджекинга)
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
  }
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
};

/** Явный список доверенных источников (точные origin через запятую), например за нестандартным прокси. */
export function trustedOrigins(env: NodeJS.ProcessEnv = process.env): Set<string> {
  return new Set(
    (env.TRUSTED_ORIGINS || '')
      .split(',')
      .map((o) => o.trim().replace(/\/+$/, '').toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Дополнительная защита от CSRF: запросы, изменяющие данные, принимаются, только если заголовок
 * Origin (когда он есть) в точности совпадает с хостом этого сервера или входит в TRUSTED_ORIGINS.
 * Сравнение строгое: никаких масок вроде *.run.app и проверок «содержит localhost» —
 * такие домены может зарегистрировать кто угодно.
 */
export const sameOriginGuard: RequestHandler = (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const origin = req.headers.origin;
  if (!origin) return next();
  const forwardedHost = (req.headers['x-forwarded-host'] as string | undefined)?.split(',')[0]?.trim();
  const host = forwardedHost || req.headers.host;
  try {
    const parsed = new URL(origin);
    if (parsed.host === host || trustedOrigins().has(parsed.origin.toLowerCase())) return next();
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
    let employee: Awaited<ReturnType<typeof getEmployeeAuthByIdQuery>>;
    try {
      employee = await getEmployeeAuthByIdQuery(payload.sub);
    } catch {
      return res.status(503).json({ error: 'База данных недоступна. Попробуйте позже.', code: 'database_unavailable' });
    }
    if (
      !employee ||
      employee.archived ||
      !employee.passwordHash ||
      passwordVersion(employee.passwordHash) !== payload.pv ||
      !ROLES.includes(employee.role as Role)
    ) {
      res.setHeader('Set-Cookie', clearedSessionCookie(isHttps(req)));
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
