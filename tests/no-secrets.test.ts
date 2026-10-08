/** В репозитории не должно быть приватных ключей и токенов: такой файл раньше попал в коммит. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.vercel']);
const SKIP_FILES = new Set(['package-lock.json']);
const TEXT_EXT = /\.(json|ts|tsx|js|mjs|cjs|md|txt|yml|yaml|env|example|html|css|pem|key)$|^\.[a-z]+$/i;

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return SKIP_DIRS.has(entry.name) ? [] : walk(path.join(dir, entry.name));
    return SKIP_FILES.has(entry.name) ? [] : [path.join(dir, entry.name)];
  });
}

test('в файлах репозитория нет приватных ключей (PEM) и ключей сервисных аккаунтов', () => {
  const findings: string[] = [];
  for (const file of walk(root)) {
    const name = path.basename(file);
    if (name === '.env' || /^\.env\.(?!example$)/.test(name)) continue; // локальные файлы окружения не отслеживаются (.gitignore)
    if (!TEXT_EXT.test(name) && !name.startsWith('.env')) continue;
    if (fs.statSync(file).size > 1_000_000) continue;
    const text = fs.readFileSync(file, 'utf8');
    const rel = path.relative(root, file);
    if (/-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/.test(text)) findings.push(`${rel}: приватный ключ (PEM)`);
    else if (/"private_key"\s*:/.test(text) && /"service_account_id"\s*:/.test(text)) findings.push(`${rel}: ключ сервисного аккаунта`);
  }
  assert.deepEqual(
    findings,
    [],
    `Найдены секреты в репозитории: ${findings.join('; ')}. Удалите файл из репозитория (git rm --cached), ОТОЗОВИТЕ скомпрометированный ключ ` +
      'в Yandex Cloud и создайте новый — он должен жить только в переменных окружения.',
  );
});

test('.gitignore закрывает типичные имена файлов с ключами', () => {
  const ignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8').split('\n').map((l) => l.trim());
  for (const pattern of ['authorized_key.json', '*.pem', '*.key']) {
    assert.ok(ignore.includes(pattern), `в .gitignore нет «${pattern}»`);
  }
  assert.ok(ignore.some((l) => /^\.env\*$/.test(l)), '.env* должен быть в .gitignore');
});

test('.env.example не содержит значений секретов', () => {
  const text = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
  assert.ok(!/BEGIN [A-Z ]*PRIVATE KEY/.test(text));
});
