/** .env.example попадает в репозиторий: в нём не должно быть ни секретов, ни «битых» строк конфигурации. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const file = path.resolve(import.meta.dirname, '..', '.env.example');
const text = fs.readFileSync(file, 'utf8');
const parsed = dotenv.parse(text);
const { ydbConfigProblem } = await import('../src/db/ydb.ts');
const { validatePassword } = await import('../src/auth/crypto.ts');

test('каждая строка — комментарий, пустая или корректная пара KEY=VALUE', () => {
  const bad = text.split('\n').map((l, i) => [i + 1, l] as const)
    .filter(([, l]) => l.trim() !== '' && !l.trimStart().startsWith('#') && !/^[A-Z][A-Z0-9_]*=/.test(l));
  assert.deepEqual(bad, [], 'строки не в формате KEY=VALUE (возможно, сломанный комментарий)');
  assert.ok(Object.keys(parsed).every((k) => /^[A-Z][A-Z0-9_]*$/.test(k)));
});

test('секреты в примере пусты (пример не должен содержать ни паролей, ни токенов, ни ключей)', () => {
  for (const key of ['YDB_TOKEN', 'YDB_SERVICE_ACCOUNT_KEY', 'AUTH_SECRET', 'BOOTSTRAP_ADMIN_PASSWORD']) {
    assert.equal(parsed[key] ?? '', '', `${key} должен быть пустым в .env.example`);
  }
});

test('копия примера без правок = «БД не настроена» и демо-данные выключены', () => {
  assert.ok(ydbConfigProblem(parsed as NodeJS.ProcessEnv), 'пустые YDB_* считаются незаданными');
  assert.equal(parsed.YDB_AUTO_SEED, 'false');
  assert.notEqual(parsed.NODE_ENV, 'production');
});

test('значения-примеры, если они есть, не проходят проверку пароля', () => {
  for (const [key, value] of Object.entries(parsed)) {
    if (/PASSWORD|SECRET/.test(key) && value) assert.ok(validatePassword(value) || key === 'AUTH_SECRET', key);
  }
});
