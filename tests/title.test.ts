// The start screen (title.ts, 开始画面 with its menu): a plain page load in a browser opens variant 1; ?title=N picks one (also
// headless, for captures); ?skip / ?run skip it; ?opening asks for the old rainy-night opening instead; headless capture scripts
// (tools/cap.mjs, the bot — they wait for the yard) skip it unless ?title asks.
import { describe, it, expect } from 'vitest';
import { wantTitle, TITLE_COUNT } from '../src/present/act/titleFlag';
import { wantOpening } from '../src/present/act/openingFlag';

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36';
const HEADLESS = CHROME.replace('Chrome/', 'HeadlessChrome/');

describe('which start screen a page load opens with', () => {
  it('a plain load in a browser opens title variant 1', () => {
    expect(wantTitle('http://127.0.0.1:5237/', CHROME, false)).toBe(1);
    expect(wantTitle('https://rare1fy.github.io/unseen-blade/#px2', CHROME, false)).toBe(1);
  });
  it('?title=N picks a variant (clamped), also headless', () => {
    expect(wantTitle('http://x/?title=3', CHROME, false)).toBe(3);
    expect(wantTitle('http://x/?title=2', HEADLESS, false)).toBe(2);
    expect(wantTitle('http://x/#title=4', CHROME, true)).toBe(4);
    expect(wantTitle('http://x/?title', HEADLESS, false)).toBe(1);
    expect(wantTitle('http://x/?title=99', CHROME, false)).toBe(TITLE_COUNT);
    expect(wantTitle('http://x/?px=2&title=5', CHROME, false)).toBe(5);
  });
  it('?skip / ?run skip it; ?opening hands over to the old opening', () => {
    for (const u of ['http://x/?skip', 'http://x/#skip', 'http://x/?run', 'http://x/?title=2&skip']) expect(wantTitle(u, CHROME, false)).toBe(0);
    expect(wantTitle('http://x/?opening', CHROME, false)).toBe(0);
    expect(wantOpening('http://x/?opening', CHROME, false)).toBe(true);
  });
  it('headless capture scripts go straight to the yard', () => {
    expect(wantTitle('http://x/', HEADLESS, false)).toBe(0);
    expect(wantTitle('http://x/', CHROME, true)).toBe(0);
    expect(wantOpening('http://x/', HEADLESS, false)).toBe(false);
  });
  it('does not mistake other words for the switch', () => {
    expect(wantTitle('http://x/?titles', HEADLESS, false)).toBe(0);
    expect(wantTitle('http://x/?subtitle=2', HEADLESS, false)).toBe(0);
  });
});
