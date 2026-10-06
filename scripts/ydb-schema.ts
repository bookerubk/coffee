import 'dotenv/config';
import { closeYdbConnection, ensureYdbSchema, ydbConfigProblem } from '../src/db/ydb.ts';

const configProblem = ydbConfigProblem();
if (configProblem) {
  console.error(configProblem);
  process.exitCode = 1;
} else {
  try {
    await ensureYdbSchema();
    console.log('YDB schema is ready.');
  } finally {
    await closeYdbConnection();
  }
}
