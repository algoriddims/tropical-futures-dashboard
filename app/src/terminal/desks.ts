// Desk keys and names — one name per desk, used by the nav, help and status bar.

export type DeskKey = 's' | 'p' | 'i' | 'l' | 'o' | 'a' | 'n' | 'c' | 'g' | 'f';

export const DESKS: { key: DeskKey; label: string; title: string }[] = [
  { key: 's', label: 'OVERVIEW', title: 'OVERVIEW' },
  { key: 'p', label: 'PRODUCTION', title: 'PRODUCTION' },
  { key: 'g', label: 'PLANNING', title: 'PLANNING' },
  { key: 'i', label: 'INVENTORY', title: 'INVENTORY' },
  { key: 'l', label: 'SHOPS', title: 'SHOPS' },
  { key: 'c', label: 'COSTS', title: 'COSTS' },
  { key: 'o', label: 'ORDERS', title: 'ORDERS' },
  { key: 'a', label: 'ADS', title: 'ADS' },
  { key: 'n', label: 'ALERTS', title: 'ALERTS' },
  { key: 'f', label: 'IMPORTS', title: 'IMPORTS' },
];
