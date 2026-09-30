import { Driver, getCredentialsFromEnv } from 'ydb-sdk';

declare global {
  var _ydbDriver: Driver | undefined;
}

function getConnectionString() {
  const endpoint = process.env.YDB_ENDPOINT;
  const database = process.env.YDB_DATABASE;
  if (!endpoint || !database) {
    throw new Error('YDB_ENDPOINT and YDB_DATABASE must be configured');
  }
  return `${endpoint}/?database=${encodeURIComponent(database)}`;
}

export function createYdbDriver() {
  if (!global._ydbDriver) {
    global._ydbDriver = new Driver({
      connectionString: getConnectionString(),
      authService: getCredentialsFromEnv(),
    });
  }
  return global._ydbDriver;
}

export async function checkYdbConnection() {
  const driver = createYdbDriver();
  return driver.ready(10_000);
}

export async function closeYdbConnection() {
  if (global._ydbDriver) {
    await global._ydbDriver.destroy();
    global._ydbDriver = undefined;
  }
}
