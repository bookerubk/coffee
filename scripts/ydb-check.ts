import 'dotenv/config';
import { checkYdbConnection, closeYdbConnection } from '../src/db/ydb.ts';

const required = ['YDB_ENDPOINT', 'YDB_DATABASE'];
const missing = required.filter((key) => !process.env[key]);
const authModes = [
  Boolean(process.env.YDB_TOKEN),
  Boolean(process.env.YDB_SERVICE_ACCOUNT_ID && process.env.YDB_KEY_ID && process.env.YDB_PRIVATE_KEY),
];
if (authModes.filter(Boolean).length > 1) {
  missing.push('use only one auth mode: YDB_TOKEN or service-account variables');
} else if (!authModes.some(Boolean)) {
  missing.push('YDB_TOKEN or YDB_SERVICE_ACCOUNT_ID/YDB_KEY_ID/YDB_PRIVATE_KEY');
}
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
