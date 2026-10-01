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

const ACCOUNT_ID_RE = /^[a-zA-Z0-9_-]{2,64}$/;
const SLOT_IDS = new Set(['morning', 'evening']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TRANSIT_REASONS = new Set(['not_delivered', 'damaged', 'spoiled', 'shortage', 'other']);
const MAX_QUANTITY = 1_000_000;
const MAX_PHOTO_LENGTH = 3_000_000; // ~2 МБ в base64

// Helper to get active tenant account id (приоритет: заголовок > query > body)
const getAccountId = (req: express.Request): string => {
  const candidate =
    (req.headers['x-account-id'] as string) ||
    (req.query.accountId as string) ||
    (req.body && req.body.accountId) ||
    'acc-aroma';
  return typeof candidate === 'string' && ACCOUNT_ID_RE.test(candidate) ? candidate : 'acc-aroma';
};

const isValidQuantity = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) <= MAX_QUANTITY;

/** Бросается из обработчиков, чтобы вернуть клиенту понятную ошибку 4xx. */
// (поле объявлено явно: `node server.ts` работает в strip-only режиме без parameter properties)
class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const sendError = (res: express.Response, error: any, fallback: string) => {
  if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
  console.error(fallback, error);
  return res.status(500).json({ error: error?.message || fallback });
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
    if (!account || !account.id || !account.name) {
      return res.status(400).json({ error: 'Необходимо указать ID и название аккаунта' });
    }
    if (!ACCOUNT_ID_RE.test(String(account.id))) {
      return res.status(400).json({ error: 'ID аккаунта: 2–64 символа, только латиница, цифры, «-» и «_».' });
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
    await upsertLegalEntityQuery({ ...req.body, accountId });
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
    await upsertWorkshopQuery({ ...req.body, accountId });
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
    await upsertDriverQuery({ ...req.body, accountId });
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
    await upsertPointQuery({ ...req.body, accountId });
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
    await upsertProductQuery({ ...req.body, accountId });
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
    await upsertEmployeeQuery({ ...req.body, accountId });
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
    await upsertSlotQuery({ ...req.body, accountId });
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
    const payload = req.body ?? {};
    const accountId = getAccountId(req);
    const isDraft = Boolean(payload.isDraft);

    if (!payload.pointId || typeof payload.pointId !== 'string') {
      throw new HttpError(400, 'Не указана точка заказа.');
    }
    if (!SLOT_IDS.has(payload.slotId)) throw new HttpError(400, 'Некорректный слот поставки.');
    if (!DATE_RE.test(String(payload.date))) throw new HttpError(400, 'Некорректная дата заказа.');
    if (!Array.isArray(payload.items)) throw new HttpError(400, 'Список позиций заказа обязателен.');

    // Validate non-negative integers
    for (const it of payload.items) {
      if (!isValidQuantity(it?.quantity)) {
        throw new HttpError(400, `Количество товара "${it?.name}" должно быть целым числом от 0 до ${MAX_QUANTITY}.`);
      }
    }
    const items = payload.items.filter((it: any) => it.quantity > 0);
    if (!isDraft && items.length === 0) throw new HttpError(400, 'Нельзя отправить пустую заявку.');

    // Idempotency: повторный запрос с тем же ключом не создаёт дубль.
    // Но черновик с этим ключом — не «уже отправленный заказ»: его нужно обновить
    // (повторное сохранение) или превратить в отправленный (иначе заявка навсегда
    // остаётся черновиком, хотя интерфейс сообщает об успешной отправке).
    let existing: any = null;
    if (payload.idempotencyKey) {
      existing = await findOrderByKeyQuery(payload.idempotencyKey, accountId);
      if (existing && existing.status !== 'draft') {
        return res.json({ success: true, order: existing, isDuplicate: true });
      }
    }

    // ID заказа всегда генерирует сервер: id — глобальный первичный ключ, и клиент
    // не должен иметь возможности перезаписать чужой заказ, передав его id.
    const orderId = existing?.id || `ord-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const nowIso = new Date().toISOString();

    const order = {
      id: orderId,
      accountId,
      idempotencyKey: payload.idempotencyKey,
      pointId: payload.pointId,
      pointName: payload.pointName,
      slotId: payload.slotId,
      date: payload.date,
      status: isDraft ? 'draft' : 'submitted',
      items,
      createdBy: payload.createdBy,
      createdAt: existing?.createdAt || nowIso,
      updatedAt: nowIso,
      submittedAt: isDraft ? null : nowIso,
    };

    await upsertOrderQuery(order);

    res.json({ success: true, order });
  } catch (error: any) {
    sendError(res, error, 'Failed to submit order');
  }
});

// Waybills (scoped to accountId)
const FINISHED_WAYBILL = new Set(['received', 'received_with_discrepancies']);

async function findWaybillOr404(accountId: string, id: string) {
  const waybills = await getWaybillsQuery(accountId);
  const waybill = waybills.find((w: any) => w.id === id);
  if (!waybill) throw new HttpError(404, 'Waybill not found');
  return waybill;
}

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
    const { date, slotId, workshopId } = req.body ?? {};
    const accountId = getAccountId(req);
    if (!DATE_RE.test(String(date))) throw new HttpError(400, 'Некорректная дата.');
    if (!SLOT_IDS.has(slotId)) throw new HttpError(400, 'Некорректный слот.');

    const allOrders = await getOrdersQuery(accountId);
    let slotOrders = allOrders.filter(
      (o: any) => o.date === date && o.slotId === slotId && o.status === 'submitted'
    );

    // Оператор цеха формирует накладные только по точкам своего цеха
    // (так же, как интерфейс показывает ему сводный заказ).
    if (workshopId) {
      const points = await getPointsQuery(accountId);
      const workshopPointIds = new Set(
        points.filter((p: any) => p.assignedWorkshopId === workshopId).map((p: any) => p.id)
      );
      if (workshopPointIds.size > 0) {
        slotOrders = slotOrders.filter((o: any) => workshopPointIds.has(o.pointId));
      }
    }

    // id накладной — глобальный первичный ключ, поэтому уникальность проверяем по всем аккаунтам.
    const allWaybills = await getWaybillsQuery('all');
    const existingWaybills = allWaybills.filter((w: any) => w.accountId === accountId);
    const usedIds = new Set(allWaybills.map((w: any) => w.id));
    const makeWaybillId = (pointId: string) => {
      const base = `WB-${date.replace(/-/g, '')}-${slotId.charAt(0).toUpperCase()}-${pointId.replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase()}`;
      let id = base;
      for (let n = 2; usedIds.has(id); n++) id = `${base}-${n}`;
      usedIds.add(id);
      return id;
    };

    for (const ord of slotOrders) {
      const alreadyHas = existingWaybills.some((w: any) => w.orderId === ord.id);
      if (alreadyHas) continue;

      const waybill = {
        id: makeWaybillId(ord.pointId),
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

      // Update order status to aggregated
      await upsertOrderQuery({ ...ord, status: 'aggregated' });
    }

    const updatedList = await getWaybillsQuery(accountId);
    res.json(updatedList.filter((w: any) => w.date === date && w.slotId === slotId));
  } catch (error: any) {
    sendError(res, error, 'Error generating waybills');
  }
});

app.put('/api/waybills/:id/dispatch', async (req, res) => {
  try {
    const { items, newStatus, operatorName, driverName, driverId, workshopId, legalEntityId } = req.body ?? {};
    const accountId = getAccountId(req);
    if (!Array.isArray(items)) throw new HttpError(400, 'Не переданы позиции накладной.');
    if (!['formed', 'packing', 'dispatched'].includes(newStatus)) {
      throw new HttpError(400, 'Недопустимый статус отгрузки.');
    }

    const waybill = await findWaybillOr404(accountId, req.params.id);
    if (FINISHED_WAYBILL.has(waybill.status)) {
      throw new HttpError(409, 'Накладная уже принята — изменить отгрузку нельзя.');
    }
    if (waybill.status === 'dispatched' && newStatus !== 'dispatched') {
      throw new HttpError(409, 'Накладная уже отгружена — вернуть её в сборку нельзя.');
    }

    // Validate quantities and reason for production discrepancy
    for (const it of items) {
      if (!isValidQuantity(it?.dispatchedQuantity)) {
        throw new HttpError(400, 'Отгруженное количество должно быть целым неотрицательным числом.');
      }
      const orig = waybill.items.find((x: any) => x.productId === it.productId);
      if (orig && orig.orderedQuantity !== it.dispatchedQuantity) {
        if (!it.dispatchDiscrepancyReason || !String(it.dispatchDiscrepancyReason).trim()) {
          throw new HttpError(400, `Укажите причину расхождения для "${orig.productName}".`);
        }
      }
    }

    waybill.items = waybill.items.map((orig: any) => {
      const updated = items.find((u: any) => u.productId === orig.productId);
      if (!updated) return orig;
      return {
        ...orig,
        dispatchedQuantity: updated.dispatchedQuantity,
        dispatchDiscrepancyReason: updated.dispatchDiscrepancyReason,
        // До приёмки «принято» по умолчанию равно «отгружено». Раньше старое значение
        // сохранялось даже после исправления отгрузки, и на приёмке появлялось ложное расхождение.
        receivedQuantity: updated.dispatchedQuantity,
      };
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
    sendError(res, error, 'Error updating dispatch');
  }
});

app.put('/api/waybills/:id/driver-status', async (req, res) => {
  try {
    const { status, driverName, driverId } = req.body ?? {};
    const accountId = getAccountId(req);
    // Водитель может только начать рейс; приёмку и прочие статусы ему менять нельзя.
    if (status !== undefined && status !== 'dispatched') {
      throw new HttpError(400, 'Водитель может только перевести накладную в статус «Отгружена (в пути)».');
    }

    const waybill = await findWaybillOr404(accountId, req.params.id);
    if (FINISHED_WAYBILL.has(waybill.status)) {
      throw new HttpError(409, 'Накладная уже принята — статус рейса изменить нельзя.');
    }

    if (driverName) waybill.driverName = driverName;
    if (driverId) waybill.driverId = driverId;
    if (status) waybill.status = status;

    await upsertWaybillQuery(waybill);
    res.json(waybill);
  } catch (error: any) {
    sendError(res, error, 'Error updating driver status');
  }
});

app.put('/api/waybills/:id/receive', async (req, res) => {
  try {
    const { items, supervisorName } = req.body ?? {};
    const accountId = getAccountId(req);
    if (!Array.isArray(items)) throw new HttpError(400, 'Не переданы позиции приёмки.');

    const waybill = await findWaybillOr404(accountId, req.params.id);
    if (waybill.status !== 'dispatched') {
      throw new HttpError(409, 'Принять можно только отгруженную накладную, которая ещё не принята.');
    }

    // Validate quantities and reasons
    for (const it of items) {
      const orig = waybill.items.find((x: any) => x.productId === it?.productId);
      if (!orig) throw new HttpError(400, 'В приёмке указана позиция, которой нет в накладной.');
      if (!isValidQuantity(it.receivedQuantity)) {
        throw new HttpError(400, `Принятое количество для "${orig.productName}" должно быть целым неотрицательным числом.`);
      }
      if (orig.dispatchedQuantity !== it.receivedQuantity) {
        if (!it.receiveDiscrepancyReason || !TRANSIT_REASONS.has(it.receiveDiscrepancyReason)) {
          throw new HttpError(400, `Выберите причину расхождения для позиции "${orig.productName}".`);
        }
        if (it.receiveDiscrepancyReason === 'other' && (!it.receiveDiscrepancyComment || !String(it.receiveDiscrepancyComment).trim())) {
          throw new HttpError(400, `При выборе «Другое» обязателен комментарий для "${orig.productName}".`);
        }
        if (it.receiveDiscrepancyPhoto !== undefined && it.receiveDiscrepancyPhoto !== null && it.receiveDiscrepancyPhoto !== '') {
          const photo = it.receiveDiscrepancyPhoto;
          if (typeof photo !== 'string' || !photo.startsWith('data:image/')) {
            throw new HttpError(400, `Фото для "${orig.productName}" должно быть изображением.`);
          }
          if (photo.length > MAX_PHOTO_LENGTH) {
            throw new HttpError(413, `Фото для "${orig.productName}" слишком большое (максимум ~2 МБ).`);
          }
        }
      }
    }

    waybill.items = waybill.items.map((orig: any) => {
      const updated = items.find((u: any) => u.productId === orig.productId);
      if (!updated) return orig;
      return {
        ...orig,
        receivedQuantity: updated.receivedQuantity,
        receiveDiscrepancyReason: updated.receiveDiscrepancyReason,
        receiveDiscrepancyComment: updated.receiveDiscrepancyComment,
        receiveDiscrepancyPhoto: updated.receiveDiscrepancyPhoto,
      };
    });

    // Расхождение считаем по всем позициям накладной, а не только по присланным
    const hasDiscrepancy = waybill.items.some(
      (i: any) => (i.receivedQuantity ?? i.dispatchedQuantity) !== i.dispatchedQuantity
    );
    waybill.status = hasDiscrepancy ? 'received_with_discrepancies' : 'received';
    waybill.receivedAt = new Date().toISOString();
    waybill.receivedBy = supervisorName;

    await upsertWaybillQuery(waybill);
    res.json(waybill);
  } catch (error: any) {
    sendError(res, error, 'Error updating receive');
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

// Неизвестные маршруты API — JSON 404 (а не index.html от SPA-fallback)
app.use('/api', (req, res) => {
  res.status(404).json({ error: `Маршрут не найден: ${req.method} ${req.originalUrl}` });
});

// Ошибки парсинга/размера тела запроса — JSON вместо HTML-страницы Express
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) return next(err);
  const status = err?.status || err?.statusCode || 500;
  const message =
    status === 413
      ? 'Слишком большой запрос (например, фото).'
      : status < 500
        ? 'Некорректный запрос.'
        : 'Внутренняя ошибка сервера.';
  if (status >= 500) console.error('Unhandled error:', err);
  res.status(status).json({ error: message });
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
    app.get(/^(?!\/api\/).*/, (req, res) => {
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
