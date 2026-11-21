import { describe, expect, it } from 'vitest';
import { uiScale } from '../src/present/act/uiScale';

const SRC = Object.fromEntries(
  Object.entries(
    import.meta.glob('../src/present/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>,
  ).map(([k, v]) => [k.slice(3), v]),
);

describe('uiScale responsive scaling (act-146)', () => {
  it('matches baseline 1.0 at 720p and scales cleanly across mobile, 1080p, 2K, and 4K', () => {
    expect(uiScale(1280, 720)).toBeCloseTo(1.0, 5);
    expect(uiScale(1920, 1080)).toBeCloseTo(1.5, 5);
    expect(uiScale(2560, 1440)).toBeCloseTo(2.0, 5);
    expect(uiScale(3840, 2160)).toBeCloseTo(2.8, 5);
    expect(uiScale(844, 390)).toBeCloseTo(0.72, 5);
    expect(uiScale(844, 390, 0.62)).toBeCloseTo(0.62, 5);
  });

  it('constrains narrow or ultrawide viewports by the tighter axis', () => {
    // 1280x1440 split-screen: width caps scale at 1.0 instead of overflowing at 2.0
    expect(uiScale(1280, 1440)).toBeCloseTo(1.0, 5);
    // 3440x1440 ultrawide: height caps scale at 2.0
    expect(uiScale(3440, 1440)).toBeCloseTo(2.0, 5);
  });

  it('unifies PC and WeChat scene transitions on withLoadingBlade without __WX__ branching', () => {
    const src = SRC['src/present/scenes/transWipe.ts'];
    expect(src).toBeTruthy();
    expect(src).toContain('withLoadingBlade');
    expect(src).not.toContain('__WX__');
    expect(src).not.toContain('wipeCover(');
  });

  it('removes legacy 1.18-1.25 /720 caps from act UI modules', () => {
    const files = [
      'src/present/act/dialogue.ts',
      'src/present/act/barks.ts',
      'src/present/act/uiPlate.ts',
      'src/present/act/cards3d.ts',
      'src/present/act/hud.ts',
      'src/present/act/pauseMenu.ts',
      'src/present/act/skillList.ts',
      'src/present/act/timeline.ts',
      'src/present/act/tutorial.ts',
      'src/present/act/title.ts',
      'src/present/act/cards.ts',
    ];
    for (const f of files) {
      const src = SRC[f];
      expect(src, `${f} should exist`).toBeTruthy();
      expect(src, `${f} should import uiScale`).toContain("from './uiScale'");
      expect(src, `${f} should not cap scale at 1.18-1.25`).not.toMatch(/Math\.min\(\s*1\.[12]\d*\s*,.*\/\s*720/);
    }
  });
});
