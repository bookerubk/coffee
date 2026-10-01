import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { ensureYdbSchema } from './src/db/ydb.ts';
import {
  seedDatabaseIfEmpty,
  getPointsQuery,
  upsertPointQuery,
  getProductsQuery,
  upsertProductQuery,
  getEmployeesQuery,
  upsertEmployeeQuery,
  getSlotsQuery,
  upsertSlotQuery,
  getOrdersQuery,
  findOrderByKeyQuery,
  upsertOrderQuery,
  getWaybillsQuery,
  upsertWaybillQuery,
  getLegalEntitiesQuery,
  upsertLegalEntityQuery,
  getWorkshopsQuery,
  upsertWorkshopQuery,
  getDriversQuery,
  upsertDriverQuery,
  getTenantAccountsQuery,
  upsertTenantAccountQuery,
} from './src/db/queries.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: '15mb' }));

// Helper to get active tenant account id
const getAccountId = (req: express.Request): string => {
  return (
    (req.headers['x-account-id'] as string) ||
    (req.query.accountId as string) ||
    (req.body && req.body.accountId) ||
    'acc-aroma'
  );
};

// Health / database check
app.get('/api/health', (req, res) => {
  const databaseConfigured = Boolean(process.env.YDB_ENDPOINT && process.env.YDB_DATABASE);
  res.status(200).json({
    status: 'ok',
    database: 'ydb',
    databaseConfigured,
    timestamp: new Date().toISOString(),
  });
});

// Server Time API with Timezone support
app.get('/api/time', (req, res) => {
  const now = new Date();
  const targetTz = (req.query.tz as string) || 'Europe/Moscow';

  let timeFormatted = '';
  let dateFormatted = '';
  let timezoneLabel = 'МСК (UTC+3)';

  try {
    const timeFormatter = new Intl.DateTimeFormat('ru-RU', {
      timeZone: targetTz,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    timeFormatted = timeFormatter.format(now);

    const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
      timeZone: targetTz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    dateFormatted = dateFormatter.format(now);

    if (targetTz === 'Europe/Moscow') {
      timezoneLabel = 'МСК (UTC+3)';
    } else {
      timezoneLabel = targetTz;
    }
  } catch {
    timeFormatted = now.toISOString().substring(11, 19);
    dateFormatted = now.toISOString().substring(0, 10);
    timezoneLabel = 'UTC';
  }

  res.json({
    iso: now.toISOString(),
    timestamp: now.getTime(),
    timezone: targetTz,
    timezoneLabel,
    timeFormatted,
    dateFormatted,
    utcTime: now.toISOString().substring(11, 19),
  });
});

// Tenant Accounts API (Multi-tenant Databases)
app.get('/api/accounts', async (req, res) => {
  try {
    const list = await getTenantAccountsQuery();
    res.json(list);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error fetching tenant accounts' });
  }
});

app.post('/api/accounts', async (req, res) => {
  try {
    const account = req.body;
    if (!account.id || !account.name) {
      return res.status(400).json({ error: 'Необходимо указать ID и название аккаунта' });
    }
    await upsertTenantAccountQuery(account);
    res.json({ success: true, account });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error saving tenant account' });
  }
});

// Handbooks API (scoped to accountId)
app.get('/api/handbooks', async (req, res) => {
  try {
    const accountId = getAccountId(req);
    const [
      pointsRes,
      productsRes,
      employeesRes,
      slotsRes,
      legalEntitiesRes,
      workshopsRes,
      driversRes,
      accountsRes,
    ] = await Promise.allSettled([
      getPointsQuery(accountId),
      getProductsQuery(accountId),
      getEmployeesQuery(accountId),
      getSlotsQuery(accountId),
      getLegalEntitiesQuery(accountId),
      getWorkshopsQuery(accountId),
      getDriversQuery(accountId),
      getTenantAccountsQuery(),
    ]);

    res.json({
      points: pointsRes.status === 'fulfilled' ? pointsRes.value : [],
      products: productsRes.status === 'fulfilled' ? productsRes.value : [],
      employees: employeesRes.status === 'fulfilled' ? employeesRes.value : [],
      slots: slotsRes.status === 'fulfilled' ? slotsRes.value : [],
      legalEntities: legalEntitiesRes.status === 'fulfilled' ? legalEntitiesRes.value : [],
      workshops: workshopsRes.status === 'fulfilled' ? workshopsRes.value : [],
      drivers: driversRes.status === 'fulfilled' ? driversRes.value : [],
      accounts: accountsRes.status === 'fulfilled' ? accountsRes.value : [],
    });
  } catch (error: any) {
    console.error('Failed to get handbooks:', error);
    res.status(500).json({ error: error.message || 'Database error fetching handbooks' });
  }
});

// Legal Entities (scoped to accountId)
app.get('/api/legal-entities', async (req, res) => {
  try {
    const accountId = getAccountId(req);
    const list = await getLegalEntitiesQuery(accountId);
    res.json(list);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error fetching legal entities' });
  }
});

app.post('/api/legal-entities', async (req, res) => {
  try {
    const accountId = getAccountId(req);
    await upsertLegalEntityQuery({ ...req.body, accountId: req.body.accountId || accountId });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error saving legal entity' });
  }
});

// Workshops (scoped to accountId)
app.get('/api/workshops', async (req, res) => {
  try {
    const accountId = getAccountId(req);
    const list = await getWorkshopsQuery(accountId);
    res.json(list);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error fetching workshops' });
  }
});

app.post('/api/workshops', async (req, res) => {
  try {
    const accountId = getAccountId(req);
    await upsertWorkshopQuery({ ...req.body, accountId: req.body.accountId || accountId });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error saving workshop' });
  }
});

// Drivers (scoped to accountId)
app.get('/api/drivers', async (req, res) => {
  try {
    const accountId = getAccountId(req);
    const list = await getDriversQuery(accountId);
    res.json(list);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error fetching drivers' });
  }
});

app.post('/api/drivers', async (req, res) => {
  try {
    const accountId = getAccountId(req);
    await upsertDriverQuery({ ...req.body, accountId: req.body.accountId || accountId });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error saving driver' });
  }
});

// Points (scoped to accountId)
app.get('/api/points', async (req, res) => {
  try {
    const accountId = getAccountId(req);
    const points = await getPointsQuery(accountId);
    res.json(points);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error fetching points' });
  }
});

app.post('/api/points', async (req, res) => {
  try {
    const accountId = getAccountId(req);
    await upsertPointQuery({ ...req.body, accountId: req.body.accountId || accountId });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error saving point' });
  }
});

// Products (scoped to accountId)
app.get('/api/products', async (req, res) => {
  try {
    const accountId = getAccountId(req);
    const products = await getProductsQuery(accountId);
    res.json(products);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error fetching products' });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const accountId = getAccountId(req);
    await upsertProductQuery({ ...req.body, accountId: req.body.accountId || accountId });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error saving product' });
  }
});

// Employees (scoped to accountId)
app.get('/api/employees', async (req, res) => {
  try {
    const accountId = getAccountId(req);
    const employees = await getEmployeesQuery(accountId);
    res.json(employees);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error fetching employees' });
  }
});

app.post('/api/employees', async (req, res) => {
  try {
    const accountId = getAccountId(req);
    await upsertEmployeeQuery({ ...req.body, accountId: req.body.accountId || accountId });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error saving employee' });
  }
});

// Slots (scoped to accountId)
app.get('/api/slots', async (req, res) => {
  try {
    const accountId = getAccountId(req);
    const slots = await getSlotsQuery(accountId);
    res.json(slots);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error fetching slots' });
  }
});

app.post('/api/slots', async (req, res) => {
  try {
    const accountId = getAccountId(req);
    await upsertSlotQuery({ ...req.body, accountId: req.body.accountId || accountId });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error saving slot' });
  }
});

// Orders (scoped to accountId)
app.get('/api/orders', async (req, res) => {
  try {
    const accountId = getAccountId(req);
    const orders = await getOrdersQuery(accountId);
    res.json(orders);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error fetching orders' });
  }
});

app.get('/api/orders/previous/:pointId', async (req, res) => {
  try {
    const accountId = getAccountId(req);
    const orders = await getOrdersQuery(accountId);
    const pointOrders = orders
      .filter((o: any) => o.pointId === req.params.pointId && o.status !== 'draft')
      .sort((a: any, b: any) => new Date(b.submittedAt || b.createdAt).getTime() - new Date(a.submittedAt || a.createdAt).getTime());
    res.json(pointOrders[0] || null);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error fetching previous order' });
  }
});

app.post('/api/orders', async (req, res) => {
  try {
    const payload = req.body;
    const accountId = payload.accountId || getAccountId(req);

    // Validate non-negative integers
    for (const it of payload.items || []) {
      if (!Number.isInteger(it.quantity) || it.quantity < 0) {
        return res.status(400).json({
          error: `Количество товара "${it.name}" должно быть целым неотрицательным числом.`,
        });
      }
    }

    // Check Idempotency Key in YDB
    if (payload.idempotencyKey) {
      const existing = await findOrderByKeyQuery(payload.idempotencyKey, accountId);
      if (existing) {
        return res.json({ success: true, order: existing, isDuplicate: true });
      }
    }

    const orderId = payload.orderId || `ord-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const nowIso = new Date().toISOString();

    const order = {
      id: orderId,
      accountId,
      idempotencyKey: payload.idempotencyKey,
      pointId: payload.pointId,
      pointName: payload.pointName,
      slotId: payload.slotId,
      date: payload.date,
      status: payload.isDraft ? 'draft' : 'submitted',
      items: (payload.items || []).filter((it: any) => it.quantity > 0),
      createdBy: payload.createdBy,
      createdAt: nowIso,
      updatedAt: nowIso,
      submittedAt: payload.isDraft ? null : nowIso,
    };

    await upsertOrderQuery(order);

    res.json({ success: true, order });
  } catch (error: any) {
    console.error('Failed to submit order:', error);
    res.status(500).json({ error: error.message || 'Failed to submit order to YDB' });
  }
});

// Waybills (scoped to accountId)
app.get('/api/waybills', async (req, res) => {
  try {
    const accountId = getAccountId(req);
    const waybills = await getWaybillsQuery(accountId);
    res.json(waybills);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error fetching waybills' });
  }
});

app.post('/api/waybills/generate', async (req, res) => {
  try {
    const { date, slotId } = req.body;
    const accountId = req.body.accountId || getAccountId(req);
    const allOrders = await getOrdersQuery(accountId);
    const slotOrders = allOrders.filter(
      (o: any) => o.date === date && o.slotId === slotId && o.status === 'submitted'
    );

    const existingWaybills = await getWaybillsQuery(accountId);
    const created: any[] = [];

    for (const ord of slotOrders) {
      const alreadyHas = existingWaybills.some((w: any) => w.orderId === ord.id);
      if (!alreadyHas) {
        const waybill = {
          id: `WB-${date.replace(/-/g, '')}-${slotId.charAt(0).toUpperCase()}-${ord.pointId.replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase()}`,
          accountId,
          orderId: ord.id,
          pointId: ord.pointId,
          pointName: ord.pointName,
          date,
          slotId,
          status: 'formed',
          createdAt: new Date().toISOString(),
          items: ord.items.map((it: any) => ({
            productId: it.productId,
            sku: it.sku,
            productName: it.name,
            unit: it.unit,
            category: it.category,
            orderedQuantity: it.quantity,
            dispatchedQuantity: it.quantity,
          })),
        };

        await upsertWaybillQuery(waybill);
        created.push(waybill);

        // Update order status to aggregated
        ord.status = 'aggregated';
        await upsertOrderQuery(ord);
      }
    }

    const updatedList = await getWaybillsQuery(accountId);
    res.json(updatedList.filter((w: any) => w.date === date && w.slotId === slotId));
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error generating waybills' });
  }
});

app.put('/api/waybills/:id/dispatch', async (req, res) => {
  try {
    const { items, newStatus, operatorName, driverName, driverId, workshopId, legalEntityId } = req.body;
    const accountId = req.body.accountId || getAccountId(req);
    const waybills = await getWaybillsQuery(accountId);
    const waybill = waybills.find((w: any) => w.id === req.params.id);
    if (!waybill) return res.status(404).json({ error: 'Waybill not found' });

    // Validate reason for production discrepancy
    for (const it of items) {
      const orig = waybill.items.find((x: any) => x.productId === it.productId);
      if (orig && orig.orderedQuantity !== it.dispatchedQuantity) {
        if (!it.dispatchDiscrepancyReason || !it.dispatchDiscrepancyReason.trim()) {
          return res.status(400).json({
            error: `Укажите причину расхождения для "${orig.productName}".`,
          });
        }
      }
    }

    waybill.items = waybill.items.map((orig: any) => {
      const updated = items.find((u: any) => u.productId === orig.productId);
      if (updated) {
        return {
          ...orig,
          dispatchedQuantity: updated.dispatchedQuantity,
          dispatchDiscrepancyReason: updated.dispatchDiscrepancyReason,
          receivedQuantity: orig.receivedQuantity !== undefined ? orig.receivedQuantity : updated.dispatchedQuantity,
        };
      }
      return orig;
    });

    waybill.status = newStatus;
    if (newStatus === 'dispatched') {
      waybill.dispatchedAt = new Date().toISOString();
      waybill.dispatchedBy = operatorName;
      if (driverName) waybill.driverName = driverName;
      if (driverId) waybill.driverId = driverId;
      if (workshopId) waybill.workshopId = workshopId;
      if (legalEntityId) waybill.legalEntityId = legalEntityId;
    }

    await upsertWaybillQuery(waybill);
    res.json(waybill);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error updating dispatch' });
  }
});

app.put('/api/waybills/:id/driver-status', async (req, res) => {
  try {
    const { status, driverName, driverId } = req.body;
    const accountId = req.body.accountId || getAccountId(req);
    const waybills = await getWaybillsQuery(accountId);
    const waybill = waybills.find((w: any) => w.id === req.params.id);
    if (!waybill) return res.status(404).json({ error: 'Waybill not found' });

    if (driverName) waybill.driverName = driverName;
    if (driverId) waybill.driverId = driverId;
    if (status) waybill.status = status;

    await upsertWaybillQuery(waybill);
    res.json(waybill);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error updating driver status' });
  }
});

app.put('/api/waybills/:id/receive', async (req, res) => {
  try {
    const { items, supervisorName } = req.body;
    const accountId = req.body.accountId || getAccountId(req);
    const waybills = await getWaybillsQuery(accountId);
    const waybill = waybills.find((w: any) => w.id === req.params.id);
    if (!waybill) return res.status(404).json({ error: 'Waybill not found' });

    let hasDiscrepancy = false;

    // Validate reasons
    for (const it of items) {
      const orig = waybill.items.find((x: any) => x.productId === it.productId);
      if (orig && orig.dispatchedQuantity !== it.receivedQuantity) {
        hasDiscrepancy = true;
        if (!it.receiveDiscrepancyReason) {
          return res.status(400).json({
            error: `Выберите причину расхождения для позиции "${orig.productName}".`,
          });
        }
        if (it.receiveDiscrepancyReason === 'other' && (!it.receiveDiscrepancyComment || !it.receiveDiscrepancyComment.trim())) {
          return res.status(400).json({
            error: `При выборе «Другое» обязателен комментарий для "${orig.productName}".`,
          });
        }
      }
    }

    waybill.items = waybill.items.map((orig: any) => {
      const updated = items.find((u: any) => u.productId === orig.productId);
      if (updated) {
        return {
          ...orig,
          receivedQuantity: updated.receivedQuantity,
          receiveDiscrepancyReason: updated.receiveDiscrepancyReason,
          receiveDiscrepancyComment: updated.receiveDiscrepancyComment,
          receiveDiscrepancyPhoto: updated.receiveDiscrepancyPhoto,
        };
      }
      return orig;
    });

    waybill.status = hasDiscrepancy ? 'received_with_discrepancies' : 'received';
    waybill.receivedAt = new Date().toISOString();
    waybill.receivedBy = supervisorName;

    await upsertWaybillQuery(waybill);
    res.json(waybill);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error updating receive' });
  }
});

// Seed / Reset
app.post('/api/reset', async (req, res) => {
  try {
    await seedDatabaseIfEmpty();
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error resetting data' });
  }
});

// Vite Middleware for Dev / Static for Prod
async function startServer() {
  // Seed only when a database is explicitly configured. This keeps the
  // preview and Vercel process healthy before YDB variables are added.
  const databaseConfigured = Boolean(process.env.YDB_ENDPOINT && process.env.YDB_DATABASE);
  if (databaseConfigured) {
    if (process.env.YDB_AUTO_SCHEMA === 'true') {
      ensureYdbSchema().catch((err) => console.error('YDB schema initialization error:', err));
    }
    if (process.env.YDB_AUTO_SEED === 'true') {
      seedDatabaseIfEmpty().catch((err) => {
        console.error('Initial seed error:', err);
      });
    }
  } else {
    console.warn('Database is not configured; starting without automatic seeding.');
  }

  const isProd = process.env.NODE_ENV === 'production';
  if (isProd) {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: {
      middlewareMode: true,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on http://0.0.0.0:${PORT} (${databaseConfigured ? 'database configured' : 'database not configured'})`);
  });
}

if (process.env.VERCEL !== '1') {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
  });
}
