import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installStorage } from './memoryStorage';
import type { MemoryStorage } from './memoryStorage';
import { DEFAULT_LOOK, loadLook, nextLook, saveLook } from '../../terminal/look';

let store: MemoryStorage;
beforeEach(() => { store = installStorage(); });
afterEach(() => { delete (globalThis as { matchMedia?: unknown }).matchMedia; });

const systemPrefersDark = (dark: boolean) => {
  (globalThis as { matchMedia?: unknown }).matchMedia = () => ({ matches: dark });
};

describe('look preference', () => {
  it('defaults to paper when the system preference is unknown or light', () => {
    expect(DEFAULT_LOOK).toBe('paper');
    expect(loadLook()).toBe('paper');
    systemPrefersDark(false);
    expect(loadLook()).toBe('paper');
  });

  it('defaults to dark when the system prefers dark', () => {
    systemPrefersDark(true);
    expect(loadLook()).toBe('dark');
  });

  it('a saved choice beats the system preference', () => {
    systemPrefersDark(true);
    saveLook('paper');
    expect(loadLook()).toBe('paper');
    saveLook('terminal');
    expect(loadLook()).toBe('terminal');
  });

  it('T cycles paper → dark → terminal → paper', () => {
    expect(nextLook('paper')).toBe('dark');
    expect(nextLook('dark')).toBe('terminal');
    expect(nextLook('terminal')).toBe('paper');
  });

  it('ignores junk and survives blocked storage', () => {
    store.setItem('tfi-look-v1', 'neon');
    expect(loadLook()).toBe('paper');
    store.failWrites = true;
    expect(() => saveLook('dark')).not.toThrow();
  });
});
