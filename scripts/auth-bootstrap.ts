import 'dotenv/config';
import { closeYdbConnection, ensureYdbSchema, ydbConfigProblem } from '../src/db/ydb.ts';
import { bootstrapAdminFromEnv } from '../src/auth/bootstrap.ts';

const configProblem = ydbConfigProblem();
if (configProblem) {
  console.error(configProblem);
  process.exitCode = 1;
} else if (!process.env.BOOTSTRAP_ADMIN_EMAIL || !process.env.BOOTSTRAP_ADMIN_PASSWORD) {
  console.error('Задайте BOOTSTRAP_ADMIN_EMAIL и BOOTSTRAP_ADMIN_PASSWORD (см. .env.example).');
  process.exitCode = 1;
} else {
  try {
    await ensureYdbSchema(); // заодно добавит колонку password_hash в существующую таблицу employees
    const result = await bootstrapAdminFromEnv();
    console.log(`Готово: ${result}.`);
  } finally {
    await closeYdbConnection();
  }
}
