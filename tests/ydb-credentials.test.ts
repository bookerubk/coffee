/**
 * Авторизация в YDB: ключ сервисного аккаунта (токен обновляется сам), готовый IAM-токен,
 * нормализация значений из панели хостинга. Обмен JWT на IAM-токен проверяется на локальной имитации IAM.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { constants, generateKeyPairSync, verify } from 'node:crypto';

const y = await import('../src/db/ydb.ts');
const { AccessTokenCredentialsProvider } = await import('@ydbjs/auth/access-token');
const { ServiceAccountCredentialsProvider } = await import('@ydbjs/auth-yandex-cloud');

// ---------- имитация Yandex IAM ----------
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const keyJson = { id: 'key-1', service_account_id: 'sa-1', private_key: privatePem };

let iam: http.Server;
let iamUrl = '';
let iamCalls = 0;
let iamStatus = 200;
const seenJwts: { header: any; payload: any; signatureValid: boolean }[] = [];

before(async () => {
  iam = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      iamCalls++;
      try {
        if (iamStatus !== 200) {
          res.statusCode = iamStatus;
          return res.end('denied');
        }
        const jwt: string = JSON.parse(body).jwt;
        const [h, p, s] = jwt.split('.');
        const signatureValid = verify(
          'sha256',
          Buffer.from(`${h}.${p}`),
          { key: publicKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: constants.RSA_PSS_SALTLEN_AUTO },
          Buffer.from(s, 'base64url'),
        );
        seenJwts.push({ header: JSON.parse(Buffer.from(h, 'base64url').toString()), payload: JSON.parse(Buffer.from(p, 'base64url').toString()), signatureValid });
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ iamToken: `t1.mock-token-${iamCalls}`, expiresAt: new Date(Date.now() + 12 * 3600 * 1000).toISOString() }));
      } catch (error) {
        // ошибка в самой имитации не должна превращаться в «молчаливое» зависание теста
        res.statusCode = 500;
        res.end(`mock error: ${(error as Error).message}`);
      }
    });
  }).listen(0, '127.0.0.1');
  await new Promise((r) => iam.once('listening', r));
  iamUrl = `http://127.0.0.1:${(iam.address() as AddressInfo).port}/iam/v1/tokens`;
});
after(() => iam.close());

// ---------- нормализация значений ----------
test('readEnv: убирает пробелы, переводы строк и обрамляющие кавычки', () => {
  const env = { A: '  value  ', B: '"quoted"', C: "'single'", D: '  "  spaced  "  ', E: '', F: '   ', G: '"', H: 'in"side', I: '\nt1.abc\n' } as NodeJS.ProcessEnv;
  assert.equal(y.readEnv('A', env), 'value');
  assert.equal(y.readEnv('B', env), 'quoted');
  assert.equal(y.readEnv('C', env), 'single');
  assert.equal(y.readEnv('D', env), 'spaced');
  assert.equal(y.readEnv('E', env), undefined);
  assert.equal(y.readEnv('F', env), undefined);
  assert.equal(y.readEnv('G', env), '"');
  assert.equal(y.readEnv('H', env), 'in"side');
  assert.equal(y.readEnv('I', env), 't1.abc');
  assert.equal(y.readEnv('MISSING', env), undefined);
});

test('ydbConfigProblem: перечисляет, чего не хватает', () => {
  assert.equal(y.ydbConfigProblem({ YDB_ENDPOINT: 'grpcs://h:2135', YDB_DATABASE: '/db', YDB_TOKEN: 't' } as NodeJS.ProcessEnv), null);
  assert.equal(y.ydbConfigProblem({ YDB_ENDPOINT: 'grpcs://h:2135', YDB_DATABASE: '/db', YDB_SERVICE_ACCOUNT_KEY: '{}' } as NodeJS.ProcessEnv), null);
  assert.match(y.ydbConfigProblem({} as NodeJS.ProcessEnv)!, /YDB_ENDPOINT, YDB_DATABASE, YDB_SERVICE_ACCOUNT_KEY/);
  assert.match(y.ydbConfigProblem({ YDB_ENDPOINT: '""', YDB_DATABASE: '/db', YDB_TOKEN: 't' } as NodeJS.ProcessEnv)!, /YDB_ENDPOINT/); // пустые кавычки = не задано
  assert.match(y.ydbConfigProblem({ YDB_ENDPOINT: 'e', YDB_DATABASE: '/db' } as NodeJS.ProcessEnv)!, /YDB_TOKEN/);
});

test('normalizeIamEndpoint: принимает host:port (старый формат) и полный URL', () => {
  assert.equal(y.normalizeIamEndpoint('iam.api.cloud.yandex.net:443'), 'https://iam.api.cloud.yandex.net/iam/v1/tokens');
  assert.equal(y.normalizeIamEndpoint('https://iam.api.cloud.yandex.net'), 'https://iam.api.cloud.yandex.net/iam/v1/tokens');
  assert.equal(y.normalizeIamEndpoint('http://127.0.0.1:9999/iam/v1/tokens'), 'http://127.0.0.1:9999/iam/v1/tokens');
});

// ---------- разбор ключа ----------
test('parseServiceAccountKey: JSON, base64 и понятные ошибки', () => {
  assert.equal(y.parseServiceAccountKey(JSON.stringify(keyJson)).id, 'key-1');
  assert.equal(y.parseServiceAccountKey('  ' + JSON.stringify(keyJson, null, 2) + '\n').service_account_id, 'sa-1');
  assert.equal(y.parseServiceAccountKey(Buffer.from(JSON.stringify(keyJson)).toString('base64')).id, 'key-1');
  assert.throws(() => y.parseServiceAccountKey('это не ключ'), /не удалось разобрать ключ/);
  assert.throws(() => y.parseServiceAccountKey('{"id":"x"}'), /обязательных полей/);
});

// ---------- выбор способа авторизации ----------
test('YDB_TOKEN: кавычки, Bearer и переносы строк не ломают токен', async () => {
  for (const raw of ['t1.abc-def', '"t1.abc-def"', "'t1.abc-def'", ' t1.abc-def\n', 'Bearer t1.abc-def', '"Bearer t1.abc-def"', 't1.abc-\ndef']) {
    const provider = y.createYdbCredentialsProvider({ YDB_TOKEN: raw } as NodeJS.ProcessEnv);
    assert.ok(provider instanceof AccessTokenCredentialsProvider, raw);
    assert.equal(await provider.getToken(), 't1.abc-def', JSON.stringify(raw));
  }
});

test('нет учётных данных — понятная ошибка', () => {
  assert.throws(() => y.createYdbCredentialsProvider({} as NodeJS.ProcessEnv), /YDB_SERVICE_ACCOUNT_KEY.*YDB_TOKEN/);
  assert.throws(() => y.createYdbCredentialsProvider({ YDB_TOKEN: '""' } as NodeJS.ProcessEnv), /YDB_SERVICE_ACCOUNT_KEY/);
});

test('ключ сервисного аккаунта: IAM-токен получается, кэшируется и обновляется; JWT подписан корректно', async () => {
  iamCalls = 0; seenJwts.length = 0; iamStatus = 200;
  const env = {
    YDB_SERVICE_ACCOUNT_KEY: Buffer.from(JSON.stringify(keyJson)).toString('base64'),
    YDB_IAM_ENDPOINT: iamUrl,
    YDB_TOKEN: 'должен-игнорироваться', // ключ сервисного аккаунта приоритетнее статического токена
  } as NodeJS.ProcessEnv;
  const provider = y.createYdbCredentialsProvider(env);
  assert.ok(provider instanceof ServiceAccountCredentialsProvider);

  const first = await provider.getToken();
  const second = await provider.getToken();
  assert.equal(first, 't1.mock-token-1');
  assert.equal(second, first);
  assert.equal(iamCalls, 1, 'повторный вызов берёт токен из кэша');

  const refreshed = await provider.getToken(true);
  assert.equal(refreshed, 't1.mock-token-2');
  assert.equal(iamCalls, 2);

  const jwt = seenJwts[0];
  assert.equal(jwt.signatureValid, true, 'подпись PS256 должна проверяться публичным ключом');
  assert.deepEqual([jwt.header.alg, jwt.header.kid], ['PS256', 'key-1']);
  assert.equal(jwt.payload.iss, 'sa-1');
  assert.equal(jwt.payload.aud, iamUrl);
  assert.ok(jwt.payload.exp > jwt.payload.iat);
});

test('ключ сервисного аккаунта: отказ IAM даёт понятную ошибку, а не зависание', async () => {
  iamStatus = 401;
  const provider = y.createYdbCredentialsProvider({
    YDB_SERVICE_ACCOUNT_KEY: JSON.stringify(keyJson),
    YDB_IAM_ENDPOINT: iamUrl,
  } as NodeJS.ProcessEnv);
  await assert.rejects(() => provider.getToken(), /IAM API error: 401/);
  iamStatus = 200;
});

test('YDB_IAM_ENDPOINT в старом формате host:port не ломает ключ сервисного аккаунта', () => {
  const provider = y.createYdbCredentialsProvider({
    YDB_SERVICE_ACCOUNT_KEY: JSON.stringify(keyJson),
    YDB_IAM_ENDPOINT: 'iam.api.cloud.yandex.net:443',
  } as NodeJS.ProcessEnv);
  assert.ok(provider instanceof ServiceAccountCredentialsProvider);
});
