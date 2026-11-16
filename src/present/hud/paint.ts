// Canvas painting helpers for the HUD: rounded panels, rich text lines, measured to fit. Everything is drawn at device resolution.
import { makeCanvas } from '../../platform/index';

export const FONT = '"Microsoft YaHei UI","Microsoft YaHei","PingFang SC","Hiragino Sans GB","Noto Sans SC","Source Han Sans SC",sans-serif';
export interface Span { t: string; c?: string; s?: number; w?: number }
export interface TextStyle { size?: number; color?: string; weight?: number; stroke?: string; strokeW?: number; shadow?: string; align?: 'left' | 'center' | 'right'; gradient?: [string, string] }

const measureCv = makeCanvas(8, 8), mg = measureCv.getContext('2d') as CanvasRenderingContext2D;
export function fontOf(size: number, weight = 800) { return `${weight} ${size}px ${FONT}`; }
export function measure(spans: Span[], st: TextStyle) {
  let w = 0, h = 0;
  for (const s of spans) { const size = s.s ?? st.size ?? 16; mg.font = fontOf(size, s.w ?? st.weight); w += mg.measureText(s.t).width; h = Math.max(h, size); }
  return { w, h };
}

export function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r); g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
}

/** Draw a line of spans with optional stroke / shadow / gradient, starting at (x, baselineY). */
export function drawSpans(g: CanvasRenderingContext2D, spans: Span[], st: TextStyle, x: number, y: number, k: number) {
  let cx = x;
  for (const s of spans) {
    const size = (s.s ?? st.size ?? 16) * k; g.font = fontOf(size, s.w ?? st.weight); g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    const tw = g.measureText(s.t).width;
    if (st.shadow) { g.save(); g.fillStyle = st.shadow; g.globalAlpha = 0.7; g.fillText(s.t, cx + 2 * k, y + 3 * k); g.restore(); }
    if (st.stroke) { g.lineJoin = 'round'; g.lineWidth = (st.strokeW ?? 4) * k; g.strokeStyle = st.stroke; g.strokeText(s.t, cx, y); }
    if (st.gradient && !s.c) { const gr = g.createLinearGradient(0, y - size, 0, y); gr.addColorStop(0, st.gradient[0]); gr.addColorStop(1, st.gradient[1]); g.fillStyle = gr; }
    else g.fillStyle = s.c ?? st.color ?? '#fff';
    g.fillText(s.t, cx, y);
    cx += tw;
  }
}

export function canvasOf(w: number, h: number) { const c = makeCanvas(Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h))); return { c, g: c.getContext('2d') as CanvasRenderingContext2D }; }
