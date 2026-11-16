import wenkaiUrl from '../../../fonts/body/wenkai.woff2?inline';
import serifUrl from '../../../fonts/body/serif.woff2?inline';
import sansUrl from '../../../fonts/body/sans.woff2?inline';
import { text, textW, PIX_H } from '../v2/overlay';

export type BodyFont = 'wenkai' | 'serif' | 'sans' | 'pixel';
export const BODY_FONT_NAME: Record<BodyFont, string> = { wenkai: '文楷', serif: '宋体', sans: '黑体', pixel: '像素' };
const families: Record<Exclude<BodyFont, 'pixel'>, string> = { wenkai: 'UBWenKai', serif: 'UBSerif', sans: 'UBSans' };
const urls = { wenkai: wenkaiUrl, serif: serifUrl, sans: sansUrl };
const listeners = new Set<() => void>();
function savedFont(): BodyFont {
  try { const value = localStorage.getItem('ub.font') as BodyFont; if (value in BODY_FONT_NAME) return value; } catch { /* storage unavailable */ }
  return 'wenkai';
}
export const BODY_FONT = { current: savedFont(), version: 0 };
export function onBodyFontChange(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); }
function changed() { BODY_FONT.version++; for (const fn of listeners) fn(); }
export function setBodyFont(font: BodyFont) {
  if (BODY_FONT.current === font) return;
  BODY_FONT.current = font;
  try { localStorage.setItem('ub.font', font); } catch { /* storage unavailable */ }
  changed();
}
export const fontsReady: Promise<void> = typeof document === 'undefined' || typeof FontFace === 'undefined'
  ? Promise.resolve()
  : Promise.all((Object.keys(urls) as Array<Exclude<BodyFont, 'pixel'>>).map(async key => {
      try {
        const face = new FontFace(families[key], `url(${urls[key]})`);
        document.fonts.add(face);
        await face.load();
        changed();
      } catch { /* the canvas fallback remains available */ }
    })).then(() => {});

function useFont(g: CanvasRenderingContext2D, px: number) {
  const family = BODY_FONT.current === 'pixel' ? '' : families[BODY_FONT.current];
  g.font = `${px}px ${family}, sans-serif`;
  g.textBaseline = 'top';
}
export function bodyText(g: CanvasRenderingContext2D, value: string, x: number, y: number, px: number, color: string,
  align: 'left' | 'center' | 'right' = 'left', outline: string | null = null) {
  if (BODY_FONT.current === 'pixel') return text(g, value, x, y, Math.max(1, Math.round(px / PIX_H)), color, align, outline);
  g.save(); useFont(g, px); g.textAlign = align; g.fillStyle = color;
  if (outline) { g.strokeStyle = outline; g.lineWidth = Math.max(1, Math.min(2, px * 0.1)); g.lineJoin = 'round'; g.strokeText(value, x, y); }
  g.fillText(value, x, y); g.restore();
}
export function bodyW(value: string, px: number) {
  if (BODY_FONT.current === 'pixel') return textW(value, Math.max(1, Math.round(px / PIX_H)));
  if (typeof document === 'undefined') return value.length * px;
  const g = measureCtx ?? (measureCtx = document.createElement('canvas').getContext('2d')!);
  useFont(g, px); return g.measureText(value).width;
}
let measureCtx: CanvasRenderingContext2D | null = null;
