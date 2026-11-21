/**
 * Canonical viewport-proportional UI scale relative to the 1280×720 design reference.
 *
 * Uses `min(h / 720, w / 1280)` so narrow/split-screen windows never overflow horizontally,
 * mobile landscape (e.g. 844×390) stays identical to its compact layout, 720p stays 1.0×,
 * and high-res PC displays (1080p 1.5×, 2K 2.0×, 4K 2.8×) scale proportionally instead of
 * shrinking under the old ~1.2× ceiling.
 */
export function uiScale(w: number, h: number, min = 0.72, max = 2.8): number {
  const raw = Math.min(h / 720, w / 1280);
  return Math.max(min, Math.min(max, raw));
}
