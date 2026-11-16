// 居合架势（docs/ronin/DESIGN.md §7）：浪人的居合借魔导的机制和动作骨架（纳刀 = 吟唱，拔刀 = 释放），姿势在这里改成居合的样子：
// 平时刀在鞘里（刀身藏起，只露刀柄），右手按在左腰的刀柄上，左手握住鞘口，身子压低；
// 出手（释放 / 小咒 / 攻击）的打击帧一刀横着拔出去，停一下，再收回鞘里。
// 在 poseHero / poseMove 之后调用，直接设定手臂和手腕（不是叠加），所以魔导的举杖动作不会漏出来。
import { type Bone, type Action, curve } from '../actors/rig';
import { wrist } from '../bestiary/heroPose';

/** how far the blade is out (0 = in the scabbard, 1 = the cut's follow-through) for the action playing */
function drawOf(a: Action | null): number {
  if (!a) return 0;
  const k = a.k, n = a.name;
  if (n === 'chant' && a.data.burst) return curve(k, [[0, 0], [0.72, 0], [0.78, 1], [0.93, 1], [1, 0]]);
  if (n === 'cast') return curve(k, [[0, 0], [0.5, 0], [0.58, 1], [0.86, 1], [1, 0]]);
  if (n === 'attack' || n === 'hew' || n === 'stab' || n === 'sweep') return curve(k, [[0, 0], [0.4, 0], [0.5, 1], [0.82, 1], [1, 0]]);
  return 0;
}
export function poseIai(b: Record<string, Bone>, t: number, a: Action | null) {
  const d = drawOf(a), s = 1 - d, br = Math.sin(t * 2.0) * 0.02;
  if (b.blade) b.blade.visible = d > 0.35;
  // sheathed: the right arm crosses the body to the hilt at the left hip; drawn: out to the right at shoulder height (the cut's end)
  b.armR.rotation.set(-0.30 * s - 1.35 * d + br, 0, 0.62 * s - 0.55 * d);
  b.foreR.rotation.set(-1.05 * s - 0.05 * d, 0, 0);
  wrist(b, 'R', -0.18 * s + 0.05 * d, (Math.PI - 0.25) * s - 0.95 * d);
  // the left hand on the scabbard's mouth at the hip, thumb on the guard
  b.armL.rotation.set(-0.18, 0, 0.12); b.foreL.rotation.set(-0.95 + 0.2 * d, 0, 0);
  wrist(b, 'L', 0, 0.4);
  // a lower, wider stance; the draw turns the shoulders through
  if (b.spine) b.spine.rotation.y += -0.25 * s + 0.35 * d;
}
