import { useEffect, useRef, useState } from 'react';
import { isKeyboardOpen } from '../utils/viewport';

export interface VisualViewportState {
  /** Высота видимой области (без экранной клавиатуры). */
  height: number;
  /** Смещение видимой области от верха страницы (iOS сдвигает страницу при фокусе в поле). */
  offsetTop: number;
  keyboardOpen: boolean;
}

/**
 * Следит за видимой областью экрана. `100vh` и `fixed bottom-0` на мобильных НЕ учитывают экранную
 * клавиатуру: окно уезжает под неё, а список в нём «схлопывается». Окно, размер которого берётся отсюда,
 * всегда помещается в видимую часть экрана.
 */
export function useVisualViewport(active = true): VisualViewportState {
  const maxHeight = useRef(0);
  const read = (): VisualViewportState => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    const height = Math.round(vv?.height ?? (typeof window !== 'undefined' ? window.innerHeight : 0));
    maxHeight.current = Math.max(maxHeight.current, height, typeof window !== 'undefined' ? window.innerHeight : 0);
    return { height, offsetTop: Math.round(vv?.offsetTop ?? 0), keyboardOpen: isKeyboardOpen(height, maxHeight.current) };
  };
  const [state, setState] = useState<VisualViewportState>(read);

  useEffect(() => {
    if (!active || typeof window === 'undefined') return;
    const vv = window.visualViewport;
    const update = () => setState(read());
    update();
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return state;
}
