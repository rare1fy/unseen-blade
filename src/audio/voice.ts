// act-37 (用户：「台词已经出了最新版了，用breeze生成一下配音」): the voiced lines (Breeze TTS 2, GameProtos/voice/gen_unseen.py →
// src/assets/voice/<who>/<section>_<index>.mp3). A line is found by who said it and its exact text (the pools keep only the text), so
// the script stays as it is; a line with no clip is simply silent. Clips are decoded the first time they are needed.
import SCRIPT from '../present/act/scriptData.json';
import { audio } from './audio';
import { dh } from '../debug/dh';

const FILES = import.meta.glob('../assets/voice/*/*.mp3', { eager: true, query: '?inline', import: 'default' }) as Record<string, string>;
const BY_TEXT = new Map<string, string>();
for (const [sec, rows] of Object.entries(SCRIPT as Record<string, Array<{ who: string; text: string }>>)) rows.forEach((r, i) => {
  const url = FILES[`../assets/voice/${r.who}/${sec}_${i}.mp3`]; if (url) BY_TEXT.set(r.who + '|' + r.text, url);
});
/** say this line if there is a clip for it (stops the line before) */
export function sayLine(who: string, text: string) { const url = BY_TEXT.get(who + '|' + text); if (url) void audio.voiceLine(url); else audio.stopVoice(); }
export const voicedLines = () => BY_TEXT.size;
dh.add({ voiced: () => BY_TEXT.size, voicing: () => audio.voicing });
