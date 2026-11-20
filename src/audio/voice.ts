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
