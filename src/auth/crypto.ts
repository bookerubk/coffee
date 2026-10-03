/**
 * Криптография аутентификации: хэширование паролей (scrypt) и подписанные токены сессии
 * (HMAC-SHA256). Только встроенный node:crypto, без внешних зависимостей.
 */
import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const SESSION_COOKIE = 'coffee_session';
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

const KEY_LENGTH = 64;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

function scryptAsync(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize('NFKC'),
      salt,
      KEY_LENGTH,
      { N: n, r, p, maxmem: 128 * n * r * 2 },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}

/** Возвращает текст ошибки или null, если пароль допустим. */
export function validatePassword(password: unknown): string | null {
  if (typeof password !== 'string') return 'Пароль должен быть строкой.';
  if (password.length < PASSWORD_MIN_LENGTH) return `Пароль должен содержать не менее ${PASSWORD_MIN_LENGTH} символов.`;
  if (password.length > PASSWORD_MAX_LENGTH) return `Пароль должен содержать не более ${PASSWORD_MAX_LENGTH} символов.`;
  if (password.trim().length === 0) return 'Пароль не может состоять только из пробелов.';
  return null;
}

/** Формат: scrypt$N$r$p$соль(base64)$хэш(base64) — параметры хранятся вместе с хэшем. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P);
  return ['scrypt', SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString('base64'), hash.toString('base64')].join('$');
}

let dummyHash: Promise<string> | null = null;

/**
 * Проверка пароля за постоянное время. Если хэша нет (пользователь не найден или пароль
 * ещё не задан), всё равно выполняется вычисление scrypt — чтобы по времени ответа нельзя
 * было узнать, существует ли такой email.
 */
export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  const parts = typeof stored === 'string' ? stored.split('$') : [];
  const valid = parts.length === 6 && parts[0] === 'scrypt';
  if (!valid) {
    dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
    const dummy = (await dummyHash).split('$');
    await scryptAsync(password, Buffer.from(dummy[4], 'base64'), SCRYPT_N, SCRYPT_R, SCRYPT_P);
    return false;
  }
  const [, n, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scryptAsync(password, Buffer.from(saltB64, 'base64'), Number(n), Number(r), Number(p));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** «Версия пароля»: при смене пароля меняется и аннулирует все ранее выданные сессии. */
export function passwordVersion(passwordHash: string): string {
  return createHash('sha256').update(passwordHash).digest('hex').slice(0, 16);
}

let devSecret: string | null = null;

export function getAuthSecret(): string {
  const configured = process.env.AUTH_SECRET;
  if (configured) {
    if (configured.length < 32) throw new Error('AUTH_SECRET должен содержать не менее 32 символов.');
    return configured;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Не задана переменная окружения AUTH_SECRET (нужна для подписи сессий).');
  }
  if (!devSecret) {
    devSecret = randomBytes(32).toString('hex');
    console.warn('[auth] AUTH_SECRET не задан: используется временный ключ, сессии сбрасятся при перезапуске сервера.');
  }
  return devSecret;
}

export interface SessionPayload {
  sub: string; // id сотрудника
  pv: string; // версия пароля
  iat: number;
  exp: number;
}

const hmac = (body: string) => createHmac('sha256', getAuthSecret()).update(body).digest();

export function signSession(employeeId: string, pv: string, nowMs: number = Date.now()): string {
  const iat = Math.floor(nowMs / 1000);
  const payload: SessionPayload = { sub: employeeId, pv, iat, exp: iat + SESSION_TTL_SECONDS };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${hmac(body).toString('base64url')}`;
}

export function verifySession(token: unknown, nowMs: number = Date.now()): SessionPayload | null {
  if (typeof token !== 'string' || token.length === 0 || token.length > 2048) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [body, signature] = parts;
  const expected = hmac(body);
  const given = Buffer.from(signature, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (
      typeof payload?.sub !== 'string' ||
      typeof payload?.pv !== 'string' ||
      typeof payload?.exp !== 'number' ||
      payload.exp <= Math.floor(nowMs / 1000)
    ) {
      return null;
    }
    return payload as SessionPayload;
  } catch {
    return null;
  }
}
