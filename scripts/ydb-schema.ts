import 'dotenv/config';
import { closeYdbConnection, ensureYdbSchema } from '../src/db/ydb.ts';

if (!process.env.YDB_ENDPOINT?.trim() || !process.env.YDB_DATABASE?.trim() || !process.env.YDB_TOKEN?.trim()) {
  console.error('Missing YDB_ENDPOINT, YDB_DATABASE, or YDB_TOKEN.');
  process.exitCode = 1;
} else {
  try {
    await ensureYdbSchema();
    console.log('YDB schema is ready.');
  } finally {
    await closeYdbConnection();
  }
}
