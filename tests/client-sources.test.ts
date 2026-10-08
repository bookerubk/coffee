/** Охранные проверки исходников: в клиентском коде не должно быть прошитых демо-значений. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', 'src');
function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : /\.(ts|tsx)$/.test(e.name) ? [full] : [];
  });
}
const clientFiles = walk(root).filter((f) => !f.includes(`${path.sep}db${path.sep}`) && !f.endsWith('mockData.ts') && !f.endsWith('DevSimulationBar.tsx'));

test('в клиентском коде нет прошитых демо-данных (цех, адреса, автомобиль, телефон)', () => {
  const forbidden = ['Грайвороновская', 'Архипов', 'В782', 'ГАЗель NEXT', 'Дежурный бариста', 'Старый Арбат', 'Пресненская наб', '321-45-67', '333-22-11', 'Кофейня №1 (Центральная)'];
  for (const file of clientFiles) {
    const text = fs.readFileSync(file, 'utf8');
    for (const word of forbidden) assert.ok(!text.includes(word), `${path.relative(root, file)} содержит демо-значение «${word}»`);
  }
});

test('клиентский кэш не импортирует демо-наборы (кроме настроек смен по умолчанию)', () => {
  const storage = fs.readFileSync(path.join(root, 'services', 'storage.ts'), 'utf8');
  const imports = [...storage.matchAll(/import \{([^}]*)\} from '\.\/mockData'/g)].flatMap((m) => m[1].split(',').map((x) => x.trim()).filter(Boolean));
  assert.deepEqual(imports, ['INITIAL_SLOTS']);
});

test('кнопка водителя «Подтвердить доставку» вызывает сервер, а не только показывает уведомление', () => {
  const view = fs.readFileSync(path.join(root, 'components', 'driver', 'DriverWorkspaceView.tsx'), 'utf8');
  assert.match(view, /ApiService\.confirmDelivery\(/);
  assert.ok(!/Прибыл в кофейню/.test(view));
});

test('кофейня не может принять поставку до подтверждения: кнопка приёмки скрыта по флагу сервера', () => {
  const view = fs.readFileSync(path.join(root, 'components', 'supervisor', 'SupervisorDeliveriesView.tsx'), 'utf8');
  assert.match(view, /awaitingDeliveryConfirmation/);
  assert.match(view, /status === 'dispatched' && !isAwaitingDriver\(selectedWaybill\)/);
});

test('каталог номенклатуры: окно следует за видимой областью, поиск закреплён вне прокрутки', () => {
  const view = fs.readFileSync(path.join(root, 'components', 'supervisor', 'OrderCreationView.tsx'), 'utf8');
  assert.match(view, /useVisualViewport\(isCatalogOpen\)/);
  assert.match(view, /--vv-height/);
  // поиск и список — соседние блоки, а не поиск внутри прокручиваемого списка
  const catalog = view.slice(view.indexOf('{isCatalogOpen && ('));
  assert.ok(catalog.indexOf('type="search"') < catalog.indexOf('overflow-y-auto'), 'поле поиска должно стоять выше области прокрутки');
});

test('кнопка формирования накладных не называется «Обновить»', () => {
  const view = fs.readFileSync(path.join(root, 'components', 'operator', 'AggregatedOrdersView.tsx'), 'utf8');
  assert.ok(!/Обновить накладные/.test(view));
  assert.match(view, /Добавить накладные для новых заявок/);
});

test('экран цеха: принятую или доставленную накладную нельзя править (водитель и отгрузка заблокированы)', () => {
  const view = fs.readFileSync(path.join(root, 'components', 'operator', 'WaybillsManagementView.tsx'), 'utf8');
  assert.match(view, /const isLocked = isReceivedWaybill \|\| Boolean\(selectedWaybill\?\.deliveredAt\)/);
  assert.equal((view.match(/\sdisabled=\{isLocked\}/g) || []).length, 2, 'должны быть заблокированы и выбор водителя, и поле «своё значение»');
  assert.match(view, /\{!isLocked && \(\s*<button/); // кнопка «отгрузить» скрыта
  assert.match(view, /const isReadonly = isLocked/);
  assert.match(view, /Накладная \(только просмотр\)/);
});

test('форма заявки: список заявок со статусами, подгрузка черновика, постоянное подтверждение', () => {
  const view = fs.readFileSync(path.join(root, 'components', 'supervisor', 'OrderCreationView.tsx'), 'utf8');
  assert.match(view, /<MyOrdersPanel/);
  assert.match(view, /resolveDraftAdoption\(/);
  assert.match(view, /Черновик сохранён в/);
  assert.match(view, /отправлена в цех в/);
  assert.ok(!/Накладная появится в разделе отгрузок/.test(view), 'исчезающее через 4 секунды сообщение заменено постоянным');
  // форма очищается только после отправки, но не после сохранения черновика
  assert.match(view, /if \(!isDraft\) \{\s*const reset/);
});
