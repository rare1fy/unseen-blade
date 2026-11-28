// act-37 (用户：「台词已经出了最新版了，用breeze生成一下配音」): the voiced lines (Breeze TTS 2, GameProtos/voice/gen_unseen.py →
// src/assets/voice/<who>/<section>_<index>.mp3). A line is found by who said it and its exact text (the pools keep only the text), so
// the script stays as it is; a line with no clip is simply silent. Clips are decoded the first time they are needed.
import SCRIPT from '../present/act/scriptData.json';
import { audio } from './audio';
import { dh } from '../debug/dh';

const FILES = import.meta.glob('../assets/voice/*/*.mp3', { eager: true, query: '?inline', import: 'default' }) as Record<string, string>;
const BY_TEXT = new Map<string, string>();
for (const [sec, rows] of Object.entries(SCRIPT as Record<string, Array<{ who: string; text: string }>>)) rows.forEach((r, i) => {
  const dirMap: Record<string, string> = { sentry2: 'sentry', lifeng: 'yanhu', yindu: 'fengzhen', tiezhen: 'zhouan', xieyuan: 'cuixuan' };
  const dir = dirMap[r.who] ?? r.who;
  const url = FILES[`../assets/voice/${dir}/${sec}_${i}.mp3`]; if (url) BY_TEXT.set(r.who + '|' + r.text, url);
});
/** act-132 / act-147: Breeze TTS 2 voice lines for hideout newcomers (卢昭 / 桓越); Four Generals trial voices removed */
const EXTRA_VOICES: Array<[string, string, string]> = [
  // Hideout: Lu Zhao & Huan Yue
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
