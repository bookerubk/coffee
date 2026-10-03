/**
 * Регрессионные тесты безопасности: каждый тест воспроизводит дыру, найденную в ревью
 * (захват администратора, пароль «1», обход CSRF, токен в теле ответа, слабые cookie/заголовки).
 */
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { installFakeYdb, resetFakeYdb } from './fakeYdb.ts';

process.env.VERCEL = '1';
process.env.AUTH_SECRET = 'test-secret-test-secret-test-secret-123456';
installFakeYdb();
const { ensureYdbSchema } = await import('../src/db/ydb.ts');
const q = await import('../src/db/queries.ts');
const { hashPassword, validatePassword, SESSION_COOKIE } = await import('../src/auth/crypto.ts');
const { findWeakPasswordEmployees } = await import('../src/auth/audit.ts');
const { resetLoginRateLimitForTests } = await import('../src/auth/routes.ts');
const { app } = await import('../server.ts');

const PASSWORD = 'correct-horse-battery';
let server: Server;
let base = '';
let HASH = '';

before(async () => {
  HASH = await hashPassword(PASSWORD);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

beforeEach(async () => {
  resetFakeYdb();
  resetLoginRateLimitForTests();
  delete process.env.TRUSTED_ORIGINS;
  delete process.env.ALLOW_EMBEDDED_PREVIEW;
  process.env.NODE_ENV = 'test';
  await ensureYdbSchema();
  await q.seedDatabaseIfEmpty(); // демо-данные: admin@aroma-coffee.ru БЕЗ пароля
  await q.upsertEmployeeQuery({ id: 'emp-boss', accountId: 'acc-aroma', name: 'Босс', role: 'admin', email: 'boss@corp.test', archived: false, passwordHash: HASH });
});

const raw = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });

const login = (email: string, password: string) => raw('POST', '/api/auth/login', { email, password });

async function bossCookie(): Promise<string> {
  const res = await login('boss@corp.test', PASSWORD);
  assert.equal(res.status, 200);
  return res.headers.getSetCookie().map((c) => c.split(';')[0]).find((c) => c.startsWith(`${SESSION_COOKIE}=`))!;
}

const newPoint = (id: string) => ({ id, name: 'Точка', address: '', assignedEmployeeIds: [] });

// ---------- захват администратора и слабый пароль ----------

test('демо-администратор без пароля НЕ открывается паролем «1» и пароль ему не назначается', async () => {
  for (const password of ['1', '12345678', 'admin']) {
    const res = await login('admin@aroma-coffee.ru', password);
    assert.equal(res.status, 401);
    assert.equal((await res.json() as any).error, 'Неверный email или пароль.');
    assert.equal(res.headers.getSetCookie().length, 0);
  }
  const admin = await q.findEmployeeAuthByEmailQuery('admin@aroma-coffee.ru');
  assert.ok(admin);
  assert.equal(admin!.passwordHash, undefined); // автоустановки пароля больше нет
});

test('пароль «1» отклоняется: валидатор, создание сотрудника, смена пароля', async () => {
  assert.ok(validatePassword('1'));
  assert.ok(validatePassword('12345'));
  const cookie = await bossCookie();

  const create = await raw('POST', '/api/employees', { id: 'emp-weak', name: 'Слабый', role: 'driver', email: 'weak@corp.test', password: '1' }, { Cookie: cookie });
  assert.equal(create.status, 400);
  assert.equal((await login('weak@corp.test', '1')).status, 401);

  const change = await raw('POST', '/api/auth/change-password', { currentPassword: PASSWORD, newPassword: '1' }, { Cookie: cookie });
  assert.equal(change.status, 400);
  assert.equal((await login('boss@corp.test', PASSWORD)).status, 200); // пароль не изменился
});

test('аудит находит слабые пароли, оставшиеся от прежней версии', async () => {
  await q.upsertEmployeeQuery({ id: 'emp-old-admin', accountId: 'acc-aroma', name: 'Старый админ', role: 'admin', email: 'old@corp.test', archived: false, passwordHash: await hashPassword('1') });
  const findings = await findWeakPasswordEmployees(['1', 'password']);
  assert.deepEqual(findings.map((f) => [f.email, f.password]), [['old@corp.test', '1']]);
  assert.deepEqual(await findWeakPasswordEmployees(['qwerty']), []);
});

// ---------- токен не в JSON и не принимается из заголовка ----------

test('токен сессии не возвращается в теле ответа, только в HttpOnly-cookie', async () => {
  const res = await login('boss@corp.test', PASSWORD);
  const body = await res.json() as any;
  assert.equal(body.token, undefined);
  assert.ok(!JSON.stringify(body).includes('eyJ'));
  const cookie = res.headers.getSetCookie()[0];
  assert.match(cookie, /HttpOnly/);

  const cp = await raw('POST', '/api/auth/change-password', { currentPassword: PASSWORD, newPassword: 'another-good-pass' }, { Cookie: cookie.split(';')[0] });
  assert.equal(cp.status, 200);
  assert.equal(((await cp.json()) as any).token, undefined);
});

test('заголовок Authorization: Bearer не заменяет cookie', async () => {
  const cookie = await bossCookie();
  const token = cookie.split('=')[1];
  assert.equal((await raw('GET', '/api/orders', undefined, { Authorization: `Bearer ${token}` })).status, 401);
  assert.equal((await raw('GET', '/api/orders', undefined, { Cookie: cookie })).status, 200);
});

// ---------- CSRF ----------

test('CSRF: чужие и «похожие» Origin отклоняются, свой хост проходит', async () => {
  const cookie = await bossCookie();
  const post = (origin: string, id: string) => raw('POST', '/api/points', newPoint(id), { Cookie: cookie, Origin: origin });

  for (const [i, origin] of [
    'https://evil.run.app',
    'https://x.googleusercontent.com',
    'http://localhost.evil.com',
    'http://127.0.0.1.evil.com',
    'https://evil.example',
    'null',
  ].entries()) {
    assert.equal((await post(origin, `p-bad-${i}`)).status, 403, origin);
  }
  assert.equal((await post(base, 'p-ok')).status, 200);
  assert.equal((await post('http://localhost:3000', 'p-other-localhost')).status, 403); // другой порт/хост — не «свой»
});

test('CSRF: TRUSTED_ORIGINS — только точное совпадение', async () => {
  process.env.TRUSTED_ORIGINS = 'https://app.example.com/, https://second.example.com';
  const cookie = await bossCookie();
  const post = (origin: string, id: string) => raw('POST', '/api/points', newPoint(id), { Cookie: cookie, Origin: origin });
  assert.equal((await post('https://app.example.com', 'a')).status, 200);
  assert.equal((await post('https://second.example.com', 'b')).status, 200);
  assert.equal((await post('https://evil.app.example.com', 'c')).status, 403); // поддомен — не доверенный
  assert.equal((await post('https://app.example.com.evil.com', 'd')).status, 403);
  assert.equal((await post('http://app.example.com', 'e')).status, 403); // другая схема
});

test('CSRF: вход тоже защищён проверкой Origin', async () => {
  assert.equal((await raw('POST', '/api/auth/login', { email: 'boss@corp.test', password: PASSWORD }, { Origin: 'https://evil.run.app' })).status, 403);
});

// ---------- cookie и заголовки ----------

test('cookie: SameSite=Lax, без None/Partitioned; Secure при HTTPS за прокси', async () => {
  const plain = (await login('boss@corp.test', PASSWORD)).headers.getSetCookie()[0];
  assert.match(plain, /SameSite=Lax/);
  assert.doesNotMatch(plain, /SameSite=None|Partitioned/);
  assert.doesNotMatch(plain, /Secure/); // обычный http (локальная разработка)

  const proxied = (await raw('POST', '/api/auth/login', { email: 'boss@corp.test', password: PASSWORD }, { 'X-Forwarded-Proto': 'https' })).headers.getSetCookie()[0];
  assert.match(proxied, /SameSite=Lax; Secure/);
});

test('заголовки: запрет встраивания в iframe и защита от MIME-sniffing', async () => {
  const res = await raw('GET', '/api/health');
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.match(res.headers.get('content-security-policy') || '', /frame-ancestors 'none'/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
});

test('встроенный предпросмотр: работает только вне production и только по флагу', async () => {
  // 1) флаг выключен — строгий режим
  assert.match((await login('boss@corp.test', PASSWORD)).headers.getSetCookie()[0], /SameSite=Lax/);

  // 2) флаг включён в разработке — iframe разрешён
  process.env.ALLOW_EMBEDDED_PREVIEW = 'true';
  const preview = await login('boss@corp.test', PASSWORD);
  assert.match(preview.headers.getSetCookie()[0], /SameSite=None; Secure; Partitioned/);
  assert.equal(preview.headers.get('x-frame-options'), null);

  // 3) тот же флаг в production игнорируется
  process.env.NODE_ENV = 'production';
  const prod = await login('boss@corp.test', PASSWORD);
  assert.match(prod.headers.getSetCookie()[0], /SameSite=Lax/);
  assert.doesNotMatch(prod.headers.getSetCookie()[0], /Partitioned/);
  assert.equal(prod.headers.get('x-frame-options'), 'DENY');
});

test('в preview-режиме CSRF-защита Origin остаётся строгой', async () => {
  process.env.ALLOW_EMBEDDED_PREVIEW = 'true';
  const cookie = await bossCookie();
  assert.equal((await raw('POST', '/api/points', newPoint('x'), { Cookie: cookie, Origin: 'https://evil.run.app' })).status, 403);
  assert.equal((await raw('POST', '/api/points', newPoint('y'), { Cookie: cookie, Origin: base })).status, 200);
});
