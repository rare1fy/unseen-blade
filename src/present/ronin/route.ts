// 场景内选路（docs/ronin/DESIGN.md §3）：一场打完，镜头不切、缓缓升高后拉成「选路机位」；场景里每条去路的路口立着一块高札
// （两根柱、一块木板、一道小檐），板上烧着节点图标、两个大字（战斗 / 精英 / 商人……）和奖励图标、下一处的地名。
// 指着哪块，英雄就转头看哪边，那块板抬起一点、木色亮一点；点下去（或 ←→ 选、回车），英雄沿路走出场景。
// 路的位置来自拼装器切进场景的出口（asm/exits.ts）。
import * as THREE from 'three';
import { V3, scene, onUpdate } from '../engine/world';
import { animP } from '../engine/clock';
import { shot, staticShot } from '../director';
import { toon } from '../look/toon';
import { worldToUi } from '../ui3d/layer';
import { icon, text, textW } from '../v2/overlay';
import { cue } from '../../audio/cues';
import type { BattleActor } from '../bestiary/battle';
import type { RouteOpt } from '../../core/v2/ronin/chapter';
import { ROUTE_CN } from '../../core/v2/ronin/chapter';
import { exitInfo, type ExitId, type ExitInfo } from '../asm/exits';
import type { Layout } from '../asm/types';

// ------------------------------------------------------------------ the burned-in icons (10 × 10, '#' = ink, 'o' = accent)
const GLYPH: Record<string, string[]> = {
  normal: ['........##', '.......##.', '......##..', '.....##...', '#...##....', '##.##.....', '.###......', '.##.......', '#.##......', '...#......'],
  elite: ['#........#', '##......##', '.##....##.', '..######..', '.########.', '##########', '##.####.##', '##########', '.#.#..#.#.', '..........'],
  camp: ['....#.....', '...##.....', '...###.#..', '..#####...', '..######..', '.###oo##..', '.##oooo#..', '..######..', '#.#.##.#.#', '##########'],
  shop: ['..######..', '.#......#.', '#..####..#', '#..#..#..#', '#..####..#', '.#......#.', '..######..', '....##....', '..######..', '....##....'],
  event: ['##########', '#........#', '#.######.#', '#........#', '#.#####..#', '#........#', '#.######.#', '#........#', '##########', '.#......#.'],
  midBoss: ['....##....', '..######..', '.##....##.', '##..##..##', '#..####..#', '#..####..#', '##..##..##', '.##....##.', '..######..', '....##....'],
  build: ['.########.', '#oooo#ooo#', '#oooo#ooo#', '#oooo#ooo#', '#oooo#ooo#', '#oooo#ooo#', '#oooo#ooo#', '.####.###.', '..........', '..........'],
  relic: ['..........', '.########.', '#oooooooo#', '##########', '#oo#..#oo#', '#ooo##ooo#', '#oooooooo#', '##########', '..........', '..........'],
  slot: ['.########.', '#........#', '#.##..##.#', '#.##..##.#', '#........#', '#.##..##.#', '#.##..##.#', '#........#', '.########.', '..........'],
  heal: ['.##...##..', '####.####.', '#########.', '#########.', '.#######..', '..#####...', '...###....', '....#.....', '..........', '..........'],
};
const INK = '#2a170c', WOOD = '#c09464', WOOD_D = '#8a6440', ACC = '#7a2a1e';

function boardTexture(o: RouteOpt, place: string) {
  const W = 160, H = 104, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.fillStyle = WOOD; g.fillRect(0, 0, W, H);
  // plank seams as two whole-pixel lines, a dark frame
  g.fillStyle = WOOD_D; g.fillRect(0, 34, W, 2); g.fillRect(0, 70, W, 2); g.fillRect(0, 0, W, 4); g.fillRect(0, H - 4, W, 4); g.fillRect(0, 0, 4, H); g.fillRect(W - 4, 0, 4, H);
  // top: the node glyph (×5) and the two big characters (×3)
  icon(g, GLYPH[o.kind] ?? GLYPH.normal, 10, 8, 5, { main: INK, acc: ACC, dark: INK });
  const k = o.kind === 'midBoss' ? '首领' : ROUTE_CN[o.kind];
  text(g, k, 66 + (84 - textW(k, 3)) / 2, 12, 3, INK, 'left', null);
  // bottom: the reward glyph (×3) and the place
  icon(g, GLYPH[o.reward] ?? GLYPH.build, 10, 66, 3, { main: INK, acc: ACC, dark: INK });
  const p = place.slice(0, 6), s = textW(p, 2) > 104 ? 1 : 2;
  text(g, p, 46, 72 + (s === 1 ? 6 : 0), s, INK, 'left', null);
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = false;
  return t;
}

/** a 高札: two posts, a board with the face, a little roof */
export function makeBoard(o: RouteOpt, place: string) {
  const g = new THREE.Group(), post = toon(0x4a3422), roof = toon(0x2e2a28), face = boardTexture(o, place);
  const faceMat = toon(0xffffff, { map: face }); faceMat.emissive.set(0xffffff); faceMat.emissiveMap = face; faceMat.emissiveIntensity = 0.28;
  const back = toon(0x7a5636);
  for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.3, 0.14), post); m.position.set(s * 0.82, 1.15, 0); m.castShadow = true; g.add(m); }
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.04, 0.08), [back, back, back, back, faceMat, back]); board.position.set(0, 1.55, 0.08); board.castShadow = true; g.add(board);
  const r1 = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.1, 0.5), roof); r1.position.set(0, 2.16, 0.05); g.add(r1);
  const r2 = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 0.3), roof); r2.position.set(0, 2.26, 0.05); g.add(r2);
  return { g, board, faceMat };
}

/** the route shot's eye (boards turn toward it) and the boards' size (a 高札 is a big notice board: ~2.4 m wide at 1.5) */
const ROUTE_EYE = V3(0, 9.6, 8.8), BOARD_K = 1.5;

interface Sign { opt: RouteOpt; i: number; ex: ExitInfo; g: THREE.Group; board: THREE.Mesh; faceMat: THREE.MeshToonMaterial; lift: number }
export interface RouteHost { hero: () => BattleActor | null; place: (o: RouteOpt) => string }

export class RouteScene {
  on = false; focus = -1; private signs: Sign[] = []; private done: ((i: number) => void) | null = null; private walking = false;
  constructor(private h: RouteHost) {
    onUpdate((dt) => {
      for (const s of this.signs) {
        const want = s.i === this.focus && this.on ? 1 : 0; s.lift += (want - s.lift) * Math.min(1, dt * 10);
        s.board.position.y = 1.55 + 0.1 * s.lift; s.board.scale.setScalar(1 + 0.12 * s.lift); s.faceMat.emissiveIntensity = 0.28 + 0.22 * s.lift;
      }
    });
  }
  /** the boards up, the camera pulled up and back; resolves with the option walked */
  open(opts: RouteOpt[], exits: ExitId[], layout: Layout): Promise<number> {
    this.close();
    this.signs = opts.map((opt, i) => {
      const ex = exitInfo(layout, exits[i] ?? 'back'), { g, board, faceMat } = makeBoard(opt, this.h.place(opt));
      g.position.set(ex.sign.x, 0, ex.sign.z); g.scale.setScalar(BOARD_K); g.rotation.y = Math.atan2(ROUTE_EYE.x - ex.sign.x, ROUTE_EYE.z - ex.sign.z) * 0.85; scene.add(g);
      return { opt, i, ex, g, board, faceMat, lift: 0 };
    });
    this.on = true; this.focus = -1; this.walking = false;
    // the route shot: up and back from the battle view, so the whole floor, both wings and the back show
    shot('route', staticShot(ROUTE_EYE.clone(), V3(0, 0.9, -5.2), 46), { speed: 1.6 });
    return new Promise(res => { this.done = res; });
  }
  close() { for (const s of this.signs) { s.g.parent?.remove(s.g); s.g.traverse(o => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); }); } this.signs = []; this.on = false; this.focus = -1; }
  /** screen rect of a board (projected corners) */
  private rectOf(s: Sign) {
    const pts = [[-1, 0.9], [1, 0.9], [-1, 2.3], [1, 2.3]].map(([x, y]) => worldToUi(s.g.localToWorld(V3(x, y, 0))));
    return { x0: Math.min(...pts.map(p => p.x)) - 10, x1: Math.max(...pts.map(p => p.x)) + 10, y0: Math.min(...pts.map(p => p.y)) - 10, y1: Math.max(...pts.map(p => p.y)) + 40 };
  }
  private setFocus(i: number) {
    if (i === this.focus) return; this.focus = i; if (i < 0) return;
    cue('click', 0.4); const hero = this.h.hero(), s = this.signs[i];
    if (hero && s) hero.faceToward(V3(s.ex.walk[1][0], 0, s.ex.walk[1][1]));
  }
  pointer(type: string, x: number, y: number): boolean {
    if (!this.on || this.walking) return this.on;
    const hit = this.signs.findIndex(s => { const r = this.rectOf(s); return x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1; });
    if (type === 'move') this.setFocus(hit);
    if (type === 'down' && hit >= 0) { this.setFocus(hit); this.pick(hit); }
    return true;
  }
  key(k: 'left' | 'right' | 'ok'): boolean {
    if (!this.on || this.walking) return this.on;
    const n = this.signs.length; if (!n) return false;
    // left / right by the boards' screen order
    const order = this.signs.map(s => ({ i: s.i, x: worldToUi(s.g.position).x })).sort((a, b) => a.x - b.x).map(o => o.i);
    const at = order.indexOf(this.focus);
    if (k === 'left') this.setFocus(order[at <= 0 ? n - 1 : at - 1]);
    else if (k === 'right') this.setFocus(order[at < 0 || at >= n - 1 ? 0 : at + 1]);
    else if (this.focus >= 0) this.pick(this.focus);
    return true;
  }
  private pick(i: number) { if (this.walking) return; this.walking = true; cue('select', 0.7); const d = this.done; this.done = null; d?.(i); }
  /** the hero walks road i out of the scene; the camera follows from behind. Resolves at the far end (the scene change follows) */
  async walkOut(i: number, k = 1): Promise<void> {
    const hero = this.h.hero(), s = this.signs[i]; if (!hero || !s) return;
    const pts = [hero.home.clone(), ...s.ex.walk.map(([x, z]) => V3(x, 0, z))];
    const look = V3(), base = V3();
    shot('routeWalk', () => {
      const f = hero.fwd(); look.copy(hero.home).addScaledVector(f, 2.2); look.y = 1.0;
      base.copy(hero.home).addScaledVector(f, -4.6); base.y = 6.2; return { base, look, fov: 46 };
    }, { speed: 2.2 });
    hero.walkK = 1;
    for (let j = 1; j < pts.length; j++) {
      const a = pts[j - 1].clone(), b = pts[j], d = a.distanceTo(b), dur = d / (2.3 * k);
      hero.faceToward(b);
      await animP(dur, u => { hero.home.lerpVectors(a, b, u); });
      // the last leg is out of the stage: the scene change takes it from halfway
      if (j === pts.length - 2) break;
    }
    hero.walkK = 0;
    this.close();
  }
}
