import type { UserRole } from './types';

/**
 * Единственное меню приложения — плитки под шапкой. Раньше под ними была вторая строка вкладок
 * с теми же разделами, а часть плиток вела на один и тот же экран под разными названиями.
 */
export type TileIcon = 'layers' | 'database' | 'file' | 'truck' | 'factory' | 'coffee';
export type TileColor = 'emerald' | 'violet' | 'blue';

export interface WorkspaceTile {
  /** Экран, который открывает плитка (activeSubView). Уникален в пределах роли. */
  view: string;
  title: string;
  subtitle: string;
  icon: TileIcon;
  color: TileColor;
}

/** Длиннее — на узком экране плитка не вмещает название. Проверяется тестом. */
export const MAX_TILE_TITLE_LENGTH = 22;
export const MAX_TILE_SUBTITLE_LENGTH = 26;

export const WORKSPACE_TILES: Record<UserRole, WorkspaceTile[]> = {
  admin: [
    { view: 'legal_entities', title: 'Рабочая область', subtitle: 'Юрлица и объекты', icon: 'layers', color: 'emerald' },
    { view: 'directories', title: 'Справочники', subtitle: 'Номенклатура, персонал', icon: 'database', color: 'violet' },
    { view: 'discrepancies', title: 'Проверка данных', subtitle: 'Сводка расхождений', icon: 'file', color: 'blue' },
  ],
  shift_supervisor: [
    { view: 'order', title: 'Создание заявки', subtitle: 'Потребности кофейни', icon: 'layers', color: 'emerald' },
    { view: 'deliveries', title: 'Приёмка поставок', subtitle: 'Сверка и приёмка', icon: 'truck', color: 'violet' },
  ],
  production_operator: [
    { view: 'summary', title: 'Сводный заказ', subtitle: 'Что производить', icon: 'factory', color: 'emerald' },
    { view: 'waybills', title: 'Накладные', subtitle: 'Сборка и отправка', icon: 'file', color: 'violet' },
  ],
  driver: [
    { view: 'deliveries', title: 'Мои рейсы', subtitle: 'Маршрут и доставки', icon: 'truck', color: 'emerald' },
  ],
};

export function getWorkspaceTiles(role: UserRole): WorkspaceTile[] {
  return WORKSPACE_TILES[role] ?? [];
}

/** Экран, который открывается первым после входа или переключения роли. */
export function defaultViewFor(role: UserRole): string {
  return getWorkspaceTiles(role)[0]?.view ?? 'order';
}
