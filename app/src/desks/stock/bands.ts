// Colour and name of each stock-age band, shared by the Stock desk's tiles and charts.
import type { AgeBand } from '@/analytics/stock';
import { AGE_BANDS } from '@/analytics/stock';

export const BAND_COLOR: Record<AgeBand, string> = {
  NEW: 'var(--age-new)', AGED: 'var(--age-aged)', LAST_CALL: 'var(--age-late)', ARCHIVE: 'var(--age-archive)',
  TIMELESS: 'var(--phase-1)', UNKNOWN: 'var(--vhs-dim)',
};

export const BAND_LABEL: Record<AgeBand, string> = {
  ...Object.fromEntries(AGE_BANDS.map((b) => [b.band, b.label.toUpperCase()])) as Record<'NEW' | 'AGED' | 'LAST_CALL' | 'ARCHIVE', string>,
  TIMELESS: 'TIMELESS', UNKNOWN: 'NOT ON THE WEBSTORE',
};

