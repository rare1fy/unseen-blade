/** Device-local settings are separate from the progress slot. The mini-game adapter supplies this API too. */
export const preferences = {
  get(key: string): string | null {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key: string, value: string) {
    try { localStorage.setItem(key, value); } catch { /* private mode */ }
  },
};
