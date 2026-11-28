// 第一章的立绘对话台词（agy 写，docs/STORY.md 第 8 节，我核对）。who 用 dialogue.ts CAST 的 id。
import type { Line } from './dialogue';
const L = (who: string, text: string): Line => ({ who, text });
// act-30: the script the user writes with agy (docs/对白/剧本.md → `npm run script` → scriptData.json); a section there replaces the
// lines below; sections it does not have keep the code's
import SCRIPT from './scriptData.json';
const S = SCRIPT as Record<string, Line[]>;
const pick = (id: string, fallback: Line[]) => (S[id]?.length ? S[id] : fallback);
const pool = (id: string, fallback: string[]) => (S[id]?.length ? S[id].map(l => l.text) : fallback);

/** the first time she wakes in the hideout (debug talkTest only; the prologue's waking is PRO_WAKE) */
export const WAKE_DUWU: Line[] = [L('duwu', '白哥！别乱动，你肋下还插着孙婆婆的银针！'), L('jiangjin', '……刀呢。'), L('duwu', '在火堆边烤着呢！')];
export const WAKE_SUNAO: Line[] = [L('sunao', '醒了？命倒硬。'), L('jiangjin', '银针拔了，我要出门。')];
/** 11-19 剧情改版: each region's boss, before and after the fight (index 0 = 石雷 … 4 = 崔玄; ch5_after is the blade at his throat,
 *  then the ending she picks) */
export const CH_BEFORE: Line[][] = [1, 2, 3, 4, 5].map(n => pick(`ch${n}_before`, []));
export const CH_AFTER: Line[][] = [1, 2, 3, 4, 5].map(n => pick(`ch${n}_after`, []));
export const CHULEI_BEFORE = CH_BEFORE[0], CHULEI_AFTER = CH_AFTER[0];
/** the three endings (A 一个人走进雪里 / B 不杀、只带走阿爹那柄 / C 回破窑挂满刀架) and the choices' words, in that order */
export const ENDING: Record<'a' | 'b' | 'c', Line[]> = { a: pick('ending_a', []), b: pick('ending_b', []), c: pick('ending_c', []) };
export const ENDING_A_NO_DUWU: Line[] = pick('ending_a_no_duwu', ENDING.a);
export const ENDING_C_NO_DUWU: Line[] = pick('ending_c_no_duwu', ENDING.c);
export const DUWU_ROAD_1: Line[] = pick('duwu_road_1', []);
export const DUWU_ROAD_2: Line[] = pick('duwu_road_2', []);
export const DUWU_BONDS: Line[][] = [1, 2, 3, 4].map(n => pick(`duwu_bond_${n}`, []));
export const DUWU_MISSING: Line[] = pick('duwu_missing', []);
export const NORTH_CLUE_1: Line[] = pick('north_clue_1', []);
export const NORTH_CLUE_2: Line[] = pick('north_clue_2', []);
export const DUWU_DIE_NORTH: Line[] = pick('duwu_die_north', pick('duwu_die', []));
export const DUWU_DIE: Line[] = DUWU_DIE_NORTH;
export const NORTH_BEFORE: Line[][] = [1, 2, 3, 4].map(n => pick(`north_before_${n}`, []));
export const NORTH_AFTER: Line[][] = [1, 2, 3, 4].map(n => pick(`north_after_${n}`, []));
export const NORTH_ENDING: Line[] = pick('north_ending', []);
export const TRUE_ENDING: Line[] = pick('true_ending', []);
export const DUWU_MEMORIAL_INTRO: Line[] = pick('duwu_memorial_intro', []);
export const DEATH_SUNAO_AFTER_DUWU: string[] = pool('death_sunao_after_duwu', []);
export const ENDING_PICK: string[] = pool('ending_pick', ['挥刀封喉，独入风雪', '留刀阁内，抽身而去', '斩断恩仇，抱刀归窑']);
export const ENDING_DESC: string[] = ['一刀封喉，孤身没入风雪', '留他性命，只带阿爹旧刀', '斩尽血仇，抱三十刀归窑'];
/** act-114 三国名将客串（一～四关：赵云 / 吕布 / 夏侯惇 / 陆逊） */
export const GEN_BEFORE: Line[][] = [1, 2, 3, 4].map(n => pick(`gen${n}_before`, []));
export const GEN_AFTER: Line[][] = [1, 2, 3, 4].map(n => pick(`gen${n}_after`, []));
/** what they say when she is dragged back after a death (one line each, picked at random) */
export const DEATH_POOL: Record<string, string[]> = {
  duwu: pool('death_duwu', ['白哥！我顺着刀环声才在泥沟里摸到你，险些晚了！', '黄巾贼换了巡山哨卡，下次走东边麦田，我挂了铜铃。', '别硬撑了，你吐出来的全是黑血，先喝口热米汤！',
    '那帮杂碎怕了！听说他们把破庙前院全埋上了火油罐。', '我的灰驴都累吐沫子了，白哥，咱歇半个时辰再去成吗？', '你的暗红腰布掉死人堆里了，我拼死给你捡回来了，洗净了。']),
  sunao: pool('death_sunao', ['又被抬回来了？再偏半寸，老身就直接给你钉棺材板了。', '咬碎闭息散的狠劲倒是利索，张嘴，把这碗乌头汤咽下去！', '耳后听宫穴给你扎透了，下次那群杂碎放冷箭，听准点！', '肩骨裂了三道缝，别拿你那双死人眼瞪我，忍着疼！']),
  fengtiebi: ['（默默指了指刀刃上崩出的三个缺口，一锤砸扁烧红的铁块）', '（抓起刘白发抖的右手按在温热的刀鞘上，重重敲了两下铁砧）', '（从怀里掏出打磨一新的十枚柳叶镖塞进她袖袋，转身拉动风箱）', '（用火钳夹起一块寒山坞残铁熔入刀脊，对她比了个「斩」的手势）'],
};
/** a random line from someone's death pool, as a one-line scene */
export function deathLine(who: keyof typeof DEATH_POOL, rnd = Math.random): Line[] {
  const pool = DEATH_POOL[who]; return [L(who, pool[Math.floor(rnd() * pool.length) % pool.length])];
}

// ---------------------------------------------------------------- act-29 开篇（方案 1，agy · gemini-3.8-flash-high 写，11-17）
/** the cold open's last line (寒山坞, that night), then the two cards over the snowy village */
// 11-19 (neon 重写，用户挑过): the black cards and the two place captions are one section, cold_cards — the cards first, the last
// two lines the place captions; the second-to-last card is her father's words (the slow heartbeat ring)
const COLD = pick('cold_cards', [
  L('caption', '东汉末年，天下大乱，群雄争锋。'),
  L('caption', '寒山坞文家铸成三十柄名刀，一夜惨遭灭门夺刃。'),
  ...pick('pro_cold', [L('caption', '唯有铁匠之女被炉火烫瞎双眼，死里逃生。')]),
  L('caption', '七年了，她蒙眼提刀走出山野，只为寻仇。'),
  L('caption', '七年后'),
  L('caption', '许都 · 冬'),
]).map(l => l.text);
export const COLD_CARDS = COLD.slice(0, -2);
export const PRO_COLD = COLD_CARDS[COLD_CARDS.length - 2] ?? COLD_CARDS[0];
export const PRO_CAPTIONS = COLD.slice(-2);   // (11-19: no year; history only the backdrop)
/** 11-19 剧情改版: 崔府's snowy forecourt, before the fight she cannot win (崔玄) */
export const PRO_CUIXUAN: Line[] = pick('pro_cuixuan', [L('cuixuan', '夜深落了锁。你走错门了。'), L('jiangjin', '七年前，寒山坞文家，三十柄百辟刀。'), L('cuixuan', '刀在我这。')]);
/** struck down in the snow */
/** 11-19 (用户：「突然就进入战斗了……敌人跳出来把她包围了的过程，辅以对话和文字」): the sentries close round her in the snowy village (agy) */
export const PRO_AMBUSH: Line[] = pick('pro_ambush', [L('sentry', '摸他怀里！肯定藏着干粮！'), L('sentry2', '少废话，先把袄子扒了！'), L('act', '（风雪骤急，刘白微偏下颌，按住刀镡）'), L('jiangjin', '刀都晃出声了，拿稳点。')]);
export const PRO_FALL: Line[] = pick('pro_fall', [L('cuixuan', '拿刀的那四个人你一个都没杀过，就来找我？')]);
/** dawn: the man with the donkey, picking over the dead */
export const PRO_DAWN: Line[] = pick('pro_dawn', [L('duwu', '冻死鬼的衣裳，扒都扒不下来。'), L('duwu', '松手……娘哎，怎么还有气儿？！')]);
/** the kiln: her first waking (only 杜五 and 孙媪 — the others come later, each with their own story) */
export const PRO_WAKE: Line[] = pick('pro_wake', [L('act', '（刘白猛地惊醒，指尖抓空）'), L('sunao', '别扑腾，肋骨断了三根。'), L('jiangjin', '刘白。'), L('act', '（刘白扶墙撑起身体）'), L('jiangjin', '刀给我。')]);

// ---------------------------------------------------------------- act-40 (用户：「我感觉还有很多对话没配音」): the hideout's lines from the final
// script too (docs/对白/剧本5.md) — the talk pools, the stele, the provisions, the needles — so they are the user's words and voiced;
// hideoutLines.ts stays as the fallback for anything the script has no section for (冯铁臂's silent business, 卢昭, 桓越)
import { NPC_LINES, STELE_LINES, MEAL_LINES, UP_LINES, POOR_LINES } from './hideoutLines';
const one = (id: string, fallback: string) => (S[id]?.[0]?.text ?? fallback);
export const NPC_TALK: Record<string, string[]> = { ...NPC_LINES, duwu: pool('npc_duwu', NPC_LINES.duwu), sunao: pool('npc_sunao', NPC_LINES.sunao) };
export const STELE_TALK = {
  none: pool('stele_none', STELE_LINES.none), one: pool('stele_one', STELE_LINES.one),
  /** 11-19 剧情改版: what she says at the stone with n names cut (0 … 5; five cut = stele_five, act-114) */
  byCount: [pool('stele_none', STELE_LINES.none), pool('stele_one', STELE_LINES.one), pool('stele_two', STELE_LINES.one), pool('stele_three', STELE_LINES.one), pool('stele_four', STELE_LINES.one), pool('stele_five', ['五个名字，全都划平了。'])],
  /** the cut down the n-th name (index 0 = 石雷 … 4 = 崔玄) */
  strike: [1, 2, 3, 4, 5].map(n => one(`stele_strike_${n}`, n === 5 ? '崔玄，销了。阿爹，这笔账平了。' : n === 1 ? one('stele_strike', STELE_LINES.strike) : STELE_LINES.strike)),
};
/** 11-19 剧情改版: a region's boss down for good (the five in order). The first four: their after-talk seen; 崔玄: dead by her hand
 *  (ending A or C; ending B leaves him alive and his name uncut) */
export const BOSS_AFTER = ['ch1_boss_after', 'ch2_boss_after', 'ch3_boss_after', 'ch4_boss_after', 'cuixuan_dead'] as const;
export const STRIKE_FLAG = ['strike_chulei', 'strike_2', 'strike_3', 'strike_4', 'strike_5'] as const;
const leading = (seen: Record<string, unknown>, ids: readonly string[]) => { let n = 0; while (n < ids.length && seen[ids[n]]) n++; return n; };
export const bossesDown = (seen: Record<string, unknown>) => leading(seen, BOSS_AFTER);
export const struckOnStele = (seen: Record<string, unknown>) => leading(seen, STRIKE_FLAG);
export const MEAL_TALK = { offer: pool('meal_offer', MEAL_LINES.offer), packed: pool('meal_packed', MEAL_LINES.packed),
  after: { feast: one('meal_feast', MEAL_LINES.after.feast), purse: one('meal_purse', MEAL_LINES.after.purse), wine: one('meal_wine', MEAL_LINES.after.wine) } as Record<string, string> };
export const UP_TALK: Record<string, string[]> = { ...UP_LINES, sunao: pool('up_sunao', UP_LINES.sunao ?? []) };
export const POOR_TALK: Record<string, string> = { ...POOR_LINES, sunao: one('poor_sunao', POOR_LINES.sunao) };

