// 北出官道（第二入口 · 乱世线）四位专属首领注册：
//   北一 · 荒驿官道：镇驿百夫长 · 厉锋（nr1_boss）
//   北二 · 毒雾药坞：毒雾药主 · 殷毒（nr2_boss，杜五长线弧光真正高潮所在）
//   北三 · 铁甲军寨：虎贲校尉 · 铁镇（nr3_boss）
//   北四 · 函谷玄台：监军太尉 · 谢渊（nr4_boss，双线幕后执棋终局首领）
import { addFoes, FOE_AI } from '../enemy';
import '../foes/ly_ai';
import '../foes/xp_ai';
import '../foes/r45_ai';

export const NORTH_BOSS_ORDER = ['nr1_boss', 'nr2_boss', 'nr3_boss', 'nr4_boss'] as const;

addFoes({
  nr1_boss: {
    model: 'ly_boss',
    hp: 580,
    r: 0.78,
    speed: 2.25,
    mass: 3.4,
    poise: 120,
    gold: 34,
    name: '镇驿百夫长 · 厉锋',
    role: 'ly_boss',
    boss: true,
    tag: '铁戟封道 · 捉夫充役',
    intro: '哪个不长眼的瞎子，敢闯官驿捉夫营！',
  },
  nr2_boss: {
    model: 'xp_boss',
    hp: 760,
    r: 0.62,
    speed: 2.55,
    mass: 2.8,
    poise: 132,
    gold: 38,
    name: '毒雾药主 · 殷毒',
    role: 'xp_boss',
    boss: true,
    tag: '活人试药 · 百草成霜',
    intro: '送上门的新药引，倒省得老夫再派人去抓。',
  },
  nr3_boss: {
    model: 'wl_boss',
    hp: 940,
    r: 0.64,
    speed: 2.45,
    mass: 3.1,
    poise: 148,
    gold: 42,
    name: '虎贲校尉 · 铁镇',
    role: 'ext',
    boss: true,
    tag: '百辟武装 · 铁甲连营',
    intro: '寒山坞的百辟刀，就该配给大军铁骑！',
  },
  nr4_boss: {
    model: 'cx_boss',
    hp: 1220,
    r: 0.62,
    speed: 2.68,
    mass: 3.2,
    poise: 176,
    gold: 50,
    name: '监军太尉 · 谢渊',
    role: 'ext',
    boss: true,
    tag: '执棋乱世 · 众生为刍',
    intro: '连崔玄那枚弃子都收拾不干净……你倒是比我想的锋利。',
  },
});

// Reuse proven ext boss combat state machines for nr3_boss & nr4_boss
if (FOE_AI.wl_boss) FOE_AI.nr3_boss = FOE_AI.wl_boss;
if (FOE_AI.cx_boss) FOE_AI.nr4_boss = FOE_AI.cx_boss;
