import { selectYdbRows } from '../db/ydb.ts';
import { COMMON_PASSWORDS, verifyPassword } from './crypto.ts';

/** Пароли, которые никогда не должны быть у сотрудников (в т.ч. «1» из прежней версии кода). */
export const WEAK_PASSWORDS = COMMON_PASSWORDS;

export interface WeakPasswordFinding {
  id: string;
  name: string;
  email: string;
  accountId: string;
  password: string;
}

/** Находит сотрудников, чей пароль совпадает с одним из распространённых слабых паролей. */
export async function findWeakPasswordEmployees(candidates: readonly string[] = WEAK_PASSWORDS): Promise<WeakPasswordFinding[]> {
  const rows = await selectYdbRows('employees');
  const findings: WeakPasswordFinding[] = [];
  for (const row of rows as any[]) {
    if (!row.password_hash) continue;
    for (const candidate of candidates) {
      if (await verifyPassword(candidate, row.password_hash)) {
        findings.push({ id: row.id, name: row.name, email: row.email, accountId: row.account_id, password: candidate });
        break;
      }
    }
  }
  return findings;
}
