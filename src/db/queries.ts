import { eq, desc, and } from 'drizzle-orm';
import { db } from './index.ts';
import {
  coffeePoints,
  products,
  employees,
  slots,
  shiftOrders,
  waybills,
  users,
  legalEntities,
  workshops,
  drivers,
  tenantAccounts,
} from './schema.ts';
import {
  INITIAL_POINTS,
  INITIAL_PRODUCTS,
  INITIAL_EMPLOYEES,
  INITIAL_SLOTS,
  INITIAL_ORDERS,
  INITIAL_WAYBILLS,
  INITIAL_LEGAL_ENTITIES,
  INITIAL_WORKSHOPS,
  INITIAL_DRIVERS,
} from '../services/mockData.ts';

export const INITIAL_TENANT_ACCOUNTS = [
  {
    id: 'acc-aroma',
    name: 'Сеть кофеен «Арома Холдинг»',
    dbSchema: 'db_aroma_prod',
    inn: '7701984210',
    adminEmail: 'admin@aroma-coffee.ru',
    adminName: 'Сергей Воронов',
    description: 'Основная сеть кофеен и пекарен Москвы (Тверская, Арбат, Сити, Патриаршие)',
  },
  {
    id: 'acc-nordic',
    name: 'Сеть кофеен «Север Кофе» (Изолированная БД)',
    dbSchema: 'db_nordic_prod',
    inn: '7802345678',
    adminEmail: 'admin@nordic-coffee.ru',
    adminName: 'Алексей Смирнов',
    description: 'Отдельный независимый аккаунт со своей базой данных: цех Север, 2 кофейни, свой парк доставки',
  },
];

/**
 * Auto-seed database if empty on startup
 */
export async function seedDatabaseIfEmpty() {
  try {
    // Seed tenant accounts
    for (const acc of INITIAL_TENANT_ACCOUNTS) {
      await db.insert(tenantAccounts).values({
        id: acc.id,
        name: acc.name,
        dbSchema: acc.dbSchema,
        inn: acc.inn,
        adminEmail: acc.adminEmail,
        adminName: acc.adminName,
        description: acc.description,
      }).onConflictDoNothing();
    }

    const existingEntities = await db.select().from(legalEntities).limit(1);
    if (existingEntities.length === 0) {
      console.log('Seeding legal entities, workshops, and drivers into YDB...');
      for (const le of INITIAL_LEGAL_ENTITIES) {
        await db.insert(legalEntities).values({
          id: le.id,
          accountId: 'acc-aroma',
          name: le.name,
          shortName: le.shortName,
          inn: le.inn,
          kpp: le.kpp,
          ogrn: le.ogrn,
          legalAddress: le.legalAddress,
          actualAddress: le.actualAddress,
          bankName: le.bankName,
          bik: le.bik,
          checkingAccount: le.checkingAccount,
          correspondentAccount: le.correspondentAccount,
          directorName: le.directorName,
          phone: le.phone,
          email: le.email,
          taxSystem: le.taxSystem,
          source: le.source,
          externalId: le.external_id,
          archived: le.archived,
        }).onConflictDoNothing();
      }

      for (const ws of INITIAL_WORKSHOPS) {
        await db.insert(workshops).values({
          id: ws.id,
          accountId: 'acc-aroma',
          name: ws.name,
          legalEntityId: ws.legalEntityId,
          address: ws.address,
          chiefName: ws.chiefName,
          phone: ws.phone,
          capacity: ws.capacity || '',
          source: ws.source,
          externalId: ws.external_id,
          archived: ws.archived,
        }).onConflictDoNothing();
      }

      for (const drv of INITIAL_DRIVERS) {
        await db.insert(drivers).values({
          id: drv.id,
          accountId: 'acc-aroma',
          name: drv.name,
          phone: drv.phone,
          legalEntityId: drv.legalEntityId,
          assignedWorkshopId: drv.assignedWorkshopId,
          vehicleModel: drv.vehicleModel,
          licensePlate: drv.licensePlate,
          hasRefrigerator: drv.hasRefrigerator,
          status: drv.status,
          archived: drv.archived,
        }).onConflictDoNothing();
      }
    }

    const existingPoints = await db.select().from(coffeePoints).limit(1);
    if (existingPoints.length === 0) {
      console.log('Seeding initial points, products, employees into YDB...');

      // Points
      for (const pt of INITIAL_POINTS) {
        await db.insert(coffeePoints).values({
          id: pt.id,
          accountId: 'acc-aroma',
          name: pt.name,
          address: pt.address,
          legalEntityId: pt.legalEntityId || '',
          assignedWorkshopId: pt.assignedWorkshopId || '',
          assignedEmployeeIds: JSON.stringify(pt.assignedEmployeeIds),
          source: pt.source,
          externalId: pt.external_id,
          archived: pt.archived,
        }).onConflictDoNothing();
      }

      // Products
      for (const prod of INITIAL_PRODUCTS) {
        await db.insert(products).values({
          id: prod.id,
          accountId: 'acc-aroma',
          sku: prod.sku,
          name: prod.name,
          unit: prod.unit,
          category: prod.category,
          source: prod.source,
          externalId: prod.external_id,
          archived: prod.archived,
        }).onConflictDoNothing();
      }

      // Employees
      for (const emp of INITIAL_EMPLOYEES) {
        await db.insert(employees).values({
          id: emp.id,
          accountId: 'acc-aroma',
          name: emp.name,
          role: emp.role,
          pointId: emp.pointId || null,
          phone: emp.phone || null,
          archived: emp.archived,
        }).onConflictDoNothing();
      }

      // Slots
      for (const slot of INITIAL_SLOTS) {
        await db.insert(slots).values({
          id: slot.id,
          accountId: 'acc-aroma',
          name: slot.name,
          deadlineTime: slot.deadlineTime,
          deliveryTime: slot.deliveryTime,
          description: slot.description,
          isActive: slot.isActive,
        }).onConflictDoNothing();
      }

      // Orders
      for (const ord of INITIAL_ORDERS) {
        await db.insert(shiftOrders).values({
          id: ord.id,
          accountId: 'acc-aroma',
          idempotencyKey: ord.idempotencyKey,
          pointId: ord.pointId,
          pointName: ord.pointName,
          slotId: ord.slotId,
          date: ord.date,
          status: ord.status,
          items: JSON.stringify(ord.items),
          createdBy: ord.createdBy,
          createdAt: new Date(ord.createdAt),
          updatedAt: new Date(ord.updatedAt),
          submittedAt: ord.submittedAt ? new Date(ord.submittedAt) : null,
        }).onConflictDoNothing();
      }

      // Waybills
      for (const wb of INITIAL_WAYBILLS) {
        await db.insert(waybills).values({
          id: wb.id,
          accountId: 'acc-aroma',
          orderId: wb.orderId,
          pointId: wb.pointId,
          pointName: wb.pointName,
          date: wb.date,
          slotId: wb.slotId,
          status: wb.status,
          driverName: wb.driverName || null,
          dispatchedBy: wb.dispatchedBy || null,
          dispatchedAt: wb.dispatchedAt ? new Date(wb.dispatchedAt) : null,
          items: JSON.stringify(wb.items),
          createdAt: new Date(wb.createdAt),
        }).onConflictDoNothing();
      }

      console.log('YDB Cloud seeded successfully.');
    }
  } catch (error) {
    console.error('Failed to seed database:', error);
  }
}

// Tenant Accounts queries
export async function getTenantAccountsQuery() {
  try {
    const list = await db.select().from(tenantAccounts);
    return list.map((a: any) => ({
      id: a.id,
      name: a.name,
      dbSchema: a.dbSchema,
      inn: a.inn,
      adminEmail: a.adminEmail,
      adminName: a.adminName,
      description: a.description,
      createdAt: a.createdAt ? a.createdAt.toISOString() : undefined,
    }));
  } catch (error) {
    console.error('Database query failed (getTenantAccountsQuery):', error);
    throw new Error('Database query failed for tenant accounts', { cause: error });
  }
}

export async function upsertTenantAccountQuery(account: any) {
  try {
    await db.insert(tenantAccounts)
      .values({
        id: account.id,
        name: account.name,
        dbSchema: account.dbSchema || `db_${account.id.replace(/[^a-zA-Z0-9]/g, '_')}`,
        inn: account.inn || '',
        adminEmail: account.adminEmail || '',
        adminName: account.adminName || '',
        description: account.description || '',
      })
      .onConflictDoUpdate({
        target: tenantAccounts.id,
        set: {
          name: account.name,
          dbSchema: account.dbSchema || `db_${account.id.replace(/[^a-zA-Z0-9]/g, '_')}`,
          inn: account.inn || '',
          adminEmail: account.adminEmail || '',
          adminName: account.adminName || '',
          description: account.description || '',
        },
      });
  } catch (error) {
    console.error('Database query failed (upsertTenantAccountQuery):', error);
    throw new Error('Failed to upsert tenant account', { cause: error });
  }
}

// Points queries (scoped to accountId)
export async function getPointsQuery(accountId?: string) {
  try {
    const query = accountId && accountId !== 'all'
      ? db.select().from(coffeePoints).where(eq(coffeePoints.accountId, accountId))
      : db.select().from(coffeePoints);
    const list = await query;
    return list.map((p: any) => ({
      id: p.id,
      accountId: p.accountId,
      name: p.name,
      address: p.address,
      legalEntityId: p.legalEntityId || '',
      assignedWorkshopId: p.assignedWorkshopId || '',
      assignedEmployeeIds: JSON.parse(p.assignedEmployeeIds || '[]'),
      source: p.source as 'manual' | 'external',
      external_id: p.externalId,
      archived: p.archived,
    }));
  } catch (error) {
    console.error('Database query failed (getPointsQuery):', error);
    throw new Error('Database query failed for coffee points', { cause: error });
  }
}

export async function upsertPointQuery(point: any) {
  try {
    await db.insert(coffeePoints)
      .values({
        id: point.id,
        accountId: point.accountId || 'acc-aroma',
        name: point.name,
        address: point.address,
        legalEntityId: point.legalEntityId || '',
        assignedWorkshopId: point.assignedWorkshopId || '',
        assignedEmployeeIds: JSON.stringify(point.assignedEmployeeIds || []),
        source: point.source || 'manual',
        externalId: point.external_id || '',
        archived: point.archived || false,
      })
      .onConflictDoUpdate({
        target: coffeePoints.id,
        set: {
          accountId: point.accountId || 'acc-aroma',
          name: point.name,
          address: point.address,
          legalEntityId: point.legalEntityId || '',
          assignedWorkshopId: point.assignedWorkshopId || '',
          assignedEmployeeIds: JSON.stringify(point.assignedEmployeeIds || []),
          source: point.source || 'manual',
          externalId: point.external_id || '',
          archived: point.archived || false,
        },
      });
  } catch (error) {
    console.error('Database query failed (upsertPointQuery):', error);
    throw new Error('Failed to upsert point', { cause: error });
  }
}

// Products queries (scoped to accountId)
export async function getProductsQuery(accountId?: string) {
  try {
    const query = accountId && accountId !== 'all'
      ? db.select().from(products).where(eq(products.accountId, accountId))
      : db.select().from(products);
    const list = await query;
    return list.map((p: any) => ({
      id: p.id,
      accountId: p.accountId,
      sku: p.sku,
      name: p.name,
      unit: p.unit,
      category: p.category,
      source: p.source as 'manual' | 'external',
      external_id: p.externalId,
      archived: p.archived,
    }));
  } catch (error) {
    console.error('Database query failed (getProductsQuery):', error);
    throw new Error('Database query failed for products', { cause: error });
  }
}

export async function upsertProductQuery(product: any) {
  try {
    await db.insert(products)
      .values({
        id: product.id,
        accountId: product.accountId || 'acc-aroma',
        sku: product.sku,
        name: product.name,
        unit: product.unit,
        category: product.category,
        source: product.source || 'manual',
        externalId: product.external_id || '',
        archived: product.archived || false,
      })
      .onConflictDoUpdate({
        target: products.id,
        set: {
          accountId: product.accountId || 'acc-aroma',
          sku: product.sku,
          name: product.name,
          unit: product.unit,
          category: product.category,
          source: product.source || 'manual',
          externalId: product.external_id || '',
          archived: product.archived || false,
        },
      });
  } catch (error) {
    console.error('Database query failed (upsertProductQuery):', error);
    throw new Error('Failed to upsert product', { cause: error });
  }
}

// Employees queries (scoped to accountId)
export async function getEmployeesQuery(accountId?: string) {
  try {
    const query = accountId && accountId !== 'all'
      ? db.select().from(employees).where(eq(employees.accountId, accountId))
      : db.select().from(employees);
    const list = await query;
    return list.map((e: any) => ({
      id: e.id,
      accountId: e.accountId,
      name: e.name,
      role: e.role as any,
      pointId: e.pointId || undefined,
      workshopId: e.workshopId || undefined,
      driverId: e.driverId || undefined,
      phone: e.phone || undefined,
      archived: e.archived,
    }));
  } catch (error) {
    console.error('Database query failed (getEmployeesQuery):', error);
    throw new Error('Database query failed for employees', { cause: error });
  }
}

export async function upsertEmployeeQuery(emp: any) {
  try {
    await db.insert(employees)
      .values({
        id: emp.id,
        accountId: emp.accountId || 'acc-aroma',
        name: emp.name,
        role: emp.role,
        pointId: emp.pointId || null,
        workshopId: emp.workshopId || null,
        driverId: emp.driverId || null,
        phone: emp.phone || null,
        archived: emp.archived || false,
      })
      .onConflictDoUpdate({
        target: employees.id,
        set: {
          accountId: emp.accountId || 'acc-aroma',
          name: emp.name,
          role: emp.role,
          pointId: emp.pointId || null,
          workshopId: emp.workshopId || null,
          driverId: emp.driverId || null,
          phone: emp.phone || null,
          archived: emp.archived || false,
        },
      });
  } catch (error) {
    console.error('Database query failed (upsertEmployeeQuery):', error);
    throw new Error('Failed to upsert employee', { cause: error });
  }
}

// Slots queries (guarantee both morning and evening slots are always returned)
export async function getSlotsQuery(accountId?: string) {
  try {
    const list = await db.select().from(slots);
    
    // Map with default slots (morning and evening)
    const slotMap = new Map<string, any>();
    INITIAL_SLOTS.forEach((s) => {
      slotMap.set(s.id, {
        id: s.id,
        accountId: accountId || 'acc-aroma',
        name: s.name,
        deadlineTime: s.deadlineTime,
        deliveryTime: s.deliveryTime,
        description: s.description,
        isActive: s.isActive,
      });
    });

    // Overlay database values
    list.forEach((s: any) => {
      slotMap.set(s.id, {
        id: s.id as 'morning' | 'evening',
        accountId: s.accountId || accountId || 'acc-aroma',
        name: s.name,
        deadlineTime: s.deadlineTime,
        deliveryTime: s.deliveryTime,
        description: s.description,
        isActive: s.isActive,
      });
    });

    return Array.from(slotMap.values());
  } catch (error) {
    console.error('Database query failed (getSlotsQuery):', error);
    return INITIAL_SLOTS;
  }
}

export async function upsertSlotQuery(slot: any) {
  try {
    await db.insert(slots)
      .values({
        id: slot.id,
        accountId: slot.accountId || 'acc-aroma',
        name: slot.name,
        deadlineTime: slot.deadlineTime,
        deliveryTime: slot.deliveryTime,
        description: slot.description,
        isActive: slot.isActive !== undefined ? slot.isActive : true,
      })
      .onConflictDoUpdate({
        target: slots.id,
        set: {
          accountId: slot.accountId || 'acc-aroma',
          name: slot.name,
          deadlineTime: slot.deadlineTime,
          deliveryTime: slot.deliveryTime,
          description: slot.description,
          isActive: slot.isActive !== undefined ? slot.isActive : true,
        },
      });
  } catch (error) {
    console.error('Database query failed (upsertSlotQuery):', error);
    throw new Error('Failed to upsert slot', { cause: error });
  }
}

// Orders queries (scoped to accountId)
export async function getOrdersQuery(accountId?: string) {
  try {
    const query = accountId && accountId !== 'all'
      ? db.select().from(shiftOrders).where(eq(shiftOrders.accountId, accountId)).orderBy(desc(shiftOrders.createdAt))
      : db.select().from(shiftOrders).orderBy(desc(shiftOrders.createdAt));
    const list = await query;
    return list.map((o: any) => ({
      id: o.id,
      accountId: o.accountId,
      idempotencyKey: o.idempotencyKey,
      pointId: o.pointId,
      pointName: o.pointName,
      slotId: o.slotId as 'morning' | 'evening',
      date: o.date,
      status: o.status as 'draft' | 'submitted' | 'aggregated',
      items: JSON.parse(o.items || '[]'),
      createdBy: o.createdBy,
      createdAt: o.createdAt ? o.createdAt.toISOString() : new Date().toISOString(),
      updatedAt: o.updatedAt ? o.updatedAt.toISOString() : new Date().toISOString(),
      submittedAt: o.submittedAt ? o.submittedAt.toISOString() : undefined,
    }));
  } catch (error) {
    console.error('Database query failed (getOrdersQuery):', error);
    throw new Error('Database query failed for shift orders', { cause: error });
  }
}

export async function findOrderByKeyQuery(idempotencyKey: string, accountId?: string) {
  try {
    const conditions = [eq(shiftOrders.idempotencyKey, idempotencyKey)];
    if (accountId && accountId !== 'all') {
      conditions.push(eq(shiftOrders.accountId, accountId));
    }
    const existing = await db
      .select()
      .from(shiftOrders)
      .where(and(...conditions))
      .limit(1);

    if (existing.length === 0) return null;
    const o = existing[0];
    return {
      id: o.id,
      accountId: o.accountId,
      idempotencyKey: o.idempotencyKey,
      pointId: o.pointId,
      pointName: o.pointName,
      slotId: o.slotId as 'morning' | 'evening',
      date: o.date,
      status: o.status as 'draft' | 'submitted' | 'aggregated',
      items: JSON.parse(o.items || '[]'),
      createdBy: o.createdBy,
      createdAt: o.createdAt ? o.createdAt.toISOString() : new Date().toISOString(),
      updatedAt: o.updatedAt ? o.updatedAt.toISOString() : new Date().toISOString(),
      submittedAt: o.submittedAt ? o.submittedAt.toISOString() : undefined,
    };
  } catch (error) {
    console.error('Database query failed (findOrderByKeyQuery):', error);
    throw new Error('Database query failed for idempotency check', { cause: error });
  }
}

export async function upsertOrderQuery(order: any) {
  try {
    const now = new Date();
    await db.insert(shiftOrders)
      .values({
        id: order.id,
        accountId: order.accountId || 'acc-aroma',
        idempotencyKey: order.idempotencyKey,
        pointId: order.pointId,
        pointName: order.pointName,
        slotId: order.slotId,
        date: order.date,
        status: order.status,
        items: JSON.stringify(order.items || []),
        createdBy: order.createdBy,
        createdAt: order.createdAt ? new Date(order.createdAt) : now,
        updatedAt: now,
        submittedAt: order.submittedAt ? new Date(order.submittedAt) : (order.status === 'submitted' ? now : null),
      })
      .onConflictDoUpdate({
        target: shiftOrders.id,
        set: {
          accountId: order.accountId || 'acc-aroma',
          status: order.status,
          items: JSON.stringify(order.items || []),
          updatedAt: now,
          submittedAt: order.submittedAt ? new Date(order.submittedAt) : (order.status === 'submitted' ? now : null),
        },
      });
  } catch (error) {
    console.error('Database query failed (upsertOrderQuery):', error);
    throw new Error('Failed to upsert order', { cause: error });
  }
}

// Waybills queries (scoped to accountId)
export async function getWaybillsQuery(accountId?: string) {
  try {
    const query = accountId && accountId !== 'all'
      ? db.select().from(waybills).where(eq(waybills.accountId, accountId)).orderBy(desc(waybills.createdAt))
      : db.select().from(waybills).orderBy(desc(waybills.createdAt));
    const list = await query;
    return list.map((w: any) => ({
      id: w.id,
      accountId: w.accountId,
      orderId: w.orderId,
      pointId: w.pointId,
      pointName: w.pointName,
      date: w.date,
      slotId: w.slotId as 'morning' | 'evening',
      status: w.status as any,
      driverName: w.driverName || undefined,
      driverId: w.driverId || undefined,
      workshopId: w.workshopId || undefined,
      legalEntityId: w.legalEntityId || undefined,
      dispatchedBy: w.dispatchedBy || undefined,
      dispatchedAt: w.dispatchedAt ? w.dispatchedAt.toISOString() : undefined,
      receivedBy: w.receivedBy || undefined,
      receivedAt: w.receivedAt ? w.receivedAt.toISOString() : undefined,
      items: JSON.parse(w.items || '[]'),
      createdAt: w.createdAt ? w.createdAt.toISOString() : new Date().toISOString(),
    }));
  } catch (error) {
    console.error('Database query failed (getWaybillsQuery):', error);
    throw new Error('Database query failed for waybills', { cause: error });
  }
}

export async function upsertWaybillQuery(waybill: any) {
  try {
    await db.insert(waybills)
      .values({
        id: waybill.id,
        accountId: waybill.accountId || 'acc-aroma',
        orderId: waybill.orderId,
        pointId: waybill.pointId,
        pointName: waybill.pointName,
        date: waybill.date,
        slotId: waybill.slotId,
        status: waybill.status,
        driverName: waybill.driverName || null,
        driverId: waybill.driverId || null,
        workshopId: waybill.workshopId || null,
        legalEntityId: waybill.legalEntityId || null,
        dispatchedBy: waybill.dispatchedBy || null,
        dispatchedAt: waybill.dispatchedAt ? new Date(waybill.dispatchedAt) : null,
        receivedBy: waybill.receivedBy || null,
        receivedAt: waybill.receivedAt ? new Date(waybill.receivedAt) : null,
        items: JSON.stringify(waybill.items || []),
        createdAt: waybill.createdAt ? new Date(waybill.createdAt) : new Date(),
      })
      .onConflictDoUpdate({
        target: waybills.id,
        set: {
          accountId: waybill.accountId || 'acc-aroma',
          status: waybill.status,
          driverName: waybill.driverName || null,
          driverId: waybill.driverId || null,
          workshopId: waybill.workshopId || null,
          legalEntityId: waybill.legalEntityId || null,
          dispatchedBy: waybill.dispatchedBy || null,
          dispatchedAt: waybill.dispatchedAt ? new Date(waybill.dispatchedAt) : null,
          receivedBy: waybill.receivedBy || null,
          receivedAt: waybill.receivedAt ? new Date(waybill.receivedAt) : null,
          items: JSON.stringify(waybill.items || []),
        },
      });
  } catch (error) {
    console.error('Database query failed (upsertWaybillQuery):', error);
    throw new Error('Failed to upsert waybill', { cause: error });
  }
}

// Legal Entities queries (scoped to accountId)
export async function getLegalEntitiesQuery(accountId?: string) {
  try {
    const query = accountId && accountId !== 'all'
      ? db.select().from(legalEntities).where(eq(legalEntities.accountId, accountId))
      : db.select().from(legalEntities);
    const list = await query;
    return list.map((le: any) => ({
      id: le.id,
      accountId: le.accountId,
      name: le.name,
      shortName: le.shortName,
      inn: le.inn,
      kpp: le.kpp,
      ogrn: le.ogrn,
      legalAddress: le.legalAddress,
      actualAddress: le.actualAddress,
      bankName: le.bankName,
      bik: le.bik,
      checkingAccount: le.checkingAccount,
      correspondentAccount: le.correspondentAccount,
      directorName: le.directorName,
      phone: le.phone,
      email: le.email,
      taxSystem: le.taxSystem,
      source: le.source as 'manual' | 'external',
      external_id: le.externalId,
      archived: le.archived,
      createdAt: le.createdAt ? le.createdAt.toISOString() : undefined,
    }));
  } catch (error) {
    console.error('Database query failed (getLegalEntitiesQuery):', error);
    throw new Error('Database query failed for legal entities', { cause: error });
  }
}

export async function upsertLegalEntityQuery(entity: any) {
  try {
    await db.insert(legalEntities)
      .values({
        id: entity.id,
        accountId: entity.accountId || 'acc-aroma',
        name: entity.name,
        shortName: entity.shortName,
        inn: entity.inn,
        kpp: entity.kpp || '',
        ogrn: entity.ogrn || '',
        legalAddress: entity.legalAddress,
        actualAddress: entity.actualAddress || '',
        bankName: entity.bankName || '',
        bik: entity.bik || '',
        checkingAccount: entity.checkingAccount || '',
        correspondentAccount: entity.correspondentAccount || '',
        directorName: entity.directorName || '',
        phone: entity.phone || '',
        email: entity.email || '',
        taxSystem: entity.taxSystem || 'УСН (Доходы - Расходы, 15%)',
        source: entity.source || 'manual',
        externalId: entity.external_id || '',
        archived: entity.archived || false,
      })
      .onConflictDoUpdate({
        target: legalEntities.id,
        set: {
          accountId: entity.accountId || 'acc-aroma',
          name: entity.name,
          shortName: entity.shortName,
          inn: entity.inn,
          kpp: entity.kpp || '',
          ogrn: entity.ogrn || '',
          legalAddress: entity.legalAddress,
          actualAddress: entity.actualAddress || '',
          bankName: entity.bankName || '',
          bik: entity.bik || '',
          checkingAccount: entity.checkingAccount || '',
          correspondentAccount: entity.correspondentAccount || '',
          directorName: entity.directorName || '',
          phone: entity.phone || '',
          email: entity.email || '',
          taxSystem: entity.taxSystem || 'УСН (Доходы - Расходы, 15%)',
          source: entity.source || 'manual',
          externalId: entity.external_id || '',
          archived: entity.archived || false,
        },
      });
  } catch (error) {
    console.error('Database query failed (upsertLegalEntityQuery):', error);
    throw new Error('Failed to upsert legal entity', { cause: error });
  }
}

// Workshops queries (scoped to accountId)
export async function getWorkshopsQuery(accountId?: string) {
  try {
    const query = accountId && accountId !== 'all'
      ? db.select().from(workshops).where(eq(workshops.accountId, accountId))
      : db.select().from(workshops);
    const list = await query;
    return list.map((w: any) => ({
      id: w.id,
      accountId: w.accountId,
      name: w.name,
      legalEntityId: w.legalEntityId,
      address: w.address,
      chiefName: w.chiefName,
      phone: w.phone,
      capacity: w.capacity,
      source: w.source as 'manual' | 'external',
      external_id: w.externalId,
      archived: w.archived,
      createdAt: w.createdAt ? w.createdAt.toISOString() : undefined,
    }));
  } catch (error) {
    console.error('Database query failed (getWorkshopsQuery):', error);
    throw new Error('Database query failed for workshops', { cause: error });
  }
}

export async function upsertWorkshopQuery(workshop: any) {
  try {
    await db.insert(workshops)
      .values({
        id: workshop.id,
        accountId: workshop.accountId || 'acc-aroma',
        name: workshop.name,
        legalEntityId: workshop.legalEntityId || '',
        address: workshop.address,
        chiefName: workshop.chiefName || '',
        phone: workshop.phone || '',
        capacity: workshop.capacity || '',
        source: workshop.source || 'manual',
        externalId: workshop.external_id || '',
        archived: workshop.archived || false,
      })
      .onConflictDoUpdate({
        target: workshops.id,
        set: {
          accountId: workshop.accountId || 'acc-aroma',
          name: workshop.name,
          legalEntityId: workshop.legalEntityId || '',
          address: workshop.address,
          chiefName: workshop.chiefName || '',
          phone: workshop.phone || '',
          capacity: workshop.capacity || '',
          source: workshop.source || 'manual',
          externalId: workshop.external_id || '',
          archived: workshop.archived || false,
        },
      });
  } catch (error) {
    console.error('Database query failed (upsertWorkshopQuery):', error);
    throw new Error('Failed to upsert workshop', { cause: error });
  }
}

// Drivers queries (scoped to accountId)
export async function getDriversQuery(accountId?: string) {
  try {
    const query = accountId && accountId !== 'all'
      ? db.select().from(drivers).where(eq(drivers.accountId, accountId))
      : db.select().from(drivers);
    const list = await query;
    return list.map((d: any) => ({
      id: d.id,
      accountId: d.accountId,
      name: d.name,
      phone: d.phone,
      legalEntityId: d.legalEntityId,
      assignedWorkshopId: d.assignedWorkshopId,
      vehicleModel: d.vehicleModel,
      licensePlate: d.licensePlate,
      hasRefrigerator: d.hasRefrigerator,
      status: d.status as 'active' | 'on_route' | 'day_off',
      archived: d.archived,
      createdAt: d.createdAt ? d.createdAt.toISOString() : undefined,
    }));
  } catch (error) {
    console.error('Database query failed (getDriversQuery):', error);
    throw new Error('Database query failed for drivers', { cause: error });
  }
}

export async function upsertDriverQuery(driver: any) {
  try {
    await db.insert(drivers)
      .values({
        id: driver.id,
        accountId: driver.accountId || 'acc-aroma',
        name: driver.name,
        phone: driver.phone,
        legalEntityId: driver.legalEntityId || '',
        assignedWorkshopId: driver.assignedWorkshopId || '',
        vehicleModel: driver.vehicleModel || '',
        licensePlate: driver.licensePlate || '',
        hasRefrigerator: driver.hasRefrigerator || false,
        status: driver.status || 'active',
        archived: driver.archived || false,
      })
      .onConflictDoUpdate({
        target: drivers.id,
        set: {
          accountId: driver.accountId || 'acc-aroma',
          name: driver.name,
          phone: driver.phone,
          legalEntityId: driver.legalEntityId || '',
          assignedWorkshopId: driver.assignedWorkshopId || '',
          vehicleModel: driver.vehicleModel || '',
          licensePlate: driver.licensePlate || '',
          hasRefrigerator: driver.hasRefrigerator || false,
          status: driver.status || 'active',
          archived: driver.archived || false,
        },
      });
  } catch (error) {
    console.error('Database query failed (upsertDriverQuery):', error);
    throw new Error('Failed to upsert driver', { cause: error });
  }
}
