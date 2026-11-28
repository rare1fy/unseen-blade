// 调参面板（调试用的 DOM 面板，和骰子版 v2/tunePanel 一样只在开发 / 试玩时用）：按 ` 键或点右上角的「调」打开。
// 拉条即时生效；「复制」把当前数值拷成一行 JSON，发给我写回代码。
import { TUNE, TUNE_UI, type TuneKey } from './tune';
import { HAS_DOM } from '../../platform/index';

/** extra buttons at the top of the panel: a label (re-read after each click) and what it does */
export interface TuneAction { label: () => string; run: () => void }
/** open / close the panel from code (the title screen's 设置); a no-op until installActTune has run */
export let toggleActTune = () => {};
/** 11-18 / dual-route: the regions to jump into (supports both South 5-act and North 4-act routes) */
export interface TuneRouteSpec {
  id: 'south' | 'north';
  label: string;
  shortPrefix?: string;
  regions: string[];
  rooms(ri: number): number;
  go(ri: number, room: number, type: 'fight' | 'elite' | 'shop' | 'rest' | 'boon' | 'boss'): string | void;
}
export interface TuneJump {
  /** the regions' names in order (第一关 …) — legacy single-route fallback */
  regions: string[];
  /** go to region ri's room: room = its index in the region (0 = the first room), the boss room = rooms; type = what kind of room.
   *  Returns why it could not (a cutscene / a talk running), or nothing when it went */
  go(ri: number, room: number, type: 'fight' | 'elite' | 'shop' | 'rest' | 'boon' | 'boss'): string | void;
  /** the fight rooms before the boss in region ri */ rooms(ri: number): number;
  /** Optional multi-route tabs (南门旧道 + 北出官道) */
  routes?: TuneRouteSpec[];
}
export interface TuneQuickGroup {
  title: string;
  items: Array<{
    label: string;
    title?: string;
    accent?: 'gold' | 'crimson';
    run: () => string | void;
  }>;
}
export function installActTune(actions: TuneAction[] = [], jump?: TuneJump, quickGroups: TuneQuickGroup[] = []) {
  if (!HAS_DOM || !__DEBUG_UI__) return;
  const btn = document.createElement('div');
  btn.textContent = '调'; Object.assign(btn.style, { position: 'fixed', right: '8px', top: '8px', width: '30px', height: '30px', lineHeight: '30px', textAlign: 'center',
    font: '14px/30px system-ui,"Microsoft YaHei",sans-serif', color: '#e8dcc0', background: 'rgba(30,26,36,0.72)', border: '1px solid #8a7456', borderRadius: '4px', cursor: 'pointer', zIndex: '20', userSelect: 'none' });
  const pane = document.createElement('div');
  Object.assign(pane.style, { position: 'fixed', right: '8px', top: '44px', width: '288px', maxHeight: '82vh', overflowY: 'auto', padding: '8px 10px', background: 'rgba(20,18,26,0.94)',
    border: '1px solid #8a7456', borderRadius: '6px', font: '12px/1.4 system-ui,"Microsoft YaHei",sans-serif', color: '#e8dcc0', zIndex: '20', display: 'none' });
  // the frame rate (act-14 用户在手机上说帧率低): frames counted over half a second, shown while the panel is open
  const fps = document.createElement('div'); fps.style.margin = '0 0 6px'; pane.append(fps);
  { let n = 0, t0 = performance.now(); const tick = () => { n++; const t = performance.now(); if (t - t0 >= 500) { if (pane.style.display !== 'none') fps.textContent = `帧率：${Math.round(n * 1000 / (t - t0))}`; n = 0; t0 = t; } requestAnimationFrame(tick); }; requestAnimationFrame(tick); }
  const styleMini = (b: HTMLButtonElement, on = false, accent?: 'gold' | 'crimson') => {
    const bg = on ? '#8a6a3a' : accent === 'crimson' ? '#5c2224' : accent === 'gold' ? '#4a3a1e' : '#262130';
    const bd = on ? '#e0b868' : accent === 'crimson' ? '#c85848' : accent === 'gold' ? '#c89a48' : '#584b3c';
    const fg = on ? '#fff6e0' : accent === 'crimson' ? '#ffd6cc' : accent === 'gold' ? '#ffe6a8' : '#e8dcc0';
    Object.assign(b.style, {
      flex: '1 0 auto', padding: '3px 6px', minWidth: '46px', cursor: 'pointer',
      background: bg, color: fg, border: `1px solid ${bd}`, borderRadius: '3px',
      font: '12px/1.35 system-ui,"Microsoft YaHei",sans-serif',
    });
  };
  if (jump) {
    // 快速切关: pick route (南门旧道 / 北出官道), region, then room
    const box = document.createElement('div'); Object.assign(box.style, { margin: '0 0 8px', padding: '6px', border: '1px solid #5a4a36', borderRadius: '4px' });
    const head = document.createElement('div'); head.textContent = '快速切关'; head.style.margin = '0 0 4px'; head.style.color = '#ffd88a'; box.append(head);
    const routes: TuneRouteSpec[] = jump.routes?.length
      ? jump.routes
      : [{ id: 'south', label: '南门旧道', regions: jump.regions, rooms: jump.rooms, go: jump.go }];
    let rti = 0, ri = 0;
    const routeRow = document.createElement('div');
    Object.assign(routeRow.style, { display: 'flex', gap: '4px', margin: '0 0 5px' });
    const regRow = document.createElement('div'), roomRow = document.createElement('div'), note = document.createElement('div');
    Object.assign(regRow.style, { display: 'flex', flexWrap: 'wrap', gap: '3px', margin: '0 0 4px' }); Object.assign(roomRow.style, { display: 'flex', flexWrap: 'wrap', gap: '3px' });
    Object.assign(note.style, { margin: '4px 0 0', color: '#c8a070', minHeight: '1em' });
    const drawRooms = () => {
      const cur = routes[rti];
      roomRow.textContent = '';
      const n = cur.rooms(ri), add = (label: string, room: number, type: Parameters<TuneJump['go']>[2], accent?: 'gold' | 'crimson') => {
        const b = document.createElement('button'); b.textContent = label; styleMini(b, false, accent);
        b.onclick = () => { const why = cur.go(ri, room, type); if (why) { note.textContent = why; return; } note.textContent = `${cur.regions[ri]} · ${label}`; pane.style.display = 'none'; };
        roomRow.append(b);
      };
      for (let i = 0; i < n; i++) add(`第${i + 1}间`, i, 'fight');
      add('死士', 2, 'elite'); add('行商', 2, 'shop'); add('歇脚', 2, 'rest'); add('遗卷', 2, 'boon'); add('首领', n, 'boss', 'crimson');
    };
    const drawRegions = () => {
      const cur = routes[rti];
      regRow.textContent = '';
      const cn = '一二三四五六七八九十';
      const btns: HTMLButtonElement[] = [];
      cur.regions.forEach((name, i) => {
        const b = document.createElement('button');
        b.textContent = cur.shortPrefix ? `${cur.shortPrefix}${cn[i] ?? i + 1}` : `${cn[i] ?? i + 1}关`;
        b.title = name; styleMini(b, i === ri);
        b.onclick = () => { ri = i; btns.forEach((x, k) => styleMini(x, k === ri)); drawRooms(); note.textContent = `${cur.label} · ${name}`; };
        regRow.append(b); btns.push(b);
      });
      drawRooms();
      note.textContent = `${cur.label} · ${cur.regions[ri] ?? ''}`;
    };
    if (routes.length > 1) {
      const rBtns: HTMLButtonElement[] = [];
      routes.forEach((rt, idx) => {
        const b = document.createElement('button'); b.textContent = rt.label; styleMini(b, idx === rti);
        b.onclick = () => { rti = idx; ri = 0; rBtns.forEach((x, k) => styleMini(x, k === rti)); drawRegions(); };
        routeRow.append(b); rBtns.push(b);
      });
      box.append(routeRow);
    }
    drawRegions();
    box.append(regRow, roomRow, note); pane.append(box);
  }
  if (quickGroups.length) {
    const qBox = document.createElement('div');
    Object.assign(qBox.style, { margin: '0 0 8px', padding: '6px', border: '1px solid #6b5238', borderRadius: '4px', background: 'rgba(34,26,22,0.55)' });
    const qNote = document.createElement('div');
    Object.assign(qNote.style, { margin: '4px 0 0', color: '#e0b870', minHeight: '1em', fontSize: '11px' });
    for (const grp of quickGroups) {
      const gHead = document.createElement('div');
      gHead.textContent = grp.title;
      Object.assign(gHead.style, { margin: '4px 0 3px', color: '#ffd88a', fontWeight: '600' });
      const row = document.createElement('div');
      Object.assign(row.style, { display: 'flex', flexWrap: 'wrap', gap: '3px', margin: '0 0 4px' });
      for (const item of grp.items) {
        const b = document.createElement('button');
        b.textContent = item.label;
        if (item.title) b.title = item.title;
        styleMini(b, false, item.accent);
        b.onclick = () => {
          const why = item.run();
          if (why) { qNote.textContent = why; return; }
          qNote.textContent = `已切入：${item.label}`;
          pane.style.display = 'none';
        };
        row.append(b);
      }
      qBox.append(gHead, row);
    }
    qBox.append(qNote);
    pane.append(qBox);
  }
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
  toggleActTune = toggle;
  btn.onclick = toggle; btn.onpointerdown = e => e.stopPropagation(); pane.onpointerdown = e => e.stopPropagation();
  window.addEventListener('keydown', e => { if (e.key === '`') toggle(); });
  document.body.append(btn, pane);
}
