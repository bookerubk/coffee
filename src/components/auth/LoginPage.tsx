import React, { useEffect, useState } from 'react';
import { Coffee, ArrowRight, UserPlus, LogIn } from 'lucide-react';
import { UserSession, TenantAccount } from '../../types';
import { StorageManager } from '../../services/storage';
import { ApiService } from '../../services/api';

interface LoginPageProps {
  onLogin: (session: UserSession) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const [isRegistration, setIsRegistration] = useState(false);
  const [accounts, setAccounts] = useState<TenantAccount[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const loadAccounts = async () => {
      try {
        const data = await ApiService.getHandbooks();
        setAccounts(data.accounts?.length ? data.accounts : StorageManager.getTenantAccounts());
      } catch {
        setAccounts(StorageManager.getTenantAccounts());
      }
    };
    loadAccounts();
  }, []);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!email.trim() || !password.trim() || (isRegistration && !name.trim())) {
      setError('Заполните все обязательные поля.');
      return;
    }

    setIsSubmitting(true);
    const account = accounts[0] || StorageManager.getTenantAccounts()[0];
    if (!account) {
      setError('Не найден аккаунт компании. Обратитесь к администратору.');
      setIsSubmitting(false);
      return;
    }

    const employees = StorageManager.getEmployees();
    const employee = employees.find((item) => (item as typeof item & { email?: string }).email?.toLowerCase() === email.trim().toLowerCase());
    const session: UserSession = {
      id: employee?.id || `user-${Date.now()}`,
      name: employee?.name || name.trim() || email.trim().split('@')[0],
      role: employee?.role || 'shift_supervisor',
      accountId: employee?.accountId || account.id,
      accountName: account.name,
      dbSchema: account.dbSchema,
      email: email.trim(),
      pointId: employee?.pointId,
      workshopId: employee?.workshopId,
      driverId: employee?.driverId,
    };

    StorageManager.setCurrentUser(session);
    StorageManager.setActiveAccountId(session.accountId);
    onLogin(session);
    setIsSubmitting(false);
  };

  return (
    <main className="min-h-screen bg-stone-100 px-4 py-8 text-stone-900 sm:flex sm:items-center sm:justify-center sm:px-6">
      <section className="mx-auto w-full max-w-md">
        <header className="mb-6 text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-amber-800 text-amber-100 shadow-md">
            <Coffee className="size-7" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Кофейня → Производство</h1>
          <p className="mt-2 text-sm leading-6 text-stone-500">Рабочая область для сотрудников компании</p>
        </header>

        <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-xl sm:p-8">
          <div className="mb-6 flex rounded-xl bg-stone-100 p-1" role="tablist" aria-label="Тип действия">
            <button type="button" role="tab" aria-selected={!isRegistration} onClick={() => { setIsRegistration(false); setError(''); }} className={`flex-1 rounded-lg px-3 py-3 text-sm font-bold transition ${!isRegistration ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'}`}>
              <LogIn className="mr-2 inline size-4" aria-hidden="true" />Войти
            </button>
            <button type="button" role="tab" aria-selected={isRegistration} onClick={() => { setIsRegistration(true); setError(''); }} className={`flex-1 rounded-lg px-3 py-3 text-sm font-bold transition ${isRegistration ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'}`}>
              <UserPlus className="mr-2 inline size-4" aria-hidden="true" />Регистрация
            </button>
          </div>

          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
            После регистрации сотрудник получает базовый доступ. Роль и рабочие объекты назначает администратор компании.
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {isRegistration && (
              <label className="flex flex-col gap-2 text-sm font-semibold">
                Имя сотрудника
                <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" className="rounded-xl border border-stone-300 bg-stone-50 px-4 py-3 text-base outline-none focus:ring-2 focus:ring-amber-700" placeholder="Иван Петров" />
              </label>
            )}
            <label className="flex flex-col gap-2 text-sm font-semibold">
              Email
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" className="rounded-xl border border-stone-300 bg-stone-50 px-4 py-3 text-base outline-none focus:ring-2 focus:ring-amber-700" placeholder="employee@company.ru" />
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold">
              Пароль
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={isRegistration ? 'new-password' : 'current-password'} className="rounded-xl border border-stone-300 bg-stone-50 px-4 py-3 text-base outline-none focus:ring-2 focus:ring-amber-700" placeholder="Введите пароль" />
            </label>
            {error && <p role="alert" className="text-sm font-medium text-rose-700">{error}</p>}
            <button type="submit" disabled={isSubmitting} className="mt-2 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-amber-800 px-4 py-3 text-base font-bold text-white transition hover:bg-amber-900 disabled:opacity-60">
              {isRegistration ? 'Зарегистрироваться' : 'Войти'}
              <ArrowRight className="size-5" aria-hidden="true" />
            </button>
          </form>
        </div>
      </section>
    </main>
  );
};

export default LoginPage;
