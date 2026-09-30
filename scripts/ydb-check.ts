import 'dotenv/config';
import { checkYdbConnection, closeYdbConnection } from '../src/db/ydb.ts';

try {
  await checkYdbConnection();
  console.log('YDB connection is healthy.');
} finally {
  await closeYdbConnection();
}
