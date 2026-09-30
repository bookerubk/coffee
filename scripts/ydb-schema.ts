import 'dotenv/config';
import { closeYdbConnection, ensureYdbSchema } from '../src/db/ydb.ts';

try {
  await ensureYdbSchema();
  console.log('YDB schema is ready.');
} finally {
  await closeYdbConnection();
}
