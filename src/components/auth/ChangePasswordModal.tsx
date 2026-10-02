import React, { useState } from 'react';
import { KeyRound, X } from 'lucide-react';
import { ApiService } from '../../services/api';

interface ChangePasswordModalProps {
  onClose: () => void;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ onClose }) => {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (next.length < 8) return setError('Новый пароль должен содержать не менее 8 символов.');
    if (next !== repeat) return setError('Новый пароль и повтор не совпадают.');
    setBusy(true);
    try {
      await ApiService.changePassword(current, next);
      setDone(true);
    } catch (e: any) {
      setError(e?.message || 'Не удалось сменить пароль.');
    } finally {
      setBusy(false);
    }
  };

  const input = 'rounded-xl border border-stone-300 bg-stone-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-700';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/70 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Смена пароля">
      <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-bold text-stone-900">
            <KeyRound className="size-4 text-amber-800" aria-hidden="true" />
            Смена пароля
          </h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-stone-500 hover:text-stone-800" aria-label="Закрыть">
            <X className="size-4" />
          </button>
        </div>

        {done ? (
          <div className="space-y-4 text-sm">
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-900">
              Пароль изменён. На других устройствах потребуется войти заново.
            </p>
            <button type="button" onClick={onClose} className="w-full rounded-xl bg-amber-800 px-4 py-2.5 font-semibold text-white hover:bg-amber-900">
              Готово
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3 text-xs font-semibold">
            <label className="flex flex-col gap-1.5">
              Текущий пароль
              <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" className={input} required />
            </label>
            <label className="flex flex-col gap-1.5">
              Новый пароль (не менее 8 символов)
              <input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" className={input} required />
            </label>
            <label className="flex flex-col gap-1.5">
              Повторите новый пароль
              <input type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" className={input} required />
            </label>
            {error && (
              <p role="alert" className="text-xs font-medium text-rose-700">
                {error}
              </p>
            )}
            <div className="mt-1 flex justify-end gap-2">
              <button type="button" onClick={onClose} className="px-4 py-2 text-stone-500 hover:text-stone-700">
                Отмена
              </button>
              <button type="submit" disabled={busy} className="rounded-xl bg-amber-800 px-4 py-2 font-semibold text-white hover:bg-amber-900 disabled:opacity-60">
                {busy ? 'Сохранение…' : 'Сменить пароль'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ChangePasswordModal;
