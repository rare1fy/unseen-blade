// Sound cues: presentation code calls cue('clack', 0.6) at the exact frame of a beat; the audio module (step 6) maps each cue
// to layered samples with pitch / volume variation. Until then cues are recorded (QA can assert that beats fire their sounds).
export type Cue =
  | 'clack' | 'select' | 'deselect' | 'whoosh' | 'reveal' | 'count' | 'relic' | 'impact' | 'crit' | 'block' | 'armor' | 'hurt'
  | 'heal' | 'burn' | 'poison' | 'magic' | 'deny' | 'click' | 'coin' | 'win' | 'lose' | 'shatter' | 'summon' | 'curse' | 'roar' | 'tick'
  // act-19: 不见刀's own combat set (Stable Audio 3 medium, GameProtos/sfx/cues_unseen_v1.json; samples ub_<id>_<n>.mp3)
  | 'swish' | 'swishHeavy' | 'cut' | 'cutHeavy' | 'draw' | 'sheathe' | 'parry' | 'dash' | 'jump' | 'land' | 'dartThrow' | 'dartHit' | 'arrow'
  | 'bodyFall' | 'foeSwing' | 'thunder' | 'freeze' | 'iceShatter' | 'boom' | 'fuse' | 'fire' | 'potBreak' | 'crateBreak' | 'hayBurst' | 'pillarFall'
  | 'wallSlam' | 'gateOpen' | 'exitChime' | 'timeSlow' | 'ultSlash' | 'scroll' | 'hound'
  // act-23: the killing blow's gore (bone chop + splatter)
  | 'gore'
  // 11-18 第二轮: one composed sound per blow (five tiers), the whoosh of each cut, her breath, the blade's ring, a skid; the foes' voices
  // (x = 0 a man, 1 a big man, 2 the chief, 3 a hound), their heavy swing, a guard broken
  | 'hitLight' | 'hitStab' | 'hitHeavy' | 'hitKick' | 'hitKill' | 'hitIai' | 'swingLight' | 'swingSpin' | 'swingStab' | 'swingHeavy'
  | 'breath' | 'bladeRing' | 'skid' | 'foePain' | 'foeDeath' | 'foeCry' | 'foeHeavy' | 'guardBreak'
  // 11-18: one cut of 不见刀's burst (rapid, pitched up as it goes)
  | 'flurry'
  // short music (Stable Audio 3 medium, GameProtos/sfx/cues_unseen_music_v1.json): a run won, a run lost, a room cleared
  | 'stingWin' | 'stingLose' | 'stingClear' | 'stingStele' | 'stingRevive';

type Handler = (name: Cue, intensity: number, extra?: number) => void;
let handler: Handler | null = null;
export const cueLog: Array<{ name: Cue; intensity: number }> = [];
export function setCueHandler(h: Handler) { handler = h; }
export function cue(name: Cue, intensity = 1, extra?: number) {
  if (cueLog.length > 200) cueLog.shift();
  cueLog.push({ name, intensity });
  handler?.(name, intensity, extra);
}
