// The opening (开场「雨夜听雨」) plays on the first entry only; the URL and headless capture scripts can skip or force it, and ?run
// still goes straight into a run (show.ts checks ?run before asking wantOpening).
import { describe, it, expect } from 'vitest';
import { wantOpening } from '../src/present/act/openingFlag';

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36';
const HEADLESS = CHROME.replace('Chrome/', 'HeadlessChrome/');

describe('when the opening plays', () => {
  it('plays on a plain page load in a browser', () => {
    expect(wantOpening('http://127.0.0.1:5237/', CHROME, false)).toBe(true);
    expect(wantOpening('https://rare1fy.github.io/unseen-blade/#px2', CHROME, false)).toBe(true);
  });
  it('?skip / #skip and ?run skip it', () => {
    for (const u of ['http://x/?skip', 'http://x/#skip', 'http://x/#px2&skip', 'http://x/?run', 'http://x/?px=2&skip=1']) expect(wantOpening(u, CHROME, false)).toBe(false);
  });
  it('headless capture scripts skip it unless ?opening asks for it', () => {
    expect(wantOpening('http://x/', HEADLESS, false)).toBe(false);
    expect(wantOpening('http://x/', CHROME, true)).toBe(false);
    expect(wantOpening('http://x/?opening', HEADLESS, false)).toBe(true);
    expect(wantOpening('http://x/#opening', HEADLESS, true)).toBe(true);
    expect(wantOpening('http://x/?opening&skip', CHROME, false)).toBe(false);
  });
  it('does not mistake other words for the switches', () => {
    expect(wantOpening('http://x/?skipper', CHROME, false)).toBe(true);
    expect(wantOpening('http://x/?runway', HEADLESS, false)).toBe(false);
  });
});
