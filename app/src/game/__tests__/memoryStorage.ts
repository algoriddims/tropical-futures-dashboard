// Minimal in-memory localStorage for node tests. `failWrites` simulates a
// full or blocked browser store.
export class MemoryStorage {
  private m = new Map<string, string>();
  failWrites = false;
  getItem(k: string): string | null { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string): void {
    if (this.failWrites) throw new Error('QuotaExceededError');
    this.m.set(k, String(v));
  }
  removeItem(k: string): void { this.m.delete(k); }
  clear(): void { this.m.clear(); }
}

export function installStorage(): MemoryStorage {
  const s = new MemoryStorage();
  (globalThis as unknown as { localStorage: MemoryStorage }).localStorage = s;
  return s;
}
