import 'dotenv/config';
import { closeYdbConnection } from '../src/db/ydb.ts';
import { seedDatabaseIfEmpty } from '../src/db/queries.ts';

try {
  await seedDatabaseIfEmpty();
  console.log('YDB seed completed.');
} finally {
  await closeYdbConnection();
}
