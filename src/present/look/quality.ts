import { OPT } from '../engine/perfOpts';
import { msg } from '../act/i18n';
// 11-18 微信帧率: the quality tier. 高 = the look as it was (minus the work nobody saw); 中 / 低 cut what a phone pays for most.
// 自动 picks from the device (WeChat's model tier, else phone / computer) and, on phones and mini-games, steps down a tier when the
// frame rate stays low for a few seconds. The choice is kept on the device (platform storage 'ub.quality').
import type { Platform } from '../../platform/index';

export type Tier = 'high' | 'mid' | 'low';
export type Choice = 'auto' | Tier;
export const TIER_CN: Record<Choice, string> = { auto: '自动', high: '高', mid: '中', low: '低' };

/** what each tier draws; fps = the most frames a second it draws (11-19 用户：「手机发烫比较严重」: a 90 / 120 Hz phone ran the game
 *  at its screen's rate, twice the work of 60 for nothing the eye needs here) */
export const TIERS: Record<Tier, { uiDpr: number; worldMsaa: boolean; shadowMap: number; shadowEvery: number; fps: number; pointLights: number }> = {
  /** the UI layer at up to 3 device px per CSS px (native on every phone), MSAA on the 1× world, the shadow map 2048 (1024 on phones) */
  high: { uiDpr: 3, worldMsaa: true, shadowMap: 2048, shadowEvery: 1, fps: 60, pointLights: 18 },
  /** 1.5× interface, baked scenery and a 512 shadow map refreshed every other frame for moving objects. */
  mid: { uiDpr: 1.5, worldMsaa: false, shadowMap: 512, shadowEvery: 2, fps: 60, pointLights: 2 },
  /** 1× interface, contact shadows. Keeps 60 fps target so action combat stays responsive even on low quality. */
  low: { uiDpr: 1, worldMsaa: false, shadowMap: 512, shadowEvery: 2, fps: 60, pointLights: 1 },
};

export const QUALITY = {
  choice: 'auto' as Choice,
  /** the tier in force */
  tier: 'high' as Tier,
  /** what 自动 picked (the device), and steps it took down since (low frame rate) */
  auto: 'high' as Tier, drops: 0, reducedWorld: false,
  /** a phone-sized touch screen or a mini-game (high keeps a phone's shadow at 1024, as before; only these drop a tier by themselves) */
  phone: false,
};
export const tierNow = () => TIERS[QUALITY.tier];

export const effectLimit = (capacity: number) => Math.max(1, Math.floor(capacity * (!OPT.effectBudget || QUALITY.tier === 'high' ? 1 : QUALITY.tier === 'mid' ? 0.7 : 0.5)));
export const mobileTargets = () => OPT.mobileTargets && QUALITY.tier !== 'high';
export const lowTargets = () => OPT.mobileTargets && QUALITY.tier === 'low';
export const cheapVoxelUniform = { value: 0 };
export function refreshQuality() {
  cheapVoxelUniform.value = OPT.cheapVoxels && QUALITY.tier === 'low' ? 1 : 0;
  for (const f of subs) f();
}
function platformFps() {
  if (P?.name === 'wx' || P?.name === 'tt') try {
    const g = globalThis as { wx?: { setPreferredFramesPerSecond?(fps: number): void }; tap?: { setPreferredFramesPerSecond?(fps: number): void } };
    const fn = g.wx?.setPreferredFramesPerSecond ?? g.tap?.setPreferredFramesPerSecond;
    fn?.(tierNow().fps);
  } catch { /* older base library; gfx still paces drawing */ }
}
const subs: Array<() => void> = [];
export function onQualityChange(fn: () => void) { subs.push(fn); }
function apply() {
  const t: Tier = QUALITY.choice === 'auto' ? QUALITY.auto : QUALITY.choice;
  if (t === QUALITY.tier) return; QUALITY.tier = t; platformFps(); refreshQuality();
}

let P: Platform | null = null;
const ORDER: Choice[] = ['auto', 'high', 'mid', 'low'];
/** the settings row: 自动 → 高 → 中 → 低 → 自动 */
export function cycleQuality() { setQuality(ORDER[(ORDER.indexOf(QUALITY.choice) + 1) % ORDER.length]); }
export function setQuality(c: Choice, persist = true) { const wasReduced = QUALITY.reducedWorld, wasTier = QUALITY.tier; QUALITY.choice = c; QUALITY.drops = 0; try { if (persist) P?.storage?.set('ub.quality', c); } catch { /* storage blocked */ } apply(); if (wasReduced && wasTier === QUALITY.tier) refreshQuality(); }
export const qualityLabel = () => msg`画质：${QUALITY.choice === 'auto' ? msg`自动（${TIER_CN[QUALITY.tier]}）` : TIER_CN[QUALITY.choice]}`;

/** at boot, before the renderer: the saved choice and the device's tier */
export function initQuality(p: Platform) {
  P = p;
  const mini = p.name === 'wx' || p.name === 'tt';
  let phone = mini;
  try { const n = globalThis.navigator as Navigator | undefined, s = globalThis.screen as Screen | undefined; if (n && (n.maxTouchPoints ?? 0) > 0 && s && Math.min(s.width, s.height) < 900) phone = true; } catch { /* no screen info: a computer */ }
  QUALITY.phone = phone; QUALITY.auto = phone ? 'mid' : 'high';
  try { const v = p.storage?.get('ub.quality'); if (v === 'auto' || v === 'high' || v === 'mid' || v === 'low') QUALITY.choice = v; } catch { /* storage blocked */ }
  // WeChat (base library 3.4.5+): modelLevel 1 = high-end, 2 = mid, 3 = low-end, 0 = unknown.
  // Keep auto capped at 'mid' on WeChat phones (players can still choose 高 manually) so 1.5K/2K Android phones
  // (e.g. Redmi) never auto-escalate into 22× RGBA16F bloom FBOs & full-DPR VRAM spikes right at boot.
  const wxApi = p.name === 'wx' ? (globalThis as unknown as { wx?: { getDeviceBenchmarkInfo?: (o: { success: (r: { modelLevel?: number }) => void }) => void } }).wx : undefined;
  try { wxApi?.getDeviceBenchmarkInfo?.({ success: r => { const m = r?.modelLevel; QUALITY.auto = m === 3 ? 'low' : 'mid'; QUALITY.drops = 0; apply(); } }); } catch { /* old base library */ }
  QUALITY.tier = QUALITY.choice === 'auto' ? QUALITY.auto : QUALITY.choice; platformFps(); refreshQuality();
}

// Three seconds of drawn frames. Wait 6 s after boot so initial warm-up doesn't trigger false drops,
// then step mid→low whenever sustained FPS dips under ~50 fps (>20 ms/frame) while keeping the 60 fps cap.
let elapsed = 0, frames = 0, cool = 6000;
export function qualityFrame(ms: number) {
  if (QUALITY.choice !== 'auto' || !QUALITY.phone || ms <= 0 || ms > 500) return;
  if (cool > 0) { cool -= ms; return; }
  elapsed += ms; frames++;
  if (elapsed < 3000) return;
  const slow = elapsed / frames > (QUALITY.auto === 'low' ? 24 : 20);
  frames = elapsed = 0;
  if (!slow) return;
  if (QUALITY.auto === 'low') {
    if (QUALITY.reducedWorld) return;
    QUALITY.reducedWorld = true; refreshQuality();
  } else { QUALITY.auto = QUALITY.auto === 'high' ? 'mid' : 'low'; apply(); }
  QUALITY.drops++; cool = 10000;
}
