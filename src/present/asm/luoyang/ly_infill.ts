import type { Locale } from '../types';
import { M } from '../../scenes/props';
import { frame, up, palaceWall, charPost, ingots, qianfan, heap, LY } from './ly_kit';
import { smallFurnace } from './ly_mint_props';

/** The collapsed roof fills the footprint. Only the surviving frame needs camera clearance. */
export function burntInfill(place: 'road' | 'ward' | 'mint'): NonNullable<Locale['infill']> {
  return (c, { rect, p, back }) => {
    const w = M(rect.x1) - M(rect.x0), d = M(rect.z1) - M(rect.z0);
    const B = frame(c.w, rect.x0, rect.z0);
    const x = Math.floor(w / 2), z = Math.floor(d / 2);
    B(0, 0, 0, w - 1, 2, d - 1, place === 'mint' ? LY.brickD : LY.stoneD);

    if (place === 'mint') {
      const deck = up(B, 7), ovenZ = back ? d - 16 : z;
      const side = p.rnd(1) < 0.5 ? -1 : 1;
      B(2, 3, 2, w - 3, 3, d - 3, LY.slag);
      B(3, 4, 3, x, 6, d - 4, LY.brickD);
      B(x + 1, 4, 3, w - 4, 6, d - 4, LY.charD);
      smallFurnace(deck, x + side * 17, ovenZ, true);
      heap(deck, x - side * 17, ovenZ, 11, 9, 3, LY.charD, LY.charL);
      ingots(deck, x - side * 14, 12, 4);
      qianfan(deck, x - 4, 11, 0, { bronze: true });
      return;
    }

    // Long ruins retain several roof bays. The lowest sheet reaches under the outline wall.
    B(2, 3, 2, w - 3, 4, d - 3, LY.ashD);
    const nx = Math.max(1, Math.round(w / 58)), nz = Math.max(1, Math.round(d / 64));
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const a = 2 + Math.floor(i * (w - 4) / nx), b = 1 + Math.floor((i + 1) * (w - 4) / nx);
      const f = 2 + Math.floor(j * (d - 4) / nz), n = 1 + Math.floor((j + 1) * (d - 4) / nz);
      const k = 10 + (j * nx + i) * 8, left = p.rnd(k) < 0.5;
      const h = back && f < z ? 6 : 8 + Math.floor(p.rnd(k + 1) * 3);
      const split = Math.floor((b - a) * (0.3 + p.rnd(k + 2) * 0.13));
      const x0 = left ? a + 3 : a + split, x1 = left ? b - split : b - 3;
      const z0 = f + 3 + Math.floor((n - f) * p.rnd(k + 3) * 0.22);
      const z1 = n - 3 - Math.floor((n - f) * p.rnd(k + 4) * 0.18);
      B(a + 1, 5, f + 1, b - 1, h, n - 1, p.rnd(k + 5) < 0.5 ? LY.brick : LY.ashD);
      B(x0, h + 1, z0, x1, h + 3, z1, LY.tileD);
      B(x0 + 2, h + 4, z0 + 3, x1 - 2, h + 4, z1 - 2, LY.tile);
      for (let u = x0 + 4; u < x1 - 2; u += 10)
        B(u, h + 5, z0 + 3, u + 1, h + 5, z1 - 2, LY.tileL);
      // A ridge timber lies across the tile sheet or lengthways in the exposed masonry.
      if (p.rnd(k + 6) < 0.5) {
        const bz = Math.floor((z0 + z1) / 2);
        B(a + 3, h + 5, bz, b - 3, h + 9, bz + 3, LY.char);
      } else {
        const u = left ? x1 + 2 : a + 3;
        B(u, h + 1, f + 2, u + 3, h + 5, n - 3, LY.char);
      }
      if (place === 'road' && p.rnd(k + 7) < 0.6) {
        const u = left ? x1 + 1 : a + 2;
        B(u, h + 1, z0 + 2, u + 4, h + 1, z0 + 4, 0xa34928, 1);
      }
    }

    const near = d - 9, rear = back ? Math.max(z + 2, near - 16) : 9;
    // At the back of a shallow block the allowed height also depends on the sightline to the far floor.
    const heightAt = (v: number) => Math.min(34, back ? Math.floor((v - 3) * 0.68) : 34);
    const h = heightAt(rear);
    if (place === 'ward') {
      palaceWall(B, 8, w - 9, rear - 2, rear + 2, h,
        { seed: p.seed, drops: [[x, w - 9, Math.max(6, h - 10)]], plaster: 0.95 });
      // An overturned bracket set: transverse arm, two bearing blocks and a shorter arm across it.
      const bz = Math.max(8, near - 2);
      B(x - 7, 5, bz - 2, x + 7, 12, bz + 2, LY.redD);
      for (const u of [x - 5, x + 3]) B(u, 13, bz - 2, u + 2, 15, bz + 2, LY.woodD);
      B(x - 6, 16, bz - 1, x + 5, 17, bz + 1, LY.red);
    } else {
      const end = p.rnd(2) < 0.5 ? x : w - 9;
      B(8, 3, rear - 2, end, h - 3, rear + 2, LY.brick);
      for (let y = 7; y < h - 3; y += 5) B(8, y, rear + 2, end, y, rear + 2, LY.brickD);
      B(8, h - 2, rear - 2, end, h, rear + 2, LY.charL);
    }
    const bays = Math.ceil((w - 17) / 44);
    for (let i = 0; i <= bays; i++) {
      const u = 8 + Math.round(i * (w - 17) / bays);
      charPost(B, u, rear, Math.max(7, h - 1), { broken: true });
      charPost(B, u, near, Math.min(heightAt(near), 22 + Math.floor(p.rnd(30 + u) * 13)), { broken: true });
    }
    if (place === 'road') B(x - 3, 5, 2, x + 3, 5, 3, 0xa34928, 1);
  };
}
