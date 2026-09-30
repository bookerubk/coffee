import { fromYdbRow, selectYdbRows, toYdbRow, upsertYdbRow, YDB_TABLES } from './ydb.ts';

function tableName(table: any) {
  return table?.[Symbol.for('drizzle:Name')] || table?.name;
}

function columnName(column: any) {
  return column?.name || String(column);
}

function conditionValue(condition: any) {
  const chunks = condition?.queryChunks || [];
  const column = chunks.find((chunk: any) => chunk?.name && chunk?.table)?.name;
  const param = chunks.find((chunk: any) => chunk?.value !== undefined && !chunk?.name);
  return column && param ? { column, value: param.value } : undefined;
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
        const normalizedColumn = condition?.column?.replace(/[A-Z]/g, (match: string) => `_${match.toLowerCase()}`);
        return rows
          .filter((row) => !condition || row[normalizedColumn] === condition.value)
          .map((row) => fromYdbRow(row));
      });
      builder.where = (condition: any) => {
        state.condition = condition;
        return builder;
      };
      builder.limit = (limit: number) => Promise.resolve(builder).then((rows) => rows.slice(0, limit));
      builder.orderBy = () => builder;
      return builder;
    },
  }),
};

export { checkYdbConnection, closeYdbConnection, createYdbDriver } from './ydb.ts';

export const dbSchema = YDB_TABLES;
