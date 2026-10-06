import 'dotenv/config';
import { checkYdbConnection, closeYdbConnection, readEnv, ydbConfigProblem } from '../src/db/ydb.ts';

const configProblem = ydbConfigProblem();
if (configProblem) {
  console.error(configProblem);
  process.exitCode = 1;
} else {
  try {
    await checkYdbConnection();
    console.log(`YDB connection is healthy: ${readEnv('YDB_DATABASE')}`);
  } catch (error) {
    console.error('YDB connection failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await closeYdbConnection();
  }
}
