import { msg } from '../act/i18n';
// 11-18 微信帧率: the quality tier. 高 = the look as it was (minus the work nobody saw); 中 / 低 cut what a phone pays for most.
// 自动 picks from the device (WeChat's model tier, else phone / computer) and, on phones and mini-games, steps down a tier when the
// frame rate stays low for a few seconds. The choice is kept on the device (platform storage 'ub.quality').
import type { Platform } from '../../platform/index';

export type Tier = 'high' | 'mid' | 'low';
export type Choice = 'auto' | Tier;
export const TIER_CN: Record<Choice, string> = { auto: '自动', high: '高', mid: '中', low: '低' };

/** what each tier draws */
export const TIERS: Record<Tier, { uiDpr: number; worldMsaa: boolean; shadowMap: number; shadowEvery: number }> = {
  /** the UI layer at up to 3 device px per CSS px (native on every phone), MSAA on the 1× world, the shadow map 2048 (1024 on phones) */
  high: { uiDpr: 3, worldMsaa: true, shadowMap: 2048, shadowEvery: 1 },
  /** the UI layer at 2× (on a 3× phone 2/3 of the pixels each way), no MSAA on the world, shadow 1024 */
  mid: { uiDpr: 2, worldMsaa: false, shadowMap: 1024, shadowEvery: 1 },
  /** the UI layer at 1.5×, shadow 512 redrawn every other frame */
  low: { uiDpr: 1.5, worldMsaa: false, shadowMap: 512, shadowEvery: 2 },
};

export const QUALITY = {
  choice: 'auto' as Choice,
  /** the tier in force */
  tier: 'high' as Tier,
  /** what 自动 picked (the device), and steps it took down since (low frame rate) */
  auto: 'high' as Tier, drops: 0,
  /** a phone-sized touch screen or a mini-game (high keeps a phone's shadow at 1024, as before; only these drop a tier by themselves) */
  phone: false,
};
export const tierNow = () => TIERS[QUALITY.tier];

const subs: Array<() => void> = [];
export function onQualityChange(fn: () => void) { subs.push(fn); }
function apply() {
  const t: Tier = QUALITY.choice === 'auto' ? QUALITY.auto : QUALITY.choice;
  if (t === QUALITY.tier) return; QUALITY.tier = t; for (const f of subs) f();
}

let P: Platform | null = null;
const ORDER: Choice[] = ['auto', 'high', 'mid', 'low'];
/** the settings row: 自动 → 高 → 中 → 低 → 自动 */
export function cycleQuality() { setQuality(ORDER[(ORDER.indexOf(QUALITY.choice) + 1) % ORDER.length]); }
export function setQuality(c: Choice) { QUALITY.choice = c; QUALITY.drops = 0; try { P?.storage?.set('ub.quality', c); } catch { /* storage blocked */ } apply(); }
export const qualityLabel = () => msg`画质：${QUALITY.choice === 'auto' ? msg`自动（${TIER_CN[QUALITY.tier]}）` : TIER_CN[QUALITY.choice]}`;

/** at boot, before the renderer: the saved choice and the device's tier */
export function initQuality(p: Platform) {
  P = p;
  const mini = p.name === 'wx' || p.name === 'tt';
  let phone = mini;
  try { const n = globalThis.navigator as Navigator | undefined, s = globalThis.screen as Screen | undefined; if (n && (n.maxTouchPoints ?? 0) > 0 && s && Math.min(s.width, s.height) < 900) phone = true; } catch { /* no screen info: a computer */ }
  QUALITY.phone = phone; QUALITY.auto = phone ? 'mid' : 'high';
  try { const v = p.storage?.get('ub.quality'); if (v === 'auto' || v === 'high' || v === 'mid' || v === 'low') QUALITY.choice = v; } catch { /* storage blocked */ }
  // WeChat (base library 3.4.5+): modelLevel 1 = high-end, 2 = mid, 3 = low-end, 0 = unknown
  const wxApi = p.name === 'wx' ? (globalThis as unknown as { wx?: { getDeviceBenchmarkInfo?: (o: { success: (r: { modelLevel?: number }) => void }) => void } }).wx : undefined;
  try { wxApi?.getDeviceBenchmarkInfo?.({ success: r => { const m = r?.modelLevel; QUALITY.auto = m === 1 ? 'high' : m === 3 ? 'low' : 'mid'; QUALITY.drops = 0; apply(); } }); } catch { /* old base library */ }
  QUALITY.tier = QUALITY.choice === 'auto' ? QUALITY.auto : QUALITY.choice;
}

// ---------------------------------------------------------------- 自动: step down when the frame rate stays low
// Every frame's real interval; a window of 4 s once the game has run 6 s: if more than 60 % of the frames took longer than 21 ms
// (under ~48 fps), one tier down (at most twice, 10 s apart). Long frames (> 120 ms: a room being built, the app in the background)
// are left out. Only on phones / mini-games, only on 自动.
let since = 0, n = 0, slow = 0, cool = 0;
export function qualityFrame(ms: number) {
  since += ms; if (QUALITY.choice !== 'auto' || !QUALITY.phone || since < 6000 || ms > 120) return;
  if (cool > 0) { cool -= ms; return; }
  n++; if (ms > 21) slow++;
  if (n < 240) return;
  if (slow / n > 0.6 && QUALITY.drops < 2 && QUALITY.auto !== 'low') { QUALITY.auto = QUALITY.auto === 'high' ? 'mid' : 'low'; QUALITY.drops++; cool = 10000; apply(); }
  n = 0; slow = 0;
}
