// 统一激励视频平台层（act-139，100% 主动触发，零插屏、零 Banner）：
//   - 微信小游戏：wx.createRewardedVideoAd（复用单例，完整观看才返 true，期间静音暂停）
//   - 抖音小游戏：tt.createRewardedVideoAd（同上）
//   - CrazyGames：CrazyGames.SDK.ad.requestAd('rewarded', callbacks)（暂停游戏与音频）
//   - 网页 / 开发试玩：走游戏内 UiLayer 纯像素风模拟观影弹板（setAdSimHost），不直接碰 DOM。
import { G } from './index';
import { CRAZYGAMES, reportGameplay } from './crazygames';
import { PAUSE } from '../present/engine/clock';
import { audio } from '../audio/audio';

export type AdPlacement =
  | 'collector_unlock'
  | 'collector_trial'
  | 'weapon_rent'
  | 'garden_double'
  | 'garden_speed'
  | 'garden_seed'
  | 'meal_upgrade'
  | 'divine_school'
  | 'revive'
  | 'haul_bonus';

export interface AdRequestInfo {
  placement: AdPlacement;
  title: string;
  rewardText: string;
}

export interface AdResult {
  watched: boolean;
  reason?: 'ended' | 'cancelled' | 'unavailable';
}

/** WeChat / Douyin adUnitId registry (fill real unit IDs when publishing to mini-game stores) */
export const AD_UNITS = {
  wx: '',
  tt: '',
};

type SimHost = (info: AdRequestInfo) => Promise<boolean>;
let simHost: SimHost | null = null;
let busy = false;
let wxAd: any = null;
let ttAd: any = null;

/** Register the native in-game UiLayer ad preview host (for browser / local dev / WeChat sim when no live adUnitId is set). */
export function setAdSimHost(host: SimHost | null) {
  simHost = host;
}

/** True when a real mini-game or CrazyGames rewarded ad SDK is ready, or the in-game preview simulator is mounted. */
export function adsAvailable(): boolean {
  if (typeof wx !== 'undefined' && wx && typeof wx.createRewardedVideoAd === 'function' && AD_UNITS.wx) return true;
  if (typeof tt !== 'undefined' && tt && typeof tt.createRewardedVideoAd === 'function' && AD_UNITS.tt) return true;
  if (CRAZYGAMES && G.CrazyGames?.SDK?.ad?.requestAd) return true;
  return !!simHost;
}

function suspendForAd(): () => void {
  const wasPause = PAUSE.on;
  const wasMuted = audio.muted;
  PAUSE.on = true;
  if (!wasMuted) {
    audio.muted = true;
    try {
      if (audio.master && audio.ctx) audio.master.gain.setValueAtTime(0, audio.ctx.currentTime);
    } catch { /* ignore */ }
  }
  reportGameplay(false);
  return () => {
    PAUSE.on = wasPause;
    audio.muted = wasMuted;
    try {
      if (!wasMuted && audio.master && audio.ctx) {
        audio.master.gain.setValueAtTime(0.9, audio.ctx.currentTime);
      }
      audio.recover();
    } catch { /* ignore */ }
  };
}

function runMiniVideo(mini: any, unitId: string, cache: 'wx' | 'tt'): Promise<AdResult> {
  return new Promise<AdResult>(resolve => {
    try {
      let ad = cache === 'wx' ? wxAd : ttAd;
      if (!ad) {
        ad = mini.createRewardedVideoAd({ adUnitId: unitId });
        if (cache === 'wx') wxAd = ad; else ttAd = ad;
      }
      let settled = false;
      const done = (watched: boolean, reason: AdResult['reason']) => {
        if (settled) return;
        settled = true;
        try { ad.offClose?.(onClose); ad.offError?.(onErr); } catch { /* ignore */ }
        resolve({ watched, reason });
      };
      const onClose = (res?: { isEnded?: boolean }) => {
        const ok = !res || res.isEnded !== false;
        done(ok, ok ? 'ended' : 'cancelled');
      };
      const onErr = () => done(false, 'unavailable');
      ad.onClose(onClose);
      ad.onError(onErr);
      Promise.resolve(ad.show()).catch(() => {
        Promise.resolve(ad.load()).then(() => ad.show()).catch(() => done(false, 'unavailable'));
      });
    } catch {
      resolve({ watched: false, reason: 'unavailable' });
    }
  });
}

function runCrazyGamesRewarded(): Promise<AdResult> {
  return new Promise<AdResult>(resolve => {
    const cgAd = G.CrazyGames?.SDK?.ad;
    if (!cgAd?.requestAd) {
      resolve({ watched: false, reason: 'unavailable' });
      return;
    }
    let settled = false;
    const done = (watched: boolean, reason: AdResult['reason']) => {
      if (settled) return;
      settled = true;
      resolve({ watched, reason });
    };
    try {
      cgAd.requestAd('rewarded', {
        adStarted: () => { /* audio already suspended */ },
        adFinished: () => done(true, 'ended'),
        adError: () => done(false, 'unavailable'),
      });
    } catch {
      done(false, 'unavailable');
    }
  });
}

/**
 * Show a strictly opt-in rewarded video ad.
 * Resolves `{ watched: true }` ONLY if the player finished the ad cleanly.
 */
export async function showRewardedAd(info: AdRequestInfo): Promise<AdResult> {
  if (busy) return { watched: false, reason: 'cancelled' };
  busy = true;
  const restore = suspendForAd();
  try {
    if (typeof wx !== 'undefined' && wx && typeof wx.createRewardedVideoAd === 'function' && AD_UNITS.wx) {
      return await runMiniVideo(wx, AD_UNITS.wx, 'wx');
    }
    if (typeof tt !== 'undefined' && tt && typeof tt.createRewardedVideoAd === 'function' && AD_UNITS.tt) {
      return await runMiniVideo(tt, AD_UNITS.tt, 'tt');
    }
    if (CRAZYGAMES && G.CrazyGames?.SDK?.ad?.requestAd) {
      return await runCrazyGamesRewarded();
    }
    if (simHost) {
      const ok = await simHost(info);
      return { watched: ok, reason: ok ? 'ended' : 'cancelled' };
    }
    return { watched: false, reason: 'unavailable' };
  } finally {
    restore();
    busy = false;
  }
}
