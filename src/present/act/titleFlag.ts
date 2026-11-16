// Which start screen a page load opens with (title.ts, the 开始画面 with its menu) — kept apart from it so the rule can be tested
// without a canvas. The old rainy-night opening (opening.ts) is still there behind ?opening.

/** how many title variants there are (title.ts TITLES; tests keep the two in step) */
export const TITLE_COUNT = 5;

/** the title variant this page load opens with, 0 = none. ?title / ?title=N (#title, #title=N) picks one, also in a headless
 *  browser; a plain load in a browser gets variant 1; ?skip / #skip and ?run skip it, ?opening asks for the old opening instead;
 *  a headless browser (tools/cap.mjs, the bot — they wait for the yard) skips it unless ?title asks */
export function wantTitle(href = typeof location !== 'undefined' ? location.href : '', ua = typeof navigator !== 'undefined' ? navigator.userAgent : '', webdriver = typeof navigator !== 'undefined' && !!navigator.webdriver) {
  if (/[?&#](skip|run)\b/.test(href)) return 0;
  const m = /[?&#]title(?:=(\d+))?(?![\w-])/.exec(href);
  if (m) return Math.max(1, Math.min(TITLE_COUNT, +(m[1] ?? 1) || 1));
  if (/[?&#]opening\b/.test(href)) return 0;
  return webdriver || /HeadlessChrome/.test(ua) ? 0 : 1;
}
