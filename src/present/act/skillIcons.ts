// 11-18 (用户：「所有道具我要求都是真实的模型，不要用立体简笔画糊弄我」): 以实物摆出出招的瞬间。
// 模型共用一份体素几何。卡面、暂停页和战斗各自保留材质，翻面时调光不会串到别处。
import { customIcon3D, type Model3D } from '../ui3d/models3d';
import { box, type Set3 } from '../ui3d/models3dArt';
import type { BoonId } from './boons';
import { btnIcon3D } from './icons3d';
import { ITEM_PROPS } from './itemModels';
import { LINK_COLORS, type BaseIcon, type LinkIcon } from './skillInfo';

type Art = (set: Set3) => void;
type Turn = 0 | 1 | 2 | 3;
const C = {
  edge: 0xe5eced, steel: 0xa3afb6, iron: 0x596472, gold: 0xd5a55d, goldLight: 0xf0cf8e,
  leather: 0x4a2523, leatherLight: 0x79503d, string: 0xaa3045, stringLight: 0xe2606a,
  linen: 0xd6c3a2, blood: 0xb62834, skin: 0xb47d55, straw: 0xcfaa52,
  slate: 0x55505a, earth: 0x8d6952, sand: 0xc49a66, ghost: 0x88a8d4, ghostDark: 0x4f678b,
};
const { sabre, dart, boot, sandal } = ITEM_PROPS;

// Turn the whole solid prop; it still has the original grip, edge, and back in its new pose.
const at = (set: Set3, ox: number, oy: number, oz = 0, turn: Turn = 0): Set3 => {
  const dx = [1, 0, -1, 0][turn], dy = [0, 1, 0, -1][turn];
  return (x, y, z, col, glow) => set(ox + x * dx + y * dy, oy + y * dx - x * dy, oz + z, col, glow);
};
const darken = (col: number) => ((col & 0xfefefe) >>> 1);
/** The blade's track sits behind the props, with a dark back and one lit face. */
function trace(set: Set3, x: number, y: number, length: number, col: number) {
  box(set, x, y, -4, x + length - 1, y + 1, -3, darken(col));
  box(set, x, y + 1, -2, x + length - 1, y + 1, -2, col);
}
/** A turn seen from above, broken at the front so the steel stays separate from the track. */
function arc(set: Set3, x: number, y: number, col: number) {
  trace(set, x - 7, y + 7, 15, col);
  trace(set, x - 10, y + 5, 4, col);
  trace(set, x + 7, y + 5, 4, col);
  box(set, x - 11, y - 2, -4, x - 9, y + 4, -2, col);
  box(set, x + 9, y - 2, -4, x + 11, y + 4, -2, col);
}
/** Yellow scarf, face and padded collar. For a silhouette at HUD size the scarf gets a full band. */
function head(set: Set3, x: number, y: number, oz = 0, shade = false) {
  const p = at(set, x, y, oz), cloth = shade ? C.ghost : C.straw, face = shade ? C.ghostDark : C.skin;
  box(p, -5, -5, -3, 5, -2, 2, shade ? C.ghostDark : C.leather);
  box(p, -3, -2, -3, 3, 3, 2, face);
  box(p, -4, 1, -4, 4, 4, 3, cloth);
  box(p, -3, 5, -3, 3, 5, 2, shade ? C.ghost : C.goldLight);
  box(p, -2, -1, 3, 2, 0, 3, shade ? C.ghost : C.linen);
  box(p, 4, -2, 1, 5, 2, 2, cloth);
  if (!shade) box(p, -2, 0, 4, 2, 0, 4, C.leather);
}
function scabbard(set: Set3, mouth: number, exposed: number) {
  box(set, -2, mouth - 15, -2, 2, mouth, 1, C.leather);
  box(set, -1, mouth - 14, 2, 1, mouth - 1, 2, C.leatherLight);
  for (const y of [mouth - 14, mouth - 6, mouth - 1]) box(set, -3, y, -2, 3, y + 1, 2, C.gold);
  if (exposed) box(set, -1, mouth + 1, -1, 1, mouth + exposed, 1, C.edge);
  const guard = mouth + exposed + 1;
  box(set, -4, guard, -2, 4, guard + 1, 2, C.goldLight);
  box(set, -1, guard + 2, -1, 1, guard + 6, 1, C.string);
  box(set, -2, guard + 7, -1, 2, guard + 11, 1, C.gold);
  box(set, -1, guard + 8, -1, 1, guard + 10, 1, null);
}
function ground(set: Set3, broken = false) {
  box(set, -12, -8, -5, 12, -4, 3, C.earth);
  box(set, -11, -4, -4, 11, -4, 1, C.sand);
  box(set, -12, -8, 3, 12, -7, 3, C.slate);
  if (broken) {
    box(set, 0, -8, -5, 2, -4, 1, null);
    box(set, 2, -8, 2, 5, -4, 3, null);
    box(set, 4, -5, 2, 10, -3, 4, C.sand);
  }
}
function blood(set: Set3, x: number, y: number) {
  box(set, x - 1, y, 0, x + 1, y + 2, 2, C.blood);
  box(set, x, y + 3, 0, x, y + 4, 1, C.stringLight);
}
function dartsFan(set: Set3) {
  dart(at(set, -6, -3, -1)); dart(at(set, 6, -3, -1)); dart(at(set, 0, 1, 1));
}
function armour(set: Set3, x: number, y: number, z = 0) {
  box(set, x - 3, y - 5, z - 3, x + 3, y + 5, z, C.iron);
  box(set, x - 2, y + 2, z + 1, x + 2, y + 5, z + 1, C.steel);
  box(set, x - 3, y - 1, z + 1, x + 3, y, z + 1, C.gold);
  box(set, x - 2, y - 4, z + 1, x + 2, y - 2, z + 1, C.steel);
}

const ART: Record<Exclude<BaseIcon, `btn:${string}`> | BoonId, Art> = {
  // 基础招
  dcut: set => { const col = LINK_COLORS.dcut; trace(set, -15, -5, 21, col); trace(set, -17, 4, 13, col); sabre(at(set, -2, 0, 0, 1), 0, 0, 15); },
  plunge: set => { ground(set); sabre(at(set, 0, 5, 1, 2), 0, 0, 9); trace(set, -12, -1, 8, LINK_COLORS.plunge); trace(set, 5, -1, 8, LINK_COLORS.plunge); },
  counter: set => { sabre(at(set, -3, -4, 2), 0, 0, 16); sabre(at(set, 0, 3, -1, 3), 0, 0, 13); box(set, -5, 1, 3, 0, 5, 3, C.goldLight); },
  stance: set => scabbard(set, 0, 6),
  parry: set => {
    scabbard(at(set, -3, 0, 2), -3, 4);
    dart(at(set, 9, 3, -1, 1));
    box(set, 1, 1, 1, 5, 3, 3, C.goldLight);
  },
  ult: set => {
    scabbard(at(set, 0, 1, 2), -3, 0);
    sabre(at(set, -5, -4, -2, 3), 0, 0, 9); sabre(at(set, 5, 5, -1, 1), 0, 0, 9);
    trace(set, -16, 10, 9, C.gold); trace(set, 8, -10, 9, C.gold);
  },
  // 刀谱
  chase: set => { dart(at(set, 10, 4, 2, 1)); sabre(at(set, -5, -4, 0), 0, 0, 14); trace(set, -3, -4, 17, LINK_COLORS.chase); },
  back: set => { for (const [x, y] of [[1, 7], [-4, 0], [3, -7]]) dart(at(set, x, y, 0, 3)); trace(set, 5, -11, 9, LINK_COLORS.back); },
  dbl: set => {
    sandal(at(set, -5, -6, -1, 1)); sandal(at(set, 4, 6, 1, 3));
    trace(set, -10, -11, 8, LINK_COLORS.dbl); trace(set, 5, -3, 9, LINK_COLORS.dbl);
  },
  launch: set => { sabre(at(set, -6, -2, 1), 0, 0, 15); head(set, 5, 8); trace(set, 0, -10, 10, LINK_COLORS.launch); trace(set, 2, -6, 8, LINK_COLORS.launch); },
  cdart: set => { dartsFan(at(set, -5, 2, 1, 1)); head(set, 10, -4); },
  keep: set => { boot(at(set, 5, -10, 1)); sabre(at(set, -6, -1, 0), 0, 0, 13); trace(set, -4, 6, 14, LINK_COLORS.keep); },
  pause: set => { sabre(at(set, 0, 4, 2, 1), 0, 0, 13); arc(set, 0, 3, LINK_COLORS.pause); arc(at(set, 0, -5, -1, 2), 0, 0, C.goldLight); },
  kick: set => { boot(at(set, -7, -6, 2)); head(set, 5, 2); box(set, 11, -9, -5, 15, 9, 2, C.earth); box(set, 11, -2, 3, 14, -1, 3, C.sand); trace(set, -13, 7, 11, LINK_COLORS.kick); },
  acut: set => {
    head(set, 6, 4);
    sabre(at(set, -4, 3, 2, 2), 0, 0, 11);
    trace(set, 0, 11, 12, LINK_COLORS.acut); trace(set, 0, -4, 12, LINK_COLORS.acut);
    ground(at(set, 0, -4, -1));
  },
  swoop: set => {
    boot(at(set, -7, -1, 1)); sabre(at(set, -1, -6, 3, 1), 0, 0, 13);
    trace(set, -16, 9, 10, LINK_COLORS.swoop); trace(set, 2, -10, 15, LINK_COLORS.swoop);
  },
  reel: set => {
    dart(at(set, 4, 3, 1, 1));
    box(set, -14, 1, 0, 2, 3, 2, C.string);
    box(set, -15, -6, 0, -13, 3, 2, C.string);
    box(set, -15, -7, 0, -7, -5, 2, C.string);
    box(set, -8, -7, 0, -6, -2, 2, C.string);
    box(set, -13, 3, 3, -2, 3, 3, C.stringLight);
  },
  stomp: set => { head(set, 2, -5); boot(at(set, -2, 1, 2)); trace(set, -9, -13, 19, LINK_COLORS.stomp); },
  // 秘传
  bladeWind: set => { sabre(at(set, -3, -4, 0, 1), 0, 0, 16); arc(set, 4, 1, C.edge); },
  extra: set => { sabre(at(set, -5, -2), 0, 0, 14); sabre(at(set, 5, 2, 2), 0, 0, 14); },
  bleed: set => {
    sabre(at(set, -3, 5, 1, 1), 0, 0, 16);
    box(set, 4, 4, 2, 11, 5, 2, C.blood);
    blood(set, -5, -4); blood(set, 3, -8); blood(set, 10, -5);
  },
  behead: set => {
    head(set, -2, 3); sabre(at(set, 1, -5, 3, 1), 0, 0, 14);
    box(set, -12, -11, -3, 12, -9, -1, C.blood);
    box(set, -12, -9, -3, -10, -3, -1, C.stringLight);
    box(set, 10, -9, -3, 12, -3, -1, C.stringLight);
  },
  spin: set => { sabre(at(set, 0, -4, 1), 0, 0, 14); arc(set, 0, -2, C.steel); arc(at(set, 0, -2, -1, 2), 0, 0, C.edge); },
  pierce: set => {
    armour(set, 0, 2); armour(set, 11, 2, 1);
    sabre(at(set, -8, 0, 4, 1), 0, 0, 20);
    trace(set, 13, -1, 7, C.edge);
  },
  passCut: set => { boot(at(set, -5, -2, 0)); sabre(at(set, -2, -4, 3, 1), 0, 0, 15); trace(set, -13, 4, 8, C.ghost); },
  decoy: set => { head(set, -6, -2, 0, true); head(set, 6, 3, 1); trace(set, -12, -11, 14, C.ghost); },
  darts3: dartsFan,
  boomerang: set => { dart(at(set, -1, 5, 1, 1)); dart(at(set, 1, -5, 1, 3)); trace(set, -11, 9, 17, C.ghost); trace(set, -5, -10, 17, C.ghost); },
  pin: set => {
    armour(set, 0, -4);
    dart(at(set, 0, 4, 3, 2));
    box(set, -7, -7, -3, -4, -3, -1, C.ghost); box(set, 4, -7, -3, 7, -3, -1, C.ghost);
  },
  twinDraw: set => { scabbard(at(set, -5, -4, -1), 1, 3); scabbard(at(set, 5, 3, 2), 1, 4); },
  burst: set => { scabbard(at(set, 0, 2, 1), -3, 4); arc(set, 0, -3, C.goldLight); trace(set, -15, -8, 12, C.gold); trace(set, 4, -8, 12, C.gold); },
  rift: set => { ground(set, true); sabre(at(set, 2, 5, 2, 2), 0, 0, 10); },
  vault: set => { head(set, -2, -6); sandal(at(set, -4, 8, 0, 1)); sabre(at(set, 8, 4, 2, 2), 0, 0, 10); },
  drink: set => {
    // Open bronze vessel; its red contents sit down inside the thick mouth.
    box(set, -6, -1, -4, 6, 4, 3, C.gold);
    box(set, -7, 4, -5, 7, 5, 4, C.goldLight);
    box(set, -5, 4, -3, 5, 5, 2, null);
    box(set, -5, 3, -3, 5, 3, 2, C.blood);
    box(set, -4, -2, -3, 4, -2, 2, C.goldLight);
    for (const x of [-4, 3]) box(set, x, -7, 1, x + 1, -3, 2, C.gold);
    box(set, -1, -7, -3, 0, -3, -2, C.gold);
    blood(set, 1, 9);
  },
};

export function skillIcon3D(id: BaseIcon | BoonId): Model3D {
  switch (id) {
    case 'btn:attack': return btnIcon3D('attack');
    case 'btn:dash': return btnIcon3D('dash');
    case 'btn:jump': return btnIcon3D('jump');
    case 'btn:special': return btnIcon3D('special');
    default: return customIcon3D('skill:' + id, ART[id]);
  }
}

export const isLinkIcon = (id: BaseIcon | BoonId): id is LinkIcon => Object.prototype.hasOwnProperty.call(LINK_COLORS, id);
