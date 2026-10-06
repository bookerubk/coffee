/**
 * Установка/сброс пароля существующего сотрудника.
 *   NEW_PASSWORD='...' npm run auth:set-password -- user@company.ru
 *   npm run auth:set-password -- user@company.ru 'новый-пароль'
 * Предпочтительнее переменная NEW_PASSWORD: пароль в аргументах попадает в историю shell.
 * Все действующие сессии сотрудника после смены пароля перестают работать.
 */
import 'dotenv/config';
import { closeYdbConnection, ensureYdbSchema, ydbConfigProblem } from '../src/db/ydb.ts';
import { hashPassword, validatePassword } from '../src/auth/crypto.ts';
import { findEmployeeAuthByEmailQuery, setEmployeePasswordHashQuery } from '../src/db/queries.ts';

const [email, passwordArg] = process.argv.slice(2);
const password = process.env.NEW_PASSWORD || passwordArg;

const configProblem = ydbConfigProblem();
if (configProblem) {
  console.error(configProblem);
  process.exitCode = 1;
} else if (!email || !password) {
  console.error("Использование: NEW_PASSWORD='...' npm run auth:set-password -- user@company.ru");
  process.exitCode = 1;
} else {
  const weak = validatePassword(password);
  if (weak) {
    console.error(weak);
    process.exitCode = 1;
  } else {
    try {
      await ensureYdbSchema();
      const employee = await findEmployeeAuthByEmailQuery(email);
      if (!employee) {
        console.error(`Сотрудник с email ${email} не найден.`);
        process.exitCode = 1;
      } else {
        await setEmployeePasswordHashQuery(employee.id, await hashPassword(password));
        console.log(`Пароль для ${employee.name} (${email}) установлен.`);
      }
    } finally {
      await closeYdbConnection();
    }
  }
}
