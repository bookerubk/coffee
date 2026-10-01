import { fromYdbRow, selectYdbRows, toYdbRow, upsertYdbRow, YDB_TABLES } from './ydb.ts';

function tableName(table: any): string {
  const name = table?.__tableName;
  if (typeof name !== 'string') throw new Error('Unknown YDB table reference');
  return name;
}

function columnName(column: any) {
  return column?.name || String(column);
}

function conditionValue(condition: any) {
  if (condition?.__ydbWhere) return condition.__ydbWhere;
  return undefined;
}

export function eq(column: any, value: unknown) {
  return { __ydbWhere: { column: columnName(column), value } };
}

export function and(...conditions: any[]) {
  return { __ydbWhere: { conditions: conditions.map((condition) => condition.__ydbWhere).filter(Boolean) } };
}

export function desc(column: any) {
  return { __ydbOrder: { column: columnName(column), direction: 'desc' as const } };
}

/**
 * Минимальная замена drizzle-подобного API поверх YDB.
 *  - onConflictDoNothing: вставляет строку, только если такого id ещё нет;
 *  - onConflictDoUpdate: если строка есть — обновляет только поля из `set`
 *    (createdAt, idempotencyKey и т.п. не затираются), иначе вставляет целиком.
 */
const tableApi = (table: any) => ({
  table,
  values: (values: any) => {
    const name = tableName(table);
    const exists = async () => (await selectYdbRows(name, { id: values.id })).length > 0;
    return {
      onConflictDoNothing: async () => {
        if (!(await exists())) await upsertYdbRow(name, toYdbRow(values));
      },
      onConflictDoUpdate: async (options: { target?: any; set: Record<string, unknown> }) => {
        if (await exists()) {
          await upsertYdbRow(name, toYdbRow({ id: values.id, ...options.set }));
        } else {
          await upsertYdbRow(name, toYdbRow(values));
        }
      },
    };
  },
});

export const db: any = {
  insert: (table: any) => tableApi(table),
  select: () => ({
    from: (table: any) => {
      const state: any = { table };
      const builder: any = Promise.resolve().then(async () => {
        const condition = conditionValue(state.condition);
        const filters = condition?.conditions ?? (condition ? [condition] : []);
        const rows = await selectYdbRows(tableName(table), Object.fromEntries(filters.map((filter: any) => [
          filter.column.replace(/[A-Z]/g, (match: string) => `_${match.toLowerCase()}`),
          filter.value,
        ])));

        const matches = (row: Record<string, unknown>, filter: any): boolean => {
          if (!filter) return true;
          if (filter.conditions) return filter.conditions.every((nested: any) => matches(row, nested));
          const normalizedColumn = filter.column?.replace(/[A-Z]/g, (match: string) => `_${match.toLowerCase()}`);
          return row[normalizedColumn] === filter.value;
        };
        return rows.filter((row) => matches(row, condition)).map((row) => fromYdbRow(row));
      });
      builder.where = (condition: any) => {
        state.condition = condition;
        return builder;
      };
      builder.limit = (limit: number) => Promise.resolve(builder).then((rows) => rows.slice(0, limit));
      builder.orderBy = (order: any) => {
        if (order?.__ydbOrder) {
          const normalizedColumn = order.__ydbOrder.column.replace(/[A-Z]/g, (match: string) => `_${match.toLowerCase()}`);
          return builder.then((rows: any[]) => [...rows].sort((a, b) => String(b[normalizedColumn] ?? '').localeCompare(String(a[normalizedColumn] ?? ''))));
        }
        return builder;
      };
      return builder;
    },
  }),
};

export { checkYdbConnection, closeYdbConnection, createYdbDriver } from './ydb.ts';

export const dbSchema = YDB_TABLES;
