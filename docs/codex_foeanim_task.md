# Codex task: make the enemies move like people, not boards (不见刀 · cx/foeanim)

Work only in this worktree (`GameProtos/unseen-blade-wt/foeanim`, branch `cx/foeanim`). Don't commit (your sandbox can't write `.git`);
leave the changes in the working tree and write `NOTES_FOEANIM.md` at the end (what changed, per file, and anything you left).
No browser is available to you — I check every result visually myself; your job is the code plus the numeric test in §6.

## 0. Why

The user (game designer, the owner): 「你整体再指挥codex优化一下敌人的动作……让敌人的动作别那么僵硬。」

What I measured on the current build (side-view frames every 80 ms, six kinds walking in and attacking):
- **Walking / running** is one fixed cycle for every humanoid foe (`bestiary/battle.ts` `poseRest`): `ph = sin(t * 11)` whatever the
  speed (feet slide), thighs ±0.8 rad with **straight knees** (shins never bend — a pair of scissors), only the left arm swings, the
  weapon arm and the whole upper body are frozen, no hip / chest twist, no lean that follows speed or acceleration, on / off by a
  boolean (`setRunning(vel > 0.6)`), so starting and stopping pop.
- **Attacks** (`bestiary/bactor.ts`, the `swing` / `slam` / `claw` / `dual` / `shoot` / cast cases): the raise to the wind-up is a
  plain ease, the chop is a `snap` to a fixed pose, the body barely takes part (no hip → chest → arm order, no step), nothing
  overshoots, the recovery is a straight blend back.
- **Hurt** is one recoil straight back (`off.z = -0.35`), always the same, no matter where the blow came from.
- **Idle** is a breath and a slow head turn, every foe in phase.

## 1. Hard rules

- **Gameplay must not change.** Do not change any Action's duration, its `at` (the moment the blow lands), wind-up times, `startAttack`
  shapes / timings, AI, damage, speeds, hitboxes, collisions. You only change how bones / `off` move *within* the same timeline.
  Telegraph readability stays: the pose at the strike moment (`k = at`) is still the strike.
- **Files you may edit:** `src/present/bestiary/battle.ts`, `src/present/bestiary/bactor.ts`, `src/present/act/foes/ly_poses.ts`,
  `src/present/act/foes/xp_poses.ts`, `src/present/act/foes/r45_pose.ts`; new files under `src/present/act/foes/` (e.g. `foe_motion.ts`
  for shared helpers, `hj_poses.ts` for 黄巾-specific layers registered through `POSE_AFTER`); in `src/present/act/enemy.ts` only the
  lines that call `f.a.setRunning(...)` (to also hand the actor its speed — see §2); in `src/present/act/show.ts` only the `__dh` debug
  list (the lab hook in §5); new test files under `tests/`.
- **Files you must not touch:** `src/present/asm/**` (another task is editing it), `src/present/act/foes/hj_models.ts` (someone is
  re-modelling the 黄巾渠帅 there — put 黄巾 pose work in a new `hj_poses.ts` instead), `src/present/act/hideout_people.ts`, every
  `*_models.ts` voxel model, `src/present/act/hero.ts` / `ninjaAct.ts` (the heroine), `CLAUDE.md`, `docs/**`.
- The hero shares `BActor` / `BattleActor`: the heroine's grip poses (`isGripHero`, `poseHero`, `poseMove`) must behave exactly as now.
  Gate every change to foes (e.g. `this.def.id` not a hero, or a `foe` flag the enemy code sets when it spawns them).
- Every foe is a 3.5 cm voxel figure on the same humanoid skeleton (`foes/fine_kit.ts`, `hj_models.ts skel()`); the hounds are `kind:
  'quad'`. Rig signs (measured): `spine` / `chest` + = bend forward; thigh (`legL` / `legR`) + = swing **back**; `shinL/R` + = knee bends;
  `footL/R` + = toes down; arm (`armL/R`) + = swing back, − = forward / up; forearm (`foreL/R`) − = elbow bends forward. `rot` / `mov`
  are additive on top of the rest pose each frame. A foe with its own full `POSE_HOOKS` (第四 / 五关, `r45_pose.ts`) still gets
  `battle.ts poseRest` on top — keep those consistent (no double run cycle).
- Machine memory is tight (other jobs run). Use `npx tsc --noEmit` and `npx vitest run <your test file>`; don't run the whole suite
  more than once at the very end, don't start dev servers or browsers.

## 2. Locomotion (the biggest win — do this first)

Give the actor its real ground speed: where `enemy.ts` calls `f.a.setRunning(f.vel.length() > 0.6)`, also set `f.a.moveSpeed =
f.vel.length()` (horizontal) and its turn rate if handy. In `battle.ts` replace the fixed cycle for foes with:

- **Distance-driven phase:** `phase += speed * dt / strideLen` (one full cycle = two steps). `strideLen` from the leg length (hip height
  `H`): walk ≈ 1.6·H, run ≈ 2.4·H, blended by speed. No foot sliding: at constant speed the planted foot stays put in world space.
- **Walk ↔ run by speed** (walk below ~2.0 m/s, run above ~3.2, blended): walk = upright (spine +0.06), arms swing ±0.35, knees in swing
  ~0.55 rad; run = lean forward (spine +0.22, chest +0.08), arms pumped (forearm −1.1), knees in swing ~1.2 rad, a short flight.
- **Knees and feet:** the swing leg's knee bends (`shin += max(0, cos(phase)) * K` for the left, `max(0, −cos)` for the right — the leg
  moving forward is the one bending); the planted leg is near straight; feet turn back towards level on the planted leg, toes down at
  push-off, toes up a little at heel strike.
- **Hips ride on the legs:** lowest at double support, highest at mid-stance — compute the hip drop from the leg angles so the planted
  foot stays on the ground (thigh / shin lengths from the bones' rest offsets; see `hideout_people.ts walkOver` for a working example of
  this: `reach = max(T·cos(tL) + S·cos(tL+kL), …)`, `mov(hips, 0, −(T+S−reach), 0)`). Run: add a little flight bounce.
- **Twist and counter-twist:** pelvis yaw ±0.10 with the stride, chest counter-yaw ∓0.14, head counter-turns to stay looking ahead.
- **Arms:** both arms swing against their legs. The weapon arm keeps its grip pose and swings at ~40%, the shield arm at ~25%; the free
  arm full. Elbows bend more in a run.
- **Lean with acceleration:** forward when speeding up, back a little when braking (smooth the speed with a short filter and use its
  derivative), banked into turns (`hips` z-rot by turn rate × speed, capped ~0.12).
- **Start / stop:** no popping — the cycle weight follows the smoothed speed; on a stop the last step settles (knees dip ~0.15 s).
- **Hounds (`kind: 'quad'`, `hj_hound`):** a trot (diagonal pairs) below ~3.5 m/s, a bounding gallop above (front pair then back pair,
  spine flexing, head bobbing), the tail lagging behind the body, distance-driven like the bipeds.
- Every foe gets its own random phase / tempo offset (±8%) so a crowd doesn't march in step.

## 3. Attacks (all humanoid cases in `bactor.ts`, and each region's own named actions in `ly_poses` / `xp_poses` / `r45_pose`)

Keep the timeline (duration and `at`); reshape the curves inside it. For every attack:
- **Anticipation:** a small counter-move before the wind-up (dip / step back / weight to the back foot), then ease *into* the wind-up
  peak; heavy ones (`slam`, the brutes, bosses) hold the peak with a slight tremble.
- **The strike, whole body, in order:** hips turn first, the chest ~0.04 later, the arm / weapon last (offset the curves in `k`, keep the
  weapon reaching its strike pose exactly at `at`). The front foot steps / plants into it, the hips drop a little, the free arm swings
  the other way for balance.
- **Follow-through:** the weapon carries 10–20% past the strike pose and settles back (no hard stop on the impact pose).
- **Recovery:** ease-out back to the idle (no linear slide), the head and free arm a beat behind.
- `snap` stays only for the 1–2 frame strike itself; everything around it eases.
- Bows / crossbows (`shoot`): breathe and settle on the aim, the release kicks the bow arm and the body back a touch.
- Casters: the gather pulls the body in (shoulders up, chest closing), the release opens it (chest forward, arms thrown).

## 4. Hurt, death, idle, secondary motion

- **Hurt:** directional — use the blow's direction (`Action.data` already carries `power`; add the hit direction where the enemy code
  calls `hurt()`, it has the hit point): recoil away from it with a twist (a blow from the left turns the chest right), a 2–3 frame
  hold, recover with a small overshoot. Two or three variants picked at random so repeated hits don't look identical; heavier power =
  a step back and a stumble.
- **Death (`fall` / `collapse` in `battle.ts`):** knees buckle first, then the body goes over (falling away from the last blow), a small
  bounce when it lands, limbs settling a beat later — no rigid board tipping over.
- **Idle:** breathing in the chest, a slow weight shift from foot to foot (hips sway, the unloaded knee bends), the weapon hand moving a
  little, the head turning toward the heroine now and then; per role a light fidget (流民 / looters nervous glances, 力士 / brutes
  rolling the shoulders, archers testing the string). Random phase per actor.
- **Secondary motion:** a tiny spring helper (per actor, critically-damped-ish, in `foe_motion.ts`) to make `hat`, `cape`, `tail`,
  topknots / ribbons and long weapon tips lag behind the body's movement and settle after stops and strikes. Use it where the bones
  exist.

## 5. A lab hook for my checks (show.ts `__dh` list only)

`foeLab(kinds: string[], opts?: { gap?: number; z?: number })`: hide everything on the stage except the lights (like `labSpawn(…, true)`
does — reuse it), put one BattleActor per model id in a row facing +x, **no AI**; `foeLabSpeed(v: number)`: all of them animate
locomotion as if moving at `v` m/s (treadmill — they stay in place); `foeLabAct(i: number, name: string, dur?: number, at?: number)`:
play an action on actor i (`attack`, `cast`, `hurt`, `fall`, `roar`, and the regions' own names); `foeLabHurtFrom(i, angleRad)`;
`foeLab([])` clears. Keep it small and self-contained.

## 6. A numeric test (`tests/foe_motion.test.ts`, vitest, no browser)

Build a `BattleActor` for `hj_blade` and `ly_halberd` (as the existing tests build actors), drive the locomotion at 1.5, 2.5 and 4.0
m/s for 2 s at 60 fps while moving the root forward at that speed, and assert: (a) **foot slide** — while a foot is the lowest one
(planted), its world position moves ≤ 3 cm per step (frame-to-frame summed over the plant); (b) the swing leg's knee bends ≥ 0.4 rad
at walk and ≥ 0.8 at run at some point in each cycle; (c) the lowest foot's height stays within ±3 cm of the standing height
(no sinking / floating); (d) the hero's pose (a `fine_white` actor) is byte-for-byte unchanged over the same frames (no regression).
`npx tsc --noEmit` and this test must pass.

## 7. Order and hand-in

Do §2 first and make it solid (with the test), then §3 for the generic `bactor.ts` cases and the regions' layers, then §4, then §5.
At the end write `NOTES_FOEANIM.md`: per file what you changed; the numbers you chose; what the test measured; anything you could not
do or are unsure of (I will look at the frames and tell you what to fix next).
