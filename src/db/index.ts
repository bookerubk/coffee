import { fromYdbRow, selectYdbRows, toYdbRow, upsertYdbRow, YDB_TABLES } from './ydb.ts';

function tableName(table: any) {
  return table?.[Symbol.for('drizzle:Name')] || table?.name;
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

const tableApi = (table: any) => ({
  table,
  values: (values: any) => ({
    onConflictDoNothing: async () => upsertYdbRow(tableName(table), toYdbRow(values)),
  }),
});

export const db: any = {
  insert: (table: any) => tableApi(table),
  select: () => ({
    from: (table: any) => {
      const state: any = { table };
      const builder: any = Promise.resolve().then(async () => {
        const rows = await selectYdbRows(tableName(table));
        const condition = conditionValue(state.condition);
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
