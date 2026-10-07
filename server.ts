import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { ensureYdbSchema, selectYdbRows, YDB_TABLES, ydbConfigProblem } from './src/db/ydb.ts';
import { HttpError, sendError } from './src/http-errors.ts';
import { authRouter } from './src/auth/routes.ts';
import { requireAuth, requireRole, sameOriginGuard, securityHeaders } from './src/auth/middleware.ts';
import { ROLES } from './src/auth/types.ts';
import type { AuthUser } from './src/auth/types.ts';
import {
  canAccessOrder,
  canAccessPoint,
  canAccessWaybill,
  requiresDeliveryConfirmation,
  resolveDriverId,
  supervisorPointIds,
} from './src/auth/access.ts';
import type { AccessContext } from './src/auth/access.ts';
import { getAuthSecret, hashPassword, validatePassword } from './src/auth/crypto.ts';
import { bootstrapAdminFromEnv } from './src/auth/bootstrap.ts';
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
  findEmployeeAuthByEmailQuery,
} from './src/db/queries.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// За reverse-proxy (Vercel, nginx) IP клиента берётся из X-Forwarded-For — нужно для ограничения попыток входа
if (process.env.VERCEL || process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1);

app.use(securityHeaders);
// Неаутентифицированные эндпоинты входа принимают только маленькие тела
app.use('/api/auth', express.json({ limit: '10kb' }));
app.use(express.json({ limit: '15mb' }));
app.use('/api', sameOriginGuard);

const ACCOUNT_ID_RE = /^[a-zA-Z0-9_-]{2,64}$/;
const SLOT_IDS = new Set(['morning', 'evening']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TRANSIT_REASONS = new Set(['not_delivered', 'damaged', 'spoiled', 'shortage', 'other']);
const MAX_QUANTITY = 1_000_000;
const MAX_PHOTO_LENGTH = 3_000_000; // ~2 МБ в base64

// Аккаунт (тенант) определяется ТОЛЬКО по аутентифицированному пользователю.
// Заголовок x-account-id, query и body для этого больше не используются.
const getAccountId = (req: express.Request): string => req.user!.accountId;

const isValidQuantity = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) <= MAX_QUANTITY;

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

// На Vercel сервер не запускается как процесс, и схема БД сама не обновляется. Если включён YDB_AUTO_SCHEMA=true,
// первый запрос каждого экземпляра функции один раз проверяет схему: создаёт недостающие таблицы и добавляет
// новые колонки (миграции идемпотентны). Без этого после обновления с новыми колонками записи падали бы
// до ручного `npm run ydb:schema`.
let schemaReady: Promise<void> | undefined;
app.use('/api', async (_req, _res, next) => {
  if (process.env.YDB_AUTO_SCHEMA === 'true' && process.env.VERCEL === '1' && !ydbConfigProblem()) {
    schemaReady ??= ensureYdbSchema().catch((error) => {
      console.error('Автоматическое обновление схемы БД не удалось:', error);
      schemaReady = undefined; // следующий запрос попробует снова
    });
    await schemaReady;
  }
  next();
});

// ---------------------------------------------------------------------------
// Всё, что выше, — публичное (health, time, вход). Всё, что ниже, требует входа в систему.
// ---------------------------------------------------------------------------
app.use('/api/auth', authRouter);
app.use('/api', requireAuth);

// ---------------------------------------------------------------------------
// Общие помощники авторизации
// ---------------------------------------------------------------------------
const adminOnly = requireRole('admin');

async function loadAccessContext(accountId: string): Promise<AccessContext> {
  const [points, drivers] = await Promise.all([getPointsQuery(accountId), getDriversQuery(accountId)]);
  return { points, drivers };
}

/**
 * id во всех таблицах — глобальный первичный ключ. Без этой проверки администратор одного
 * аккаунта мог бы перезаписать запись другого аккаунта, прислав её id.
 */
async function assertRecordOwnership(table: string, id: string, accountId: string) {
  const rows = await selectYdbRows(table, { id });
  const owner = rows[0] ? String((rows[0] as any).account_id || 'acc-aroma') : null;
  if (owner && owner !== accountId) throw new HttpError(409, 'Запись с таким id уже существует.');
}

function requireRecordId(body: any): string {
  if (!body || typeof body !== 'object' || typeof body.id !== 'string' || !body.id.trim() || body.id.length > 100) {
    throw new HttpError(400, 'Не указан id записи.');
  }
  return body.id;
}

/** Остальным ролям не нужны контакты коллег — отдаём только рабочие поля. */
const publicEmployee = (e: any) => ({
  id: e.id,
  accountId: e.accountId,
  name: e.name,
  role: e.role,
  pointId: e.pointId,
  workshopId: e.workshopId,
  driverId: e.driverId,
  archived: e.archived,
});
const employeesFor = (user: AuthUser, list: any[]) => (user.role === 'admin' ? list : list.map(publicEmployee));
const pointsFor = (user: AuthUser, list: any[]) => {
  if (user.role !== 'shift_supervisor') return list;
  const ids = supervisorPointIds(user, list);
  return list.filter((p) => ids.has(p.id));
};
const driversFor = (user: AuthUser, list: any[]) => {
  if (user.role === 'admin' || user.role === 'production_operator') return list;
  if (user.role === 'driver') {
    const id = resolveDriverId(user, list);
    return list.filter((d) => d.id === id);
  }
  return [];
};

// ---------------------------------------------------------------------------
// Аккаунт компании
// ---------------------------------------------------------------------------
const minimalAccount = (a: any) => ({ id: a.id, name: a.name, dbSchema: '', inn: '', adminEmail: '' });

app.get('/api/accounts', async (req, res) => {
  try {
    const user = req.user!;
    const list = (await getTenantAccountsQuery()).filter((a: any) => a.id === user.accountId);
    res.json(user.role === 'admin' ? list : list.map(minimalAccount));
  } catch (error: any) {
    sendError(res, error, 'Не удалось получить аккаунт компании.');
  }
});

app.post('/api/accounts', adminOnly, async (req, res) => {
  try {
    const account = req.body;
    if (!account || !account.id || !account.name) {
      throw new HttpError(400, 'Необходимо указать ID и название аккаунта');
    }
    if (!ACCOUNT_ID_RE.test(String(account.id))) {
      throw new HttpError(400, 'ID аккаунта: 2–64 символа, только латиница, цифры, «-» и «_».');
    }
    // Администратор правит только профиль своей компании. Новые аккаунты (тенанты)
    // создаёт оператор платформы — см. BOOTSTRAP_ADMIN_* в .env.example.
    if (account.id !== req.user!.accountId) {
      throw new HttpError(403, 'Создавать и изменять чужие аккаунты нельзя.');
    }
    await upsertTenantAccountQuery(account);
    res.json({ success: true, account });
  } catch (error: any) {
    sendError(res, error, 'Не удалось сохранить аккаунт компании.');
  }
});

// ---------------------------------------------------------------------------
// Справочники (чтение — по ролям, запись — только администратор)
// ---------------------------------------------------------------------------
app.get('/api/handbooks', async (req, res) => {
  try {
    const user = req.user!;
    const accountId = user.accountId;
    const isAdmin = user.role === 'admin';
    const results = await Promise.allSettled([
      getPointsQuery(accountId),
      getProductsQuery(accountId),
      getEmployeesQuery(accountId),
      getSlotsQuery(accountId),
      getLegalEntitiesQuery(accountId),
      getWorkshopsQuery(accountId),
      getDriversQuery(accountId),
      getTenantAccountsQuery(),
    ]);
    results.forEach((r) => {
      if (r.status === 'rejected') console.error('Handbooks query failed:', r.reason);
    });
    const pick = (i: number): any[] => {
      const r = results[i];
      return r.status === 'fulfilled' ? (r.value as any[]) : [];
    };
    const accounts = pick(7).filter((a) => a.id === accountId);

    res.json({
      points: pointsFor(user, pick(0)),
      products: pick(1),
      employees: employeesFor(user, pick(2)),
      slots: pick(3),
      legalEntities: isAdmin ? pick(4) : [],
      workshops: isAdmin ? pick(5) : [],
      drivers: driversFor(user, pick(6)),
      accounts: isAdmin ? accounts : accounts.map(minimalAccount),
    });
  } catch (error: any) {
    sendError(res, error, 'Не удалось загрузить справочники.');
  }
});

/** Регистрирует POST-маршрут сохранения справочника (только администратор). */
function registerHandbookSave(
  route: string,
  table: string,
  label: string,
  save: (record: any) => Promise<unknown>,
) {
  app.post(route, adminOnly, async (req, res) => {
    try {
      const accountId = getAccountId(req);
      const id = requireRecordId(req.body);
      await assertRecordOwnership(table, id, accountId);
      await save({ ...req.body, accountId });
      res.json({ success: true });
    } catch (error: any) {
      sendError(res, error, `Не удалось сохранить: ${label}.`);
    }
  });
}

app.get('/api/legal-entities', adminOnly, async (req, res) => {
  try {
    res.json(await getLegalEntitiesQuery(getAccountId(req)));
  } catch (error: any) {
    sendError(res, error, 'Не удалось получить юридические лица.');
  }
});
registerHandbookSave('/api/legal-entities', YDB_TABLES.legalEntities, 'юридическое лицо', upsertLegalEntityQuery);

app.get('/api/workshops', adminOnly, async (req, res) => {
  try {
    res.json(await getWorkshopsQuery(getAccountId(req)));
  } catch (error: any) {
    sendError(res, error, 'Не удалось получить цеха.');
  }
});
registerHandbookSave('/api/workshops', YDB_TABLES.workshops, 'цех', upsertWorkshopQuery);

app.get('/api/drivers', async (req, res) => {
  try {
    res.json(driversFor(req.user!, await getDriversQuery(getAccountId(req))));
  } catch (error: any) {
    sendError(res, error, 'Не удалось получить водителей.');
  }
});
registerHandbookSave('/api/drivers', YDB_TABLES.drivers, 'водителя', upsertDriverQuery);

const DRIVER_STATUSES = new Set(['active', 'on_route', 'day_off']);

// Водитель меняет только статус своей смены (а не всю карточку водителя)
app.put('/api/drivers/me/status', requireRole('driver'), async (req, res) => {
  try {
    const { status } = req.body ?? {};
    if (!DRIVER_STATUSES.has(status)) throw new HttpError(400, 'Недопустимый статус смены.');
    const user = req.user!;
    const drivers = await getDriversQuery(user.accountId);
    const driverId = resolveDriverId(user, drivers);
    const driver = drivers.find((d: any) => d.id === driverId);
    if (!driver) throw new HttpError(404, 'Профиль водителя не найден. Обратитесь к администратору.');
    await upsertDriverQuery({ ...driver, accountId: user.accountId, status });
    res.json({ success: true, driver: { ...driver, status } });
  } catch (error: any) {
    sendError(res, error, 'Не удалось обновить статус смены.');
  }
});

app.get('/api/points', async (req, res) => {
  try {
    res.json(pointsFor(req.user!, await getPointsQuery(getAccountId(req))));
  } catch (error: any) {
    sendError(res, error, 'Не удалось получить кофейни.');
  }
});
registerHandbookSave('/api/points', YDB_TABLES.coffeePoints, 'кофейню', upsertPointQuery);

app.get('/api/products', async (req, res) => {
  try {
    res.json(await getProductsQuery(getAccountId(req)));
  } catch (error: any) {
    sendError(res, error, 'Не удалось получить товары.');
  }
});
registerHandbookSave('/api/products', YDB_TABLES.products, 'товар', upsertProductQuery);

app.get('/api/employees', async (req, res) => {
  try {
    res.json(employeesFor(req.user!, await getEmployeesQuery(getAccountId(req))));
  } catch (error: any) {
    sendError(res, error, 'Не удалось получить сотрудников.');
  }
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.post('/api/employees', adminOnly, async (req, res) => {
  try {
    const admin = req.user!;
    const accountId = admin.accountId;
    const id = requireRecordId(req.body);
    // password / passwordHash / hasPassword из тела запроса никогда не попадают в запись как есть
    const { password, passwordHash: _ignoredHash, hasPassword: _ignoredFlag, ...fields } = req.body;

    if (typeof fields.name !== 'string' || !fields.name.trim() || fields.name.length > 200) {
      throw new HttpError(400, 'Укажите имя сотрудника.');
    }
    if (!ROLES.includes(fields.role)) throw new HttpError(400, 'Недопустимая роль сотрудника.');

    let email: string | undefined;
    if (fields.email !== undefined && fields.email !== null && String(fields.email).trim() !== '') {
      email = String(fields.email).trim().toLowerCase();
      if (email.length > 254 || !EMAIL_RE.test(email)) throw new HttpError(400, 'Некорректный email.');
      const holder = await findEmployeeAuthByEmailQuery(email);
      if (holder && holder.id !== id) throw new HttpError(409, 'Этот email уже используется другим сотрудником.');
    }

    // Защита от потери доступа: администратор не может разжаловать или заархивировать себя
    if (id === admin.id && (fields.role !== 'admin' || fields.archived === true)) {
      throw new HttpError(400, 'Нельзя изменить свою роль или архивировать собственную учётную запись.');
    }

    let newPasswordHash: string | undefined;
    if (password !== undefined && password !== null && password !== '') {
      const weak = validatePassword(password);
      if (weak) throw new HttpError(400, weak);
      if (!email) throw new HttpError(400, 'Чтобы задать пароль, укажите email сотрудника.');
      newPasswordHash = await hashPassword(password);
    }

    await assertRecordOwnership(YDB_TABLES.employees, id, accountId);
    await upsertEmployeeQuery({ ...fields, id, email, accountId, passwordHash: newPasswordHash });
    res.json({ success: true });
  } catch (error: any) {
    sendError(res, error, 'Не удалось сохранить сотрудника.');
  }
});

// Slots (scoped to accountId)
app.get('/api/slots', async (req, res) => {
  try {
    res.json(await getSlotsQuery(getAccountId(req)));
  } catch (error: any) {
    sendError(res, error, 'Не удалось получить настройки смен.');
  }
});

app.post('/api/slots', adminOnly, async (req, res) => {
  try {
    if (!SLOT_IDS.has(req.body?.id)) throw new HttpError(400, 'Некорректный слот.');
    await upsertSlotQuery({ ...req.body, accountId: getAccountId(req) });
    res.json({ success: true });
  } catch (error: any) {
    sendError(res, error, 'Не удалось сохранить настройки смены.');
  }
});

// ---------------------------------------------------------------------------
// Заказы
// ---------------------------------------------------------------------------
app.get('/api/orders', requireRole('admin', 'production_operator', 'shift_supervisor'), async (req, res) => {
  try {
    const user = req.user!;
    const [orders, ctx] = await Promise.all([getOrdersQuery(user.accountId), loadAccessContext(user.accountId)]);
    res.json(orders.filter((o: any) => canAccessOrder(user, o, ctx)));
  } catch (error: any) {
    sendError(res, error, 'Не удалось получить заказы.');
  }
});

app.get('/api/orders/previous/:pointId', requireRole('admin', 'shift_supervisor'), async (req, res) => {
  try {
    const user = req.user!;
    const ctx = await loadAccessContext(user.accountId);
    if (!canAccessPoint(user, req.params.pointId, ctx)) throw new HttpError(403, 'Нет доступа к этой кофейне.');
    const orders = await getOrdersQuery(user.accountId);
    const pointOrders = orders
      .filter((o: any) => o.pointId === req.params.pointId && o.status !== 'draft')
      .sort((a: any, b: any) => new Date(b.submittedAt || b.createdAt).getTime() - new Date(a.submittedAt || a.createdAt).getTime());
    res.json(pointOrders[0] || null);
  } catch (error: any) {
    sendError(res, error, 'Не удалось получить предыдущий заказ.');
  }
});

app.post('/api/orders', requireRole('admin', 'shift_supervisor'), async (req, res) => {
  try {
    const user = req.user!;
    const payload = req.body ?? {};
    const accountId = user.accountId;
    const isDraft = Boolean(payload.isDraft);

    if (!payload.pointId || typeof payload.pointId !== 'string') {
      throw new HttpError(400, 'Не указана точка заказа.');
    }
    if (!SLOT_IDS.has(payload.slotId)) throw new HttpError(400, 'Некорректный слот поставки.');
    if (!DATE_RE.test(String(payload.date))) throw new HttpError(400, 'Некорректная дата заказа.');
    if (!Array.isArray(payload.items)) throw new HttpError(400, 'Список позиций заказа обязателен.');

    // Старший смены оформляет заказы только для своих кофеен
    const points = await getPointsQuery(accountId);
    if (user.role === 'shift_supervisor' && !supervisorPointIds(user, points).has(payload.pointId)) {
      throw new HttpError(403, 'Нет доступа к этой кофейне.');
    }
    const point = points.find((p: any) => p.id === payload.pointId);

    // Validate non-negative integers
    for (const it of payload.items) {
      if (!isValidQuantity(it?.quantity)) {
        throw new HttpError(400, `Количество товара "${it?.name}" должно быть целым числом от 0 до ${MAX_QUANTITY}.`);
      }
    }
    const items = payload.items.filter((it: any) => it.quantity > 0);
    if (!isDraft && items.length === 0) throw new HttpError(400, 'Нельзя отправить пустую заявку.');

    // Idempotency: повторный запрос с тем же ключом не создаёт дубль.
    // Черновик с этим ключом — не «уже отправленный заказ»: его обновляем или отправляем.
    let existing: any = null;
    if (payload.idempotencyKey) {
      existing = await findOrderByKeyQuery(payload.idempotencyKey, accountId);
      if (existing && existing.pointId !== payload.pointId) {
        throw new HttpError(409, 'Ключ идемпотентности уже использован для другой кофейни.');
      }
      if (existing && existing.status !== 'draft') {
        return res.json({ success: true, order: existing, isDuplicate: true });
      }
    }

    // ID заказа всегда генерирует сервер: id — глобальный первичный ключ
    const orderId = existing?.id || `ord-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const nowIso = new Date().toISOString();

    const order = {
      id: orderId,
      accountId,
      idempotencyKey: payload.idempotencyKey,
      pointId: payload.pointId,
      pointName: point?.name ?? String(payload.pointName ?? '').slice(0, 200),
      slotId: payload.slotId,
      date: payload.date,
      status: isDraft ? 'draft' : 'submitted',
      items,
      createdBy: user.name, // автор — из сессии, а не из тела запроса
      createdAt: existing?.createdAt || nowIso,
      updatedAt: nowIso,
      submittedAt: isDraft ? null : nowIso,
    };

    await upsertOrderQuery(order);

    res.json({ success: true, order });
  } catch (error: any) {
    sendError(res, error, 'Не удалось отправить заказ.');
  }
});

// ---------------------------------------------------------------------------
// Накладные
// ---------------------------------------------------------------------------
const FINISHED_WAYBILL = new Set(['received', 'received_with_discrepancies']);

/**
 * Справочные данные для карточки рейса (адрес кофейни, цех и его контакты). Подставляются из справочников
 * на лету, в накладной не хранятся — поэтому водителю не нужен доступ ко всему справочнику цехов.
 */
async function withDetails(accountId: string, list: any[]): Promise<any[]> {
  if (list.length === 0) return list;
  try {
    const [points, workshops, employees, drivers] = await Promise.all([
      getPointsQuery(accountId),
      getWorkshopsQuery(accountId),
      getEmployeesQuery(accountId),
      getDriversQuery(accountId),
    ]);
    const pointById = new Map<string, any>(points.map((p: any) => [p.id, p]));
    const workshopById = new Map<string, any>(workshops.map((w: any) => [w.id, w]));
    return list.map((w: any) => {
      const point = pointById.get(w.pointId);
      const workshop = workshopById.get(w.workshopId || point?.assignedWorkshopId);
      return {
        ...w,
        pointAddress: point?.address || undefined,
        workshopName: workshop?.name || undefined,
        workshopAddress: workshop?.address || undefined,
        workshopPhone: workshop?.phone || undefined,
        workshopChiefName: workshop?.chiefName || undefined,
        // То же правило, по которому сервер отклонит приёмку: интерфейс не должен его угадывать
        awaitingDeliveryConfirmation:
          w.status === 'dispatched' && !w.deliveredAt && requiresDeliveryConfirmation(w, employees, { points, drivers }),
      };
    });
  } catch (error) {
    console.error('Не удалось дополнить накладные справочными данными:', error);
    return list; // карточка рейса откроется и без адресов
  }
}

/** Накладная, доступная пользователю. Чужую или несуществующую не различаем (404). */
async function findWaybillFor(user: AuthUser, id: string) {
  const [waybills, ctx] = await Promise.all([getWaybillsQuery(user.accountId), loadAccessContext(user.accountId)]);
  const waybill = waybills.find((w: any) => w.id === id);
  if (!waybill || !canAccessWaybill(user, waybill, ctx)) throw new HttpError(404, 'Waybill not found');
  return { waybill, ctx };
}

app.get('/api/waybills', async (req, res) => {
  try {
    const user = req.user!;
    const [waybills, ctx] = await Promise.all([getWaybillsQuery(user.accountId), loadAccessContext(user.accountId)]);
    res.json(await withDetails(user.accountId, waybills.filter((w: any) => canAccessWaybill(user, w, ctx))));
  } catch (error: any) {
    sendError(res, error, 'Не удалось получить накладные.');
  }
});

app.post('/api/waybills/generate', requireRole('admin', 'production_operator'), async (req, res) => {
  try {
    const user = req.user!;
    const { date, slotId } = req.body ?? {};
    const accountId = user.accountId;
    if (!DATE_RE.test(String(date))) throw new HttpError(400, 'Некорректная дата.');
    if (!SLOT_IDS.has(slotId)) throw new HttpError(400, 'Некорректный слот.');
    // Оператор формирует накладные только для своего цеха; цех из запроса учитывается лишь у администратора
    const workshopId = user.role === 'production_operator' ? user.workshopId : req.body?.workshopId;

    const allOrders = await getOrdersQuery(accountId);
    let slotOrders = allOrders.filter(
      (o: any) => o.date === date && o.slotId === slotId && o.status === 'submitted'
    );

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

    const [updatedList, ctx] = await Promise.all([getWaybillsQuery(accountId), loadAccessContext(accountId)]);
    res.json(
      await withDetails(
        accountId,
        updatedList.filter((w: any) => w.date === date && w.slotId === slotId && canAccessWaybill(user, w, ctx)),
      ),
    );
  } catch (error: any) {
    sendError(res, error, 'Не удалось сформировать накладные.');
  }
});

app.put('/api/waybills/:id/dispatch', requireRole('admin', 'production_operator'), async (req, res) => {
  try {
    const user = req.user!;
    const { items, newStatus, driverName, driverId, workshopId, legalEntityId } = req.body ?? {};
    if (!Array.isArray(items)) throw new HttpError(400, 'Не переданы позиции накладной.');
    if (!['formed', 'packing', 'dispatched'].includes(newStatus)) {
      throw new HttpError(400, 'Недопустимый статус отгрузки.');
    }

    const { waybill, ctx } = await findWaybillFor(user, req.params.id);
    if (FINISHED_WAYBILL.has(waybill.status)) {
      throw new HttpError(409, 'Накладная уже принята — изменить отгрузку нельзя.');
    }
    if (waybill.status === 'dispatched' && newStatus !== 'dispatched') {
      throw new HttpError(409, 'Накладная уже отгружена — вернуть её в сборку нельзя.');
    }
    if (driverId && !ctx.drivers.some((d: any) => d.id === driverId)) {
      throw new HttpError(400, 'Указанный водитель не найден.');
    }
    if (legalEntityId) {
      const entities = await getLegalEntitiesQuery(user.accountId);
      if (!entities.some((e: any) => e.id === legalEntityId)) throw new HttpError(400, 'Указанное юрлицо не найдено.');
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
        // До приёмки «принято» по умолчанию равно «отгружено»
        receivedQuantity: updated.dispatchedQuantity,
      };
    });

    waybill.status = newStatus;
    if (newStatus === 'dispatched') {
      waybill.dispatchedAt = new Date().toISOString();
      waybill.dispatchedBy = user.name; // из сессии, а не из тела запроса
      if (driverName) waybill.driverName = String(driverName).slice(0, 200);
      if (driverId) waybill.driverId = driverId;
      const ownWorkshop = user.role === 'production_operator' ? user.workshopId : workshopId;
      if (ownWorkshop) waybill.workshopId = ownWorkshop;
      if (legalEntityId) waybill.legalEntityId = legalEntityId;
    }

    await upsertWaybillQuery(waybill);
    res.json((await withDetails(user.accountId, [waybill]))[0]);
  } catch (error: any) {
    sendError(res, error, 'Не удалось обновить отгрузку.');
  }
});

// Водитель подтверждает, что груз доставлен в кофейню. До этого момента приёмка поставки недоступна.
app.put('/api/waybills/:id/deliver', requireRole('admin', 'driver'), async (req, res) => {
  try {
    const user = req.user!;
    const { waybill } = await findWaybillFor(user, req.params.id);
    if (FINISHED_WAYBILL.has(waybill.status)) {
      throw new HttpError(409, 'Накладная уже принята.');
    }
    if (waybill.status !== 'dispatched') {
      throw new HttpError(409, 'Подтвердить доставку можно только после выезда: накладная ещё не в пути.');
    }
    // Повторное нажатие (двойной тап, повтор после обрыва связи) безопасно: время первого подтверждения сохраняется
    if (!waybill.deliveredAt) {
      waybill.deliveredAt = new Date().toISOString();
      waybill.deliveredBy = user.name; // из сессии, а не из тела запроса
      await upsertWaybillQuery(waybill);
    }
    res.json((await withDetails(user.accountId, [waybill]))[0]);
  } catch (error: any) {
    sendError(res, error, 'Не удалось подтвердить доставку.');
  }
});

app.put('/api/waybills/:id/driver-status', requireRole('admin', 'driver'), async (req, res) => {
  try {
    const user = req.user!;
    const { status, driverName, driverId } = req.body ?? {};
    // Водитель может только начать рейс; приёмку и прочие статусы ему менять нельзя.
    if (status !== undefined && status !== 'dispatched') {
      throw new HttpError(400, 'Водитель может только перевести накладную в статус «Отгружена (в пути)».');
    }

    const { waybill, ctx } = await findWaybillFor(user, req.params.id);
    if (FINISHED_WAYBILL.has(waybill.status)) {
      throw new HttpError(409, 'Накладная уже принята — статус рейса изменить нельзя.');
    }

    if (user.role === 'driver') {
      // Личность водителя — из сессии; назначить рейс на другого водителя нельзя
      const ownId = resolveDriverId(user, ctx.drivers);
      const profile = ctx.drivers.find((d: any) => d.id === ownId);
      if (ownId && !waybill.driverId) waybill.driverId = ownId;
      if (!waybill.driverName) {
        waybill.driverName = profile ? `${profile.name} (${profile.vehicleModel} ${profile.licensePlate})` : user.name;
      }
    } else {
      if (driverId && !ctx.drivers.some((d: any) => d.id === driverId)) {
        throw new HttpError(400, 'Указанный водитель не найден.');
      }
      if (driverName) waybill.driverName = String(driverName).slice(0, 200);
      if (driverId) waybill.driverId = driverId;
    }
    if (status) waybill.status = status;

    await upsertWaybillQuery(waybill);
    res.json((await withDetails(user.accountId, [waybill]))[0]);
  } catch (error: any) {
    sendError(res, error, 'Не удалось обновить статус рейса.');
  }
});

app.put('/api/waybills/:id/receive', requireRole('admin', 'shift_supervisor'), async (req, res) => {
  try {
    const user = req.user!;
    const { items } = req.body ?? {};
    if (!Array.isArray(items)) throw new HttpError(400, 'Не переданы позиции приёмки.');

    const { waybill, ctx } = await findWaybillFor(user, req.params.id);
    if (waybill.status !== 'dispatched') {
      throw new HttpError(409, 'Принять можно только отгруженную накладную, которая ещё не принята.');
    }
    // Поставку принимают после того, как водитель подтвердил доставку (администратор может принять и без этого)
    if (user.role !== 'admin' && !waybill.deliveredAt) {
      const employees = await getEmployeesQuery(user.accountId);
      if (requiresDeliveryConfirmation(waybill, employees, ctx)) {
        throw new HttpError(409, 'Водитель ещё не подтвердил доставку. Приёмка станет доступна после его подтверждения.');
      }
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
    waybill.receivedBy = user.name; // из сессии, а не из тела запроса

    await upsertWaybillQuery(waybill);
    res.json((await withDetails(user.accountId, [waybill]))[0]);
  } catch (error: any) {
    sendError(res, error, 'Не удалось принять накладную.');
  }
});

// Seed / Reset (идемпотентное наполнение демо-данными — только администратор)
app.post('/api/reset', adminOnly, async (req, res) => {
  try {
    // Демо-данные в рабочую базу не заливаем, пока они явно не включены (YDB_AUTO_SEED=true)
    if (process.env.YDB_AUTO_SEED !== 'true') {
      throw new HttpError(403, 'Демо-данные отключены (YDB_AUTO_SEED не равен true).');
    }
    await seedDatabaseIfEmpty();
    res.json({ success: true });
  } catch (error: any) {
    sendError(res, error, 'Не удалось выполнить сидирование.');
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

  // Без секрета подписи вход невозможен — в production падаем сразу, а не при первом логине
  getAuthSecret();

  if (databaseConfigured) {
    // Порядок важен: сначала схема (и миграции), потом демо-данные, потом первый администратор
    (async () => {
      if (process.env.YDB_AUTO_SCHEMA === 'true') await ensureYdbSchema();
      if (process.env.YDB_AUTO_SEED === 'true') await seedDatabaseIfEmpty();
      // Учётные данные первого администратора берутся только из окружения — значений по умолчанию нет
      await bootstrapAdminFromEnv();
    })().catch((err) => console.error('Database initialization error:', err));
  } else {
    console.warn('Database is not configured; starting without automatic seeding. Вход в систему невозможен без базы данных.');
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

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on http://0.0.0.0:${PORT} (${databaseConfigured ? 'database configured' : 'database not configured'})`);
  });

  server.on('error', (err: any) => {
    console.error('Server listen error:', err);
    process.exit(1); // порт занят и т.п.: процесс не должен оставаться «живым» без сервера
  });
}

if (process.env.VERCEL !== '1') {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exitCode = 1; // чтобы PM2/Docker/CI видели неудачный запуск
  });
}
