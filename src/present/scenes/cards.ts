// Dressing cards (面片): alpha-cut pixel-art sprites at the same pixel density as the blocks (one texel = one 7 cm block), placed as
// crossed quads (grass, ferns, flowers, weeds, little mushrooms), wall-hung strips (vines, moss), corner webs and ground decals
// (leaf litter, moss, cracks). They soften the block silhouettes and fill the edges of the stage with organic detail while the
// battle floor stays readable. Plus the atmosphere layer: fireflies, falling leaves, spores, dust, and moonbeam shafts.
import * as THREE from 'three';
import { camera, canvasTex, onUpdate, V3, R } from '../engine/world';
import { clock } from '../engine/clock';
import { PADD, PALPHA, TILE } from '../engine/particles';
import { QUALITY } from '../look/quality';
import { VOXEL_WEATHER } from './weatherFx';
import { CELL } from '../bestiary/kit';
import { hash, inPlay } from './props';

// ------------------------------------------------------------------ the sprite atlas (128×128 texels), painted in code
// Every picture is laid out by hand (no random texels): tufts are fans of whole blades, leaves are whole shapes with a lit top row
// and a shaded bottom row, and every line runs along an axis — no 45° pixel staircases.
type Rect = [number, number, number, number];
export const SPR: Record<string, Rect> = {
  grass: [0, 0, 16, 16], tallgrass: [16, 0, 16, 16], fern: [32, 0, 16, 16], flowers: [48, 0, 16, 16], weeds: [64, 0, 16, 16], shroom: [80, 0, 16, 16], bramble: [96, 0, 16, 16], reeds: [112, 0, 16, 16],
  vine: [0, 16, 16, 32], moss: [16, 16, 16, 32], web: [32, 16, 32, 32], litter: [64, 16, 32, 32], mossdecal: [96, 16, 32, 32], crack: [0, 48, 32, 32], bonesdecal: [32, 48, 32, 32], puddle: [64, 48, 32, 32], pebbles: [96, 48, 32, 32],
  leaf: [0, 80, 16, 16], roots: [16, 80, 16, 32], clover: [32, 80, 32, 32], bells: [64, 80, 16, 16], sprig: [80, 80, 16, 16],
  fungus: [96, 80, 16, 16], crow: [112, 80, 10, 8], deadvine: [96, 96, 16, 32], twigs: [0, 112, 32, 16],
};
let atlas: THREE.Texture | null = null;
function paintAtlas() {
  if (atlas) return atlas;
  const t = canvasTex(128, 128, g => {
    const px = (x: number, y: number, c: string) => { g.fillStyle = c; g.fillRect(x, y, 1, 1); };
    const rect = (x: number, y: number, w: number, h: number, c: string) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    /** a blade from the ground (y = oy + 15) up h texels, w wide, a lighter tip on tall ones */
    const blade = (ox: number, oy: number, x: number, h: number, c: string, tip: string, w = 1) => { rect(ox + x, oy + 16 - h, w, h, c); if (h >= 7) rect(ox + x, oy + 16 - h, w, 1, tip); };
    // grass: a fan of blades, tallest in the middle, three greens, a dark root band
    const G = ['#4e8a3e', '#5f9c48', '#3f7434'], GT = '#82bc5e';
    for (const [x, h, k, w] of [[2, 5, 1, 1], [3, 8, 0, 1], [5, 11, 2, 1], [6, 7, 1, 1], [7, 13, 0, 2], [9, 10, 2, 1], [10, 12, 1, 1], [12, 8, 0, 1], [13, 5, 2, 1]] as const) blade(0, 0, x, h, G[k], GT, w);
    rect(2, 15, 12, 1, '#2a4a22');
    // tall grass: a taller fan with two seed heads
    for (const [x, h, k, w] of [[1, 7, 1, 1], [3, 12, 0, 1], [4, 9, 2, 1], [6, 15, 1, 1], [8, 11, 0, 2], [10, 14, 2, 1], [11, 10, 1, 1], [12, 13, 0, 1], [14, 8, 2, 1]] as const) blade(16, 0, x, h, G[k], GT, w);
    for (const x of [6, 10]) { const h = x === 6 ? 15 : 14; rect(16 + x - 0 , 16 - h, 2, 3, '#c8b878'); rect(16 + x, 16 - h, 2, 1, '#e4d6a0'); }
    rect(17, 15, 14, 1, '#2a4a22');
    // fern: three fronds — a tall centre one and two shorter ones — each a stem with level leaflets, longest low, short at the tip
    const FN = ['#5aa04a', '#4a8c3e'], FT = '#7cc060', FS = '#2e5a26';
    const frond = (x: number, y0: number, lens: number[]) => {
      rect(32 + x, y0, 1, 16 - y0, FS);
      lens.forEach((L, i) => { const y = y0 + 1 + i * 3; for (const sgn of [-1, 1]) { const x0 = sgn < 0 ? 32 + x - L : 32 + x + 1; rect(x0, y, L, 1, FT); rect(x0, y + 1, L, 1, FN[i % 2]); } });
    };
    frond(3, 6, [1, 2, 2]); frond(13, 5, [1, 2, 2]); frond(8, 0, [1, 2, 3, 4, 3]);
    // flowers: three stems with leaf pairs; petals painted pale at alpha 0.75 (they take the instance tint), centres stay gold
    const ST = '#3e7434', LF = '#5a9a48', PET = 'rgba(244,244,250,0.75)', CEN = '#e8c440';
    for (const [x, h] of [[3, 7], [8, 12], [12, 9]] as const) { rect(48 + x, 16 - h, 1, h, ST); rect(48 + x - 2, 16 - Math.round(h * 0.45), 2, 1, LF); rect(48 + x + 1, 15 - Math.round(h * 0.3), 2, 1, LF); }
    const head = (x: number, y: number, big: boolean) => {
      if (big) { for (const [a, b] of [[1, 0], [2, 0], [0, 1], [3, 1], [0, 2], [3, 2], [1, 3], [2, 3]]) px(48 + x + a, y + b, PET); rect(48 + x + 1, y + 1, 2, 2, CEN); }
      else { for (const [a, b] of [[1, 0], [0, 1], [2, 1], [1, 2]]) px(48 + x + a, y + b, PET); px(48 + x + 1, y + 1, CEN); }
    };
    head(7, 1, true); head(2, 7, false); head(11, 5, false);
    for (const [x, h] of [[1, 4], [5, 5], [10, 4], [14, 5]] as const) blade(48, 0, x, h, G[x % 3], GT);
    // weeds: four dry stalks with seed heads and a side twig each
    const W1 = '#8a7a5e', W2 = '#a89a74', W3 = '#c8b890';
    for (const [x, h, tw] of [[3, 12, 1], [7, 14, -1], [10, 9, 1], [13, 11, -1]] as const) {
      rect(64 + x, 16 - h, 1, h, W1); rect(64 + x, 16 - h - 1, 2, 3, W2); rect(64 + x, 16 - h - 1, 2, 1, W3);
      const ty = 16 - Math.round(h * 0.55); rect(64 + x + (tw > 0 ? 1 : -2), ty, 2, 1, W1); rect(64 + x + (tw > 0 ? 3 : -3), ty - 1, 1, 2, W2);
    }
    rect(65, 15, 14, 1, '#5e5040');
    // little glowing mushrooms: a big one, a small one, a tiny one; lit cap tops, dark gills (glow material: colours as painted)
    const CAP = '#6ad0ff', CAPT = '#c8f4ff', GILL = '#3a8cc0', STEM = '#d8d0e0';
    rect(88, 7, 2, 9, STEM); rect(86, 5, 7, 2, CAP); rect(87, 4, 5, 1, CAPT); rect(86, 7, 7, 1, GILL);
    rect(83, 11, 1, 5, STEM); rect(81, 9, 5, 2, CAP); rect(82, 8, 3, 1, CAPT); rect(81, 11, 5, 1, GILL);
    rect(93, 13, 1, 3, STEM); rect(92, 12, 3, 1, CAP); px(93, 11, CAPT);
    // bramble: dark stems in right-angle loops, thorns on a regular beat, a few berries (accents: they take the tint)
    const BR = '#3a2a2a', TH = '#5a3a3a', BE = 'rgba(200,56,56,0.75)';
    const run = (x0: number, y0: number, x1: number, y1: number) => rect(96 + Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0) + 1, Math.abs(y1 - y0) + 1, BR);
    run(2, 15, 2, 5); run(2, 5, 7, 5); run(7, 5, 7, 9); run(10, 15, 10, 3); run(10, 3, 13, 3); run(13, 3, 13, 8); run(5, 15, 5, 10); run(5, 10, 8, 10);
    for (const [x, y] of [[1, 12], [1, 8], [3, 4], [6, 4], [8, 7], [11, 12], [9, 7], [11, 2], [14, 5], [4, 13], [6, 11]]) px(96 + x, y, TH);
    for (const [x, y] of [[6, 8], [12, 7], [7, 11]]) rect(96 + x, y, 2, 2, BE);
    // reeds: cattail stalks with brown heads, two long leaf blades
    for (const [x, h] of [[2, 11], [4, 14], [7, 12], [9, 15], [12, 10], [14, 13]] as const) { rect(112 + x, 16 - h, 1, h, '#6a7a3a'); rect(112 + x, 16 - h + 1, 2, 4, '#5a3a22'); rect(112 + x, 16 - h + 1, 1, 4, '#6e4a2c'); px(112 + x, 16 - h, '#7a8a46'); }
    for (const [x, h] of [[5, 9], [11, 8]] as const) rect(112 + x, 16 - h, 1, h, '#8a9a4a');
    // vine (16×32): a two-wide stem, leaves in pairs alternating sides, each leaf lit on top and shaded below, shrinking to the tip
    rect(7, 16, 2, 32, '#2e5a24');
    for (let i = 0; i < 7; i++) {
      const y = 17 + i * 4 + (i % 2), left = i % 2 === 0, w = i < 5 ? 5 : 3, x = left ? 7 - w : 9;
      rect(x, y, w, 1, '#7ab850'); rect(x, y + 1, w, 1, '#5a9a3a'); rect(left ? x + 1 : x, y + 2, w - 1, 1, '#3e7a2e');
    }
    // hanging moss (16×32): a solid cap, then strands two texels wide of different lengths, a lit left column
    rect(16, 16, 16, 3, '#6a7a5a');
    for (const [x, len] of [[16, 22], [18, 12], [21, 29], [24, 17], [27, 25], [30, 10]]) { rect(x, 18, 2, len, '#6e7e5e'); rect(x, 18, 1, len, '#8a9a76'); }
    // web (32×32): radial — eight spokes (across, down, the two exact 45° diagonals) and three octagon rings made of axis runs and
    // exact 45° runs; the outer ring sags (its lower edge one texel low). Single-texel 45° lines are the one exception here: a web
    // drawn only along the axes reads as a wire grid.
    const wc = 'rgba(214,214,226,0.92)', cx = 48, cy = 32;
    rect(cx - 15, cy, 31, 1, wc); rect(cx, cy - 15, 1, 31, wc);
    for (let k = -13; k <= 13; k++) { px(cx + k, cy + k, wc); px(cx + k, cy - k, wc); }
    for (const r of [4, 8, 12]) {
      const b = Math.round(r * 0.414), sag = r === 12 ? 1 : 0;
      rect(cx - b, cy - r, 2 * b + 1, 1, wc); rect(cx - b, cy + r + sag, 2 * b + 1, 1, wc);           // top, bottom
      rect(cx - r, cy - b, 1, 2 * b + 1, wc); rect(cx + r, cy - b, 1, 2 * b + 1, wc);                 // left, right
      for (let k = 0; k <= r - b; k++) {
        px(cx + b + k, cy - r + k, wc); px(cx - b - k, cy - r + k, wc);                              // upper diagonals
        px(cx + r - k, cy + b + k, wc); px(cx - r + k, cy + b + k, wc);                              // lower diagonals
      }
      if (sag) { px(cx + b, cy + r + 1, wc); px(cx - b, cy + r + 1, wc); }
    }
    // leaf litter (32×32): a dark earth patch with seven whole leaves (5×3, a lit top row, a shaded bottom row and a stem)
    const blob = (ox: number, oy: number, r: number, cIn: string, cOut: string, sx = 1, sd = 1) => { for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const d = Math.hypot((x - 15.5) * sx, y - 15.5) + (hash(x >> 2, y >> 2, sd) - 0.5) * 4; if (d < r) px(ox + x, oy + y, d < r * 0.62 ? cIn : cOut); } };
    blob(64, 16, 12, '#3c2e24', '#33271f', 1, 5);
    const leafAt = (x: number, y: number, c: [string, string, string]) => { rect(x + 1, y, 5, 1, c[0]); rect(x, y + 1, 7, 2, c[1]); rect(x + 1, y + 3, 5, 1, c[2]); rect(x + 1, y + 2, 5, 1, c[2]); rect(x + 1, y + 1, 5, 1, c[1]); px(x + 7, y + 2, '#4a3020'); };
    const AUT: Array<[string, string, string]> = [['#b08a5c', '#94704a', '#6e5238'], ['#9a8462', '#7c684c', '#5c4c3a'], ['#9a6e52', '#7c5640', '#5a402e'], ['#8c8a64', '#6e6c4c', '#525038'], ['#b8945e', '#9a7a4c', '#76603c']];
    [[69, 20, 1], [77, 18, 3], [84, 22, 0], [71, 25, 2], [79, 24, 4], [67, 30, 0], [75, 30, 1], [83, 28, 2], [72, 35, 3], [80, 34, 0]].forEach(([x, y, k]) => leafAt(x, y, AUT[k]));
    // moss decal: an irregular patch with a lighter heart (edges in 4-texel blocks)
    blob(96, 16, 13, '#4e7a3a', '#3e6a32', 1, 1);
    // crack decal: right-angle runs two texels wide, a branch, a lit lip on one side
    const cr = '#16121c', lip = '#8a86a0';
    for (const [x, y, w, h] of [[2, 62, 9, 2], [9, 62, 2, 5], [9, 65, 8, 2], [15, 60, 2, 7], [15, 60, 10, 2], [23, 60, 2, 4], [23, 62, 7, 2], [12, 67, 2, 7], [12, 72, 6, 2]] as const) rect(x, y, w, h, cr);
    for (const [x, y, w] of [[2, 64, 7], [11, 67, 1], [17, 62, 6], [25, 64, 5], [14, 74, 4]] as const) rect(x, y, w, 1, lip);
    // bones decal
    rect(36, 60, 12, 2, '#e6dcc4'); rect(35, 59, 2, 4, '#e6dcc4'); rect(47, 59, 2, 4, '#e6dcc4'); rect(44, 66, 2, 10, '#e6dcc4'); rect(43, 65, 4, 2, '#e6dcc4'); rect(50, 52, 6, 5, '#e6dcc4');
    rect(36, 61, 12, 1, '#b8ae98'); px(51, 54, '#18141c'); px(54, 54, '#18141c');
    // puddle: a lighter sky-coloured patch with a dark rim and two highlight streaks
    blob(64, 48, 11, '#5a78a8', '#34466a', 0.8, 3); rect(76, 58, 5, 1, '#c0d8ff'); rect(80, 62, 3, 1, '#a8c8f0');
    // pebbles: four flat stones, each lit on its top row and shaded on its bottom row (tinted per scene)
    for (const [x, y, w, h] of [[101, 54, 6, 4], [110, 58, 5, 3], [104, 64, 7, 5], [116, 66, 4, 3]] as const) { rect(x, y, w, h, '#a8a6b4'); rect(x, y, w, 1, '#d0ceda'); rect(x, y + h - 1, w, 1, '#6a6876'); }
    // leaf clump (16×16, pale: the caller's tint carries the green): four big overlapping leaves, few gaps — reads as one clump
    const LC = ['#dce8cc', '#b8c8a8', '#90a080'];
    for (const [x, y] of [[0, 5], [9, 6], [5, 1], [4, 9]] as const) { rect(x + 1, 80 + y, 5, 1, LC[0]); rect(x, 80 + y + 1, 7, 3, LC[1]); rect(x + 1, 80 + y + 4, 5, 1, LC[2]); rect(x + 3, 80 + y + 1, 1, 3, LC[2]); }
    // roots (16×32): three roots hanging from an earth band, two texels wide, jogging sideways at right angles, thinning to a tip
    rect(16, 80, 16, 2, '#3a2a20');
    const RB = '#6a5040', RL = '#8a6a50', RD = '#4a3428';
    const root = (segs: Array<[number, number, number, number]>) => { for (const [x, y, w, h] of segs) { rect(16 + x, 80 + y, w, h, RB); rect(16 + x, 80 + y, 1, h, w > 1 ? RL : RB); if (w > 1) rect(16 + x + w - 1, 80 + y, 1, h, RD); } };
    root([[3, 2, 2, 12], [3, 13, 4, 2], [5, 14, 2, 10], [6, 24, 1, 5]]);
    root([[10, 2, 2, 17], [8, 18, 4, 2], [8, 19, 2, 8], [8, 27, 1, 4]]);
    root([[14, 2, 1, 9], [13, 10, 2, 1], [13, 11, 1, 4]]);
    // clover (32×32 decal): ground cover — a dark green patch carpeted with trefoils (three 3×3 leaves round a dark heart)
    blob(32, 80, 13, '#3e7434', '#33602c', 1, 7);
    const tre = (x: number, y: number, c: string, lit: string) => { for (const [a, b] of [[0, 0], [4, 0], [2, 3]]) { rect(x + a, y + b, 3, 3, c); rect(x + a, y + b, 3, 1, lit); } px(x + 3, y + 2, '#264a20'); };
    [[38, 86], [45, 84], [52, 88], [40, 93], [47, 95], [54, 96], [37, 100], [45, 102], [51, 103]].forEach(([x, y], k) => tre(x, y, k % 2 ? '#5aa04a' : '#4e9442', k % 2 ? '#7cc062' : '#6ab456'));
    // bells (16×16): an arching stem with three hanging bell flowers (accents: tinted per scene)
    const BEL = 'rgba(236,236,250,0.75)';
    rect(66, 84, 1, 12, ST); rect(66, 84, 7, 1, ST); rect(72, 84, 1, 3, ST); rect(69, 84, 1, 6, ST); rect(66, 89, 2, 1, LF); rect(64, 92, 2, 1, LF);
    for (const [x, y] of [[71, 87], [68, 90], [65, 85]] as const) { rect(x, y, 3, 2, BEL); rect(x + 1, y + 2, 1, 1, BEL); }
    // sprig (16×16): a low leafy sprig, two stems with leaf pairs — a soft filler at the foot of walls, rocks and trees
    for (const [x, h] of [[5, 9], [10, 7]] as const) { rect(80 + x, 96 - h, 1, h, '#3e7434'); for (let i = 0; i < h - 2; i += 3) { rect(80 + x - 3, 96 - h + i + 1, 3, 2, '#5a9a48'); rect(80 + x - 3, 96 - h + i + 1, 3, 1, '#7ab85a'); rect(80 + x + 1, 96 - h + i + 2, 3, 2, '#4a8a3e'); rect(80 + x + 1, 96 - h + i + 2, 3, 1, '#6aa850'); } }
    // fungus (16×16): pale toadstools that grow on the dead — a big one, a brown one, a tiny one; lit cap tops, dark gills
    rect(103, 89, 2, 7, '#d8ccb8'); rect(101, 86, 6, 1, '#e8dcc8'); rect(100, 87, 8, 1, '#c8b49a'); rect(100, 88, 8, 1, '#8a7a66');
    rect(98, 92, 1, 4, '#cabca6'); rect(97, 90, 3, 1, '#b08e6c'); rect(96, 91, 5, 1, '#94704e'); px(98, 91, '#94704e'); rect(96, 92, 5, 1, '#5e4a3a'); px(98, 92, '#cabca6');
    rect(109, 93, 1, 3, '#d8ccb8'); rect(108, 92, 3, 1, '#c8b49a'); px(109, 91, '#e8dcc8');
    // crow (10×8, side view): a black bird with a sheen along its back, a grey beak and one pale eye — it perches, it does not move
    const CB = '#14141c', CS = '#2a2a3a';
    for (const [x, y, w, h, c] of [[118, 80, 2, 1, CB], [117, 81, 4, 1, CB], [114, 82, 7, 1, CS], [113, 83, 8, 1, CB], [112, 84, 2, 1, CB], [115, 84, 6, 1, CB], [112, 85, 1, 1, CB], [117, 85, 3, 1, CB], [117, 86, 1, 2, '#3a3a46'], [119, 86, 1, 2, '#3a3a46'], [121, 81, 1, 1, '#4a4a56']] as const) rect(x, y, w, h, c);
    px(119, 81, '#a8a8c0');
    // dead vine (16×32): bare grey-brown runners hanging from a dark band, jogging at right angles, a few curled dry leaves
    rect(96, 96, 16, 2, '#3a3028');
    const DV = '#5a4c40', DL = '#6e5c3e', DLT = '#8a7650';
    for (const [x, y, w, h] of [[99, 98, 1, 12], [99, 109, 3, 1], [101, 109, 1, 10], [100, 118, 2, 1], [100, 118, 1, 6], [106, 98, 1, 17], [106, 114, 3, 1], [108, 114, 1, 9], [110, 98, 1, 7], [110, 104, 2, 1]] as const) rect(x, y, w, h, DV);
    for (const [x, y] of [[100, 102], [97, 106], [102, 113], [107, 104], [104, 109], [109, 119], [101, 121]] as const) { rect(x, y, 2, 2, DL); rect(x, y, 2, 1, DLT); }
    // twigs (32×16 decal): fallen branches two texels thick with right-angle forks, lit along one edge, and a few broken pieces
    const TB = '#4a3e36', TL = '#6a5a4c';
    for (const [x, y, w, h] of [[2, 115, 19, 2], [8, 112, 1, 3], [15, 117, 1, 3], [15, 119, 4, 1], [18, 122, 12, 2], [24, 119, 1, 3], [28, 120, 1, 2]] as const) { rect(x, y, w, h, TB); if (h === 2) rect(x, y, w, 1, TL); }
    for (const [x, y] of [[4, 121], [11, 124]] as const) { rect(x, y, 3, 2, '#5a4a3e'); rect(x, y, 3, 1, '#6e5e50'); }
  }, { nearest: true });
  t.colorSpace = THREE.SRGBColorSpace;
  return (atlas = t);
}

// ------------------------------------------------------------------ card kinds
/** cross: standing crossed quads (base at y). wall: hangs down from y, faces +z before ry. decal: flat on the floor. panel: a quad
 *  centred on its position, facing +z before rx / ry (leaf skins on foliage faces). */
export type Kind = 'cross' | 'wall' | 'decal' | 'panel';
/** tile: the texture repeats (instances carry a uv repeat / offset); lit: lit by its real facing like a block face (default: lit as
 *  if it faced the sky, like foliage); accent: texels painted at alpha < 0.9 take the instance tint at full strength, the rest keep
 *  their painted colour with only a light tint (flower petals vs their leaves) */
interface Def { spr: string; kind: Kind; w: number; h: number; sway?: number; glow?: number; tile?: boolean; lit?: boolean; accent?: boolean }
type KindOpt = Omit<Def, 'spr'>;
/** card kinds registered by scene files, each with its own small pixel canvas (w × h texels, one texel = one block) */
const extra = new Map<string, { w: number; h: number; paint: (g: CanvasRenderingContext2D) => void; tex?: THREE.Texture }>();
/** register a new card kind painted in code. kind: 'cross' (standing crossed quads, base at y), 'wall' (hangs down from y, faces
 *  +z before ry), 'decal' (flat on the floor). glow > 0 = unlit and bright. Call at module level; repeated names are ignored. */
export function addCardKind(name: string, d: KindOpt, paint: (g: CanvasRenderingContext2D) => void) {
  if (CARD[name]) return;
  extra.set(name, { w: d.w, h: d.h, paint }); CARD[name] = { spr: name, ...d };
}
function texOf(d: Def) {
  const e = extra.get(d.spr); if (!e) return paintAtlas();
  if (!e.tex) { e.tex = canvasTex(e.w, e.h, e.paint, { nearest: true }); e.tex.colorSpace = THREE.SRGBColorSpace; if (d.tile) e.tex.wrapS = e.tex.wrapT = THREE.RepeatWrapping; }
  return e.tex;
}
export const CARD: Record<string, Def> = {
  grass: { spr: 'grass', kind: 'cross', w: 16, h: 16, sway: 0.06 }, tallgrass: { spr: 'tallgrass', kind: 'cross', w: 16, h: 16, sway: 0.1 }, fern: { spr: 'fern', kind: 'cross', w: 16, h: 16, sway: 0.06 },
  flowers: { spr: 'flowers', kind: 'cross', w: 16, h: 16, sway: 0.07, accent: true }, weeds: { spr: 'weeds', kind: 'cross', w: 16, h: 16, sway: 0.08 }, shroom: { spr: 'shroom', kind: 'cross', w: 16, h: 16, glow: 1.5 },
  bramble: { spr: 'bramble', kind: 'cross', w: 16, h: 16, sway: 0.03, accent: true }, reeds: { spr: 'reeds', kind: 'cross', w: 16, h: 16, sway: 0.12 },
  vine: { spr: 'vine', kind: 'wall', w: 16, h: 32, sway: 0.03 }, moss: { spr: 'moss', kind: 'wall', w: 16, h: 32, sway: 0.05 }, web: { spr: 'web', kind: 'wall', w: 32, h: 32 },
  litter: { spr: 'litter', kind: 'decal', w: 32, h: 32 }, mossdecal: { spr: 'mossdecal', kind: 'decal', w: 32, h: 32 }, crack: { spr: 'crack', kind: 'decal', w: 32, h: 32 }, bones: { spr: 'bonesdecal', kind: 'decal', w: 32, h: 32 }, puddle: { spr: 'puddle', kind: 'decal', w: 32, h: 32, glow: 0.7 }, pebbles: { spr: 'pebbles', kind: 'decal', w: 32, h: 32 }, leaf: { spr: 'leaf', kind: 'cross', w: 16, h: 16, sway: 0.04 },
  roots: { spr: 'roots', kind: 'wall', w: 16, h: 32, sway: 0.015 }, clover: { spr: 'clover', kind: 'decal', w: 32, h: 32 }, bells: { spr: 'bells', kind: 'cross', w: 16, h: 16, sway: 0.07, accent: true }, sprig: { spr: 'sprig', kind: 'cross', w: 16, h: 16, sway: 0.05 },
  fungus: { spr: 'fungus', kind: 'cross', w: 16, h: 16 }, crow: { spr: 'crow', kind: 'panel', w: 10, h: 8 }, deadvine: { spr: 'deadvine', kind: 'wall', w: 16, h: 32, sway: 0.025 }, twigs: { spr: 'twigs', kind: 'decal', w: 32, h: 16 },
};

// ------------------------------------------------------------------ foliage skins: cut-out leaf tiles laid over the faces of leaf masses
// Painted pale and tinted per face (lit top, body, dark underside). Holes show the darker block core a block behind, which is
// what makes a crown read as leaves with depth rather than a box; every shape is a whole cluster or strand, never a lone texel.
/** stamp a picture given as rows of palette characters ('.' = hole), wrapping around a w × h tile */
export function stamp(g: CanvasRenderingContext2D, ox: number, oy: number, rows: string[], pal: Record<string, string>, W = 16, H = 16) {
  rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) { const c = pal[r[x]]; if (!c) continue; g.fillStyle = c; g.fillRect((ox + x + W) % W, (oy + y + H) % H, 1, 1); } });
}
const SKIN = { '1': '#e8f0dc', '2': '#ccd9bc', '3': '#acbc9c', '4': '#8c9c7e' };
/** a broadleaf cluster: lit on its upper left, shaded on its lower right, corners cut so clusters leave small holes where they meet */
const LEAF_CLUSTER = ['..1111..', '.111122.', '11122222', '12222222', '22222223', '22222233', '.223333.', '..3333..'];
addCardKind('leafskin', { kind: 'panel', w: 16, h: 16, tile: true }, g => {
  for (const [x, y] of [[0, 0], [8, 0], [4, 8], [12, 8]]) stamp(g, x, y, LEAF_CLUSTER, SKIN);
  // a deeper overlap shadow where each lower row tucks under the one above
  for (const [x, y] of [[2, 7], [10, 7]]) stamp(g, x, y, ['4444'], SKIN);
});
/** pine needles: shingled rows of downward tufts (a lit top, a narrower tip), each row overlapping the tips of the row below */
addCardKind('needleskin', { kind: 'panel', w: 16, h: 16, tile: true }, g => {
  const tuft = ['1111', '2222', '2223', '.33.', '.33.'];
  for (let r = 3; r >= 0; r--) for (let k = 0; k < 4; k++) stamp(g, k * 4 + (r % 2) * 2, r * 4, tuft, SKIN);
});
/** drip fringes under a crown's edge (short, wide lobes: a soft lower edge, never a comb): broadleaf on the top half, needles below */
addCardKind('leafdrip', { kind: 'wall', w: 16, h: 16, tile: true, sway: 0.02 }, g => {
  const lobes = (oy: number, list: Array<[number, number, number]>) => {
    stamp(g, 0, oy, ['2222222222222222', '3333333333333333'], SKIN);
    for (const [x, wd, len] of list) for (let k = 0; k < len; k++) { const last = k === len - 1, row = (last ? '4' : '3').repeat(wd); stamp(g, x, oy + 2 + k, [last && wd >= 4 ? '.' + row.slice(1, -1) + '.' : row], SKIN); }
  };
  lobes(0, [[0, 4, 3], [4, 2, 1], [6, 5, 4], [11, 3, 2], [14, 2, 1]]);
  lobes(8, [[0, 2, 3], [3, 2, 2], [6, 2, 4], [8, 1, 1], [9, 2, 2], [12, 2, 3], [14, 2, 1]]);
});
function cardGeo(d: Def) {
  const own = extra.has(d.spr), [ax, ay, aw, ah] = own ? [0, 0, 128, 128] : SPR[d.spr], u0 = ax / 128, u1 = (ax + aw) / 128, v1 = 1 - ay / 128, v0 = 1 - (ay + ah) / 128, W = d.w * CELL, H = d.h * CELL;
  const plane = () => { const g = new THREE.PlaneGeometry(W, H); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) ? u1 : u0, uv.getY(i) ? v1 : v0); return g; };
  let g: THREE.BufferGeometry;
  if (d.kind === 'cross') { const a = plane(), b = plane(); b.rotateY(Math.PI / 2); a.translate(0, H / 2, 0); b.translate(0, H / 2, 0); g = mergeTwo(a, b); }
  else if (d.kind === 'wall') { g = plane(); g.translate(0, -H / 2, 0); }
  else if (d.kind === 'panel') g = plane();
  else { g = plane(); g.rotateX(-Math.PI / 2); g.translate(0, 0.012, 0); }
  // cards are lit as if they faced the sky (even, like foliage), not by their facing — unless they stand in for a block face
  if (!d.lit) { const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0); }
  return g;
}
function mergeTwo(a: THREE.BufferGeometry, b: THREE.BufferGeometry) {
  const g = new THREE.BufferGeometry(), A = [a, b].map(x => x.toNonIndexed());
  for (const k of ['position', 'normal', 'uv']) { const arrs = A.map(x => x.attributes[k].array as Float32Array), out = new Float32Array(arrs[0].length + arrs[1].length); out.set(arrs[0]); out.set(arrs[1], arrs[0].length); g.setAttribute(k, new THREE.BufferAttribute(out, A[0].attributes[k].itemSize)); }
  return g;
}
const swayU = { uTime: { value: 0 } };
/** a standing card whose base is nearer the camera than [0] m is gone; from [1] m on it is full size */
const NEAR_SINK = [1.6, 3.2];
onUpdate((_dt, rdt) => { swayU.uTime.value += rdt; });
function cardMat(d: Def) {
  const tex = texOf(d), H = d.h * CELL;
  if (d.glow) return new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, color: new THREE.Color(d.glow, d.glow, d.glow), toneMapped: false });
  const m = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide });
  const s = d.sway ?? 0;
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = swayU.uTime;
    // both faces lit as the front one (a flipped normal would make half of every crossed tuft go dark)
    if (!d.lit) sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize( vNormal );');
    // painted accents (petals, berries) take the instance tint; the rest only a little of it
    if (d.accent) sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#if defined( USE_COLOR )
      diffuseColor.rgb *= diffuseColor.a < 0.9 ? vColor : mix(vec3(1.0), vColor, 0.25);
      #endif`);
    // tiled textures: each instance repeats the tile over its own size, from its own offset
    if (d.tile) sh.vertexShader = 'attribute vec4 aUvr;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n vMapUv = vMapUv * aUvr.xy + aUvr.zw;\n#endif');
    // near the lens a standing card sinks into the ground (user 11-14: in the warrior's low class-select shot the reeds in front of the
    // camera became huge flat panels over the hero). A smooth shrink by the instance's view depth: no pop, no dither speckle.
    if (d.kind !== 'decal') sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
      transformed *= smoothstep(${NEAR_SINK[0].toFixed(2)}, ${NEAR_SINK[1].toFixed(2)}, -(modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).z);
      #endif`);
    if (s) sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
      vec3 ip = instanceMatrix[3].xyz;
      #else
      vec3 ip = vec3(0.0);
      #endif
      float hk = ${d.kind === 'wall' ? `clamp(-position.y / ${H.toFixed(3)}, 0.0, 1.0)` : `clamp(position.y / ${H.toFixed(3)}, 0.0, 1.0)`};
      hk *= hk;
      transformed.x += sin(uTime * 1.6 + ip.x * 0.8 + ip.z * 0.6) * ${s.toFixed(3)} * hk;
      transformed.z += cos(uTime * 1.3 + ip.x * 0.5 - ip.z * 0.7) * ${(s * 0.6).toFixed(3)} * hk;`);
  };
  m.customProgramCacheKey = () => 'card' + (d.kind !== 'decal' ? 'N' : '') + d.kind + s + H + (d.lit ? 'L' : '') + (d.accent ? 'A' : '') + (d.tile ? 'T' : '');
  return m;
}

/** collects card instances for one stage and turns them into one instanced mesh per kind */
export class Cards {
  private items = new Map<string, Array<{ p: THREE.Vector3; ry: number; s: number; tint: THREE.Color; rx?: number; sx?: number; sy?: number; uv?: [number, number, number, number] }>>();
  /** sx / sy stretch the card along its own width / height on top of s; uv = [repeat u, repeat v, offset u, offset v] (tile kinds) */
  add(kind: string, x: number, z: number, o: { y?: number; ry?: number; s?: number; tint?: number; rx?: number; sx?: number; sy?: number; uv?: [number, number, number, number] } = {}) {
    if (!this.items.has(kind)) this.items.set(kind, []);
    this.items.get(kind)!.push({ p: V3(x, o.y ?? 0, z), ry: o.ry ?? hash(x * 13, z * 7) * Math.PI, s: o.s ?? 1, tint: new THREE.Color(o.tint ?? 0xffffff), rx: o.rx, sx: o.sx, sy: o.sy, uv: o.uv });
  }
  /** how many cards of a kind are queued */
  count(kind: string) { return this.items.get(kind)?.length ?? 0; }
  /** scatter n cards in clusters over a rectangle, avoiding the battle floor */
  scatter(kind: string, n: number, area: { x0: number; z0: number; x1: number; z1: number }, o: { cluster?: number; spread?: number; s?: [number, number]; tints?: number[]; seed?: number; allowPlay?: number } = {}) {
    const cl = o.cluster ?? 4, sp = o.spread ?? 0.6, sd = o.seed ?? 1; let placed = 0, tries = 0;
    while (placed < n && tries < n * 30) {
      tries++;
      const cx = area.x0 + hash(tries, sd, 1) * (area.x1 - area.x0), cz = area.z0 + hash(tries, sd, 2) * (area.z1 - area.z0);
      if (inPlay(cx, cz) && hash(tries, sd, 9) > (o.allowPlay ?? 0)) continue;
      for (let k = 0; k < cl && placed < n; k++) {
        const x = cx + (hash(tries, k, sd + 3) - 0.5) * sp * 2, z = cz + (hash(tries, k, sd + 4) - 0.5) * sp * 2;
        if (inPlay(x, z) && hash(tries, k, 11) > (o.allowPlay ?? 0)) continue;
        const s = o.s ? o.s[0] + hash(tries, k, 5) * (o.s[1] - o.s[0]) : 0.8 + hash(tries, k, 5) * 0.5;
        this.add(kind, x, z, { s, tint: o.tints ? o.tints[Math.floor(hash(tries, k, 6) * o.tints.length)] : undefined }); placed++;
      }
    }
  }
  build(root: THREE.Object3D) {
    if (__DEBUG_UI__ && typeof window !== "undefined") try { (window as any).__cards = Object.fromEntries([...this.items].map(([k, v]) => [k, v.length])); (window as any).__cardsAt = (k: string) => (this.items.get(k) ?? []).map(i => [+i.p.x.toFixed(2), +i.p.y.toFixed(2), +i.p.z.toFixed(2), +i.s.toFixed(2), +i.ry.toFixed(2)]); } catch { /* read-only window */ }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    for (const [kind, list] of this.items) {
      const d = CARD[kind]; if (!d || !list.length) continue;
      const geo = cardGeo(d), uvr = d.tile ? new Float32Array(list.length * 4) : null;
      const mesh = new THREE.InstancedMesh(geo, cardMat(d), list.length);
      list.forEach((it, i) => {
        e.set(it.rx ?? 0, it.ry, 0); q.setFromEuler(e); m4.compose(it.p, q, V3(it.s * (it.sx ?? 1), it.s * (it.sy ?? 1), it.s)); mesh.setMatrixAt(i, m4); mesh.setColorAt(i, it.tint);
        if (uvr) uvr.set(it.uv ?? [it.sx ?? 1, it.sy ?? 1, 0, 0], i * 4);
      });
      if (uvr) geo.setAttribute('aUvr', new THREE.InstancedBufferAttribute(uvr, 4));
      mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = false; mesh.receiveShadow = d.kind === 'cross' || !!d.lit; mesh.frustumCulled = false; mesh.renderOrder = d.kind === 'decal' ? 1 : 0; root.add(mesh);
    }
  }
}

// ------------------------------------------------------------------ atmosphere: drifting particles and light shafts
export type Ambient = { kind: 'fireflies' | 'leaves' | 'spores' | 'dust' | 'embers' | 'rain' | 'storm' | 'snow' | 'petals'; color: number; rate: number; area?: { x0: number; z0: number; x1: number; z1: number }; y?: [number, number]; follow?: boolean };
const _camDir = new THREE.Vector3();
const _ambBox = { x0: -12, z0: -12, x1: 12, z1: 10 };
const _ambPos = new THREE.Vector3();
const _ambVel = new THREE.Vector3();
const _ambCol = new THREE.Color();
const _defaultArea = { x0: -12, z0: -12, x1: 12, z1: 10 };
function weatherScale() {
  return QUALITY.tier === 'high' ? 1 : QUALITY.tier === 'mid' ? 0.68 : 0.45;
}
function weatherBox(a: Ambient): { x0: number; z0: number; x1: number; z1: number } {
  if (a.follow !== false && (a.kind === 'rain' || a.kind === 'storm' || a.kind === 'snow')) {
    camera.getWorldDirection(_camDir);
    if (_camDir.y < -0.12 && camera.position.y > 2) {
      const t = Math.min(48, -camera.position.y / _camDir.y);
      const fx = Math.max(-36, Math.min(36, camera.position.x + _camDir.x * t));
      const fz = Math.max(-36, Math.min(36, camera.position.z + _camDir.z * t));
      _ambBox.x0 = fx - 10.6; _ambBox.z0 = fz - 8.6;
      _ambBox.x1 = fx + 10.6; _ambBox.z1 = fz + 7.8;
      return _ambBox;
    }
  }
  return a.area ?? _defaultArea;
}
function emitWeatherOne(a: Ambient, ar: { x0: number; z0: number; x1: number; z1: number }, prewarm = false) {
  if (a.kind === 'rain' || a.kind === 'storm') {
    const storm = a.kind === 'storm';
    const x = R(ar.x0, ar.x1), z = R(ar.z0, ar.z1);
    const y = prewarm ? R(0.6, 8.2) : R(5.4, 8.6);
    VOXEL_WEATHER.emitRain(x, y, z, a.color, storm, prewarm);
    if (prewarm && Math.random() < (storm ? 0.20 : 0.15)) {
      VOXEL_WEATHER.emitSplash(R(ar.x0, ar.x1), R(ar.z0, ar.z1), a.color, storm);
    }
    return true;
  }
  if (a.kind === 'snow') {
    const x = R(ar.x0, ar.x1), z = R(ar.z0, ar.z1);
    const y = prewarm ? R(0.4, 7.6) : R(4.8, 8.2);
    VOXEL_WEATHER.emitSnow(x, y, z, a.color, prewarm);
    return true;
  }
  return false;
}
/** act-175: seed pure 3D voxel weather across the visible viewport on room entry (quality-scaled, zero alloc) */
export function prewarmAmbient(list: Ambient[]) {
  if (PALPHA?.mesh && !PALPHA.mesh.visible) return;
  const qk = weatherScale();
  for (const a of list) {
    if (a.kind !== 'rain' && a.kind !== 'storm' && a.kind !== 'snow') continue;
    const ar = weatherBox(a);
    const base = a.kind === 'snow' ? Math.min(150, Math.round(a.rate * 2.1)) : Math.min(82, Math.round(a.rate * 0.45));
    const count = Math.max(8, Math.round(base * qk));
    for (let i = 0; i < count; i++) emitWeatherOne(a, ar, true);
  }
}
export function ambientTick(list: Ambient[], dt: number) {
  const stepDt = Math.min(0.05, Math.max(0, dt));
  if (stepDt <= 0) return;
  const hideWeather = !!(PALPHA?.mesh && !PALPHA.mesh.visible);
  const qk = weatherScale();
  for (const a of list) {
    const isWeather = a.kind === 'rain' || a.kind === 'storm' || a.kind === 'snow';
    if (isWeather && hideWeather) continue;
    const ar = weatherBox(a), exact = a.rate * (isWeather ? qk : 1) * stepDt, n = Math.floor(exact) + (Math.random() < exact % 1 ? 1 : 0);
    if (!n) continue;
    if (isWeather) {
      for (let i = 0; i < n; i++) emitWeatherOne(a, ar, false);
      continue;
    }
    _ambCol.setHex(a.color);
    const y0 = a.y ? a.y[0] : 0.3, y1 = a.y ? a.y[1] : 2.4;
    for (let i = 0; i < n; i++) {
      const p = _ambPos.set(R(ar.x0, ar.x1), R(y0, y1), R(ar.z0, ar.z1));
      if (a.kind === 'fireflies') PADD.emit({ p, v: _ambVel.set(R(-0.25, 0.25), R(-0.1, 0.2), R(-0.25, 0.25)), s0: 0.14, s1: 0.1, life: R(2.5, 4.5), c0: _ambCol, bright: 4, tile: TILE.glow, fadeIn: 0.5 });
      else if (a.kind === 'leaves') PALPHA.emit({ p: p.setY(R(3.5, 6)), v: _ambVel.set(R(0.2, 0.6), R(-0.55, -0.35), R(-0.2, 0.2)), s0: 0.09, s1: 0.09, life: R(6, 10), c0: _ambCol, alpha: 0.95, tile: TILE.pixel, spin: R(-3, 3), fadeIn: 0.3 });
      else if (a.kind === 'spores') PADD.emit({ p, v: _ambVel.set(R(-0.06, 0.06), R(0.08, 0.25), R(-0.06, 0.06)), s0: 0.05, s1: 0.03, life: R(4, 7), c0: _ambCol, bright: 1.8, tile: TILE.pixel, fadeIn: 0.6 });
      else if (a.kind === 'petals') PALPHA.emit({ p: p.setY(R(3, 6)), v: _ambVel.set(R(0.4, 0.9), R(-0.45, -0.25), R(-0.25, 0.25)), s0: 0.07, s1: 0.07, life: R(7, 11), c0: _ambCol, alpha: 0.95, tile: TILE.pixel, spin: R(-4, 4), fadeIn: 0.3 });
      else if (a.kind === 'dust') PALPHA.emit({ p, v: _ambVel.set(R(-0.05, 0.05), R(-0.02, 0.05), R(-0.05, 0.05)), s0: 0.035, s1: 0.035, life: R(5, 8), c0: _ambCol, alpha: 0.5, tile: TILE.pixel, fadeIn: 0.8 });
      else PADD.emit({ p, v: _ambVel.set(R(-0.25, 0.35), R(0.45, 1.05), R(-0.18, 0.18)), s0: 0.055, s1: 0.02, life: R(1.8, 3.6), c0: _ambCol, bright: 2.8, tile: TILE.pixel });
    }
  }
}
let shaftTex: THREE.Texture | null = null;
/** a soft additive beam from above (moonlight through trees, light through a window) */
export function shaft(root: THREE.Object3D, x: number, z: number, o: { w?: number; h?: number; color?: number; tilt?: number; yaw?: number; a?: number } = {}) {
  shaftTex ??= canvasTex(16, 64, g => { const gr = g.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 16, 64); const gx = g.createLinearGradient(0, 0, 16, 0); gx.addColorStop(0, 'rgba(0,0,0,1)'); gx.addColorStop(0.5, 'rgba(0,0,0,0)'); gx.addColorStop(1, 'rgba(0,0,0,1)'); g.globalCompositeOperation = 'destination-out'; g.fillStyle = gx; g.fillRect(0, 0, 16, 64); });
  const m = new THREE.MeshBasicMaterial({ map: shaftTex, color: new THREE.Color(o.color ?? 0xb8c8ff), transparent: true, opacity: o.a ?? 0.24, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false });
  const H = o.h ?? 8, mesh = new THREE.Mesh(new THREE.PlaneGeometry(o.w ?? 1.6, H), m);
  mesh.position.set(x, H * 0.45, z); mesh.rotation.set(0, o.yaw ?? 0.5, o.tilt ?? 0.32); mesh.renderOrder = 5; root.add(mesh);
  const base = m.opacity, ph = Math.random() * 6;
  onUpdate(() => { m.opacity = base * (0.8 + 0.2 * Math.sin(clock.rtime * 0.6 + ph)); });
  return mesh;
}
