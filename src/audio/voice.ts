// act-37 (用户：「台词已经出了最新版了，用breeze生成一下配音」): the voiced lines (Breeze TTS 2, GameProtos/voice/gen_unseen.py →
// src/assets/voice/<who>/<section>_<index>.mp3). A line is found by who said it and its exact text (the pools keep only the text), so
// the script stays as it is; a line with no clip is simply silent. Clips are decoded the first time they are needed.
import SCRIPT from '../present/act/scriptData.json';
import { audio } from './audio';
import { dh } from '../debug/dh';

const FILES = import.meta.glob('../assets/voice/*/*.mp3', { eager: true, query: '?inline', import: 'default' }) as Record<string, string>;
const BY_TEXT = new Map<string, string>();
for (const [sec, rows] of Object.entries(SCRIPT as Record<string, Array<{ who: string; text: string }>>)) rows.forEach((r, i) => {
  const dir = r.who === 'sentry2' ? 'sentry' : r.who;
  const url = FILES[`../assets/voice/${dir}/${sec}_${i}.mp3`]; if (url) BY_TEXT.set(r.who + '|' + r.text, url);
});
/** act-132: Breeze TTS 2 voice lines for the 4 reworked General Trials & hideout newcomers (卢昭 / 桓越) */
const EXTRA_VOICES: Array<[string, string, string]> = [
  // Act 1: Zhao Yun — 死守村口 · 断后护民 (act-137 reworked urgent comrade tone, zero announcer / zero 姑娘)
  ['zhaoyun', 'ev1_intro_0', '来得正好！村里老小还没撤完，帮我把这道口子死死掐住！'],
  ['zhaoyun', 'ev1_intro_1', '外头贼兵正往这儿涌——漏进一个，后头就全完了！'],
  ['zhaoyun', 'ev1_outro_0', '都撤出去了……方才若非你顶在口上，我一人绝护不住这许多性命。'],
  ['zhaoyun', 'ev1_outro_1', '这枚银穗你收着，往后路上保重。常山赵云，记你这一刀。'],
  ['zhaoyun', 'ev1_outro_hurt', '乡民伤得不轻……所幸人还活着，你也辛苦了。'],
  // Act 2: Lu Bu — 三合试锋
  ['lubu', 'ev2_intro_0', '哼，一个蒙眼盲女，也敢提刀闯本侯的地界？'],
  ['lubu', 'ev2_intro_1', '少废话！接住我三合戟势不退，本侯便认你这把刀！'],
  ['lubu', 'ev2_outro_win_0', '哈哈哈哈！好俊的卸势破招！本侯认你这把盲刀了！'],
  ['lubu', 'ev2_outro_win_1', '这缕赤兔红鬃拿去，再去铸钱场把阎虎那蠢物宰了！'],
  ['lubu', 'ev2_outro_lose_0', '火候还差三分！留你一命，练好破势再来见本侯！'],
  // Act 3: Xiahou Dun — 雾巷听弦
  ['xiahoudun', 'ev3_intro_0', '雾巷连弩暗伏，曹某左目新伤，偏要试你一试！'],
  ['xiahoudun', 'ev3_intro_1', '我藏身雾影之中——听声甩镖追影破我三回，便算你赢！'],
  ['jiangjin', 'ev3_intro_2', '暗处，归我。'],
  ['xiahoudun', 'ev3_outro_0', '好俊的听弦追影……你我同在暗处挥刀，曹某服你了。'],
  ['xiahoudun', 'ev3_outro_1', '这幅玄铁眼带留给你，白门楼的账你自己去算！'],
  // Act 4: Lu Xun — 借风引火
  ['luxun', 'ev4_intro_0', '江东陆逊。水闸与油桥皆有重盾曹兵把守，正面硬拼只会吃亏。'],
  ['luxun', 'ev4_intro_1', '姑娘善借地势——破盾关闸、断绳落桥，再劈爆引火油坛连环焚舰！'],
  ['luxun', 'ev4_outro_0', '火借江风、连营成势！好利落的身手，陆某佩服！'],
  ['luxun', 'ev4_outro_1', '这枚江东火折赠予姑娘，周默困在楼船已走不脱了。'],
  // Hideout: Lu Zhao & Huan Yue
  ['luzhao', 'hideout_0', '水渠边清净，我替你记着各路消息。每关岔路常有乱世名将，顺手走一遭，自有重礼。'],
  ['luzhao', 'hideout_1', '文家三十柄刀散落五地，每夺回一柄，北台刀廊便多一分锋芒。'],
  ['huanyue', 'hideout_0', '石阶上喝一口山泉酿，倒比洛阳城里的酒痛快。刀换了手，就去西边大试剑坪先劈两下听听响。'],
  ['huanyue', 'hideout_1', '快刀重势、重刀破阵、断刃听声——哪一柄顺手，全看你自己。'],
];
for (const [who, lid, text] of EXTRA_VOICES) {
  const url = FILES[`../assets/voice/${who}/${lid}.mp3`];
  if (url) BY_TEXT.set(who + '|' + text, url);
}
let lastEventVoiceAt = 0;
/** act-132: Play mid-trial voiced callout (with 1.4s anti-overlap cooldown) */
export function sayEventVoice(who: string, lid: string) {
  const now = performance.now();
  if (now - lastEventVoiceAt < 1400) return;
  const url = FILES[`../assets/voice/${who}/${lid}.mp3`];
  if (url) { lastEventVoiceAt = now; void audio.voiceLine(url); }
}
let packsWarmed = false;
/** act-140: silently pre-download all WeChat voice subpackages (audio5/6/7…) in background so the very first line never stalls on wx.loadSubpackage */
export function warmVoicePacks() {
  if (packsWarmed) return;
  const fn = (globalThis as unknown as { __ubPreloadSubpack?: (name: string) => Promise<unknown> }).__ubPreloadSubpack;
  if (!fn) return;
  packsWarmed = true;
  const packs = new Set<string>();
  for (const url of Object.values(FILES)) {
    if (typeof url === 'string' && !url.startsWith('data:') && !url.startsWith('/') && !url.startsWith('http')) {
      const top = url.split('/')[0];
      if (/^audio\d+$/.test(top)) packs.add(top);
    }
  }
  for (const p of packs) void fn(p);
}
/** act-140: pre-decode upcoming dialogue lines into AudioBuffers so speech plays at 0ms when text appears */
export function warmLines(lines: ReadonlyArray<{ who: string; text: string }>, limit = 6) {
  warmVoicePacks();
  let n = 0;
  for (const l of lines) {
    const url = BY_TEXT.get(l.who + '|' + l.text);
    if (url) {
      audio.warmVoice(url);
      if (++n >= limit) break;
    }
  }
}
/** act-140: pre-decode a specific voice file (e.g. hurt_breath or combat callout) */
export function warmVoiceFile(relPath: string) {
  warmVoicePacks();
  const url = FILES[`../assets/voice/${relPath}`];
  if (url) audio.warmVoice(url);
}
/** say this line if there is a clip for it (stops the line before) */
export function sayLine(who: string, text: string) { const url = BY_TEXT.get(who + '|' + text); if (url) void audio.voiceLine(url); else audio.stopVoice(); }
/** act-128: traveling merchant shop barks (Breeze TTS 2) */
const MERCHANT_LINES: Record<'greet' | 'buy', Array<[string, string]>> = {
  greet: [
    ['greet_0', '客官留步！乱世行商，货真价实，瞧瞧趁手的物件。'],
    ['greet_1', '刀客慢走！荒年难得开张，铜钱换命，童叟无欺。'],
  ],
  buy: [
    ['buy_0', '好眼光！拿稳了！'],
    ['buy_1', '多谢惠顾，前路当心！'],
  ],
};
export function sayMerchant(kind: 'greet' | 'buy'): string {
  const list = MERCHANT_LINES[kind];
  const [id, text] = list[Math.floor(Math.random() * list.length)];
  const url = FILES[`../assets/voice/merchant/${id}.mp3`];
  if (url) void audio.voiceLine(url);
  return text;
}
/** act-128: Liu Bai's wounded ragged breathing loop during prologue Boss defeat */
export function setHurtBreath(on: boolean) {
  if (!on) { audio.stopVoiceLoop(0.5); return; }
  const url = FILES['../assets/voice/jiangjin/hurt_breath.mp3'];
  if (url) void audio.startVoiceLoop(url, 0.58);
}
export function hasVoiceAsset(relPath: string) { return !!FILES[`../assets/voice/${relPath}`]; }
export const voicedLines = () => BY_TEXT.size;
dh.add({ voiced: () => BY_TEXT.size, voicing: () => audio.voicing, /** act-50 checks: the audio engine */ audioDbg: () => audio });
