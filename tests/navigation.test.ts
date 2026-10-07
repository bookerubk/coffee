/** Меню: одно, без дублей и без «осиротевших» экранов; названия плиток помещаются на узком экране. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MAX_TILE_SUBTITLE_LENGTH, MAX_TILE_TITLE_LENGTH, WORKSPACE_TILES, defaultViewFor, getWorkspaceTiles } from '../src/navigation.ts';
import type { UserRole } from '../src/types/index.ts';

const roles = Object.keys(WORKSPACE_TILES) as UserRole[];
const root = path.resolve(import.meta.dirname, '..');

test('в пределах роли каждая плитка ведёт на свой экран (без дублей под разными названиями)', () => {
  for (const role of roles) {
    const views = getWorkspaceTiles(role).map((t) => t.view);
    assert.equal(new Set(views).size, views.length, `${role}: повторяющиеся экраны ${views}`);
    const titles = getWorkspaceTiles(role).map((t) => t.title);
    assert.equal(new Set(titles).size, titles.length, `${role}: повторяющиеся названия`);
  }
});

test('названия плиток короткие: «Подтвердить доставку»-подобные подписи больше не вылезают за границы', () => {
  for (const role of roles) {
    for (const tile of getWorkspaceTiles(role)) {
      assert.ok(tile.title.length <= MAX_TILE_TITLE_LENGTH, `${role}/${tile.view}: «${tile.title}» длиннее ${MAX_TILE_TITLE_LENGTH}`);
      assert.ok(tile.subtitle.length <= MAX_TILE_SUBTITLE_LENGTH, `${role}/${tile.view}: «${tile.subtitle}» длиннее ${MAX_TILE_SUBTITLE_LENGTH}`);
    }
  }
});

test('каждый экран приложения доступен из меню, и каждая плитка открывает существующий экран', () => {
  // Нижнего меню больше нет — экран, которого нет среди плиток, стал бы недостижимым
  const app = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8');
  const rendered = new Set([...app.matchAll(/activeSubView === '([a-z_]+)'/g)].map((m) => m[1]));
  const inMenu = new Set(roles.flatMap((r) => getWorkspaceTiles(r).map((t) => t.view)));
  assert.deepEqual([...rendered].sort(), [...inMenu].sort());
});

test('Header не содержит второй строки меню (вкладок)', () => {
  const header = fs.readFileSync(path.join(root, 'src', 'components', 'Header.tsx'), 'utf8');
  assert.ok(!/Role Sub-Navigation/i.test(header));
  assert.ok(!/Приёмка поставок \(сверка\)/.test(header));
  assert.match(header, /getWorkspaceTiles\(currentRole\)/);
});

test('стартовый экран роли — первая плитка', () => {
  assert.equal(defaultViewFor('admin'), 'legal_entities');
  assert.equal(defaultViewFor('shift_supervisor'), 'order');
  assert.equal(defaultViewFor('production_operator'), 'summary');
  assert.equal(defaultViewFor('driver'), 'deliveries');
});

test('CSS: текстовый блок плитки умеет сжиматься (иначе длинное название вылезает за плитку)', () => {
  const css = fs.readFileSync(path.join(root, 'src', 'index.css'), 'utf8');
  assert.match(css, /\.workspace-tile > span:last-child\s*\{[^}]*min-width:\s*0/);
  assert.match(css, /\.workspace-tile strong\s*\{[^}]*-webkit-line-clamp:\s*2/);
});
