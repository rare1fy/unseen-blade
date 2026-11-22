// Sound cues: presentation code calls cue('clack', 0.6) at the exact frame of a beat; the audio module (step 6) maps each cue
// to layered samples with pitch / volume variation. Until then cues are recorded (QA can assert that beats fire their sounds).
export type Cue =
  | 'clack' | 'select' | 'deselect' | 'whoosh' | 'reveal' | 'count' | 'relic' | 'impact' | 'crit' | 'block' | 'armor' | 'hurt'
  | 'heal' | 'burn' | 'poison' | 'magic' | 'deny' | 'click' | 'coin' | 'win' | 'lose' | 'shatter' | 'summon' | 'curse' | 'roar' | 'tick'
  // act-19: 不见刀's own combat set (Stable Audio 3 medium, GameProtos/sfx/cues_unseen_v1.json; samples ub_<id>_<n>.mp3)
  | 'bladeFlyIn' | 'bladeFlyOut' | 'swish' | 'swishHeavy' | 'cut' | 'cutHeavy' | 'draw' | 'sheathe' | 'parry' | 'dash' | 'jump' | 'land' | 'dartThrow' | 'dartHit' | 'arrow'
  | 'bodyFall' | 'foeSwing' | 'thunder' | 'freeze' | 'iceShatter' | 'boom' | 'fuse' | 'fire' | 'potBreak' | 'crateBreak' | 'hayBurst' | 'pillarFall'
  | 'wallSlam' | 'gateOpen' | 'exitChime' | 'timeSlow' | 'dodgeOk' | 'ultSlash' | 'scroll' | 'hound'
  // act-23: the killing blow's gore (bone chop + splatter)
  | 'gore'
  // 11-18 第二轮: one composed sound per blow (five tiers), the whoosh of each cut, her breath, the blade's ring, a skid; the foes' voices
  // (x = 0 a man, 1 a big man, 2 the chief, 3 a hound), their heavy swing, a guard broken
  | 'hitLight' | 'hitStab' | 'hitHeavy' | 'hitKick' | 'hitKill' | 'hitIai' | 'swingLight' | 'swingSpin' | 'swingStab' | 'swingHeavy'
  | 'breath' | 'bladeRing' | 'skid' | 'foePain' | 'foeDeath' | 'foeCry' | 'foeHeavy' | 'guardBreak'
  // 11-18: one cut of 不见刀's burst (rapid, pitched up as it goes)
  | 'flurry'
  // 11-18 打出界: a foe knocked into the water / down a gully
  | 'splash' | 'dropFar'
  // short music (Stable Audio 3 medium, GameProtos/sfx/cues_unseen_music_v1.json): a run won, a run lost, a room cleared
  | 'stingWin' | 'stingLose' | 'stingClear' | 'stingStele' | 'stingRevive'
  // 11-18 定死的屋子的机关 (act/puzzles.ts): a bronze bell (x = which of three notes), the three at once out of tune, a hollow knock in a
  // wall, a wall caving in, a rope snapping, a bridge slamming down, a door / gate swinging open, a pressure plate's click
  | 'bell' | 'bellWrong' | 'hollow' | 'wallBreak' | 'ropeSnap' | 'bridgeDrop' | 'doorOpen' | 'plate'
  // act-114 (战斗优化第三波): spatialized off-screen high-danger sound-wave cue (x = stereo pan -1..1) & bleed-detonation burst
  | 'dangerOff' | 'bloodBurst'
  // act-122 剧情演出音效 (Stable Audio 3 medium): 对白木石轻点、藏刀阁百刃齐鸣、寒夜风雪、寒针轻啸、乱兵破门、刀劈青石
  | 'textTick' | 'bladeChorus' | 'snowWind' | 'needleZing' | 'warHorn' | 'stoneCarve';

type Handler = (name: Cue, intensity: number, extra?: number) => void;
let handler: Handler | null = null;
let muteDepth = 0;
export const cueLog: Array<{ name: Cue; intensity: number }> = [];
export function setCueHandler(h: Handler) { handler = h; }
/** Run a callback with all audio cues silenced (used by the looping 3D mini-world move preview in 招式谱). */
export function withCueMuted<T>(fn: () => T): T {
  muteDepth++;
  try { return fn(); } finally { muteDepth--; }
}
export function cue(name: Cue, intensity = 1, extra?: number) {
  if (muteDepth > 0) return;
  if (cueLog.length > 200) cueLog.shift();
  cueLog.push({ name, intensity });
  handler?.(name, intensity, extra);
}
