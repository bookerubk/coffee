import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.AUTH_SECRET = 'unit-test-secret-unit-test-secret-1234';
const c = await import('../src/auth/crypto.ts');
const { operatorPointIds, supervisorPointIds, resolveDriverId, canAccessWaybill } = await import('../src/auth/access.ts');

test('хэш пароля: соль уникальна, верный пароль проходит, неверный нет', async () => {
  const a = await c.hashPassword('пароль-12345');
  const b = await c.hashPassword('пароль-12345');
  assert.notEqual(a, b);
  assert.match(a, /^scrypt\$\d+\$\d+\$\d+\$/);
  assert.equal(await c.verifyPassword('пароль-12345', a), true);
  assert.equal(await c.verifyPassword('пароль-12346', a), false);
  assert.equal(await c.verifyPassword('любой', undefined), false);
  assert.equal(await c.verifyPassword('любой', 'не-хэш'), false);
});

test('требования к паролю', () => {
  assert.ok(c.validatePassword('short'));
  assert.ok(c.validatePassword('        '));
  assert.ok(c.validatePassword('x'.repeat(129)));
  assert.ok(c.validatePassword(12345678));
  assert.equal(c.validatePassword('1'), null);
  assert.equal(c.validatePassword('достаточно-длинный'), null);
});

test('токен сессии: подпись, срок действия, подмена', () => {
  const token = c.signSession('emp-1', 'v1');
  assert.equal(c.verifySession(token)?.sub, 'emp-1');
  assert.equal(c.verifySession(token, Date.now() + (c.SESSION_TTL_SECONDS + 5) * 1000), null);
  const [body, sig] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ sub: 'emp-admin', pv: 'v1', iat: 1, exp: 9999999999 })).toString('base64url');
  assert.equal(c.verifySession(`${forged}.${sig}`), null);
  assert.equal(c.verifySession(`${body}.`), null);
  assert.equal(c.verifySession(`${body}.${sig}.extra`), null);
  assert.equal(c.verifySession(undefined), null);
  assert.equal(c.verifySession('x'.repeat(5000)), null);
});

test('секрет: слишком короткий отклоняется; при STRICT_AUTH_SECRET без секрета — ошибка', () => {
  const saved = { secret: process.env.AUTH_SECRET, env: process.env.NODE_ENV, strict: process.env.STRICT_AUTH_SECRET };
  try {
    process.env.AUTH_SECRET = 'short';
    assert.throws(() => c.getAuthSecret(), /32/);
    delete process.env.AUTH_SECRET;
    process.env.STRICT_AUTH_SECRET = 'true';
    assert.throws(() => c.getAuthSecret(), /AUTH_SECRET/);
    delete process.env.STRICT_AUTH_SECRET;
    assert.ok(c.getAuthSecret().length >= 32);
  } finally {
    process.env.AUTH_SECRET = saved.secret;
    if (saved.env === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = saved.env;
    if (saved.strict === undefined) delete process.env.STRICT_AUTH_SECRET;
    else process.env.STRICT_AUTH_SECRET = saved.strict;
  }
});

test('правила доступа: оператор без закреплённых точек не ограничен, водитель по имени', () => {
  const points = [{ id: 'p1', assignedWorkshopId: 'ws-1', assignedEmployeeIds: ['u-sup'] }, { id: 'p2', assignedWorkshopId: 'ws-2', assignedEmployeeIds: [] }];
  const op = { id: 'o', accountId: 'a', name: 'О', role: 'production_operator', workshopId: 'ws-1' } as any;
  assert.deepEqual([...operatorPointIds(op, points)!], ['p1']);
  assert.equal(operatorPointIds({ ...op, workshopId: 'ws-9' }, points), null);
  assert.equal(operatorPointIds({ ...op, workshopId: undefined }, points), null);

  const sup = { id: 'u-sup', accountId: 'a', name: 'С', role: 'shift_supervisor', pointId: 'p2' } as any;
  assert.deepEqual([...supervisorPointIds(sup, points)].sort(), ['p1', 'p2']);

  const drivers = [{ id: 'd1', name: 'Иван Петров' }];
  const driver = { id: 'u', accountId: 'a', name: 'иван петров', role: 'driver' } as any;
  assert.equal(resolveDriverId(driver, drivers), 'd1');
  const ctx = { points, drivers };
  assert.equal(canAccessWaybill(driver, { pointId: 'p1', driverId: 'd1' }, ctx), true);
  assert.equal(canAccessWaybill(driver, { pointId: 'p1', driverName: 'Иван Петров (Газель)' }, ctx), true);
  assert.equal(canAccessWaybill(driver, { pointId: 'p1', driverName: 'Иван Петровский (Газель)' }, ctx), false);
  assert.equal(canAccessWaybill(driver, { pointId: 'p1' }, ctx), false);
});
