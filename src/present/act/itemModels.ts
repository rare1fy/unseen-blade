// act-41 (用户：「所有道具我要求都是真实的模型，不要用立体简笔画糊弄我」): the things on the cards and the buttons as real voxel
// models — a ring-pommel sabre with its wrapped grip and guard, a willow-leaf dart with its tassel, a cloth boot, a straw sandal, a
// flatbread, a coin purse, a clay wine jar, bamboo slips, an anvil with a red-hot blank, a dart case, a medicine bowl, a gourd, a
// needle roll, lamellar plates, a broken bone, a cut turban, a bronze cup… — each built cell by cell in the UI's toon look (front
// = +z toward the camera, y up), big flat masses, two or three tones a material, no stair-step diagonals. Shared through
// customIcon3D (built once per key, then instanced).
import { customIcon3D, type Model3D } from '../ui3d/models3d';
import type { Set3 } from '../ui3d/models3dArt';

const C = {
  STEEL: 0xa8b2bc, STEEL_L: 0xe2e8ee, STEEL_D: 0x6e7884, IRON: 0x3a3d45, IRON_L: 0x5a5e68, IRON_D: 0x24262c,
  BRONZE: 0xb08040, BRONZE_L: 0xd8a858, BRONZE_D: 0x7a5428, RED: 0xa83228, RED_D: 0x7a2018, RED_L: 0xc8483a,
  WOOD: 0x7a5232, WOOD_L: 0x9a6c44, WOOD_D: 0x553820, CLAY: 0x9a5a32, CLAY_L: 0xb87244, CLAY_D: 0x6e3c1e,
  CLOTH: 0x2c2e3a, CLOTH_L: 0x44485c, SOLE: 0xd8ccb0, STRAW: 0xc8a860, STRAW_D: 0x9e8040, STRAW_L: 0xe0c47c,
  BREAD: 0xc88a40, BREAD_L: 0xe2aa5a, BREAD_D: 0x9a6428, MEAT: 0x7a3020, MEAT_L: 0x9a4430, SESAME: 0xf4e6bc,
  BAM: 0xc4a058, BAM_D: 0xa8873e, BAM_E: 0xdcc282, CORD: 0x34261a, CHAR: 0x3a2a1e,
  BONE: 0xeae2ce, BONE_D: 0xb8ae98, YELLOW: 0xe0b030, YELLOW_D: 0xb08020, YELLOW_L: 0xf4d060,
  BLOOD: 0x8e1812, BLOOD_L: 0xc02a20, HOT: 0xff8a30, HOT_L: 0xffd070, STEAM: 0xe4e8ee, MED: 0x3a2214, MED_L: 0x5a3420,
  LACQ: 0x2a1a1a, LACQ_L: 0x4a2a24, LINEN: 0xd8cdb4, LINEN_D: 0xb4a888, GOLD: 0xe0b848,
};
type Art = (set: Set3) => void;
const box = (set: Set3, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: number | null, g = 0) => {
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) set(x, y, z, c, g);
};

// ---------------------------------------------------------------- the pieces (each a function of an offset, so they combine)
/** the ring-pommel sabre, upright, point up: blade (a steel back, a bright edge that glows a little), guard, red-bound grip, ring */
function sabre(set: Set3, ox = 0, oy = 0, len = 16) {
  box(set, ox, oy, 0, ox, oy + len, 0, C.STEEL); box(set, ox + 1, oy, 0, ox + 1, oy + len - 1, 0, C.STEEL_L, 0.25);
  box(set, ox, oy, -1, ox + 1, oy + len - 2, -1, C.STEEL_D); set(ox, oy + len + 1, 0, C.STEEL_L, 0.25);
  box(set, ox - 2, oy - 2, -2, ox + 3, oy - 1, 1, C.IRON); box(set, ox - 2, oy - 1, 1, ox + 3, oy - 1, 1, C.IRON_L);
  box(set, ox, oy - 8, -1, ox + 1, oy - 3, 0, C.RED); for (let y = oy - 7; y <= oy - 3; y += 2) box(set, ox, y, -1, ox + 1, y, 0, C.RED_D);
  box(set, ox - 1, oy - 13, -1, ox + 2, oy - 9, 0, C.BRONZE); box(set, ox, oy - 12, -1, ox + 1, oy - 10, 0, null); box(set, ox - 1, oy - 9, 0, ox + 2, oy - 9, 0, C.BRONZE_L);
}
/** a willow-leaf dart, point up: a narrow tip, the leaf, the waist, a small ring and two red tassel strands */
function dart(set: Set3, ox = 0, oy = 0) {
  box(set, ox, oy + 9, 0, ox, oy + 10, 0, C.STEEL_L, 0.2);
  box(set, ox - 1, oy + 3, 0, ox + 1, oy + 8, 0, C.STEEL); box(set, ox, oy + 3, 0, ox, oy + 8, 1, C.STEEL_L, 0.2); box(set, ox - 1, oy + 3, -1, ox + 1, oy + 7, -1, C.STEEL_D);
  box(set, ox, oy + 1, 0, ox, oy + 2, 0, C.STEEL_D);
  box(set, ox - 1, oy - 1, 0, ox + 1, oy, 0, C.BRONZE); set(ox, oy - 1, 0, null); set(ox, oy - 1, 1, C.BRONZE_L);
  box(set, ox - 1, oy - 6, 0, ox - 1, oy - 2, 0, C.RED); box(set, ox + 1, oy - 5, 0, ox + 1, oy - 2, 0, C.RED_D);
}
/** a cloth boot, side on, toe to the right: a light layered sole, the foot, the shaft with a wrapped band */
function boot(set: Set3, ox = 0, oy = 0) {
  box(set, ox - 5, oy, -2, ox + 5, oy, 2, C.SOLE); box(set, ox - 5, oy + 1, -2, ox + 5, oy + 1, 2, C.CHAR);
  box(set, ox - 5, oy + 2, -2, ox + 4, oy + 4, 2, C.CLOTH); box(set, ox + 5, oy + 2, -2, ox + 5, oy + 3, 2, C.CLOTH);
  box(set, ox - 5, oy + 5, -2, ox - 1, oy + 12, 2, C.CLOTH); box(set, ox - 5, oy + 12, -2, ox - 1, oy + 12, 2, C.CLOTH_L);
  box(set, ox - 5, oy + 8, -2, ox - 1, oy + 9, 2, C.LINEN); box(set, ox - 5, oy + 8, 2, ox - 1, oy + 8, 2, C.LINEN_D);
  box(set, ox - 4, oy + 2, 2, ox + 4, oy + 2, 2, C.CLOTH_L);
}
/** a straw sandal, side on: the woven sole (light and dark rows), the toe cord and two loops of cord over the instep */
function sandal(set: Set3, ox = 0, oy = 0) {
  // a straw sandal seen from above, its sole to the camera: the woven pad (light and dark rows, the heel and toe a cell narrower),
  // two cord loops across the instep, the toe cord, the heel cord
  for (let y = oy - 8; y <= oy + 8; y++) { const w = Math.abs(y - oy) >= 7 ? 2 : 3; box(set, ox - w, y, 0, ox + w - 1, y, 1, (y - oy) % 2 ? C.STRAW : C.STRAW_D); }
  box(set, ox - 3, oy - 6, 1, ox + 2, oy + 6, 1, C.STRAW_L); for (let y = oy - 6; y <= oy + 6; y += 2) box(set, ox - 3, y, 1, ox + 2, y, 1, C.STRAW);
  for (const y of [oy - 1, oy + 3]) { box(set, ox - 4, y, 2, ox + 3, y, 2, C.STRAW_D); set(ox - 4, y, 1, C.STRAW_D); set(ox + 3, y, 1, C.STRAW_D); }
  box(set, ox - 1, oy + 7, 2, ox, oy + 9, 2, C.RED); box(set, ox - 2, oy - 8, 2, ox + 1, oy - 8, 2, C.STRAW_D);
}
/** a round flatbread standing on edge (front face to the camera): stepped round outline, a lighter rim, sesame, two strips of meat */
function cake(set: Set3, ox = 0, oy = 0) {
  const R = [3, 5, 6, 6, 6, 6, 6, 6, 5, 3];
  R.forEach((w, i) => { const y = oy + i - 5; box(set, ox - w, y, -1, ox + w - 1, y, 1, C.BREAD); box(set, ox - w, y, 1, ox + w - 1, y, 1, C.BREAD_L); box(set, ox - w, y, -1, ox - w, y, 1, C.BREAD_D); box(set, ox + w - 1, y, -1, ox + w - 1, y, 1, C.BREAD_D); });
  box(set, ox - 6, oy - 5, -1, ox + 5, oy - 5, 1, C.BREAD_D);
  for (const [x, y] of [[-4, 2], [-1, 3], [2, 2], [-3, -3], [1, -2], [4, -1], [-5, 0]]) set(ox + x, oy + y, 2, C.SESAME);
  box(set, ox - 3, oy - 1, 2, ox + 2, oy, 2, C.MEAT); box(set, ox - 3, oy, 2, ox + 2, oy, 2, C.MEAT_L); box(set, ox - 2, oy + 1, 3, ox + 1, oy + 1, 3, C.MEAT);
}
/** a square-holed bronze coin (五铢) facing the camera */
function coin(set: Set3, ox: number, oy: number, oz: number) {
  box(set, ox - 1, oy - 1, oz, ox + 1, oy + 1, oz, C.BRONZE); set(ox, oy, oz, null); set(ox - 1, oy + 1, oz, C.BRONZE_L);
}
/** a cloth purse: the round body, a cinched neck tied in red, the frilled mouth; two coins spilled at its foot */
function purse(set: Set3, ox = 0, oy = 0) {
  // a brown cloth pouch: a round belly (three widths, no long diagonals), the neck cinched with a red cord, the frilled mouth
  const BR = 0x8a6440, BR_L = 0xa87e54, BR_D = 0x664628;
  for (const [y0, y1, w] of [[0, 0, 3], [1, 2, 5], [3, 6, 6], [7, 7, 5]] as const) { box(set, ox - w, oy + y0, -w + 2, ox + w - 1, oy + y1, w - 2, BR); box(set, ox - w, oy + y0, w - 2, ox + w - 1, oy + y1, w - 2, BR_L); }
  box(set, ox - 6, oy + 3, -4, ox - 6, oy + 6, 4, BR_D); box(set, ox - 3, oy, -1, ox + 2, oy, 1, BR_D);
  box(set, ox - 2, oy + 8, -1, ox + 1, oy + 8, 1, C.RED); box(set, ox - 2, oy + 8, 2, ox - 1, oy + 8, 2, C.RED_L); box(set, ox + 2, oy + 5, 2, ox + 2, oy + 8, 2, C.RED_D);
  box(set, ox - 3, oy + 9, -2, ox + 2, oy + 10, 2, BR); box(set, ox - 3, oy + 10, -2, ox + 2, oy + 10, 2, BR_L); for (const x of [ox - 3, ox - 1, ox + 1]) set(x, oy + 11, 0, BR_L);
  coin(set, ox + 6, oy + 1, 3); coin(set, ox - 7, oy + 1, 2);
}
/** a clay wine jar: the round belly, shoulder, neck, a red cloth stopper tied with cord, a red paper label */
function wineJar(set: Set3, ox = 0, oy = 0) {
  const R = [3, 4, 5, 5, 5, 5, 5, 4, 3];
  R.forEach((w, i) => { const y = oy + i; box(set, ox - w, y, -w + 1, ox + w - 1, y, w - 1, C.CLAY); box(set, ox - w, y, w - 1, ox + w - 1, y, w - 1, C.CLAY_L); });
  box(set, ox - 5, oy, -3, ox + 4, oy, 3, C.CLAY_D);
  box(set, ox - 2, oy + 9, -1, ox + 1, oy + 10, 1, C.CLAY); box(set, ox - 3, oy + 11, -2, ox + 2, oy + 12, 2, C.RED); box(set, ox - 3, oy + 13, -1, ox + 2, oy + 13, 1, C.RED_L);
  box(set, ox - 3, oy + 11, 3, ox + 2, oy + 11, 3, C.CORD); box(set, ox - 2, oy + 2, 5, ox + 1, oy + 6, 5, C.RED); box(set, ox - 1, oy + 3, 5, ox, oy + 5, 5, C.RED_D);
}
/** a roll of bamboo slips lying along x on two cords, a red tag; (stand = a little wooden cradle under it) */
function slips(set: Set3, ox = 0, oy = 0, stand = false) {
  if (stand) for (const x of [ox - 4, ox + 3]) box(set, x, oy - 2, -2, x + 1, oy - 1, 1, C.WOOD);
  box(set, ox - 6, oy, -2, ox + 5, oy + 4, 1, C.BAM); for (let y = oy; y <= oy + 4; y += 2) box(set, ox - 6, y, 1, ox + 5, y, 1, C.BAM_D);
  box(set, ox - 6, oy + 5, -1, ox + 5, oy + 5, 0, C.BAM);
  for (const x of [ox - 6, ox + 5]) { box(set, x, oy, -2, x, oy + 4, 1, C.BAM_E); box(set, x, oy + 1, -1, x, oy + 3, 0, C.BAM_D); }
  for (const x of [ox - 3, ox + 2]) box(set, x, oy, -2, x, oy + 5, 2, C.CORD);
  box(set, ox - 3, oy - 3, 2, ox - 3, oy - 1, 2, C.RED);
}
/** an open bamboo book standing (the slips upright, side by side, two cords across), one corner burnt */
function book(set: Set3, ox = 0, oy = 0) {
  for (let x = ox - 7; x <= ox + 6; x++) box(set, x, oy - 6, 0, x, oy + 6, 0, (x - ox) % 2 ? C.BAM : C.BAM_E);
  for (const y of [oy - 3, oy + 3]) box(set, ox - 8, y, 1, ox + 7, y, 1, C.CORD);
  box(set, ox + 4, oy + 4, 0, ox + 6, oy + 6, 0, C.CHAR); set(ox + 3, oy + 6, 0, C.CHAR);
  for (const [x, y] of [[-5, 1], [-5, -1], [-3, 2], [-3, 0], [-3, -2], [-1, 1], [-1, -1], [1, 2], [1, 0]]) set(ox + x, oy + y, 1, C.CORD);
}

// ---------------------------------------------------------------- the models
const ART: Record<string, Art> = {
  sabre: set => sabre(set),
  dart: set => dart(set),
  boot: set => boot(set),
  sandal: set => sandal(set),
  cake: set => cake(set),
  purse: set => purse(set),
  wine: set => wineJar(set),
  scroll: set => slips(set, 0, 0, true),
  book: set => book(set),
  // 离开: a road sign on its post, the board's end cut to a point
  signpost: set => {
    box(set, -1, -12, -1, 0, 6, 0, C.WOOD_D); box(set, -7, 0, 1, 6, 4, 1, C.WOOD); box(set, 7, 1, 1, 7, 3, 1, C.WOOD); set(8, 2, 1, C.WOOD);
    box(set, -7, 4, 1, 6, 4, 1, C.WOOD_L); box(set, -5, 2, 2, 3, 2, 2, C.WOOD_D);
  },
  // 刀身: the anvil, a red-hot blank lying across it
  anvil: set => {
    box(set, -6, 0, -3, 5, 3, 2, C.IRON); box(set, -6, 3, -3, 5, 3, 2, C.IRON_L); box(set, 6, 1, -2, 8, 3, 1, C.IRON); box(set, -3, -6, -2, 2, -1, 1, C.IRON_D); box(set, -5, -7, -3, 4, -7, 2, C.IRON);
    box(set, -8, 4, -1, 7, 4, 0, C.HOT, 0.8); box(set, -8, 5, -1, 6, 5, 0, C.HOT_L, 1); box(set, -11, 4, -1, -9, 5, 0, C.IRON_L);
  },
  // 镖匣: a wooden case, its lid up behind, three dart heads standing in it
  dartCase: set => {
    box(set, -6, 0, -2, 5, 4, 2, C.WOOD); box(set, -6, 4, -2, 5, 4, 2, C.WOOD_L); box(set, -6, 0, 2, 5, 0, 2, C.WOOD_D); box(set, -1, 2, 3, 0, 3, 3, C.BRONZE);
    box(set, -6, 5, -3, 5, 12, -3, C.WOOD_D); box(set, -6, 12, -3, 5, 12, -3, C.WOOD);
    for (const x of [-4, 0, 4]) { box(set, x - 1, 5, 0, x + 1, 8, 0, C.STEEL); box(set, x, 5, 1, x, 8, 1, C.STEEL_L, 0.2); box(set, x, 9, 0, x, 10, 0, C.STEEL_L, 0.2); }
  },
  // 筋骨: a clay bowl of dark medicine, steam rising
  medBowl: set => {
    box(set, -5, 0, -2, 4, 0, 1, C.CLAY_D); box(set, -6, 1, -3, 5, 3, 2, C.CLAY); box(set, -7, 4, -4, 6, 4, 3, C.CLAY_L); box(set, -6, 4, -3, 5, 4, 2, C.MED);
    box(set, -5, 4, -2, 4, 4, 1, C.MED_L); box(set, -6, 1, 2, 5, 3, 2, C.CLAY_L);
    for (const [x, y0, y1] of [[-3, 6, 10], [0, 7, 13], [3, 6, 9]]) box(set, x, y0, 0, x, y1, 0, C.STEAM, 0.35);
    box(set, -2, 11, 0, -2, 12, 0, C.STEAM, 0.35); box(set, 1, 13, 0, 1, 14, 0, C.STEAM, 0.35);
  },
  // 闭息: a medicine gourd, corded at the waist, a cork
  gourd: set => {
    box(set, -4, 0, -3, 3, 6, 2, C.CLAY); box(set, -4, 0, -3, 3, 0, 2, C.CLAY_D); box(set, -4, 6, -3, 3, 6, 2, C.CLAY_L); box(set, -4, 1, 2, 3, 5, 2, C.CLAY_L);
    box(set, -2, 7, -1, 1, 7, 1, C.RED); box(set, -3, 8, -2, 2, 12, 1, C.CLAY); box(set, -3, 12, -2, 2, 12, 1, C.CLAY_L);
    box(set, -1, 13, -1, 0, 15, 0, C.WOOD_L); box(set, -1, 2, 3, 0, 4, 3, C.RED); set(-1, 3, 3, C.CHAR);
  },
  // 杀气 / 出鞘: the lacquered scabbard upright, the blade half out of its mouth
  drawn: set => {
    box(set, -1, -14, -1, 2, -1, 1, C.LACQ); box(set, -1, -14, 1, 2, -1, 1, C.LACQ_L); box(set, -1, -2, -1, 2, -1, 1, C.BRONZE); box(set, -1, -14, -1, 2, -13, 1, C.BRONZE);
    sabre(set, 0, 4, 9);
  },
  // 听宫: a linen needle roll laid open, five needles with gold heads
  needles: set => {
    box(set, -8, -6, -1, 7, 6, -1, C.LINEN); box(set, -8, -6, -1, 7, -6, -1, C.LINEN_D); box(set, 8, -6, -1, 9, 6, 0, C.LINEN_D);
    for (let x = -6; x <= 6; x += 3) { box(set, x, -4, 0, x, 4, 0, C.STEEL_L, 0.15); box(set, x, 5, 0, x, 5, 1, C.GOLD); box(set, x - 1, -1, 0, x + 1, -1, 0, C.LINEN_D); }
    box(set, -8, -2, 0, 7, -2, 0, C.RED_D);
  },
  // ---------------------------------------------------------------- the blade boons
  quick: set => { sabre(set, 0, 0, 16); for (const [x, y0, y1] of [[-4, 2, 12], [-6, 5, 10], [4, 0, 8]]) box(set, x, y0, -1, x, y1, -1, C.STEEL_L, 0.5); },
  extra: set => { sabre(set, -3, 0, 15); sabre(set, 3, -2, 15); },
  sunder: set => {
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { const x = -8 + c * 4, y = -8 + r * 4; box(set, x, y, 0, x + 2, y + 3, 1, C.IRON); box(set, x, y + 3, 1, x + 2, y + 3, 1, C.IRON_L); box(set, x + 3, y + 1, 0, x + 3, y + 2, 0, C.RED); }
    for (const [x, y] of [[0, 8], [0, 7], [1, 6], [1, 5], [1, 4], [0, 3], [0, 2], [-1, 1], [-1, 0], [0, -1], [0, -2], [1, -3]]) box(set, x, y - 1, 0, x, y - 1, 2, null);
  },
  bone: set => {
    box(set, -9, -1, -1, -2, 1, 1, C.BONE); box(set, 1, -1, -1, 8, 1, 1, C.BONE); box(set, -9, -1, 1, -2, 1, 1, C.BONE);
    for (const x of [-11, 9]) { box(set, x, -3, -2, x + 2, -1, 2, C.BONE); box(set, x, 1, -2, x + 2, 3, 2, C.BONE); box(set, x, -3, -2, x + 2, -3, 2, C.BONE_D); }
    box(set, -2, 1, -1, -1, 2, 1, C.BONE); box(set, 1, -2, -1, 2, -1, 1, C.BONE); box(set, -9, -1, -1, 8, -1, -1, C.BONE_D); set(0, 0, 1, C.BLOOD);
  },
  behead: set => {
    box(set, -8, -2, -2, 7, 1, 2, C.YELLOW); box(set, -8, 1, 2, 7, 1, 2, C.YELLOW_L); box(set, -8, -2, -2, 7, -2, 2, C.YELLOW_D);
    box(set, 8, -6, 0, 9, 0, 0, C.YELLOW); box(set, 10, -8, 0, 10, -4, 0, C.YELLOW_D); box(set, -10, -1, -1, -9, 0, 1, C.YELLOW_D);
    box(set, -1, -2, 3, 0, 1, 3, C.BLOOD); set(0, -4, 3, C.BLOOD_L); set(-1, -6, 3, C.BLOOD);
  },
  bleed: set => { sabre(set, 0, 0, 14); box(set, 0, 10, 1, 1, 15, 1, C.BLOOD); for (const [x, y] of [[3, 6], [4, 3], [3, 0], [5, -2]]) box(set, x, y, 0, x, y + 1, 1, C.BLOOD_L); },
  drink: set => {
    box(set, -4, 0, -3, 3, 6, 2, C.BRONZE); box(set, -4, 6, -3, 3, 6, 2, C.BRONZE_L); box(set, -3, 6, -2, 2, 6, 1, C.BLOOD); box(set, -2, 6, -1, 1, 6, 0, C.BLOOD_L);
    box(set, 4, 4, -1, 7, 5, 0, C.BRONZE); box(set, -6, 3, -1, -5, 5, 0, C.BRONZE_D);
    for (const x of [-4, 3]) box(set, x, -5, 0, x, -1, 0, C.BRONZE_D); box(set, -1, -5, -3, -1, -1, -3, C.BRONZE_D);
    box(set, -4, 1, 2, 3, 1, 2, C.BRONZE_D); box(set, -4, 4, 2, 3, 4, 2, C.BRONZE_D);
  },
  frenzy: set => {
    box(set, -6, -1, -3, 5, 1, 3, C.RED); box(set, -6, 1, 3, 5, 1, 3, C.RED_L); box(set, -5, -1, -2, 4, 1, 2, null);
    box(set, 6, -2, 0, 7, 2, 0, C.RED_D); box(set, 8, -9, 0, 8, -2, 0, C.RED); box(set, 10, -11, 0, 10, -3, 0, C.RED_D); box(set, 9, -3, 0, 9, -2, 0, C.RED);
    set(-2, 1, 4, C.BLOOD); set(1, -1, 4, C.BLOOD);
  },
  draw: set => ART.drawn(set),
  counter: set => {
    sabre(set, 0, -4, 16);
    box(set, -11, 6, -2, 10, 6, -2, C.WOOD); box(set, -11, 6, -1, 10, 6, -1, C.WOOD_D); box(set, 11, 5, -2, 13, 7, -2, C.STEEL); set(14, 6, -2, C.STEEL_L);
    set(1, 7, 1, C.HOT_L, 1); set(2, 6, 1, C.HOT_L, 1);
  },
  evade: set => { boot(set); for (const [x, y0, y1] of [[-8, 4, 10], [-10, 6, 9]]) box(set, x, y0, 0, x, y1, 0, C.STEAM, 0.4); },
  darts3: set => { dart(set, -5, -2); dart(set, 0, 1); dart(set, 5, -2); },
  bladeWind: set => {
    // the sabre and the thin bright slash it throws: a long blade of light across, thick in the middle, tapering in two steps
    sabre(set, -9, -6, 16);
    box(set, -5, 4, 0, 14, 5, 0, C.STEEL_L, 1); box(set, -3, 6, 0, 10, 6, 0, C.STEEL_L, 0.8); box(set, -3, 3, 0, 10, 3, 0, C.STEEL_L, 0.8);
    box(set, 15, 4, 0, 17, 5, 0, C.STEEL_L, 0.6); box(set, 1, 7, 0, 6, 7, 0, C.STEEL_L, 0.5); box(set, 1, 2, 0, 6, 2, 0, C.STEEL_L, 0.5);
  },
};
/** a real model for an item / card key, or null if there is none (the caller keeps its old picture) */
export function itemModel(key: string): Model3D | null { const art = ART[key]; return art ? customIcon3D('item:' + key, art) : null; }
/** the item for a card id (a boon id, a 刀谱 card, a provision, a hideout upgrade, leave, the run's last card) */
export function itemForCard(id: string): string | null {
  if (ART[id]) return id;
  if (id.startsWith('ms_')) return 'scroll';
  const m: Record<string, string> = { meal_feast: 'cake', meal_purse: 'purse', meal_wine: 'wine', leave: 'signpost', again: 'sabre', retry: 'sabre',
    mu_blade: 'anvil', mu_darts: 'dartCase', mu_manual: 'book', mu_vigor: 'medBowl', mu_breath: 'gourd', mu_intent: 'drawn', mu_ear: 'needles' };
  return m[id] ?? null;
}
export const ITEM_KEYS = Object.keys(ART);
