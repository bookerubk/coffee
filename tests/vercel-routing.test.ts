/**
 * Регрессия: на Vercel /api/auth/me и другие вложенные маршруты отвечали 404 платформы, потому что файл
 * api/[...path].ts обслуживает только один сегмент пути. Теперь все /api/* идут в api/index.ts.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { installFakeYdb } from './fakeYdb.ts';

process.env.VERCEL = '1';
process.env.AUTH_SECRET = 'test-secret-test-secret-test-secret-123456';
installFakeYdb();
const { restoreOriginalUrl } = await import('../src/vercel-url.ts');
const { default: handler } = await import('../api/index.ts');

const root = path.resolve(import.meta.dirname, '..');
let server: Server;
let base = '';
before(() => {
  server = createServer(handler).listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

/** Применяет правило из vercel.json так же, как платформа: (.*) -> $1 в destination. */
function applyRewrite(requestPath: string): string | null {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  for (const rule of config.rewrites) {
    const match = new RegExp(`^${rule.source}$`).exec(requestPath);
    if (match) return rule.destination.replace(/\$(\d+)/g, (_: string, n: string) => match[Number(n)] ?? '');
  }
  return null;
}

const API_PATHS = [
  '/api/health', '/api/time', '/api/handbooks', '/api/auth/login', '/api/auth/me', '/api/auth/change-password',
  '/api/orders', '/api/orders/previous/point-1', '/api/waybills', '/api/waybills/generate',
  '/api/waybills/WB-20261001-M-0001/dispatch', '/api/waybills/WB-20261001-M-0001/receive',
  '/api/waybills/WB-20261001-M-0001/driver-status', '/api/drivers/me/status', '/api/legal-entities',
];

test('конфигурация: одна функция api/index.ts, файла-«catch-all» [...path].ts нет', () => {
  assert.ok(fs.existsSync(path.join(root, 'api', 'index.ts')));
  const files = fs.readdirSync(path.join(root, 'api'));
  assert.deepEqual(files.filter((f) => f.includes('[')), [], 'файлы с [..] в api/ дают 404 на вложенных путях');
});

test('vercel.json: каждый /api/* путь приложения попадает в функцию api/index', () => {
  for (const p of API_PATHS) {
    const dest = applyRewrite(p);
    assert.ok(dest, `${p}: нет правила rewrites`);
    assert.match(dest!, /^\/api\/index\?__path=/, p);
  }
  assert.equal(applyRewrite('/'), null); // страницы SPA правилом не затрагиваются
});

test('restoreOriginalUrl: восстанавливает путь и сохраняет остальной query', () => {
  assert.equal(restoreOriginalUrl('/api/index?__path=auth/me'), '/api/auth/me');
  assert.equal(restoreOriginalUrl('/api/index?__path=time&tz=Europe%2FMoscow'), '/api/time?tz=Europe%2FMoscow');
  assert.equal(restoreOriginalUrl('/api?__path=health'), '/api/health');
  assert.equal(restoreOriginalUrl('/api/index?__path=waybills/WB-1/receive'), '/api/waybills/WB-1/receive');
  assert.equal(restoreOriginalUrl('/api/index?__path='), '/api');
  // Исходный путь уже на месте — ничего не меняем (даже если в query есть __path)
  assert.equal(restoreOriginalUrl('/api/auth/me'), '/api/auth/me');
  assert.equal(restoreOriginalUrl('/api/orders?__path=evil'), '/api/orders?__path=evil');
});

test('функция отвечает приложением (а не 404 платформы) для обеих форм URL', async () => {
  for (const p of API_PATHS.filter((x) => !['/api/health', '/api/time'].includes(x))) {
    const rewritten = applyRewrite(p)!;
    const viaRewrite = await fetch(base + rewritten, { method: p.includes('login') || p.includes('generate') || p.includes('change') ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, body: undefined });
    const preserved = await fetch(base + p);
    for (const [label, res] of [['rewrite', viaRewrite], ['исходный URL', preserved]] as const) {
      const body: any = await res.json().catch(() => null);
      assert.notEqual(res.status, 404, `${p} (${label}) -> 404 ${JSON.stringify(body)}`);
      assert.ok(body && typeof body === 'object', `${p} (${label}) вернул не JSON`);
    }
  }
});

test('защищённые маршруты через rewrite отвечают 401, публичные — 200', async () => {
  const me = await fetch(base + applyRewrite('/api/auth/me')!);
  assert.equal(me.status, 401);
  assert.equal(((await me.json()) as any).code, 'unauthorized');

  assert.equal((await fetch(base + applyRewrite('/api/health')!)).status, 200);
  const time = await fetch(base + applyRewrite('/api/time?tz=UTC'.split('?')[0])! + '&tz=UTC');
  assert.equal(time.status, 200);

  // Неизвестный API-маршрут без входа — по-прежнему 401 (не раскрываем список маршрутов)
  assert.equal((await fetch(base + applyRewrite('/api/nope/deep')!)).status, 401);
});
