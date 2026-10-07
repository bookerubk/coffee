/** Если видимая область стала ниже этой доли от обычной высоты окна — считаем, что открыта экранная клавиатура. */
export const KEYBOARD_HEIGHT_RATIO = 0.8;

export function isKeyboardOpen(visibleHeight: number, referenceHeight: number): boolean {
  if (!referenceHeight || referenceHeight <= 0) return false;
  return visibleHeight < referenceHeight * KEYBOARD_HEIGHT_RATIO;
}
