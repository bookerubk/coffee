import React, { useEffect } from 'react';
import { SaveState } from '../../types';
import { Loader2, CheckCircle2, AlertTriangle, RefreshCw, HardDrive, X } from 'lucide-react';

interface SavingOverlayModalProps {
  state: SaveState;
  errorMessage?: string;
  onRetry: () => void;
  onSaveLocally: () => void;
  onCloseError: () => void;
}

export const SavingOverlayModal: React.FC<SavingOverlayModalProps> = ({
  state,
  errorMessage,
  onRetry,
  onSaveLocally,
  onCloseError,
}) => {
  // Prevent page navigation or accidental closing while saving (Section 4.2)
  useEffect(() => {
    if (state !== 'IDLE') {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }

    if (state === 'SAVING') {
      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        e.preventDefault();
        e.returnValue = 'Заявка отправляется на сервер. Пожалуйста, дождитесь завершения!';
        return e.returnValue;
      };

      window.addEventListener('beforeunload', handleBeforeUnload);

      // Hardware back button protection
      window.history.pushState(null, '', window.location.href);
      const handlePopState = () => {
        window.history.pushState(null, '', window.location.href);
      };
      window.addEventListener('popstate', handlePopState);

      return () => {
        document.body.classList.remove('modal-open');
        window.removeEventListener('beforeunload', handleBeforeUnload);
        window.removeEventListener('popstate', handlePopState);
      };
    }

    return () => {
      document.body.classList.remove('modal-open');
    };
  }, [state]);

  if (state === 'IDLE') return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-950/75 backdrop-blur-sm select-none"
      style={{ pointerEvents: 'all' }}
      aria-modal="true"
      role="dialog"
    >
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-stone-200 p-4 sm:p-6 text-center animate-in fade-in zoom-in-95 duration-200 my-auto">
        {state === 'SAVING' && (
          <div className="py-4 space-y-4">
            <div className="flex justify-center">
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-4 border-amber-200 border-t-amber-600 animate-spin flex items-center justify-center"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xl">☕</span>
                </div>
              </div>
            </div>
            <div>
              <h3 className="text-lg font-bold text-stone-900">Сохраняем заявку…</h3>
              <p className="text-sm text-stone-500 mt-1">
                Передаём данные на производство. Пожалуйста, не закрывайте и не обновляйте страницу.
              </p>
            </div>
            <div className="w-full bg-stone-100 h-1.5 rounded-full overflow-hidden">
              <div className="bg-amber-600 h-full w-2/3 animate-pulse rounded-full"></div>
            </div>
            <p className="text-xs text-stone-400">Синхронная защита от повторной отправки активна</p>
          </div>
        )}

        {state === 'SUCCESS' && (
          <div className="py-4 space-y-4">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center animate-in zoom-in-75 duration-300">
                <CheckCircle2 className="w-10 h-10 stroke-[2.5]" />
              </div>
            </div>
            <div>
              <h3 className="text-lg font-bold text-emerald-950">Заявка успешно сохранена!</h3>
              <p className="text-sm text-stone-600 mt-1">
                Заказ зарегистрирован и передан в сводный план производства.
              </p>
            </div>
          </div>
        )}

        {state === 'ERROR' && (
          <div className="py-2 space-y-4 text-left">
            <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-xl text-red-900">
              <div className="p-2 bg-red-100 rounded-lg text-red-600 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-semibold text-sm">Не удалось сохранить</h4>
                <p className="text-xs text-red-700 mt-0.5">
                  {errorMessage || 'Проверьте связь с сервером. Данные не были потеряны.'}
                </p>
              </div>
            </div>

            <p className="text-xs text-stone-600 leading-relaxed">
              Вы можете немедленно повторить отправку (idempotency-ключ защищает от дублирования) либо
              сохранить копию в память устройства и отправить позже.
            </p>

            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={onRetry}
                className="w-full py-3 px-4 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-medium rounded-xl flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Повторить отправку</span>
              </button>

              <button
                type="button"
                onClick={onSaveLocally}
                className="w-full py-2.5 px-4 bg-stone-100 hover:bg-stone-200 active:bg-stone-300 text-stone-800 font-medium rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <HardDrive className="w-4 h-4 text-stone-600" />
                <span>Сохранить локально на устройстве</span>
              </button>

              <button
                type="button"
                onClick={onCloseError}
                className="w-full py-2 text-stone-500 hover:text-stone-700 text-xs text-center transition-colors cursor-pointer"
              >
                Вернуться к редактированию
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
