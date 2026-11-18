// 11-18 (用户：「廊子绕着一个结冰的池子」): 走在木板上，池中只留几道长裂纹和几片挂霜的冰。
import * as THREE from 'three';
import type { Ctx } from '../../scenes/stage';
import { M, PLAY, SZ } from '../../scenes/props';
import { CELL } from '../../bestiary/kit';
import type { ArenaPlan } from '../arena';
import { moodFor } from '../sky';
import type { Layout, Locale, Rect } from '../types';
import { CX, bamboo, column, frame, gardenWall, paintFloor, planks, roofK, wp } from './cx_kit';

function floor(c: Ctx, f: { layout: Layout; arena?: ArenaPlan }) {
  const pond = f.arena?.shape?.solid[0];
  paintFloor(c, (X, Z, x, z) => {
    const deck = x > PLAY.x0 - 0.48 && x < PLAY.x1 + 0.48 && z > PLAY.z0 - 0.55 && z < PLAY.z1 + 1.1;
    const path = f.layout.path.some(r => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1);
    if (!deck && !path) return X < M(PLAY.x0 - 1.6) || X > M(PLAY.x1 + 1.6) ? CX.snow : 0xb2c2c9;
    const alongX = !!pond && (z < pond.z0 || z > pond.z1);
    const outerBay = Math.abs(x) > PLAY.x1 - 2.5;
    return planks(alongX ? Z : X, alongX ? X : Z, outerBay ? 0x6e5140 : 0x7d5d46, 0x5b4339);
  });
}

function ice(c: Ctx, r: Rect) {
  const x0 = M(r.x0), x1 = M(r.x1) - 1, z0 = M(r.z0), z1 = M(r.z1) - 1;
  const w = x1 - x0, d = z1 - z0, B = frame(c.w, r.x0, r.z0);
  const x = (k: number) => Math.round(w * k), z = (k: number) => Math.round(d * k);
  // 同一片冰的透色、压住的雪和湖边反光。反光下面的裂纹保持一整个分叉。
  B(0, -1, 0, w, -1, d, 0x7799ab);
  B(4, -1, 4, x(0.23), -1, z(0.84), 0x9dbbc6);
  B(x(0.58), -1, z(0.18), w - 4, -1, z(0.57), 0x688b9f);
  B(x(0.32), -1, z(0.70), w - 4, -1, d - 4, 0x8eafbb);
  B(4, -1, 4, w - 4, -1, z(0.13), 0xa6c4cf);
  B(x(0.16), -1, z(0.34), x(0.73), -1, z(0.34) + 1, 0x405d73);
  B(x(0.42), -1, z(0.34), x(0.42) + 1, -1, z(0.83), 0x405d73);
  B(x(0.42), -1, z(0.61), x(0.63), -1, z(0.61) + 1, 0x405d73);
  B(x(0.68), -1, z(0.34) - 1, x(0.68) + 1, -1, z(0.06), 0x547286);
  for (const a of [0, w - 3]) B(a, 0, 0, a + 3, 1, d, 0x566878);
  for (const b of [0, d - 3]) B(0, 0, b, w, 1, b + 3, 0x657b87);
  const glaze = new THREE.Mesh(
    new THREE.PlaneGeometry((w - 7) * CELL, (d - 7) * CELL),
    new THREE.MeshStandardMaterial({ color: 0x9bbacb, roughness: 0.34, metalness: 0.22, transparent: true, opacity: 0.22 }),
  );
  glaze.rotation.x = -Math.PI / 2;
  glaze.position.set((x0 + x1 + 1) * CELL / 2, 0.002, (z0 + z1 + 1) * CELL / 2);
  c.add(glaze);
}

function eaves(c: Ctx, x: number, z: number, turn: number, length: number) {
  const B = frame(c.w, x, z, turn), L = M(length);
  // 檐口只盖住池沿，柱脚落在池岸上，木廊的走道没有穿过柱脚。
  for (let a = 0; a <= L; a += 38) column(B, a, 0, 27);
  B(0, 29, -4, L, 31, 4, CX.wood);
  roofK(B, -3, L + 3, -7, 10, 32);
  B(0, 39, -2, L, 39, 2, CX.snow);
  for (let a = 18; a < L - 6; a += 76) {
    B(a, 21, 4, a, 31, 4, CX.ink);
    B(a - 3, 15, 2, a + 3, 21, 6, 0x80523e);
    B(a - 2, 16, 7, a + 2, 20, 7, 0xd5a773, 1);
    c.light(wp(x, z, turn, a, 18, 8), 0xffc494, 2.7, 4.4);
  }
}

function poolCourt(c: Ctx, r: Rect) {
  ice(c, r);
  const h = r.z1 - r.z0 - 0.45;
  eaves(c, r.x0 + 0.45, r.z0 + 0.16, 0, r.x1 - r.x0 - 0.9);
  eaves(c, r.x0 + 0.18, r.z0 + 0.40, 3, h);
  eaves(c, r.x1 - 0.18, r.z1 - 0.05, 1, h);
}

function far(c: Ctx, f: { arena?: ArenaPlan }) {
  // 歇脚房的地面按原来留空，冰池和廊退到后墙以外。
  if (!f.arena?.shape) {
    const side = f.arena?.gates.some(g => g.id === 'back' && g.open) ? -1 : 0;
    poolCourt(c, { x0: side ? PLAY.x0 + 0.4 : -4.9, x1: side ? -2.1 : 4.9, z0: PLAY.z0 - 6.2, z1: PLAY.z0 - 0.82 });
  }
  const B = frame(c.w, 0, 0);
  gardenWall(B, M(PLAY.x0 - 7), M(PLAY.x1 + 7), M(SZ(-14)), 36);
  for (const s of [-1, 1]) for (const z of [SZ(-8.7), SZ(-1.5), SZ(3.6)]) {
    const x = s < 0 ? PLAY.x0 - 2.4 : PLAY.x1 + 2.4;
    bamboo(frame(c.w, x, z), -8, 8, 0, 47, M(z));
  }
}

const night = moodFor('night', 'winter', 'snow');
export const cxGallery: Locale = {
  id: 'cx_gallery', name: '穿堂曲廊', theme: 'cui',
  layouts: ['axis', 'garden'], landmarks: [], groups: [],
  seasons: ['winter'], times: ['night'], weathers: ['snow', 'mist'], noSnow: true,
  mood: { ...night, moon: 0xabd8ec, hemiSky: 0x7296a7, moonI: 1.87, hemiI: 1.18, fog: 0x233644 },
  floor, far, shapes: ['cloister'],
  infill(c, f) { poolCourt(c, f.rect); },
};
