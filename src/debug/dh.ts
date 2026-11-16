// window.__dh: the debug / QA handle (successor of v6's __dh6). Tools (tools/cap.mjs, the mini-game sandbox, the bot) drive the
// game only through this object. Modules register their own entries with dh.add(); keep every entry callable from a console.
import { G } from '../platform/index';

export interface DhApi {
  /** Build stamp and active flags. */
  info(): Record<string, unknown>;
  /** Per-frame render stats of the last frame. */
  stats(): Record<string, unknown>;
  [k: string]: unknown;
}

const api: DhApi = {
  info: () => ({}),
  stats: () => ({}),
};

export const dh = {
  api,
  add(entries: Partial<DhApi>) { Object.assign(api, entries); },
  install() { G.__dh = api; },
  /** Mark the game as booted (sandbox and capture tools wait for these). */
  ready() { G.__dhready = true; G.__booted = true; },
  fail(err: unknown) { const s = String((err as Error)?.stack || err); G.__bootError = s; },
};
