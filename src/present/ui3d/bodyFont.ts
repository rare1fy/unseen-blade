import wenkaiUrl from '../../../fonts/body/wenkai.woff2?inline';
import serifUrl from '../../../fonts/body/serif.woff2?inline';
import sansUrl from '../../../fonts/body/sans.woff2?inline';
import { text, textW, PIX_H } from '../v2/overlay';
import { onLanguageChange, t } from '../act/i18n';
import { firstSounds } from '../../audio/firstSounds';

export type BodyFont = 'wenkai' | 'serif' | 'sans' | 'pixel';
export const BODY_FONT_NAME: Record<BodyFont, string> = { wenkai: '文楷', serif: '宋体', sans: '黑体', pixel: '像素' };
const families: Record<Exclude<BodyFont, 'pixel'>, string> = { wenkai: 'UBWenKai', serif: 'UBSerif', sans: 'UBSans' };
const allUrls: Record<Exclude<BodyFont, 'pixel'>, string> = { wenkai: wenkaiUrl, serif: serifUrl, sans: sansUrl };
const activeKeys = (Object.keys(allUrls) as Array<Exclude<BodyFont, 'pixel'>>).filter(k => !!allUrls[k]);
const urls = allUrls;
const listeners = new Set<() => void>();
function savedFont(): BodyFont {
  if (!__DEBUG_UI__) return 'wenkai';   // (11-18: the packages have no font switch)
  try { const value = localStorage.getItem('ub.font') as BodyFont; if (value in BODY_FONT_NAME) return value; } catch { /* storage unavailable */ }
  return 'wenkai';
}
export const BODY_FONT = { current: savedFont(), version: 0 };
export function onBodyFontChange(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); }
function changed() { BODY_FONT.version++; for (const fn of listeners) fn(); }
onLanguageChange(changed);
export function setBodyFont(font: BodyFont) {
  if (BODY_FONT.current === font) return;
  BODY_FONT.current = font;
  try { localStorage.setItem('ub.font', font); } catch { /* storage unavailable */ }
  changed();
}
/** the family each body font goes by in canvas text (the browser: the FontFace names; WeChat: what wx.loadFont returns) */
const loaded: Record<Exclude<BodyFont, 'pixel'>, string> = { ...families };
const wxFont = typeof wx !== 'undefined' ? (wx as { loadFont?: (path: string) => string | null }).loadFont : undefined;
// 11-18 微信小游戏: the fonts are package files there and wx.loadFont registers them (no FontFace); a font it can't load is drawn
// in the device's own font
// (the TrueType files sit in the `fonts` subpackage — the main package has to stay under 4 MB — loaded in the background: the game
// starts at once in the device's font and switches when they're in; 11-18: the download starts after the first sounds', at most 3 s
// after the sound starts — audio/firstSounds.ts. fontsReady itself never waits for it: main.ts boots the game on it, and the game
// is what starts the sound)
const wxLoadFonts = () => {
  let ok = false;
  for (const k of activeKeys) {
    try {
      const fam = wxFont!(urls[k]) || '';
      loaded[k] = fam;
      if (fam) ok = true;
      else console.warn('[font] wx.loadFont returned empty for', urls[k]);
    } catch (e) {
      loaded[k] = '';
      console.warn('[font] wx.loadFont failed for', urls[k], e);
    }
  }
  changed();
  // iOS high-performance+ registers loaded TTFs asynchronously with CoreText; trigger one follow-up repaint once ready.
  if (ok && typeof setTimeout === 'function') setTimeout(() => changed(), 120);
};
export const fontsReady: Promise<void> = wxFont
  ? Promise.resolve().then(() => {
      const sub = (wx as { loadSubpackage?: (o: { name: string; success: () => void; fail: () => void }) => void }).loadSubpackage;
      const g = typeof GameGlobal !== 'undefined' ? (GameGlobal as { __ubSinglePkg?: boolean; __ubTapMiniGame?: boolean }) : undefined;
      const isSinglePkg = !!g?.__ubSinglePkg;
      if (isSinglePkg && g?.__ubTapMiniGame) {
        // TapTap single-package omits wenkai.ttf (~0.94 MB) to keep cold-start download tiny; use crisp system sans-serif.
        for (const k of activeKeys) loaded[k] = '';
      } else if (sub && !isSinglePkg && /^fonts\//.test(urls.wenkai)) { for (const k of activeKeys) loaded[k] = ''; void firstSounds.then(() => sub({ name: 'fonts', success: wxLoadFonts, fail: () => changed() })); }
      else if (typeof setTimeout === 'function') {
        // The title screen uses pixel bitmap glyphs, not wenkai.ttf — defer synchronous wx.loadFont
        // until after first frame so cold start never stalls parsing a ~1 MB TTF on the main thread.
        for (const k of activeKeys) loaded[k] = '';
        setTimeout(wxLoadFonts, 1200);
      }
      else wxLoadFonts();
    })
  : typeof document === 'undefined' || typeof FontFace === 'undefined'
  ? Promise.resolve()
  : Promise.all(activeKeys.map(async key => {
      try {
        const face = new FontFace(families[key], `url(${urls[key]})`);
        document.fonts.add(face);
        await face.load();
        changed();
      } catch { /* the canvas fallback remains available */ }
    })).then(() => {});

function useFont(g: CanvasRenderingContext2D, px: number) {
  const family = BODY_FONT.current === 'pixel' ? '' : loaded[BODY_FONT.current];
  // Quote family name so multi-word names returned by wx.loadFont (e.g. "LXGW WenKai GB Screen") parse reliably on iOS/Android Canvas2D.
  g.font = family ? `${px}px "${family.replace(/"/g, '\\"')}", sans-serif` : `${px}px sans-serif`;
  g.textBaseline = 'top';
}
/** 11-19: a string starting with this is drawn / measured as it is (no translation): text already in the reader's language, cut up */
export const NOTR = '';
const tr = (v: string) => (v.charCodeAt(0) === 1 ? v.slice(1) : t(v));
export function bodyText(g: CanvasRenderingContext2D, value: string, x: number, y: number, px: number, color: string,
  align: 'left' | 'center' | 'right' = 'left', outline: string | null = null) {
  value = tr(value);
  if (BODY_FONT.current === 'pixel') return text(g, value, x, y, Math.max(1, Math.round(px / PIX_H)), color, align, outline);
  g.save(); useFont(g, px); g.textAlign = align; g.fillStyle = color;
  if (outline) { g.strokeStyle = outline; g.lineWidth = Math.max(1, Math.min(2, px * 0.1)); g.lineJoin = 'round'; g.strokeText(value, x, y); }
  g.fillText(value, x, y); g.restore();
}
export function bodyW(value: string, px: number) {
  value = tr(value);
  if (BODY_FONT.current === 'pixel') return textW(value, Math.max(1, Math.round(px / PIX_H)));
  if (typeof document === 'undefined') return value.length * px;
  const g = measureCtx ?? (measureCtx = document.createElement('canvas').getContext('2d')!);
  useFont(g, px); return g.measureText(value).width;
}
let measureCtx: CanvasRenderingContext2D | null = null;
