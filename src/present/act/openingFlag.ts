// When the opening (opening.ts, 开场「雨夜听雨」) plays — kept apart from it so the rule can be tested without a canvas.

/** does this page load start with the opening? ?skip / #skip and ?run skip it; ?opening / #opening forces it, also in a headless
 *  browser, which otherwise skips it (the capture / bot scripts wait for the yard) */
export function wantOpening(href = typeof location !== 'undefined' ? location.href : '', ua = typeof navigator !== 'undefined' ? navigator.userAgent : '', webdriver = typeof navigator !== 'undefined' && !!navigator.webdriver) {
  if (/[?&#](skip|run)\b/.test(href)) return false;
  if (/[?&#]opening\b/.test(href)) return true;
  return !(webdriver || /HeadlessChrome/.test(ua));
}
