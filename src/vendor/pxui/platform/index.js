// platform/index.js — pick the platform at runtime: Douyin (tt) → WeChat (wx) → browser.
import { createBrowserPlatform } from './browser.js';
import { createMinigamePlatform } from './minigame.js';
export function createPlatform(opts = {}) {
  if (typeof tt !== 'undefined' && tt && tt.getSystemInfoSync) return createMinigamePlatform(tt, 'tt', opts);
  if (typeof wx !== 'undefined' && wx && wx.getSystemInfoSync) return createMinigamePlatform(wx, 'wx', opts);
  return createBrowserPlatform(opts);
}
export { createBrowserPlatform, createMinigamePlatform };
