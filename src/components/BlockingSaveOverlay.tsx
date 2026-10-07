import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Блокирует весь экран, пока данные записываются в БД (то же поведение, что при отправке заказа):
 * нельзя нажать ничего другого, закрыть вкладку без предупреждения или случайно отправить запрос дважды.
 * Включается событием coffee-blocking-save от ApiService.withBlockingSave.
 */
export const BlockingSaveOverlay: React.FC = () => {
  const [state, setState] = useState<{ active: boolean; message: string }>({ active: false, message: '' });

  useEffect(() => {
    const handler = (event: Event) => {
      const { active, message } = (event as CustomEvent).detail ?? {};
      setState((prev) => ({ active: Boolean(active), message: active ? message || prev.message : '' }));
    };
    window.addEventListener('coffee-blocking-save', handler);
    return () => window.removeEventListener('coffee-blocking-save', handler);
  }, []);

  useEffect(() => {
    if (!state.active) return;
    const root = document.getElementById('root');
    // inert: страница под окном недоступна и для мыши, и для клавиатуры (Enter по кнопке под окном)
    root?.setAttribute('inert', '');
    document.body.classList.add('modal-open');
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'Данные сохраняются на сервере. Пожалуйста, дождитесь завершения!';
      return e.returnValue;
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      root?.removeAttribute('inert');
      document.body.classList.remove('modal-open');
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [state.active]);

  if (!state.active) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex select-none items-center justify-center bg-stone-950/75 p-4 backdrop-blur-sm"
      style={{ pointerEvents: 'all' }}
      role="alertdialog"
      aria-modal="true"
      aria-live="assertive"
      aria-busy="true"
      aria-label={state.message || 'Сохранение данных'}
    >
      <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-6 text-center shadow-2xl">
        <div className="relative mx-auto mb-4 size-16">
          <div className="size-16 animate-spin rounded-full border-4 border-amber-200 border-t-amber-600" />
          <span className="absolute inset-0 flex items-center justify-center text-xl" aria-hidden="true">☕</span>
        </div>
        <h2 className="text-base font-bold text-stone-900">{state.message || 'Сохраняем данные…'}</h2>
        <p className="mt-1.5 text-xs leading-5 text-stone-500">Не закрывайте страницу и ничего не нажимайте — это займёт несколько секунд.</p>
      </div>
    </div>,
    document.body,
  );
};

export default BlockingSaveOverlay;
