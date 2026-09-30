import 'dotenv/config';
import { checkYdbConnection, closeYdbConnection } from '../src/db/ydb.ts';

const required = ['YDB_ENDPOINT', 'YDB_DATABASE'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`Missing YDB configuration: ${missing.join(', ')}`);
  process.exitCode = 1;
} else {
  try {
    await checkYdbConnection();
    console.log(`YDB connection is healthy: ${process.env.YDB_DATABASE}`);
  } catch (error) {
    console.error('YDB connection failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await closeYdbConnection();
  }
}
