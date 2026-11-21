// act-138: Pure 3D voxel Boss tactical totems (石雷 · 黄巾雷旗 / 封寒 · 寒毒药鼎).
// Registered as stationary Foe entries (role 'totem') so every hero weapon, dart, sweep, auto-aim, and HUD HP bar works seamlessly,
// and routMinions() disposes them automatically when the Boss falls.
import { VoxChar } from '../../look/voxkit';
import { CELL } from '../../bestiary/kit';
import { ROSTER, type ModelDef } from '../../bestiary/models';

function buildThunderFlag() {
  const v = new VoxChar(CELL / 2);
  const WOOD_D = 0x3b2616, WOOD = 0x5c3c22, IRON = 0x444854;
  const GOLD = 0xf2c848, GOLD_L = 0xfff0a0, YEL = 0xd69e2e, RED = 0x9c241c;
  // Ground socket & upright wooden pole
  v.bone('hips', 'root', 0, 14, 0).part('hips')
    .box(-4, 0, -4, 3, 2, 3, IRON)
    .box(-2, 3, -2, 1, 5, 1, WOOD_D)
    .box(-1, 6, -1, 0, 46, 0, WOOD)
    // Crossbar near top
    .box(-9, 40, -1, 8, 41, 0, WOOD_D)
    // Yellow Turban cloth banner hanging from crossbar (axis-aligned crisp voxel slab)
    .box(-7, 16, 1, 6, 39, 1, YEL)
    .box(-6, 18, 2, 5, 37, 2, GOLD)
    // Crimson talisman stripe down center
    .box(-1, 20, 2, 0, 35, 2, RED);
  v.bone('head', 'hips', 0, 48, 0).part('head')
    .box(-2, 47, -2, 1, 50, 1, GOLD_L, 1)
    .box(-1, 51, -1, 0, 52, 0, 0xffffff, 1);
  return v;
}

function buildPoisonCauldron() {
  const v = new VoxChar(CELL / 2);
  const BRONZE_D = 0x2a3430, BRONZE = 0x42524a, RIM = 0x5e7066;
  const ICE = 0x8ce8ff, ICE_L = 0xdff8ff, VENOM = 0x3eb88a;
  v.bone('hips', 'root', 0, 12, 0).part('hips')
    // Three stout bronze tripod legs
    .box(-7, 0, -5, -4, 7, -2, BRONZE_D)
    .box(3, 0, -5, 6, 7, -2, BRONZE_D)
    .box(-2, 0, 3, 1, 7, 6, BRONZE_D)
    // Roundish stepped voxel cauldron belly
    .box(-8, 7, -8, 7, 18, 7, BRONZE)
    .box(-9, 10, -7, 8, 15, 6, BRONZE_D)
    .box(-7, 10, -9, 6, 15, 8, BRONZE_D)
    // Rim & twin ear handles
    .box(-7, 19, -7, 6, 21, 6, RIM)
    .box(-10, 17, -2, -8, 22, 1, RIM)
    .box(7, 17, -2, 9, 22, 1, RIM);
  v.bone('head', 'hips', 0, 24, 0).part('head')
    // Glowing frost-venom elixir core bubbling at the mouth
    .box(-5, 21, -5, 4, 22, 4, VENOM, 1)
    .box(-3, 23, -3, 2, 24, 2, ICE, 1)
    .box(-1, 25, -1, 0, 26, 0, ICE_L, 1);
  return v;
}

const FLAG_DEF: ModelDef = {
  id: 'totem_flag', name: '黄巾雷旗', group: '普通', role: '', line: '',
  kind: 'biped', attack: 'slam', build: buildThunderFlag,
};
const CAULDRON_DEF: ModelDef = {
  id: 'totem_cauldron', name: '寒毒药鼎', group: '普通', role: '', line: '',
  kind: 'biped', attack: 'slam', build: buildPoisonCauldron,
};

for (const def of [FLAG_DEF, CAULDRON_DEF]) {
  if (!ROSTER.some(d => d.id === def.id)) ROSTER.push(def);
}
