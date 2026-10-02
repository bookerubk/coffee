import { randomBytes } from 'node:crypto';
import { hashPassword, validatePassword } from './crypto.ts';
import {
  findEmployeeAuthByEmailQuery,
  getTenantAccountsQuery,
  setEmployeePasswordHashQuery,
  upsertEmployeeQuery,
  upsertTenantAccountQuery,
} from '../db/queries.ts';

/**
 * Первый вход: в системе нет ни одного пароля, а войти нужно, чтобы создать остальных.
 * Если заданы BOOTSTRAP_ADMIN_EMAIL и BOOTSTRAP_ADMIN_PASSWORD:
 *  - сотрудник с таким email есть и пароля у него нет → пароль устанавливается;
 *  - сотрудника нет → создаётся администратор (и аккаунт компании, если его ещё нет);
 *  - пароль уже задан → ничего не меняется (существующий пароль никогда не перезаписывается).
 */
export async function bootstrapAdminFromEnv(env: NodeJS.ProcessEnv = process.env): Promise<'skipped' | 'password-set' | 'created' | 'exists'> {
  const email = env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!email || !password) return 'skipped';

  const weak = validatePassword(password);
  if (weak) {
    console.error(`[auth] BOOTSTRAP_ADMIN_PASSWORD не принят: ${weak}`);
    return 'skipped';
  }

  const existing = await findEmployeeAuthByEmailQuery(email);
  if (existing) {
    if (existing.passwordHash) {
      console.log(`[auth] У ${email} уже задан пароль.`);
      return 'exists';
    }
    await setEmployeePasswordHashQuery(existing.id, await hashPassword(password));
    console.log(`[auth] Для ${email} установлен начальный пароль.`);
    return 'password-set';
  }

  const accountId = env.BOOTSTRAP_ADMIN_ACCOUNT_ID?.trim() || 'acc-aroma';
  const accounts = await getTenantAccountsQuery();
  if (!accounts.some((a: any) => a.id === accountId)) {
    await upsertTenantAccountQuery({
      id: accountId,
      name: env.BOOTSTRAP_ADMIN_ACCOUNT_NAME?.trim() || 'Сеть кофеен «Арома Холдинг»',
      adminEmail: email,
      adminName: env.BOOTSTRAP_ADMIN_NAME?.trim() || 'Администратор',
    });
  }
  await upsertEmployeeQuery({
    id: `emp-admin-${randomBytes(4).toString('hex')}`,
    accountId,
    name: env.BOOTSTRAP_ADMIN_NAME?.trim() || 'Администратор',
    role: 'admin',
    email,
    archived: false,
    passwordHash: await hashPassword(password),
  });
  console.log(`[auth] Создан администратор ${email} в аккаунте ${accountId}.`);
  return 'created';
}
