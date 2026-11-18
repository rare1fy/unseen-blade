import { G, HAS_DOM } from './index';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
interface CrazySdk {
  init(): Promise<void>;
  data: Store;
  game: { loadingStart(): void; loadingStop(): void; gameplayStart(): void; gameplayStop(): void };
}

export const CRAZYGAMES = __CG__;
let sdk: CrazySdk | undefined;
let playing = false;
let loading = false;

/** An unavailable CDN or a stalled init must not keep the title screen from opening. */
export async function initCrazyGames() {
  if (!CRAZYGAMES || !HAS_DOM) return;
  const get = (): CrazySdk | undefined => G.CrazyGames?.SDK;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let script: HTMLElement | null = null;
  let settled: (() => void) | undefined;
  try {
    const prepare = async () => {
      script = document.getElementById('crazygames-sdk');
      if (!get() && script) await new Promise<void>(resolve => {
        settled = () => resolve();
        script!.addEventListener('load', settled, { once: true });
        script!.addEventListener('error', settled, { once: true });
      });
      const candidate = get();
      if (candidate) await candidate.init();
      return candidate;
    };
    sdk = await Promise.race([prepare(), new Promise<undefined>(resolve => { timer = setTimeout(resolve, 3000); })]);
    if (sdk) { sdk.game.loadingStart(); loading = true; }
  } catch { /* the game and its local save still work offline */ }
  finally {
    clearTimeout(timer);
    if (settled) {
      const element = script as HTMLElement | null;
      element?.removeEventListener('load', settled);
      element?.removeEventListener('error', settled);
    }
  }
}

export function finishLoading() {
  if (!loading) return;
  loading = false;
  try { sdk?.game.loadingStop(); } catch { /* telemetry is best-effort */ }
}

export function reportGameplay(active: boolean) {
  if (!sdk || active === playing) return;
  playing = active;
  try { if (active) sdk.game.gameplayStart(); else sdk.game.gameplayStop(); } catch { /* telemetry is best-effort */ }
}

/** SDK saves are authoritative after init, including an empty slot. */
export const profileStorage: Store = {
  getItem(key) {
    try { if (sdk?.data) return sdk.data.getItem(key); } catch { /* Data Module unavailable */ }
    return localStorage.getItem(key);
  },
  setItem(key, value) {
    try { if (sdk?.data) { sdk.data.setItem(key, value); return; } } catch { /* Data Module unavailable */ }
    localStorage.setItem(key, value);
  },
  removeItem(key) {
    try { if (sdk?.data) { sdk.data.removeItem(key); return; } } catch { /* Data Module unavailable */ }
    localStorage.removeItem(key);
  },
};
