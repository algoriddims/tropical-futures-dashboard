import { beforeEach, describe, expect, it } from 'vitest';
import { installStorage } from './memoryStorage';
import type { MemoryStorage } from './memoryStorage';
import { DEFAULT_LOOK, loadLook, saveLook } from '../../terminal/look';

let store: MemoryStorage;
beforeEach(() => { store = installStorage(); });

describe('look preference', () => {
  it('defaults to paper', () => {
    expect(DEFAULT_LOOK).toBe('paper');
    expect(loadLook()).toBe('paper');
  });

  it('remembers the choice', () => {
    saveLook('terminal');
    expect(loadLook()).toBe('terminal');
  });

  it('ignores junk and survives blocked storage', () => {
    store.setItem('tfi-look-v1', 'neon');
    expect(loadLook()).toBe('paper');
    store.failWrites = true;
    expect(() => saveLook('terminal')).not.toThrow();
  });
});
