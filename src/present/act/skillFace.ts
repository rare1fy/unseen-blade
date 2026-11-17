// 一条技能在界面上的样子（11-18，用户：「强化卡片也难以辨认都是干嘛的」「选了强化后根本看不到自己选的强化是啥，在哪儿、如何释放」）：
//   左边一面小铁盾（它挂的那颗键，钮里是这一招 / 这一张的立体图标）；
//   按法 = 一排小铁盾按钮（和右下角的四颗是同一套模型、同一个图标），中间画箭头；最后那一下的钮圈染成这一招的颜色（战斗里能接这招时，
//          那颗钮就是这个颜色）；按住 = 钮圈烧成炉火色、钮下一道长条；松手接招 = 钮圈发白（「现在松手」的那个白）；
//          稍停 = 三个点；完美闪避 = 一点冷蓝的光；杀气满 = 三颗铜锭；
//   效果一句（关键词前带小图标、高亮），数值一行小字。
// 三选一卡面（cards3d.ts）、暂停菜单「已得」「招式」两页（pauseMenu.ts）共用。
import * as THREE from 'three';
import { drawPix, pixW, PIX_H } from '../v2/pix';
import { bodyText } from '../ui3d/bodyFont';
import { richLine, TIER_TXT } from './cardBoard';
import { MiniShield, btnShield } from './btnBadge';
import { skillIcon3D } from './skillIcons';
import { hintCol, isHintKey } from './ironUi';
import { fillVals } from './cards';
import { BOONS, TIER_NAMES, type Boon } from './boons';
import { MANUALS, type Manual } from './manuals';
import { KEY_BTN, MANUAL_HINT, UI_WORDS, boonEffect, boonNum, boonSteps, boonTarget, isPress, manualEffect, manualHow, manualTarget, type BaseSkill, type MarkTarget, type Step } from './skillInfo';
import type { BtnName } from './input';

export interface SkillEntry {
  id: string; kind: 'manual' | 'boon' | 'base'; name: string; tag: string; tier: number;
  /** the picture (skillIcons skillIcon3D id) */ icon: string;
  /** the presses (null = nothing to press: a passive) */ steps: Step[] | null;
  effect: string; num: string;
  /** the colour of the move (a 刀谱's link light) or of the tier's metal — the big shield's plates and the last press's rim */ col: number;
  /** where the card flies when taken, where its mark sits */ target: MarkTarget;
  /** the link light on the last press (a 刀谱 / a link move), or none */ lit: number | null;
}
const TIER_GLOW = [0xb0c0d8, 0xffb060, 0xffd060];
export function entryOfManual(m: Manual): SkillEntry {
  const s = manualHow(m), hk = MANUAL_HINT[m.id], col = hk && isHintKey(hk) ? hintCol(hk) : 0xf0e0b0;
  return { id: m.id, kind: 'manual', name: m.name, tag: UI_WORDS.manual, tier: 0, icon: hk ? 'hint:' + hk : 'btn:attack', steps: s.air && s.how[0] !== 'jump' ? ['jump', ...s.how] : s.how, effect: manualEffect(m), num: '', col, target: manualTarget(m), lit: col };
}
export function entryOfBoon(b: Boon, tier: number): SkillEntry {
  const t = Math.max(0, Math.min(2, tier));
  return { id: b.id, kind: 'boon', name: b.name, tag: TIER_NAMES[t], tier: t, icon: b.id, steps: boonSteps(b), effect: boonEffect(b), num: fillVals(boonNum(b), b, t), col: TIER_GLOW[t], target: boonTarget(b), lit: null };
}
export function entryOfBase(s: BaseSkill): SkillEntry {
  const hk = s.icon.startsWith('hint:') ? s.icon.slice(5) : '', col = hk && isHintKey(hk) ? hintCol(hk) : s.id === 'ult' ? 0xffd060 : s.id === 'iai' || s.id === 'parry' ? 0xffb060 : 0xb0c0d8;
  const target = KEY_BTN[(s.steps.find(isPress) ?? 'attack') as 'attack'] as BtnName;
  return { id: s.id, kind: 'base', name: s.name, tag: '', tier: 0, icon: s.icon, steps: s.steps, effect: s.effect, num: s.num ?? '', col, target, lit: hk || s.id === 'ult' ? col : null };
}
/** a pick card's entry (a 秘传 or a 刀谱 card), or null for the other cards (meals, the smith's and the healer's lists, 再来一次) */
export function entryOfCard(b: Boon, tier: number): SkillEntry | null {
  if (b.id.startsWith('ms_')) { const m = MANUALS.find(x => 'ms_' + x.id === b.id); return m ? entryOfManual(m) : null; }
  return BOONS.some(x => x.id === b.id) ? entryOfBoon(b, tier) : null;
}

// ---------------------------------------------------------------- the presses in a row
export type PressItem =
  | { kind: 'btn'; btn: BtnName; x: number; rim: number | null; rimK: number; bar: boolean }
  | { kind: 'sep'; mark: 'arrow' | 'dots' | 'spark' | 'ingots'; x: number; w: number };
/** lay the presses out left to right for buttons of diameter s (px): returns the items (x = left edge) and the row's width */
export function layoutPresses(steps: Step[], s: number, lit: number | null) {
  const out: PressItem[] = []; let x = 0, prev: 'btn' | 'sep' | null = null;
  const W = { arrow: s * 0.42, dots: s * 0.55, spark: s * 0.5, ingots: s * 0.95 };
  const sep = (mark: keyof typeof W) => { out.push({ kind: 'sep', mark, x, w: W[mark] }); x += W[mark]; prev = 'sep'; };
  const lastPress = steps.reduce((a, st, i) => (isPress(st) || st === 'release' ? i : a), -1);
  steps.forEach((st, i) => {
    if (st === 'wait') { sep('dots'); return; }
    if (st === 'more') { sep('dots'); return; }
    if (st === 'cue') { sep('spark'); return; }
    if (st === 'intent') { sep('ingots'); return; }
    if (prev === 'btn') sep('arrow'); else if (prev === 'sep' && out[out.length - 1]?.kind === 'sep' && (out[out.length - 1] as { mark: string }).mark === 'ingots') sep('arrow');
    const hold = st === 'hold', rel = st === 'release', btn: BtnName = rel ? 'attack' : KEY_BTN[st as 'attack'];
    const rim = rel ? 0xfff6e0 : hold ? 0xff7a2a : i === lastPress && lit != null ? lit : null;
    out.push({ kind: 'btn', btn, x, rim, rimK: rel ? 0.85 : hold ? 0.6 : 0.8, bar: hold }); x += s; prev = 'btn';
  });
  return { items: out, w: x };
}
/** the marks between the buttons, painted (axis-aligned blocks; x, cy in device px, s = the button size in device px) */
export function paintSeps(g: CanvasRenderingContext2D, items: PressItem[], x0: number, cy: number, s: number) {
  const R = (x: number, y: number, w: number, h: number, c: string) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); };
  const u = Math.max(1, Math.round(s / 16));
  for (const it of items) {
    if (it.kind === 'btn') {
      // 按住: a long bar under the button, filled ember (the HUD's held 斩 heats its plates from the bottom)
      if (it.bar) { const bw = s * 0.8, bx = x0 + it.x + (s - bw) / 2, by = cy + s * 0.5 + u; R(bx - u, by - u, bw + 2 * u, 3 * u + 2 * u, '#1a1214'); R(bx, by, bw, 3 * u, '#ff8a3a'); R(bx, by, bw, u, '#ffd090'); }
      continue;
    }
    const cx = x0 + it.x + it.w / 2;
    if (it.mark === 'arrow') { R(cx - 3 * u, cy - u, 4 * u, 2 * u, '#c8b48a'); R(cx + u, cy - 3 * u, u, 6 * u, '#c8b48a'); R(cx + 2 * u, cy - 2 * u, u, 4 * u, '#c8b48a'); R(cx + 3 * u, cy - u, u, 2 * u, '#c8b48a'); }
    else if (it.mark === 'dots') for (const d of [-1, 0, 1]) R(cx + d * 3 * u - u, cy - u, 2 * u, 2 * u, '#c8b48a');
    else if (it.mark === 'spark') { R(cx - u, cy - 4 * u, 2 * u, 8 * u, '#9ad8ff'); R(cx - 4 * u, cy - u, 8 * u, 2 * u, '#9ad8ff'); R(cx - u, cy - u, 2 * u, 2 * u, '#f0fbff'); }
    else if (it.mark === 'ingots') for (const d of [-1, 0, 1]) { R(cx + d * 5 * u - 2 * u, cy - u * 1.5, 4 * u, 3 * u, '#d09a50'); R(cx + d * 5 * u - 2 * u, cy - u * 1.5, 4 * u, u, '#ffe0a0'); }
  }
}
/** the 3D buttons of the row, children of `parent` (whose units are px: x right, y up); returns them to place / dispose */
export function pressShields(items: PressItem[], s: number, parent: THREE.Object3D, x0: number, cy: number, z: number, order: number) {
  const out: MiniShield[] = [];
  for (const it of items) if (it.kind === 'btn') {
    const m = btnShield(it.btn); m.setRim(it.rim, it.rimK); m.scale.setScalar(s); m.position.set(x0 + it.x + s / 2, cy, z); m.setRenderOrder(order);
    parent.add(m); out.push(m);
  }
  return out;
}

// ---------------------------------------------------------------- the text
/** the name (pixel font) and its tag in a recessed slot; returns the width drawn */
export function paintName(g: CanvasRenderingContext2D, e: SkillEntry, x: number, y: number, S: number, dpr: number) {
  const nameCol = e.kind === 'boon' ? ['#efe6d2', '#ffd8a0', '#fff0c0'][e.tier] : e.kind === 'manual' ? '#fff0c8' : '#efe6d2';
  drawPix(g, e.name, Math.round(x), Math.round(y), { scale: S, color: nameCol, outline: '#0a0708', align: 'left' });
  let w = pixW(e.name) * S;
  if (e.tag) {
    const s2 = Math.max(1, Math.round(S / 2)), tw = pixW(e.tag) * s2, tx = Math.round(x + w + 10 * dpr), ty = Math.round(y + (PIX_H * S - PIX_H * s2) / 2);
    const tc = e.kind === 'boon' ? TIER_TXT[e.tier] ?? TIER_TXT[0] : '#e0c890', pad = Math.max(2, s2 * 3);
    g.fillStyle = tc; g.fillRect(tx - pad, ty - pad, tw + pad * 2, PIX_H * s2 + pad * 2);
    g.fillStyle = '#0d0a0b'; g.fillRect(tx - pad + s2, ty - pad + s2, tw + pad * 2 - 2 * s2, PIX_H * s2 + pad * 2 - 2 * s2);
    drawPix(g, e.tag, tx, ty, { scale: s2, color: tc, outline: null, align: 'left' });
    w = tx - x + tw + pad;
  }
  return w;
}
/** the effect line, its body font shrunk until it fits maxW (device px); returns the size used */
export function paintEffect(g: CanvasRenderingContext2D, line: string, x: number, y: number, px: number, maxW: number, col = '#e6ddd0') {
  let p = px; while (p > 8 && richLine(null, line, 0, 0, p, col) > maxW) p -= 1;
  richLine(g, line, x, y, p, col); return p;
}
export function paintNum(g: CanvasRenderingContext2D, line: string, x: number, y: number, px: number, maxW: number, align: 'left' | 'right' = 'left') {
  if (!line) return; const w = (p: number) => richLine(null, line, 0, 0, p, '#a89c8a', '#f0e4c8', false);
  let p = px; while (p > 7 && w(p) > maxW) p -= 1;
  richLine(g, line, align === 'left' ? x : x - w(p), y, p, '#a89c8a', '#f0e4c8', false);
}
export { bodyText };

/** the big shield on the left: the move's / the boon's picture, its plates in the entry's colour */
export function bigShield(e: SkillEntry) { const m = new MiniShield(skillIcon3D(e.icon)); m.setRim(e.col, e.kind === 'boon' ? 0.45 : 0.75); m.icon.scale.setScalar(0.66); m.icon.position.z = 0.22; return m; }
