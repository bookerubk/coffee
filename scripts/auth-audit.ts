/**
 * Аудит слабых паролей.
 *   npm run auth:audit              — показать сотрудников со слабым паролем
 *   npm run auth:audit -- --revoke  — сбросить такие пароли (вход станет невозможен, пока администратор
 *                                     не задаст новый: npm run auth:set-password)
 * Сбрасывать нужно, если на сервере когда-либо работала версия с паролем «1» для admin@aroma-coffee.ru.
 */
import 'dotenv/config';
import { closeYdbConnection, upsertYdbRow, ydbConfigProblem } from '../src/db/ydb.ts';
import { findWeakPasswordEmployees } from '../src/auth/audit.ts';

const configProblem = ydbConfigProblem();
if (configProblem) {
  console.error(configProblem);
  process.exitCode = 1;
} else {
  try {
    const revoke = process.argv.includes('--revoke');
    const findings = await findWeakPasswordEmployees();
    if (findings.length === 0) {
      console.log('Слабых паролей не найдено.');
    } else {
      for (const f of findings) {
        console.log(`- ${f.name} <${f.email}> (аккаунт ${f.accountId}): пароль «${f.password}»`);
        if (revoke) {
          await upsertYdbRow('employees', { id: f.id, password_hash: null, updated_at: new Date().toISOString() });
        }
      }
      console.log(revoke
        ? `Пароли сброшены (${findings.length}). Задайте новые: NEW_PASSWORD='...' npm run auth:set-password -- email`
        : `Найдено: ${findings.length}. Запустите с --revoke, чтобы сбросить эти пароли.`);
      if (!revoke) process.exitCode = 2;
    }
  } finally {
    await closeYdbConnection();
  }
}
