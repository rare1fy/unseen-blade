import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GAME_CLUB_CONFIG,
  destroyGameClubButton,
  gameClubSupported,
  getGameClubState,
  syncGameClubButton,
} from '../src/platform/gameClub';
import { computeGameClubRect } from '../src/present/act/gameClubBadge';

function installMockWx(opts: { menuRect?: { left: number; top: number; width: number; height: number } | null; w?: number; h?: number } = {}) {
  const created: Array<{
    opts: any;
    shows: number;
    hides: number;
    destroys: number;
    tapCbs: Array<() => void>;
  }> = [];
  const W = opts.w ?? 844;
  const H = opts.h ?? 390;
  const mockWx: any = {
    getWindowInfo: () => ({
      windowWidth: W,
      windowHeight: H,
      safeArea: { left: 44, right: W - 44, top: 0, bottom: H - 21, width: W - 88, height: H - 21 },
    }),
    getMenuButtonBoundingClientRect: () => opts.menuRect ?? { left: W - 102, top: 12, width: 87, height: 32 },
    createGameClubButton: (cfg: any) => {
      const rec = { opts: cfg, shows: 0, hides: 0, destroys: 0, tapCbs: [] as Array<() => void> };
      created.push(rec);
      return {
        show() { rec.shows++; },
        hide() { rec.hides++; },
        destroy() { rec.destroys++; },
        onTap(cb: () => void) { rec.tapCbs.push(cb); },
        offTap(cb: () => void) { rec.tapCbs = rec.tapCbs.filter(x => x !== cb); },
      };
    },
  };
  vi.stubGlobal('wx', mockWx);
  return { created, mockWx };
}

afterEach(() => {
  destroyGameClubButton();
  GAME_CLUB_CONFIG.openlink = '';
  GAME_CLUB_CONFIG.hasRedDot = false;
  GAME_CLUB_CONFIG.useNativeIcon = false;
  vi.unstubAllGlobals();
});

describe('WeChat Game Club integration', () => {
  it('gracefully reports unsupported outside WeChat without throwing', () => {
    vi.stubGlobal('wx', undefined);
    expect(gameClubSupported()).toBe(false);
    expect(syncGameClubButton({ left: 10, top: 10, width: 80, height: 40 })).toBe(false);
    expect(getGameClubState().mounted).toBe(false);
  });

  it('creates an Android-safe transparent PNG button once, reuses it on identical frames, hides cleanly, and recreates on move', () => {
    const { created } = installMockWx();
    const onTap = vi.fn();

    expect(gameClubSupported()).toBe(true);
    expect(syncGameClubButton({ left: 50, top: 320, width: 88, height: 36 }, onTap)).toBe(true);
    expect(created).toHaveLength(1);
    expect(created[0].opts.type).toBe('image');
    expect(created[0].opts.image).toBe('assets/px_blank.png');
    // Clamped to minimum 40px touch height
    expect(created[0].opts.style).toEqual({ left: 50, top: 320, width: 88, height: 40 });
    expect(created[0].shows).toBe(1);

    // Identical rect on next frame: zero recreate, zero redundant show
    expect(syncGameClubButton({ left: 50, top: 320, width: 88, height: 36 }, onTap)).toBe(true);
    expect(created).toHaveLength(1);
    expect(created[0].shows).toBe(1);

    // Tap fires callback
    created[0].tapCbs.forEach(cb => cb());
    expect(onTap).toHaveBeenCalledTimes(1);

    // Hide on modal / combat
    expect(syncGameClubButton(null)).toBe(false);
    expect(created[0].hides).toBe(1);
    expect(getGameClubState().visible).toBe(false);

    // Re-show at same rect reuses instance without destroying
    expect(syncGameClubButton({ left: 50, top: 320, width: 88, height: 36 }, onTap)).toBe(true);
    expect(created).toHaveLength(1);
    expect(created[0].shows).toBe(2);

    // Moving to a new screen corner destroys old instance and creates new one
    GAME_CLUB_CONFIG.openlink = 'test-link-123';
    expect(syncGameClubButton({ left: 640, top: 12, width: 88, height: 40 }, onTap)).toBe(true);
    expect(created).toHaveLength(2);
    expect(created[0].destroys).toBe(1);
    expect(created[1].opts.openlink).toBe('test-link-123');
    expect(created[1].opts.style.left).toBe(640);
  });

  it('positions badge safely away from title menu, notch safeArea, and WeChat top-right capsule', () => {
    installMockWx({ w: 844, h: 390, menuRect: { left: 742, top: 12, width: 87, height: 32 } });

    // Title with menu on right -> badge sits cleanly in bottom-left inside safeArea
    const rTitleRight = computeGameClubRect({ kind: 'title', menuSide: 'right' }, 844, 390, 92, 40)!;
    expect(rTitleRight.left).toBeGreaterThanOrEqual(44);
    expect(rTitleRight.left + rTitleRight.width).toBeLessThan(300);
    expect(rTitleRight.top + rTitleRight.height).toBeLessThanOrEqual(390 - 21);

    // Title with menu on left -> badge sits in bottom-right inside safeArea
    const rTitleLeft = computeGameClubRect({ kind: 'title', menuSide: 'left' }, 844, 390, 92, 40)!;
    expect(rTitleLeft.left).toBeGreaterThan(500);
    expect(rTitleLeft.left + rTitleLeft.width).toBeLessThanOrEqual(844 - 44);

    // Hideout yard -> placed to the left of the WeChat capsule with zero overlap
    const rYard = computeGameClubRect({ kind: 'yard' }, 844, 390, 92, 40)!;
    expect(rYard.left + rYard.width).toBeLessThanOrEqual(742 - 8);
    expect(rYard.top).toBeGreaterThanOrEqual(6);

    // Pause menu -> bottom-right corner inside safeArea
    const rPause = computeGameClubRect({ kind: 'pause' }, 844, 390, 92, 40)!;
    expect(rPause.left).toBeGreaterThan(500);
    expect(rPause.top).toBeGreaterThan(250);
  });
});
