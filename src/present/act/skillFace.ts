// 一条技能在界面上的样子（11-18，用户：「强化卡片也难以辨认都是干嘛的」「选了强化后根本看不到自己选的强化是啥，在哪儿、如何释放」）：
//   左边是这一招 / 这一张的立体图标，托在深色铁槽里（11-18 用户：「那个圈有点丑」）；
//   按法 = 一排小铁盾按钮（和右下角的四颗是同一套模型、同一个图标），中间画箭头；最后那一下的钮圈沿用招式色标；
//          按住 = 钮圈烧成炉火色、钮下一道长条；松手接招 = 钮圈发白（「现在松手」的那个白）；
//          稍停 = 三个点；完美闪避 = 一点冷蓝的光；杀气满 = 三颗铜锭；
//   效果一句（关键词前带小图标、高亮），数值一行小字。
// 三选一卡面（cards3d.ts）、暂停菜单「已得」「招式」两页（pauseMenu.ts）共用。
import * as THREE from 'three';
import { drawPix, pixW, PIX_H } from '../v2/pix';
import { bodyText } from '../ui3d/bodyFont';
import { richLine, TIER_TXT } from './cardBoard';
import { MiniShield, btnShield } from './btnBadge';
import { isLinkIcon } from './skillIcons';
import { fillVals } from './cards';
import { ARCH_INFO, BOONS, TIER_NAMES, boonTier, type Archetype, type Boon, type BoonId, type SkillBoon } from './boons';
import { MANUALS, type Manual } from './manuals';
import { KEY_BTN, LINK_COLORS, MANUAL_HINT, STANCE_COLORS, UI_WORDS, boonSteps, boonTarget, isPress, manualSteps, manualTarget, type BaseIcon, type BaseSkill, type MarkTarget, type Step } from './skillInfo';
import type { BtnName } from './input';
import type { WeaponId } from './weapons';

export interface AttachedBoon {
  name: string;
  col: string;
  tier: number;
  eff: string;
  num: string;
}

export interface SkillEntry {
  id: string; kind: 'manual' | 'boon' | 'base' | 'arcana' | 'keepsake'; name: string; tag: string; tier: number;
  /** act-118: second pill on the name row — e.g. 新派生/变招 (manuals) or 流派 label 血刃/破势/影镖/凌空 (boons) */
  badge?: { text: string; col: string; hot?: boolean };
  /** act-149: triggered synergy resonance callout when picking this boon activates 2-piece or 3-piece resonance */
  resNote?: string;
  /** act-118: archetype accent colour for 3D boon plaque inlay */
  accentHex?: number;
  /** the picture (skillIcons skillIcon3D id) */ icon: BaseIcon | BoonId;
  /** optional 2D custom glyph for arcana/keepsake entries in the unified build screen */
  customGlyph?: string[];
  /** equipped weapon context for base moveset animated preview */
  weaponId?: WeaponId;
  /** Hades-2-style boons currently augmenting this base move slot */
  attached?: AttachedBoon[];
  /** the presses (null = nothing to press: a passive) */ steps: Step[] | null;
  effect: string; num: string;
  /** the move's or tier's colour, used when the card lands on the HUD */ col: number;
  /** where the card flies when taken, where its mark sits */ target: MarkTarget;
  /** the link light on the last press (a 刀谱 / a link move), or none */ lit: number | null;
}
const TIER_GLOW = [0xb0c0d8, 0xffb060, 0xffd060];
export function entryOfManual(m: Manual): SkillEntry {
  const icon = MANUAL_HINT[m.id], col = LINK_COLORS[icon];
  const badge = m.rel === 'new' ? { text: '新派生', col: '#7ef0c0' } : { text: '变招', col: '#ffd27a' };
  return { id: m.id, kind: 'manual', name: m.name, tag: UI_WORDS.manual, badge, tier: 0, icon, steps: manualSteps(m), effect: m.desc[0], num: m.desc[1], col, target: manualTarget(m), lit: col };
}
export function entryOfBoon(b: SkillBoon, tier: number, archHave?: Partial<Record<Archetype, number>>): SkillEntry {
  const t = boonTier(tier), ai = ARCH_INFO[b.arch];
  const n = archHave?.[b.arch];
  const nextN = n != null ? n + 1 : null;
  const hit2 = nextN === 2, hit3 = nextN === 3;
  const badge = ai
    ? {
        text: hit3 ? `${ai.name} 3/3·极势` : hit2 ? `${ai.name} 2/2·成势` : nextN != null ? `${ai.name} ${nextN}/2` : ai.name,
        col: hit2 || hit3 ? '#ffe878' : ai.col,
        hot: hit2 || hit3,
      }
    : undefined;
  const resNote = ai && hit3 ? `成势：${ai.b3}` : ai && hit2 ? `成势：${ai.b2}` : undefined;
  return { id: b.id, kind: 'boon', name: b.name, tag: `${TIER_NAMES[t]}`, badge, resNote, accentHex: ai?.hex, tier: t, icon: b.id, steps: boonSteps(b), effect: b.eff, num: fillVals(b.note, b, t), col: TIER_GLOW[t], target: boonTarget(b), lit: null };
}
export function entryOfBase(s: BaseSkill, attached?: AttachedBoon[]): SkillEntry {
  const icon = s.icon;
  const lit = isLinkIcon(icon) ? LINK_COLORS[icon] : icon === 'ult' || icon === 'stance' || icon === 'parry' ? STANCE_COLORS[icon] : null;
  const target = KEY_BTN[s.steps.find(isPress) ?? 'attack'];
  const badge = attached && attached.length
    ? { text: attached.length === 1 ? `+${attached[0].name}` : `+${attached.length}秘传`, col: attached[0].col, hot: true }
    : undefined;
  return { id: s.id, kind: 'base', name: s.name, tag: '', badge, tier: 0, icon, weaponId: s.weaponId, attached, steps: s.steps, effect: s.effect, num: s.num ?? '', col: lit ?? 0xb0c0d8, target, lit };
}
/** The other cards (meals, upgrades, 再来一次) use the regular item face. */
export function entryOfCard(b: Boon, tier: number, archHave?: Partial<Record<Archetype, number>>): SkillEntry | null {
  if (b.id.startsWith('ms_')) {
    const m = MANUALS.find(x => x.id === b.id.slice(3));
    return m ? entryOfManual(m) : null;
  }
  const boon = BOONS.find(x => x.id === b.id);
  return boon ? entryOfBoon(boon, tier, archHave) : null;
}

// ---------------------------------------------------------------- the presses in a row
export type PressItem =
  | { kind: 'btn'; btn: BtnName; x: number; rim: number | null; rimK: number; bar: boolean }
  | { kind: 'sep'; mark: 'arrow' | 'dots' | 'spark' | 'ingots' | 'air' | 'full' | 'ring' | 'dartHit' | 'nearFoe'; x: number; w: number };
/** lay the presses out left to right for buttons of diameter s (px): returns the items (x = left edge) and the row's width */
export function layoutPresses(steps: Step[], s: number, lit: number | null) {
  const out: PressItem[] = []; let x = 0, prev: 'btn' | 'sep' | null = null;
  const W = { arrow: s * 0.42, dots: s * 0.55, spark: s * 0.5, ingots: s * 0.95, air: s * 0.55, full: s * 0.55, ring: s * 0.6, dartHit: s * 0.62, nearFoe: s * 0.6 };
  const sep = (mark: keyof typeof W) => { out.push({ kind: 'sep', mark, x, w: W[mark] }); x += W[mark]; prev = 'sep'; };
  const lastPress = steps.reduce((a, st, i) => (isPress(st) || st === 'release' ? i : a), -1);
  steps.forEach((st, i) => {
    if (st === 'wait') { sep('dots'); return; }
    if (st === 'more') { sep('dots'); return; }
    if (st === 'cue') { sep('spark'); return; }
    if (st === 'intent') { sep('ingots'); return; }
    if (st === 'air' || st === 'full' || st === 'ring' || st === 'dartHit' || st === 'nearFoe') { sep(st); return; }
    if (prev === 'btn') sep('arrow'); else if (prev === 'sep' && out[out.length - 1]?.kind === 'sep' && (out[out.length - 1] as { mark: string }).mark === 'ingots') sep('arrow');
    const hold = st === 'hold', rel = st === 'release', btn: BtnName = rel ? 'attack' : KEY_BTN[st];
    const rim = rel && steps[i - 1] === 'cue' ? STANCE_COLORS.parry : hold ? 0xff7a2a : i === lastPress && lit != null ? lit : null;
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
    else if (it.mark === 'air') {
      R(cx - 3 * u, cy + 4 * u, 6 * u, u, '#9b8b74');
      R(cx - u, cy - 2 * u, 2 * u, 5 * u, '#c0ddec');
      R(cx - 2 * u, cy - 3 * u, 4 * u, 2 * u, '#c0ddec');
      R(cx - u, cy - 4 * u, 2 * u, u, '#c0ddec');
    } else if (it.mark === 'dartHit') {
      R(cx - 4 * u, cy, 6 * u, u, '#e8dfd0');
      R(cx - 3 * u, cy, 2 * u, u, '#e2606a');
      R(cx + 2 * u, cy - 3 * u, 2 * u, 7 * u, '#ea9f49');
    } else if (it.mark === 'nearFoe') {
      R(cx - 2 * u, cy - 3 * u, 4 * u, 3 * u, '#e3b969');
      R(cx - u, cy, 2 * u, u, '#c77d56');
      R(cx - 3 * u, cy + u, 6 * u, 2 * u, '#b68964');
    } else if (it.mark === 'full') {
      R(cx - 3 * u, cy - 2 * u, 6 * u, 4 * u, '#ffb369');
      R(cx - 2 * u, cy - 2 * u, 4 * u, u, '#ffe0a0');
    } else if (it.mark === 'ring') {
      R(cx - 2 * u, cy - 3 * u, 4 * u, u, '#ffd060');
      R(cx - 2 * u, cy + 2 * u, 4 * u, u, '#ffd060');
      R(cx - 3 * u, cy - 2 * u, u, 4 * u, '#ffd060');
      R(cx + 2 * u, cy - 2 * u, u, 4 * u, '#ffd060');
    }
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
    const tc = e.kind === 'boon' ? TIER_TXT[e.tier] ?? TIER_TXT[0] : '#f4d68c', pad = Math.max(2, s2 * 3);
    g.fillStyle = tc; g.fillRect(tx - pad, ty - pad, tw + pad * 2, PIX_H * s2 + pad * 2);
    g.fillStyle = '#0d0a0b'; g.fillRect(tx - pad + s2, ty - pad + s2, tw + pad * 2 - 2 * s2, PIX_H * s2 + pad * 2 - 2 * s2);
    drawPix(g, e.tag, tx, ty, { scale: s2, color: tc, outline: null, align: 'left' });
    w = tx - x + tw + pad;
  }
  if (e.badge) {
    const s2 = Math.max(1, Math.round(S / 2)), tw = pixW(e.badge.text) * s2, tx = Math.round(x + w + 10 * dpr), ty = Math.round(y + (PIX_H * S - PIX_H * s2) / 2);
    const tc = e.badge.col, pad = Math.max(2, s2 * 3);
    g.fillStyle = tc; g.fillRect(tx - pad, ty - pad, tw + pad * 2, PIX_H * s2 + pad * 2);
    g.fillStyle = e.badge.hot ? '#362310' : '#120e10'; g.fillRect(tx - pad + s2, ty - pad + s2, tw + pad * 2 - 2 * s2, PIX_H * s2 + pad * 2 - 2 * s2);
    drawPix(g, e.badge.text, tx, ty, { scale: s2, color: tc, outline: null, align: 'left' });
    w = tx - x + tw + pad;
  }
  return w;
}
/** the effect line, its body font shrunk until it fits maxW (device px); returns the size used */
export function paintEffect(g: CanvasRenderingContext2D, line: string, x: number, y: number, px: number, maxW: number, col = '#e6ddd0') {
  let p = px; while (p > 8 && richLine(null, line, 0, 0, p, col) > maxW) p -= 1;
  richLine(g, line, x, y, p, col); return p;
}
export function paintNum(g: CanvasRenderingContext2D, line: string, x: number, y: number, px: number, maxW: number, align: 'left' | 'right' = 'left', pill = false) {
  if (!line) return; const w = (p: number) => richLine(null, line, 0, 0, p, '#e8dcc6', '#fff6cc', false);
  let p = px; while (p > 8 && w(p) > maxW) p -= 1;
  const tw = w(p), dx = align === 'left' ? x : x - tw;
  if (pill) {
    const padX = Math.max(4, Math.round(p * 0.45)), padY = Math.max(2, Math.round(p * 0.22));
    g.fillStyle = '#2d241c'; g.fillRect(Math.round(dx - padX), Math.round(y - padY), Math.round(tw + padX * 2), Math.round(p * 1.18 + padY * 2));
    g.fillStyle = '#8a6c3c'; g.fillRect(Math.round(dx - padX), Math.round(y - padY), Math.round(tw + padX * 2), Math.max(1, Math.round(p * 0.08)));
  }
  richLine(g, line, dx, y, p, '#e8dcc6', '#fff6cc', false);
}
export { bodyText };
