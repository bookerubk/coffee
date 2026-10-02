/**
 * Минимальная in-memory имитация YDB-клиента для тестов.
 * Подставляется через global._ydbQueryClient, поэтому настоящая БД не нужна.
 * Эмулирует поведение YDB, важное для нашего кода:
 *  - все колонки типизированы, параметр другого типа (например Bool в Utf8) — ошибка;
 *  - UPSERT обновляет только переданные колонки существующей строки.
 */
import { toJs } from '@ydbjs/value';

type Row = Record<string, unknown>;
const schemas = new Map<string, Map<string, string>>();
const tables = new Map<string, Map<string, Row>>();

/** Создаёт таблицу «как в старой версии схемы» — для проверки миграции колонок. */
export function createLegacyTable(table: string, columns: string[]) {
  schemas.set(table, new Map(columns.map((c) => c.split(/\s+/) as [string, string])));
  tables.set(table, new Map());
}

export function resetFakeYdb() {
  schemas.clear();
  tables.clear();
}

function splitTopLevel(s: string): string[] {
  return s.split(',').map((x) => x.trim()).filter(Boolean);
}

function typeNameOf(value: any): string {
  const name = value?.type?.constructor?.name ?? '';
  if (name === 'TextType') return 'Utf8';
  if (name === 'NullType') return 'Null';
  return name.replace(/Type$/, '');
}

function exec(text: string, params: Record<string, any>): Row[][] {
  let m = text.match(/^CREATE TABLE IF NOT EXISTS `(\w+)` \((.*), PRIMARY KEY \(id\)\);$/s);
  if (m) {
    const [, table, cols] = m;
    if (!schemas.has(table)) {
      schemas.set(table, new Map(splitTopLevel(cols).map((c) => c.split(/\s+/) as [string, string])));
      tables.set(table, new Map());
    }
    return [];
  }

  m = text.match(/^ALTER TABLE `(\w+)` ADD COLUMN (\w+) (\w+);$/);
  if (m) {
    const [, table, column, type] = m;
    const schema = schemas.get(table);
    if (!schema) throw new Error(`Table not found: ${table}`);
    if (schema.has(column)) throw new Error(`Column already exists: ${column}`);
    schema.set(column, type);
    return [];
  }

  m = text.match(/^SELECT (\w+) FROM `(\w+)` LIMIT 1;$/);
  if (m) {
    const [, column, table] = m;
    const schema = schemas.get(table);
    if (!schema) throw new Error(`Table not found: ${table}`);
    if (!schema.has(column)) throw new Error(`Column not found: ${column}`);
    return [[]];
  }

  m = text.match(/^UPSERT INTO `(\w+)` \((.*?)\) VALUES \((.*?)\);$/s);
  if (m) {
    const [, table, cols, vals] = m;
    const schema = schemas.get(table);
    if (!schema) throw new Error(`Table not found: ${table}`);
    const columns = splitTopLevel(cols);
    const refs = splitTopLevel(vals);
    const row: Row = {};
    columns.forEach((col, i) => {
      const expected = schema.get(col);
      if (!expected) throw new Error(`Unknown column ${col} in ${table}`);
      const param = params[refs[i].slice(1)];
      const actual = typeNameOf(param);
      if (actual !== 'Null' && actual !== expected) {
        throw new Error(`Type mismatch for ${table}.${col}: expected ${expected}, got ${actual}`);
      }
      row[col] = actual === 'Null' ? null : toJs(param);
    });
    const store = tables.get(table)!;
    const id = String(row.id);
    store.set(id, { ...(store.get(id) ?? {}), ...row });
    return [];
  }

  m = text.match(/^SELECT \* FROM `(\w+)`(?: WHERE (.*?))?;$/s);
  if (m) {
    const [, table, where] = m;
    const schema = schemas.get(table);
    if (!schema) throw new Error(`Table not found: ${table}`);
    const conds = where ? where.split(' AND ').map((c) => c.trim().split(' = ')) : [];
    const rows = [...tables.get(table)!.values()]
      .filter((r) => conds.every(([col, ref]) => r[col] === toJs(params[ref.slice(1)])))
      .map((r) => Object.fromEntries([...schema.keys()].map((k) => [k, r[k] ?? null])));
    return [rows];
  }

  if (/^SELECT 1 AS connected;$/.test(text)) return [[{ connected: 1 }]];
  throw new Error(`Fake YDB: unsupported query: ${text}`);
}

export function installFakeYdb() {
  (globalThis as any)._ydbQueryClient = (text: string) => {
    const params: Record<string, any> = {};
    const req: any = {
      param(name: string, value: unknown) {
        params[name] = value;
        return req;
      },
      async idempotent() {
        return exec(text, params);
      },
    };
    return req;
  };
}
