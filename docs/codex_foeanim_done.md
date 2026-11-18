# Foe animation hand-in

## Changes by file

- `src/present/act/foes/foe_motion.ts` solves biped knees and hips from distance-driven foot targets, keeps the stance sole level, and adds a flight interval to the run. It also handles the hound trot and bound, anticipation and follow-through curves, directional hurt, fall and collapse, idle weight shifts, and accessory springs.
- `src/present/bestiary/battle.ts` applies the gait and reaction layers to enemy roster models. It keeps the final fall pose after the action ends and exposes a preserved projectile origin for the region-four oil jar.
- `src/present/bestiary/bactor.ts` reshapes swing, slam, claw, dual, shoot, cast, and the hound pounce around the existing impact markers. It reads the existing knockback impulse for recoil direction and accepts an exact local angle for lab hits.
- `src/present/act/enemy.ts` hands off horizontal speed, heading toward the heroine, and a read-only velocity reference at the four existing `setRunning` call sites.
- `src/present/act/foes/ly_poses.ts` reshapes the halberd, shield, crossbow, torch, looter, mounted stomp, and boss attacks. The two-hand grips follow the stride, mounted cadence follows distance, and the axe chop shares its planted pose with the stuck-axe action.
- `src/present/act/foes/xp_poses.ts` aligns the backstabs, blowpipe, sow, rise, chain attacks, needle fan, snip, and burst to their supplied impact markers. Stalk and flee use the shared distance-driven steps.
- `src/present/act/foes/r45_pose.ts` removes the second run cycle and reshapes the spear, chain, oil, crossbow, shield, sword, club, and boss attacks. The oil throw keeps its original hand anchor for the jar trajectory and flight time.
- `src/present/act/show.ts` adds the four foe lab hooks in the debug list. The lab uses the bare floor and stage lights, spawns preview actors without AI, and restores visibility when cleared.
- `tests/foe_motion.test.ts` measures foot contact and knees over 120 frames at each speed and checks the original heroine pose and oil-jar origin. It also checks strike lead and follow-through, recoil direction, and the order of the fall.

## Motion settings

- The stride covers 1.6 hip heights at a walk and 2.4 at a run, with an actor-specific factor of 0.92–1.08. The gait blends from 2.0 to 3.2 m/s, with a 75 ms speed filter and a 150 ms settling dip. At full run, each foot has 45% stance time per cycle. The flight arc adds up to 1.8 cm of lift. The hound blends from diagonal trot to bounding pairs over 3.15–3.85 m/s.
- Pelvis and chest yaw reach about ±0.10 and ∓0.14 rad respectively. Free-arm swing grows from ±0.35 to ±0.61 rad. Weapon arms retain 40% and shield arms 25% of the free-arm swing. The turn bank is capped at ±0.12 rad.
- The chest can start 40 ms ahead of the weapon and the hips up to 80 ms ahead. The final strike segment is up to 28 ms. The weapon reaches the strike pose at `Action.at` and can carry 15% past it during the next 80 ms. Hurt holds the recoil for up to 45 ms before rebounding. The accessory springs use damping rates of 12–21 s⁻¹.

## Verification

Each fixture starts at its specified constant speed and advances the root for 2 s at 60 fps. Slide is the summed 3D motion of the ankle during each continuous plant. Plant frames use the lowest sole mesh vertex and a 0.1 mm contact tolerance. Height error uses the lowest rendered sole on every frame, including flight. The knee column reports the smallest peak across complete cycles.

| Rig | Speed | Max slide per plant | Max sole height error | Min peak knee | Ground contact |
| --- | ---: | ---: | ---: | ---: | ---: |
| `hj_blade` | 1.5 m/s | 0.000 cm | 0.000 cm | 0.613 rad | 120/120 |
| `hj_blade` | 2.5 m/s | 0.000 cm | 0.642 cm | 0.896 rad | 117/120 |
| `hj_blade` | 4.0 m/s | 0.005 cm | 1.415 cm | 1.248 rad | 103/120 |
| `ly_halberd` | 1.5 m/s | 0.000 cm | 0.000 cm | 0.608 rad | 120/120 |
| `ly_halberd` | 2.5 m/s | 0.000 cm | 0.000 cm | 0.892 rad | 120/120 |
| `ly_halberd` | 4.0 m/s | 0.000 cm | 1.051 cm | 1.235 rad | 104/120 |

`npx tsc --noEmit` passed. All 10 tests in `tests/foe_motion.test.ts` passed in a single Vitest worker, including the byte-for-byte `fine_white` baseline over 360 frames. The Vitest CLI was blocked before collection by Windows sandbox permissions while esbuild tried to load `vite.config.ts`. The run used Vitest’s Node API with the project’s alias, Three.js deduplication, and voxel-file loader supplied inline. No browser, dev server, full-suite run, or commit.

## Lab and remaining checks

`__dh.foeLab(['hj_blade', 'ly_halberd', 'hj_hound'])` sets out a row. `__dh.foeLabSpeed(4)` runs it in place. `__dh.foeLabAct(1, 'thrust')` plays the halberd strike. `__dh.foeLabHurtFrom(0, Math.PI / 2)` delivers a blow from the actor’s left. `__dh.foeLab([])` clears the lab.

Live combat direction is inferred from the existing velocity impulse because the permitted lines in `enemy.ts` do not include the hit call. Steering before the next pose update can skew the estimate. Hits without a measurable impulse use the last known direction or the facing target. The new knee buckle and landing bounce apply to `BattleActor.fall()` and `collapse()`. Room kills still go through the separate `playDeath` knock-down and shatter path in `src/present/v2/death.ts`.

The numeric checks cover steady, straight travel on the two requested rigs. Hard turns, acceleration, the hound and mounted gait, weapon arcs, and the lab stage still need a visual pass.
