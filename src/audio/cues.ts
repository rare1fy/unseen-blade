// Sound cues: presentation code calls cue('clack', 0.6) at the exact frame of a beat; the audio module (step 6) maps each cue
// to layered samples with pitch / volume variation. Until then cues are recorded (QA can assert that beats fire their sounds).
export type Cue =
  | 'clack' | 'select' | 'deselect' | 'whoosh' | 'reveal' | 'count' | 'relic' | 'impact' | 'crit' | 'block' | 'armor' | 'hurt'
  | 'heal' | 'burn' | 'poison' | 'magic' | 'deny' | 'click' | 'coin' | 'win' | 'lose' | 'shatter' | 'summon' | 'curse' | 'roar' | 'tick';

type Handler = (name: Cue, intensity: number, extra?: number) => void;
let handler: Handler | null = null;
export const cueLog: Array<{ name: Cue; intensity: number }> = [];
export function setCueHandler(h: Handler) { handler = h; }
export function cue(name: Cue, intensity = 1, extra?: number) {
  if (cueLog.length > 200) cueLog.shift();
  cueLog.push({ name, intensity });
  handler?.(name, intensity, extra);
}
