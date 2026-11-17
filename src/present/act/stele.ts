// 断碑仇名（act-20，用户：「我希望复仇感强点」「要有局外内容了」）：据点院里半截断碑，刘白用刀尖刻下的四个名字——
// 褚雷、阎虎、封鸩、周黯（docs/STORY.md 第 3 节）。她看不见，靠手指摸刻痕；每杀一个，就在那个名字上竖劈一道深槽。
// 碑是体素大块（断口两级台阶，横平竖直）；字是贴在碑面上的一张像素刻字贴图（竖排、自右往左，阴刻：暗槽 + 右下一道受光边）。
import * as THREE from 'three';
import { VoxWorld } from '../look/voxkit';
import { CELL } from '../bestiary/kit';
import { V3 } from '../engine/world';
import { text } from '../v2/overlay';
import { PIX_H } from '../v2/pix';
import { fxChips, fxSparks, fxSmoke } from '../fx/fx';
import { shake } from '../engine/clock';
import { cue } from '../../audio/cues';

export const STELE_NAMES = ['褚雷', '阎虎', '封鸩', '周黯'] as const;
const STONE = 0x7a756d, STONE_L = 0x928c82, STONE_D = 0x5a554e, BASE = 0x524e48, BASE_L = 0x66615a;
// the slab's front face (cells): x -7..7, y 4..; the names sit on y 6..17
// (a cell i spans [i, i + 1] × CELL: the band x -6..6 → -6..7, its front at z 4 cells)
const FACE_W = 13 * CELL, FACE_X = 0.5 * CELL, FACE_Y0 = 5 * CELL, FACE_H = 13 * CELL, FACE_Z = 4 * CELL + 0.004;
// the carving canvas: four columns of two characters (pixel font, scale 3), right to left
const S = 3, CH = PIX_H * S, CW = 180, CHH = 150, COL_X = (i: number) => CW - 18 - CH - i * (CH + 8), ROW_Y = (r: number) => 14 + r * (CH + 10);

let GEO: THREE.Mesh[] | null = null;
function stoneModel() {
  if (!GEO) {
    const w = new VoxWorld(CELL);
    // a low plinth with a lighter lip
    w.box(-9, 0, -5, 9, 2, 5, BASE); w.box(-9, 3, -5, 9, 3, 5, BASE_L);
    // the slab; the break across the top in two big steps (left stands tallest), never a diagonal run
    w.box(-7, 4, -2, 7, 17, 2, STONE);
    w.box(-7, 18, -2, 1, 20, 2, STONE); w.box(-7, 21, -2, -3, 22, 2, STONE);
    // the broken tops lighter (fresh stone), the slab's sides a shade darker
    w.box(2, 17, -2, 7, 17, 2, STONE_L); w.box(-2, 20, -2, 1, 20, 2, STONE_L); w.box(-7, 22, -2, -3, 22, 2, STONE_L);
    w.box(-7, 4, -2, -7, 17, 2, STONE_D); w.box(7, 4, -2, 7, 16, 2, STONE_D);
    // the slab's front a hair proud of the frame (the carving plane): one cell deep border band
    w.box(-6, 5, 3, 6, 17, 3, STONE);
    GEO = w.build({ rim: 0.3, edge: 0.16 });
  }
  const g = new THREE.Group(); for (const m of GEO) { const c = new THREE.Mesh(m.geometry, m.material); c.castShadow = true; c.receiveShadow = true; g.add(c); } return g;
}

/** the carved names; struck = how many from the first are cut through */
function paint(c: HTMLCanvasElement, struck: number) {
  const g = c.getContext('2d')!; g.clearRect(0, 0, c.width, c.height); g.imageSmoothingEnabled = false;
  STELE_NAMES.forEach((name, i) => {
    const x = COL_X(i);
    [...name].forEach((ch, r) => {
      // intaglio: the lit lower-right wall of the groove, then the groove itself
      text(g, ch, x + 1, ROW_Y(r) + 1, S, '#bcb6aa', 'left', null);
      text(g, ch, x, ROW_Y(r), S, '#3c3833', 'left', null);
    });
    if (i < struck) {
      // her cut: one deep vertical gouge down the whole name, dried red in the bottom of it, chipped lips every 9 px
      const gw = 12, gx = x + Math.round(CH / 2) - gw / 2, y0 = ROW_Y(0) - 10, y1 = ROW_Y(1) + CH + 10;
      g.fillStyle = '#c4beb2'; g.fillRect(gx + gw, y0 + 2, 2, y1 - y0 - 2);
      g.fillStyle = '#211d1a'; g.fillRect(gx, y0, gw, y1 - y0);
      g.fillStyle = '#6a2a22'; g.fillRect(gx + 4, y0 + 4, 4, y1 - y0 - 8);
      g.fillStyle = '#211d1a'; for (let y = y0 + 5, k = 0; y < y1 - 5; y += 10, k++) g.fillRect(k % 2 ? gx + gw : gx - 3, y, 3, 4);
    }
  });
}

export class Stele {
  readonly g = new THREE.Group();
  private canvas = document.createElement('canvas'); private tex: THREE.CanvasTexture; private face: THREE.Mesh; private struck: number;
  constructor(struck = 0) {
    this.struck = struck; this.canvas.width = CW; this.canvas.height = CHH; paint(this.canvas, struck);
    this.tex = new THREE.CanvasTexture(this.canvas); this.tex.magFilter = this.tex.minFilter = THREE.NearestFilter; this.tex.generateMipmaps = false; this.tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshLambertMaterial({ map: this.tex, transparent: true, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2 });
    this.face = new THREE.Mesh(new THREE.PlaneGeometry(FACE_W * 0.94, FACE_W * 0.94 * CHH / CW), mat);
    this.face.position.set(FACE_X, FACE_Y0 + FACE_H / 2, FACE_Z); this.face.receiveShadow = true;
    this.g.add(stoneModel(), this.face);
  }
  get count() { return this.struck; }
  /** world point at the middle of name i (for the cut's sparks, a camera) */
  nameAt(i: number) {
    const u = (COL_X(i) + CH / 2) / CW - 0.5, w = FACE_W * 0.94;
    return this.face.localToWorld(V3(u * w, 0, 0.02));
  }
  /** the cut lands on name i: chips of stone, a few sparks off the blade, the groove appears */
  strike(i: number) {
    this.struck = Math.max(this.struck, i + 1); paint(this.canvas, this.struck); this.tex.needsUpdate = true;
    const p = this.nameAt(i);
    fxChips(p, [STONE, STONE_L, STONE_D], 14, { dir: V3(0, 0.4, 1).applyQuaternion(this.g.getWorldQuaternion(new THREE.Quaternion())), speed: 3.2, up: 2.2, size: 0.06 });
    fxSparks(p, 0xfff0c0, 12, 5, { size: 0.05, life: 0.3 });
    fxSmoke(p, 0x9a958c, 5, { r: 0.25, spd: 0.6, up: 0.4, life: 0.8 });
    cue('cutHeavy', 1); cue('wallSlam', 0.5); shake(0.25);
  }
  dispose() { this.g.parent?.remove(this.g); this.tex.dispose(); (this.face.material as THREE.Material).dispose(); this.face.geometry.dispose(); }
}
