import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isKeyboardOpen } from '../src/utils/viewport.ts';

test('экранная клавиатура определяется по сжатию видимой области', () => {
  assert.equal(isKeyboardOpen(800, 800), false);
  assert.equal(isKeyboardOpen(760, 800), false); // адресная строка браузера — не клавиатура
  assert.equal(isKeyboardOpen(480, 800), true); // типичная клавиатура телефона
  assert.equal(isKeyboardOpen(300, 0), false); // нет опорной высоты — не гадаем
});
