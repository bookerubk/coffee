import 'dotenv/config';
import { closeYdbConnection } from '../src/db/ydb.ts';
import { seedDatabaseIfEmpty } from '../src/db/queries.ts';

if (process.env.YDB_AUTO_SEED !== 'true') {
  console.log('YDB seed skipped. Set YDB_AUTO_SEED=true to enable it.');
} else {
  try {
    await seedDatabaseIfEmpty();
    console.log('YDB seed completed.');
  } catch (error) {
    console.error('YDB seed failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await closeYdbConnection();
  }
}
