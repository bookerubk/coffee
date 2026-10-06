/** Недоступная или не принимающая токен база: понятные ответы пользователю и подсказка в логах. */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { installFakeYdb } from './fakeYdb.ts';

process.env.VERCEL = '1';
process.env.AUTH_SECRET = 'test-secret-test-secret-test-secret-123456';
installFakeYdb();
const healthyClient = (globalThis as any)._ydbQueryClient;
const { app } = await import('../server.ts');
const { executeYql, resetYdbErrorHints } = await import('../src/db/ydb.ts');
const { signSession, SESSION_COOKIE } = await import('../src/auth/crypto.ts');
const { resetLoginRateLimitForTests } = await import('../src/auth/routes.ts');

let server: Server;
let base = '';
before(() => {
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());
beforeEach(() => {
  resetLoginRateLimitForTests();
  resetYdbErrorHints();
  (globalThis as any)._ydbQueryClient = healthyClient;
});

/** gRPC-ошибка, как её отдаёт YDB при просроченном токене. */
const unauthenticated = () => Object.assign(new Error('/Ydb.Discovery.V1.DiscoveryService/ListEndpoints UNAUTHENTICATED: Unauthenticated'), { code: 16 });
const failWith = (makeError: () => Error) => {
  (globalThis as any)._ydbQueryClient = () => {
    const req: any = { param: () => req, idempotent: async () => { throw makeError(); } };
    return req;
  };
};

test('вход при отказе YDB: 503 с понятным текстом (а не безликая 500)', async () => {
  failWith(unauthenticated);
  const res = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'a@b.test', password: 'whatever-pass' }) });
  assert.equal(res.status, 503);
  assert.match(((await res.json()) as any).error, /База данных недоступна/);
});

test('проверка сессии при отказе YDB: 503 database_unavailable, а не 401 (пользователя не разлогинивает)', async () => {
  failWith(unauthenticated);
  const cookie = `${SESSION_COOKIE}=${signSession('emp-1', 'pv')}`;
  const res = await fetch(base + '/api/orders', { headers: { Cookie: cookie } });
  assert.equal(res.status, 503);
  assert.equal(((await res.json()) as any).code, 'database_unavailable');
});

test('UNAUTHENTICATED: подсказка про токен пишется в лог один раз и содержит способ исправления', async () => {
  const logged: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => void logged.push(args.map(String).join(' '));
  try {
    failWith(unauthenticated);
    await assert.rejects(() => executeYql('SELECT 1;'), /UNAUTHENTICATED/);
    await assert.rejects(() => executeYql('SELECT 1;'), /UNAUTHENTICATED/);
  } finally {
    console.error = original;
  }
  const hints = logged.filter((l) => l.includes('[ydb]'));
  assert.equal(hints.length, 1);
  assert.match(hints[0], /YDB_SERVICE_ACCOUNT_KEY/);
  assert.match(hints[0], /yc iam create-token/);
  assert.match(hints[0], /БЕЗ кавычек/);
});
