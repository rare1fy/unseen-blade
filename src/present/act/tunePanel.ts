// 调参面板（调试用的 DOM 面板，和骰子版 v2/tunePanel 一样只在开发 / 试玩时用）：按 ` 键或点右上角的「调」打开。
// 拉条即时生效；「复制」把当前数值拷成一行 JSON，发给我写回代码。
import { TUNE, TUNE_UI, type TuneKey } from './tune';

/** extra buttons at the top of the panel: a label (re-read after each click) and what it does */
export interface TuneAction { label: () => string; run: () => void }
export function installActTune(actions: TuneAction[] = []) {
  if (typeof document === 'undefined') return;
  const btn = document.createElement('div');
  btn.textContent = '调'; Object.assign(btn.style, { position: 'fixed', right: '8px', top: '8px', width: '30px', height: '30px', lineHeight: '30px', textAlign: 'center',
    font: '14px/30px system-ui,"Microsoft YaHei",sans-serif', color: '#e8dcc0', background: 'rgba(30,26,36,0.72)', border: '1px solid #8a7456', borderRadius: '4px', cursor: 'pointer', zIndex: '20', userSelect: 'none' });
  const pane = document.createElement('div');
  Object.assign(pane.style, { position: 'fixed', right: '8px', top: '44px', width: '260px', maxHeight: '80vh', overflowY: 'auto', padding: '8px 10px', background: 'rgba(20,18,26,0.92)',
    border: '1px solid #8a7456', borderRadius: '6px', font: '12px/1.4 system-ui,"Microsoft YaHei",sans-serif', color: '#e8dcc0', zIndex: '20', display: 'none' });
  // the frame rate (act-14 用户在手机上说帧率低): frames counted over half a second, shown while the panel is open
  const fps = document.createElement('div'); fps.style.margin = '0 0 6px'; pane.append(fps);
  { let n = 0, t0 = performance.now(); const tick = () => { n++; const t = performance.now(); if (t - t0 >= 500) { if (pane.style.display !== 'none') fps.textContent = `帧率：${Math.round(n * 1000 / (t - t0))}`; n = 0; t0 = t; } requestAnimationFrame(tick); }; requestAnimationFrame(tick); }
  for (const a of actions) {
    const b = document.createElement('button'); b.textContent = a.label(); Object.assign(b.style, { width: '100%', margin: '2px 0 6px' });
    b.onclick = () => { a.run(); b.textContent = a.label(); }; pane.append(b);
  }
  for (const [k, name, lo, hi, step] of TUNE_UI) {
    const row = document.createElement('div'); row.style.margin = '4px 0';
    const lab = document.createElement('div'); const inp = document.createElement('input'); inp.type = 'range'; inp.min = String(lo); inp.max = String(hi); inp.step = String(step); inp.value = String(TUNE[k]); inp.style.width = '100%';
    const show = () => { lab.textContent = `${name}：${(+TUNE[k]).toFixed(step < 0.1 ? 2 : step < 1 ? 1 : 0)}`; };
    inp.oninput = () => { (TUNE as Record<TuneKey, number>)[k] = +inp.value; show(); };
    show(); row.append(lab, inp); pane.append(row);
  }
  const copy = document.createElement('button'); copy.textContent = '复制当前数值'; Object.assign(copy.style, { marginTop: '6px', width: '100%' });
  copy.onclick = () => { const s = JSON.stringify(TUNE); void navigator.clipboard?.writeText(s); copy.textContent = '已复制'; setTimeout(() => (copy.textContent = '复制当前数值'), 1200); };
  pane.append(copy);
  const toggle = () => { pane.style.display = pane.style.display === 'none' ? 'block' : 'none'; };
  btn.onclick = toggle; btn.onpointerdown = e => e.stopPropagation(); pane.onpointerdown = e => e.stopPropagation();
  window.addEventListener('keydown', e => { if (e.key === '`') toggle(); });
  document.body.append(btn, pane);
}
