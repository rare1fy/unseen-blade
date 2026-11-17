// Which start screen a page load opens with (title.ts, the 开始画面 with its menu) — kept apart from it so the rule can be tested
// without a canvas. The old rainy-night opening (opening.ts) is still there behind ?opening.

/** how many title variants there are (title.ts TITLES; tests keep the two in step) */
export const TITLE_COUNT = 5;

/** the title variant this page load opens with, 0 = none. ?title / ?title=N (#title, #title=N) picks one, also in a headless
 *  browser; a plain load in a browser gets the remembered variant (3 by default); ?skip / #skip and ?run skip it, ?opening asks for the old opening instead;
 *  a headless browser (tools/cap.mjs, the bot — they wait for the yard) skips it unless ?title asks */
export function wantTitle(href = typeof location !== 'undefined' ? location.href : '', ua = typeof navigator !== 'undefined' ? navigator.userAgent : '', webdriver = typeof navigator !== 'undefined' && !!navigator.webdriver) {
  if (/[?&#](skip|run)\b/.test(href)) return 0;
  const m = /[?&#]title(?:=(\d+))?(?![\w-])/.exec(href);
  if (m) return Math.max(1, Math.min(TITLE_COUNT, +(m[1] ?? 1) || 1));
  if (/[?&#]opening\b/.test(href)) return 0;
  return webdriver || /HeadlessChrome/.test(ua) ? 0 : savedTitle();
}
/** the variant the player last chose (设置 or the number keys on the title), remembered on this device; the default is 3 (雪夜 · 破庙 —
 *  the user's favourite, 11-17: 「我最喜欢3号，默认3号吧」) */
export const DEFAULT_TITLE = 3;
export function savedTitle() { try { const n = +(localStorage.getItem('ub.title') ?? ''); return n >= 1 && n <= TITLE_COUNT ? n : DEFAULT_TITLE; } catch { return DEFAULT_TITLE; } }
