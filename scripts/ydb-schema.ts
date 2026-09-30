import 'dotenv/config';
import { closeYdbConnection, ensureYdbSchema } from '../src/db/ydb.ts';

if (!process.env.YDB_ENDPOINT || !process.env.YDB_DATABASE) {
  console.error('Missing YDB_ENDPOINT or YDB_DATABASE.');
  process.exitCode = 1;
} else {
  try {
    await ensureYdbSchema();
    console.log('YDB schema is ready.');
  } finally {
    await closeYdbConnection();
  }
}
