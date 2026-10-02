import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { installFakeYdb, resetFakeYdb } from './fakeYdb.ts';

process.env.VERCEL = '1'; // не запускать startServer (Vite/listen) при импорте
process.env.AUTH_SECRET = 'test-secret-test-secret-test-secret-123456';
installFakeYdb();
const { ensureYdbSchema } = await import('../src/db/ydb.ts');
const q = await import('../src/db/queries.ts');
const { hashPassword, passwordVersion, signSession, SESSION_COOKIE } = await import('../src/auth/crypto.ts');
const { resetLoginRateLimitForTests } = await import('../src/auth/routes.ts');
const { bootstrapAdminFromEnv } = await import('../src/auth/bootstrap.ts');
const { app } = await import('../server.ts');

const PASSWORD = 'correct-horse-battery';
let server: Server;
let base = '';
let HASH = '';

const USERS = {
  admin: 'admin@a.test',
  sup: 'sup@a.test', // старший смены, point-1
  sup2: 'sup2@a.test', // старший смены, point-2
  op: 'op@a.test', // оператор цеха ws-1
  driver: 'driver@a.test', // водитель drv-1
  driver2: 'driver2@a.test', // водитель drv-2
  adminB: 'admin@b.test', // администратор другого аккаунта
} as const;
type Who = keyof typeof USERS | null;

before(async () => {
  HASH = await hashPassword(PASSWORD);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => {
  server.close();
});

let sessions = new Map<string, string>();

beforeEach(async () => {
  resetFakeYdb();
  resetLoginRateLimitForTests();
  sessions = new Map();
  await ensureYdbSchema();

  for (const id of ['acc-a', 'acc-b']) await q.upsertTenantAccountQuery({ id, name: `Компания ${id}` });
  const point = (id: string, ws: string) => ({ id, accountId: 'acc-a', name: `Точка ${id}`, address: '', assignedWorkshopId: ws, assignedEmployeeIds: [], archived: false });
  await q.upsertPointQuery(point('point-1', 'ws-1'));
  await q.upsertPointQuery(point('point-2', 'ws-2'));
  const drv = (id: string, name: string) => ({ id, accountId: 'acc-a', name, phone: '', legalEntityId: '', assignedWorkshopId: 'ws-1', vehicleModel: 'Газель', licensePlate: id, hasRefrigerator: true, status: 'active', archived: false });
  await q.upsertDriverQuery(drv('drv-1', 'Михаил Водитель'));
  await q.upsertDriverQuery(drv('drv-2', 'Пётр Водитель'));

  const emp = (key: string, over: Record<string, unknown>) => q.upsertEmployeeQuery({
    id: `emp-${key}`, accountId: 'acc-a', name: `Сотрудник ${key}`, email: `${key}@a.test`, archived: false, passwordHash: HASH, ...over,
  });
  await emp('admin', { role: 'admin' });
  await emp('sup', { role: 'shift_supervisor', pointId: 'point-1' });
  await emp('sup2', { role: 'shift_supervisor', pointId: 'point-2' });
  await emp('op', { role: 'production_operator', workshopId: 'ws-1' });
  await emp('driver', { role: 'driver', driverId: 'drv-1' });
  await emp('driver2', { role: 'driver', driverId: 'drv-2' });
  await emp('nopass', { role: 'shift_supervisor', pointId: 'point-1', passwordHash: undefined });
  await emp('gone', { role: 'shift_supervisor', pointId: 'point-1', archived: true });
  await q.upsertEmployeeQuery({ id: 'emp-adminB', accountId: 'acc-b', name: 'Админ B', role: 'admin', email: 'admin@b.test', archived: false, passwordHash: HASH });
});

async function raw(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* не JSON */
  }
  return { status: res.status, json, headers: res.headers };
}

const cookieFrom = (headers: Headers) =>
  headers.getSetCookie().map((c) => c.split(';')[0]).find((c) => c.startsWith(`${SESSION_COOKIE}=`)) ?? '';

async function login(email: string, password = PASSWORD) {
  return raw('POST', '/api/auth/login', { email, password });
}

async function sessionFor(who: keyof typeof USERS) {
  if (!sessions.has(who)) {
    const res = await login(USERS[who]);
    assert.equal(res.status, 200, `вход ${who}: ${JSON.stringify(res.json)}`);
    sessions.set(who, cookieFrom(res.headers));
  }
  return sessions.get(who)!;
}

async function call(who: Who, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const cookie: Record<string, string> = who ? { Cookie: await sessionFor(who) } : {};
  return raw(method, path, body, { ...cookie, ...headers });
}

const item = { productId: 'prod-1', sku: 'S1', name: 'Круассан', unit: 'шт', category: 'Выпечка', quantity: 5 };
const order = (over: Record<string, unknown> = {}) => ({
  idempotencyKey: 'k-' + Math.random(),
  pointId: 'point-1',
  pointName: 'Подделка',
  slotId: 'morning',
  date: '2026-10-01',
  items: [item],
  createdBy: 'Хакер',
  ...over,
});

// ======================= Аутентификация =======================

test('вход: cookie HttpOnly, профиль без хэша, /me и выход', async () => {
  const res = await login(USERS.sup);
  assert.equal(res.status, 200);
  const setCookie = res.headers.getSetCookie().join(';');
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Lax/);
  assert.equal(res.json.user.role, 'shift_supervisor');
  assert.equal(res.json.user.pointId, 'point-1');
  assert.equal(res.json.user.pointName, 'Точка point-1');
  assert.equal(res.json.user.accountName, 'Компания acc-a');
  assert.ok(!JSON.stringify(res.json).includes('scrypt'));
  assert.ok(!('passwordHash' in res.json.user));

  const cookie = cookieFrom(res.headers);
  const me = await raw('GET', '/api/auth/me', undefined, { Cookie: cookie });
  assert.equal(me.status, 200);
  assert.equal(me.json.user.id, 'emp-sup');

  const out = await raw('POST', '/api/auth/logout');
  assert.match(out.headers.getSetCookie().join(';'), /Max-Age=0/);
});

test('вход: email без учёта регистра и пробелов', async () => {
  assert.equal((await login('  SUP@A.TEST ')).status, 200);
});

test('вход: неверный пароль, неизвестный email, без пароля, архивный — одинаковый отказ', async () => {
  const bad = await login(USERS.sup, 'wrong-password');
  const unknown = await login('nobody@a.test');
  const noPass = await login('nopass@a.test');
  const archived = await login('gone@a.test');
  for (const r of [bad, unknown, noPass, archived]) {
    assert.equal(r.status, 401);
    assert.equal(r.json.error, 'Неверный email или пароль.');
    assert.equal(cookieFrom(r.headers), '');
  }
  assert.equal((await raw('POST', '/api/auth/login', { email: USERS.sup })).status, 400);
});

test('без входа все данные закрыты (401), публичны только health и time', async () => {
  for (const [method, path] of [
    ['GET', '/api/handbooks'], ['GET', '/api/orders'], ['GET', '/api/waybills'], ['GET', '/api/employees'],
    ['POST', '/api/orders'], ['POST', '/api/points'], ['POST', '/api/employees'], ['POST', '/api/reset'],
    ['PUT', '/api/waybills/x/receive'], ['GET', '/api/accounts'], ['GET', '/api/auth/me'],
  ]) {
    const r = await raw(method, path, method === 'GET' ? undefined : {});
    assert.equal(r.status, 401, `${method} ${path}`);
  }
  assert.equal((await raw('GET', '/api/health')).status, 200);
  assert.equal((await raw('GET', '/api/time')).status, 200);
});

test('x-account-id и accountId в теле больше не влияют на аккаунт', async () => {
  const res = await call('adminB', 'GET', '/api/points', undefined, { 'x-account-id': 'acc-a' });
  assert.deepEqual(res.json, []);
  const created = await call('adminB', 'POST', '/api/points', { id: 'pB', name: 'B', address: '', accountId: 'acc-a', assignedEmployeeIds: [] }, { 'x-account-id': 'acc-a' });
  assert.equal(created.status, 200);
  assert.equal((await call('adminB', 'GET', '/api/points')).json.length, 1);
  assert.equal((await call('admin', 'GET', '/api/points')).json.length, 2); // у A остались только его точки
});

test('поддельный, чужой подписью и просроченный токены отклоняются', async () => {
  const good = await sessionFor('sup');
  const token = good.split('=')[1];
  const tampered = token.slice(0, -2) + (token.endsWith('AA') ? 'BB' : 'AA');
  assert.equal((await raw('GET', '/api/orders', undefined, { Cookie: `${SESSION_COOKIE}=${tampered}` })).status, 401);
  assert.equal((await raw('GET', '/api/orders', undefined, { Cookie: `${SESSION_COOKIE}=abc.def` })).status, 401);
  assert.equal((await raw('GET', '/api/orders', undefined, { Cookie: `${SESSION_COOKIE}=` })).status, 401);

  const expired = signSession('emp-sup', passwordVersion(HASH), Date.now() - 13 * 3600 * 1000);
  assert.equal((await raw('GET', '/api/orders', undefined, { Cookie: `${SESSION_COOKIE}=${expired}` })).status, 401);
  const valid = signSession('emp-sup', passwordVersion(HASH));
  assert.equal((await raw('GET', '/api/orders', undefined, { Cookie: `${SESSION_COOKIE}=${valid}` })).status, 200);
  const wrongVersion = signSession('emp-sup', 'old-version');
  assert.equal((await raw('GET', '/api/orders', undefined, { Cookie: `${SESSION_COOKIE}=${wrongVersion}` })).status, 401);
});

test('перебор пароля: после 8 неудач — 429 с Retry-After, даже с верным паролем', async () => {
  for (let i = 0; i < 8; i++) assert.equal((await login(USERS.sup, `wrong-pass-${i}`)).status, 401);
  const blocked = await login(USERS.sup);
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  assert.equal((await login(USERS.admin)).status, 200); // другой email не заблокирован
});

test('смена пароля: проверка текущего, сложность, отзыв старых сессий', async () => {
  const other = await sessionFor('sup'); // «другое устройство»
  const first = await login(USERS.sup);
  const cookie = cookieFrom(first.headers);
  const change = (body: unknown) => raw('POST', '/api/auth/change-password', body, { Cookie: cookie });

  assert.equal((await change({ currentPassword: 'неверный-пароль', newPassword: 'new-password-1' })).status, 403);
  assert.equal((await change({ currentPassword: PASSWORD, newPassword: 'short' })).status, 400);
  assert.equal((await change({ currentPassword: PASSWORD, newPassword: PASSWORD })).status, 400);

  const ok = await change({ currentPassword: PASSWORD, newPassword: 'new-password-1' });
  assert.equal(ok.status, 200);
  const refreshed = cookieFrom(ok.headers);
  assert.equal((await raw('GET', '/api/orders', undefined, { Cookie: refreshed })).status, 200);
  assert.equal((await raw('GET', '/api/orders', undefined, { Cookie: other })).status, 401);
  assert.equal((await raw('GET', '/api/orders', undefined, { Cookie: cookie })).status, 401);
  assert.equal((await login(USERS.sup)).status, 401);
  assert.equal((await login(USERS.sup, 'new-password-1')).status, 200);
});

test('роль и архивация применяются сразу, без перевхода', async () => {
  assert.equal((await call('sup', 'GET', '/api/orders')).status, 200);
  const res = await call('admin', 'POST', '/api/employees', { id: 'emp-sup', name: 'Сотрудник sup', role: 'shift_supervisor', email: USERS.sup, pointId: 'point-1', archived: true });
  assert.equal(res.status, 200);
  assert.equal((await call('sup', 'GET', '/api/orders')).status, 401);

  await call('admin', 'POST', '/api/employees', { id: 'emp-op', name: 'Сотрудник op', role: 'driver', email: USERS.op });
  assert.equal((await call('op', 'POST', '/api/waybills/generate', { date: '2026-10-01', slotId: 'morning' })).status, 403);
});

test('CSRF: запрос с чужим Origin отклоняется, со своим — проходит', async () => {
  const foreign = await call('sup', 'POST', '/api/orders', order(), { Origin: 'https://evil.example' });
  assert.equal(foreign.status, 403);
  const own = await call('sup', 'POST', '/api/orders', order(), { Origin: base });
  assert.equal(own.status, 200);
  assert.equal((await raw('POST', '/api/auth/login', { email: USERS.sup, password: PASSWORD }, { Origin: 'https://evil.example' })).status, 403);
});

// ======================= Управление сотрудниками =======================

test('администратор создаёт сотрудника с паролем: тот может войти, хэш не утекает', async () => {
  const created = await call('admin', 'POST', '/api/employees', { id: 'emp-new', name: 'Новый', role: 'shift_supervisor', email: 'New@A.test', pointId: 'point-1', password: 'initial-pass-1', archived: false });
  assert.equal(created.status, 200);
  assert.equal((await login('new@a.test', 'initial-pass-1')).status, 200);

  const list = await call('admin', 'GET', '/api/employees');
  const row = list.json.find((e: any) => e.id === 'emp-new');
  assert.equal(row.hasPassword, true);
  assert.equal(row.email, 'new@a.test');
  assert.ok(!JSON.stringify(list.json).includes('scrypt'));
  assert.ok(!('password' in row) && !('passwordHash' in row));

  // Редактирование без пароля не сбрасывает существующий
  await call('admin', 'POST', '/api/employees', { id: 'emp-new', name: 'Новый 2', role: 'shift_supervisor', email: 'new@a.test', pointId: 'point-1', archived: false });
  assert.equal((await login('new@a.test', 'initial-pass-1')).status, 200);
});

test('клиент не может подсунуть passwordHash напрямую', async () => {
  const forged = await hashPassword('hacker-password');
  await call('admin', 'POST', '/api/employees', { id: 'emp-sup', name: 'Сотрудник sup', role: 'shift_supervisor', email: USERS.sup, pointId: 'point-1', passwordHash: forged, archived: false });
  assert.equal((await login(USERS.sup, 'hacker-password')).status, 401);
  assert.equal((await login(USERS.sup)).status, 200);
});

test('сотрудники: роль, email, слабый пароль, дубликат, самоблокировка', async () => {
  const base_ = { id: 'emp-x', name: 'Х', role: 'driver', archived: false };
  assert.equal((await call('admin', 'POST', '/api/employees', { ...base_, role: 'superuser' })).status, 400);
  assert.equal((await call('admin', 'POST', '/api/employees', { ...base_, email: 'не-email' })).status, 400);
  assert.equal((await call('admin', 'POST', '/api/employees', { ...base_, email: 'x@a.test', password: 'short' })).status, 400);
  assert.equal((await call('admin', 'POST', '/api/employees', { ...base_, password: 'long-enough-pass' })).status, 400); // пароль без email
  assert.equal((await call('admin', 'POST', '/api/employees', { ...base_, email: USERS.sup })).status, 409); // дубликат email
  assert.equal((await call('admin', 'POST', '/api/employees', { id: 'emp-admin', name: 'А', role: 'driver', email: USERS.admin })).status, 400);
  assert.equal((await call('admin', 'POST', '/api/employees', { id: 'emp-admin', name: 'А', role: 'admin', email: USERS.admin, archived: true })).status, 400);
});

test('чужой аккаунт не может перезаписать запись по id', async () => {
  const hijack = await call('adminB', 'POST', '/api/points', { id: 'point-1', name: 'Захвачено', address: '', assignedEmployeeIds: [] });
  assert.equal(hijack.status, 409);
  const hijackEmp = await call('adminB', 'POST', '/api/employees', { id: 'emp-sup', name: 'Захвачен', role: 'admin', email: 'z@b.test' });
  assert.equal(hijackEmp.status, 409);
  const points = await call('admin', 'GET', '/api/points');
  assert.equal(points.json.find((p: any) => p.id === 'point-1').name, 'Точка point-1');
  assert.equal((await call('adminB', 'POST', '/api/accounts', { id: 'acc-a', name: 'Чужой' })).status, 403);
});

// ======================= Права по ролям =======================

test('матрица прав: запрещённые действия возвращают 403', async () => {
  const cases: [Who & string, string, string, unknown][] = [
    ['sup', 'POST', '/api/points', { id: 'p', name: 'p', address: '' }],
    ['op', 'POST', '/api/products', { id: 'p', name: 'p' }],
    ['driver', 'POST', '/api/employees', { id: 'e', name: 'e', role: 'driver' }],
    ['sup', 'POST', '/api/slots', { id: 'morning' }],
    ['sup', 'POST', '/api/reset', {}],
    ['op', 'POST', '/api/orders', order()],
    ['driver', 'POST', '/api/orders', order()],
    ['driver', 'GET', '/api/orders', undefined],
    ['sup', 'POST', '/api/waybills/generate', { date: '2026-10-01', slotId: 'morning' }],
    ['driver', 'POST', '/api/waybills/generate', { date: '2026-10-01', slotId: 'morning' }],
    ['sup', 'PUT', '/api/waybills/x/dispatch', { items: [], newStatus: 'packing' }],
    ['driver', 'PUT', '/api/waybills/x/dispatch', { items: [], newStatus: 'packing' }],
    ['op', 'PUT', '/api/waybills/x/receive', { items: [] }],
    ['driver', 'PUT', '/api/waybills/x/receive', { items: [] }],
    ['sup', 'PUT', '/api/waybills/x/driver-status', { status: 'dispatched' }],
    ['op', 'PUT', '/api/drivers/me/status', { status: 'active' }],
  ];
  for (const [who, method, path, body] of cases) {
    const r = await call(who, method, path, body);
    assert.equal(r.status, 403, `${who} ${method} ${path}`);
  }
});

test('справочники отдаются по ролям; контакты коллег и реквизиты скрыты', async () => {
  const admin = (await call('admin', 'GET', '/api/handbooks')).json;
  assert.ok(admin.employees.some((e: any) => e.email));
  assert.equal(admin.accounts.length, 1);
  assert.equal(admin.accounts[0].id, 'acc-a');

  const sup = (await call('sup', 'GET', '/api/handbooks')).json;
  assert.deepEqual(sup.points.map((p: any) => p.id), ['point-1']);
  assert.ok(sup.employees.every((e: any) => e.email === undefined && e.phone === undefined));
  assert.deepEqual(sup.legalEntities, []);
  assert.deepEqual(sup.drivers, []);

  const driver = (await call('driver', 'GET', '/api/handbooks')).json;
  assert.deepEqual(driver.drivers.map((d: any) => d.id), ['drv-1']);

  assert.equal((await call('sup', 'GET', '/api/legal-entities')).status, 403);
  assert.equal((await call('sup', 'GET', '/api/workshops')).status, 403);
});

test('старший смены: только свои кофейни и заказы; автор — из сессии', async () => {
  assert.equal((await call('sup', 'POST', '/api/orders', order({ pointId: 'point-2' }))).status, 403);
  const mine = await call('sup', 'POST', '/api/orders', order());
  assert.equal(mine.status, 200);
  assert.equal(mine.json.order.createdBy, 'Сотрудник sup');
  assert.equal(mine.json.order.pointName, 'Точка point-1');
  await call('sup2', 'POST', '/api/orders', order({ pointId: 'point-2' }));

  assert.deepEqual((await call('sup', 'GET', '/api/orders')).json.map((o: any) => o.pointId), ['point-1']);
  assert.equal((await call('sup', 'GET', '/api/orders/previous/point-2')).status, 403);
  assert.equal((await call('sup', 'GET', '/api/orders/previous/point-1')).status, 200);
  assert.equal((await call('admin', 'GET', '/api/orders')).json.length, 2);
});

test('ключ идемпотентности нельзя переиспользовать для чужой кофейни', async () => {
  await call('sup', 'POST', '/api/orders', order({ idempotencyKey: 'shared' }));
  const r = await call('admin', 'POST', '/api/orders', order({ idempotencyKey: 'shared', pointId: 'point-2' }));
  assert.equal(r.status, 409);
});

// ======================= Заказы и накладные (бизнес-логика) =======================

test('черновик → отправка с тем же ключом превращает черновик в отправленный заказ', async () => {
  const key = 'same-key';
  const draft = await call('sup', 'POST', '/api/orders', order({ idempotencyKey: key, isDraft: true }));
  assert.equal(draft.json.order.status, 'draft');

  const sent = await call('sup', 'POST', '/api/orders', order({ idempotencyKey: key, items: [{ ...item, quantity: 9 }] }));
  assert.equal(sent.status, 200);
  assert.equal(sent.json.order.status, 'submitted');
  assert.equal(sent.json.order.id, draft.json.order.id);
  assert.equal(sent.json.order.items[0].quantity, 9);

  const again = await call('sup', 'POST', '/api/orders', order({ idempotencyKey: key }));
  assert.equal(again.json.isDuplicate, true);
  const list = await call('sup', 'GET', '/api/orders');
  assert.equal(list.json.length, 1);
  assert.equal(list.json[0].status, 'submitted');
});

test('валидация заказа: слот, количество, пустая заявка, дата', async () => {
  const post = (over: Record<string, unknown>) => call('sup', 'POST', '/api/orders', order(over));
  assert.equal((await post({ slotId: 'night' })).status, 400);
  assert.equal((await post({ items: [{ ...item, quantity: -1 }] })).status, 400);
  assert.equal((await post({ items: [{ ...item, quantity: 1.5 }] })).status, 400);
  assert.equal((await post({ items: [{ ...item, quantity: 0 }] })).status, 400);
  assert.equal((await post({ date: 'вчера' })).status, 400);
  assert.equal((await post({ items: undefined })).status, 400);
});

async function makeWaybill() {
  await call('sup', 'POST', '/api/orders', order());
  const gen = await call('admin', 'POST', '/api/waybills/generate', { date: '2026-10-01', slotId: 'morning' });
  return gen.json[0];
}

test('генерация: повтор без дублей; два заказа одной точки — две накладные', async () => {
  await call('sup', 'POST', '/api/orders', order());
  await call('sup', 'POST', '/api/orders', order({ items: [{ ...item, quantity: 2 }] }));
  const gen = await call('admin', 'POST', '/api/waybills/generate', { date: '2026-10-01', slotId: 'morning' });
  assert.equal(gen.json.length, 2);
  assert.equal(new Set(gen.json.map((w: any) => w.id)).size, 2);
  const again = await call('admin', 'POST', '/api/waybills/generate', { date: '2026-10-01', slotId: 'morning' });
  assert.equal(again.json.length, 2);
  assert.equal((await call('admin', 'GET', '/api/waybills')).json.length, 2);
});

test('оператор цеха: формирует и видит накладные только своего цеха', async () => {
  await call('sup', 'POST', '/api/orders', order());
  await call('sup2', 'POST', '/api/orders', order({ pointId: 'point-2' }));

  const gen = await call('op', 'POST', '/api/waybills/generate', { date: '2026-10-01', slotId: 'morning', workshopId: 'ws-2' });
  assert.deepEqual(gen.json.map((w: any) => w.pointId), ['point-1']); // workshopId из тела игнорируется
  const orders = (await call('admin', 'GET', '/api/orders')).json;
  assert.equal(orders.find((o: any) => o.pointId === 'point-2').status, 'submitted');

  await call('admin', 'POST', '/api/waybills/generate', { date: '2026-10-01', slotId: 'morning' });
  assert.equal((await call('admin', 'GET', '/api/waybills')).json.length, 2);
  const visible = (await call('op', 'GET', '/api/waybills')).json;
  assert.deepEqual(visible.map((w: any) => w.pointId), ['point-1']);
  const foreign = (await call('admin', 'GET', '/api/waybills')).json.find((w: any) => w.pointId === 'point-2');
  const r = await call('op', 'PUT', `/api/waybills/${foreign.id}/dispatch`, { items: [], newStatus: 'packing' });
  assert.equal(r.status, 404);
});

test('ID накладных не пересекаются между аккаунтами', async () => {
  await call('sup', 'POST', '/api/orders', order());
  await q.upsertPointQuery({ id: 'point-1b', accountId: 'acc-b', name: 'B', address: '', assignedEmployeeIds: [], archived: false });
  await call('adminB', 'POST', '/api/orders', order({ pointId: 'point-1b' }));
  const a = await call('admin', 'POST', '/api/waybills/generate', { date: '2026-10-01', slotId: 'morning' });
  const b = await call('adminB', 'POST', '/api/waybills/generate', { date: '2026-10-01', slotId: 'morning' });
  assert.notEqual(a.json[0].id, b.json[0].id);
  assert.equal((await call('admin', 'GET', '/api/waybills')).json.length, 1);
  assert.equal((await call('adminB', 'GET', '/api/waybills')).json.length, 1);
});

test('отгрузка: валидация, причина расхождения, исполнитель — из сессии', async () => {
  const wb = await makeWaybill();
  const url = `/api/waybills/${wb.id}/dispatch`;
  const send = (body: unknown) => call('op', 'PUT', url, body);

  assert.equal((await send({ newStatus: 'dispatched' })).status, 400);
  assert.equal((await send({ items: [], newStatus: 'received' })).status, 400);
  assert.equal((await send({ items: [{ productId: 'prod-1', dispatchedQuantity: -2 }], newStatus: 'dispatched' })).status, 400);
  assert.equal((await send({ items: [{ productId: 'prod-1', dispatchedQuantity: 3 }], newStatus: 'dispatched' })).status, 400);
  assert.equal((await send({ items: [], newStatus: 'dispatched', driverId: 'drv-unknown' })).status, 400);

  const ok = await send({ items: [{ productId: 'prod-1', dispatchedQuantity: 3, dispatchDiscrepancyReason: 'не хватило сырья' }], newStatus: 'dispatched', operatorName: 'Подделка', driverId: 'drv-1', driverName: 'Михаил', workshopId: 'ws-2' });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.status, 'dispatched');
  assert.equal(ok.json.dispatchedBy, 'Сотрудник op');
  assert.equal(ok.json.workshopId, 'ws-1'); // цех оператора, а не из тела запроса
  assert.equal(ok.json.items[0].receivedQuantity, 3);
  assert.equal((await send({ items: [], newStatus: 'packing' })).status, 409);
});

test('водитель: видит и ведёт только свои накладные', async () => {
  const wb = await makeWaybill();
  await call('op', 'PUT', `/api/waybills/${wb.id}/dispatch`, { items: [], newStatus: 'dispatched', driverId: 'drv-1', driverName: 'Михаил Водитель (Газель drv-1)' });

  assert.equal((await call('driver', 'GET', '/api/waybills')).json.length, 1);
  assert.equal((await call('driver2', 'GET', '/api/waybills')).json.length, 0);
  const url = `/api/waybills/${wb.id}/driver-status`;
  assert.equal((await call('driver2', 'PUT', url, { status: 'dispatched' })).status, 404);
  assert.equal((await call('driver', 'PUT', url, { status: 'received' })).status, 400);
  const ok = await call('driver', 'PUT', url, { status: 'dispatched', driverId: 'drv-2', driverName: 'Подделка' });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.driverId, 'drv-1'); // водитель не может назначить рейс на другого

  const status = await call('driver', 'PUT', '/api/drivers/me/status', { status: 'on_route' });
  assert.equal(status.status, 200);
  assert.equal((await call('driver', 'GET', '/api/handbooks')).json.drivers[0].status, 'on_route');
  assert.equal((await call('driver', 'PUT', '/api/drivers/me/status', { status: 'bogus' })).status, 400);
});

test('приёмка: только своя кофейня, только отгруженная, приёмщик — из сессии', async () => {
  const wb = await makeWaybill();
  const recv = `/api/waybills/${wb.id}/receive`;
  const good = [{ productId: 'prod-1', receivedQuantity: 5 }];

  assert.equal((await call('sup', 'PUT', recv, { items: good })).status, 409); // ещё не отгружена
  await call('op', 'PUT', `/api/waybills/${wb.id}/dispatch`, { items: [{ productId: 'prod-1', dispatchedQuantity: 5 }], newStatus: 'dispatched' });

  assert.equal((await call('sup2', 'PUT', recv, { items: good })).status, 404); // чужая кофейня
  assert.equal((await call('sup', 'PUT', recv, {})).status, 400);
  assert.equal((await call('sup', 'PUT', recv, { items: [{ productId: 'prod-1', receivedQuantity: 4 }] })).status, 400);
  assert.equal((await call('sup', 'PUT', recv, { items: [{ productId: 'prod-1', receivedQuantity: 4, receiveDiscrepancyReason: 'other' }] })).status, 400);
  assert.equal((await call('sup', 'PUT', recv, { items: [{ productId: 'prod-1', receivedQuantity: 4, receiveDiscrepancyReason: 'damaged', receiveDiscrepancyPhoto: 'javascript:alert(1)' }] })).status, 400);

  const done = await call('sup', 'PUT', recv, { items: [{ productId: 'prod-1', receivedQuantity: 4, receiveDiscrepancyReason: 'damaged' }], supervisorName: 'Подделка' });
  assert.equal(done.status, 200);
  assert.equal(done.json.status, 'received_with_discrepancies');
  assert.equal(done.json.receivedBy, 'Сотрудник sup');
  assert.equal((await call('sup', 'PUT', recv, { items: good })).status, 409);
});

test('неизвестный /api-маршрут и битый JSON возвращают JSON-ошибки', async () => {
  const nf = await call('admin', 'GET', '/api/nope');
  assert.equal(nf.status, 404);
  const bad = await call('sup', 'POST', '/api/orders', '{not json');
  assert.equal(bad.status, 400);
  assert.ok(bad.json.error);
});

test('аккаунт: администратор правит только свою компанию', async () => {
  assert.equal((await call('admin', 'POST', '/api/accounts', { id: 'плохой id!', name: 'X' })).status, 400);
  assert.equal((await call('admin', 'POST', '/api/accounts', { id: 'acc-new', name: 'X' })).status, 403);
  assert.equal((await call('admin', 'POST', '/api/accounts', { id: 'acc-a', name: 'Переименована' })).status, 200);
  assert.equal((await call('sup', 'GET', '/api/accounts')).json[0].inn, '');
});

// ======================= Первый администратор =======================

test('bootstrap: создаёт админа, ставит пароль один раз и не перезаписывает существующий', async () => {
  const env = { BOOTSTRAP_ADMIN_EMAIL: 'First@Corp.test', BOOTSTRAP_ADMIN_PASSWORD: 'bootstrap-pass-1', BOOTSTRAP_ADMIN_ACCOUNT_ID: 'acc-new', BOOTSTRAP_ADMIN_ACCOUNT_NAME: 'Новая компания' } as NodeJS.ProcessEnv;
  assert.equal(await bootstrapAdminFromEnv(env), 'created');
  const res = await login('first@corp.test', 'bootstrap-pass-1');
  assert.equal(res.status, 200);
  assert.equal(res.json.user.role, 'admin');
  assert.equal(res.json.user.accountName, 'Новая компания');

  assert.equal(await bootstrapAdminFromEnv({ ...env, BOOTSTRAP_ADMIN_PASSWORD: 'another-pass-22' }), 'exists');
  assert.equal((await login('first@corp.test', 'another-pass-22')).status, 401);

  assert.equal(await bootstrapAdminFromEnv({ ...env, BOOTSTRAP_ADMIN_PASSWORD: 'short' }), 'skipped');
  assert.equal(await bootstrapAdminFromEnv({}), 'skipped');
});

test('bootstrap: существующему сотруднику без пароля ставит пароль', async () => {
  await q.upsertEmployeeQuery({ id: 'emp-seeded', accountId: 'acc-a', name: 'Из сида', role: 'admin', email: 'admin@aroma-coffee.ru', archived: false });
  assert.equal((await login('admin@aroma-coffee.ru', 'bootstrap-pass-1')).status, 401);
  assert.equal(await bootstrapAdminFromEnv({ BOOTSTRAP_ADMIN_EMAIL: 'admin@aroma-coffee.ru', BOOTSTRAP_ADMIN_PASSWORD: 'bootstrap-pass-1' } as NodeJS.ProcessEnv), 'password-set');
  assert.equal((await login('admin@aroma-coffee.ru', 'bootstrap-pass-1')).status, 200);
});
