import React, { useState } from 'react';
import { Coffee, ArrowRight, LogIn } from 'lucide-react';
import { UserSession } from '../../types';
import { ApiService } from '../../services/api';

interface LoginPageProps {
  onLogin: (session: UserSession) => void;
  /** Сообщение, почему пользователь оказался на экране входа (например, сессия истекла). */
  notice?: string;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLogin, notice }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;
    setError('');
    if (!email.trim() || !password) {
      setError('Введите email и пароль.');
      return;
    }

    setIsSubmitting(true);
    try {
      const session = await ApiService.login(email.trim(), password);
      setPassword('');
      onLogin(session);
    } catch (e: any) {
      setError(e?.message || 'Не удалось выполнить вход.');
    } finally {
      setIsSubmitting(false);
    }
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
          {notice && (
            <div role="status" className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
              {notice}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-2 text-sm font-semibold">
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="username"
                autoFocus
                className="rounded-xl border border-stone-300 bg-stone-50 px-4 py-3 text-base outline-none focus:ring-2 focus:ring-amber-700"
                placeholder="employee@company.ru"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold">
              Пароль
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                className="rounded-xl border border-stone-300 bg-stone-50 px-4 py-3 text-base outline-none focus:ring-2 focus:ring-amber-700"
                placeholder="Введите пароль"
              />
            </label>
            {error && (
              <p role="alert" className="text-sm font-medium text-rose-700">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-2 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-amber-800 px-4 py-3 text-base font-bold text-white transition hover:bg-amber-900 disabled:opacity-60"
            >
              <LogIn className="size-5" aria-hidden="true" />
              {isSubmitting ? 'Вход…' : 'Войти'}
              {!isSubmitting && <ArrowRight className="size-5" aria-hidden="true" />}
            </button>
          </form>

          <p className="mt-5 text-center text-xs leading-5 text-stone-500">
            Учётную запись создаёт администратор компании. Забыли пароль — обратитесь к администратору.
          </p>
        </div>
      </section>
    </main>
  );
};

export default LoginPage;
