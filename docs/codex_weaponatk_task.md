# Codex task: every enemy attack uses its own weapon (不见刀 · cx/weaponatk)

Work only in this worktree (`GameProtos/unseen-blade-wt/weaponatk`, branch `cx/weaponatk`). Don't commit (your sandbox can't write
`.git`); leave the changes in the working tree and write `NOTES_WEAPONATK.md` at the end. No browser is available to you: I check the
visuals in the animation preview page. Read `CLAUDE.md` §1–§2 first (rules), then `docs/codex_foeanim_done.md` (how the enemy motion
layer from act-53 is built — `src/present/act/foes/foe_motion.ts`: `attackBeats`, `attackBody`, the gait), and `src/present/act/animCatalog.ts`
(the moves each enemy really plays in a fight: action name, `data.atk`, impact time `at`, duration `dur`).

## Why

The user (game designer, owner) watched every enemy in the animation preview page and said: 「现在问题主要出在敌人的攻击动作上，有好几个
敌人的攻击都没用自己的武器，看起来很不自然。」 I shot each enemy's real moves at load / impact / follow-through from the side. These are
the ones where the weapon is not used (the rest are fine — don't touch them):

| model ids | move (name / data.atk) | what it does now | what it must do |
|---|---|---|---|
| `hj_archer`, `hj_archer_e` | `attack` (no atk) | the bow stays slung on his back; both hands come up empty in front | the bow in the left hand, held out toward the target at shoulder height; the right hand draws the string back to the cheek (load), releases at the impact frame (the right hand flies back a little, the bow arm kicks), lowers after. The bow must be in the hand for the whole move (if the model hangs it on the back at rest, bring it to the hand early in the load and put it back after, or keep it in the hand whenever he is not walking — your call, say which in the notes) |
| `hj_brute`, `hj_brute_e` | `attack` / `slam` | the hammer is held upright by the head the whole time | both hands on the haft, the hammer raised high behind the head (load), brought down hard so the head strikes the ground in front of him at the impact frame (hips sink, back bends forward), held a beat, then lifted |
| `hj_brute`, `hj_brute_e` | `attack` / `sweep` | the same as the slam | both hands on the haft, the hammer drawn back to the right hip at waist height (load, the torso twisted right), swung horizontally across the front so the head passes in front of him at waist height at the impact frame, carried through to the left, recovered |
| `wl_spear`, `wl_spear_b` | `attack` / `poke` | the spear stays vertical beside him | the spear lowered to horizontal at chest height, two hands on the shaft, point toward the target (load: drawn back), driven forward with a step at the impact frame (the arms extend, the point well in front), drawn back, raised again |
| `wl_xbow`, `wl_xbow_e` | `attack` / `shoot` | the crossbow stays upright by his shoulder | the crossbow brought down to horizontal, stock to the shoulder, aimed at the target (load), the shot at the impact frame (a small kick back of the crossbow and the head), lowered after |
| `wl_xbow`, `wl_xbow_e` | `cast` | (it is his reload / second move; the crossbow stays up) | if it is the reload: the crossbow's front end down to the ground by his foot, the right hand pulls the string up (cranking motion), back up. Check in `r45_ai.ts` what this action is for before you pose it |
| `cx_sword`, `cx_sword_e` | `attack` / `poke` | the sword is held flat above the head at the impact frame | a straight thrust: the blade level at chest height, the point toward the target, the sword arm extends fully at the impact frame with the front foot stepping forward, the free hand back for balance |
| `cx_sword`, `cx_sword_e` | `attack` / `lunge` | the same, sword above the head | a long lunging thrust: deeper step, the body low and forward, the blade level, fully extended at the impact frame |
| `cx_guard`, `cx_guard_e` | `attack` / `cut` | the sword is raised over the head and is still up at the impact frame | raised over the right shoulder (load), cut down diagonally so the blade passes in front of him at the impact frame and ends low on the left (follow-through), recovered |
| `wl_shield`, `wl_shield_e` | `attack` / `lunge` | the sword stays vertical, unused | the shield forward (it covers him), the sword thrust out past the shield's edge toward the target at the impact frame, drawn back behind the shield |
| `xp_frost`, `xp_frost_e` | `sow` | the long rod is held up and not used; the free hand scatters | use the rod: swept low across the front from right to left so its tip skims the ground at the impact frame (the frost comes off the tip), or planted hard on the ground at the impact frame — pick the one that reads better from the side and from the battle camera, say which |

## Where the code is

- `src/present/bestiary/bactor.ts` — `poseFoeAttack` (act-53): the generic attack by the model's `attack` style (`swing`, `slam`, `claw`, `dual`, `shoot`, `cast`, default). Region one's archer and brute come through here; `data.atk` (`slam` / `sweep`) reaches the action — use it to give the brute two different swings.
- `src/present/act/foes/r45_pose.ts` — regions four and five (`wl_*`, `cx_*`): their attacks, picked by `data.atk`.
- `src/present/act/foes/xp_poses.ts` — region three (`xp_frost`'s `sow`).
- The models (where the weapon is, which bone holds it, how long it is): `src/present/act/foes/hj_models.ts`, the region four / five model files (find them from the ids), `xp_*` models. Each model's weapon sits on the `weapon` bone (the right hand) unless the file says otherwise; the bow / shield usually on `offhand`.
- `src/present/act/foes/hj_poses.ts` (region one's blade / chief / sickle / jar, key-framed — the user's own recent rework): a good example of a weapon-led attack; don't change it.

## Rules

- The impact frame stays where it is (`Action.at`): the damage, the warnings and the AI timing don't change. Only the poses.
- Follow the act-53 conventions (load → the hips lead → the chest → the weapon arrives on the impact frame → follow-through and settle; `attackBeats` / `attackBody`). Weight shift and a step where the table says so; the free hand does something (balance, braces the haft, holds the shield).
- No diagonal-stair artefacts, no limb through the body or the weapon through the head; the weapon hand never lets go of the weapon.
- Don't touch the other enemies, the heroine, the people of the hideout, `foe_motion.ts`'s gait, or these files that another window is working on: `engine/gfx.ts`, `look/post.ts`, `look/uiPass.ts`, `look/pixel.ts`, `scenes/stage.ts`, `look/env.ts`.
- The WeChat build is ES2015: no regex named groups / lookbehind / `s` flag, no BigInt, no variable-path dynamic `import()`.
- Memory on this machine is tight: `npx tsc --noEmit` and your own test file; the full `npm test` once at the end only.

## Checks (no browser — numbers)

Write `tests/weapon_attacks.test.ts`: for each row above, build the model (`new BattleActor(def)` as `tests/foe_motion.test.ts` does), play
the move as the game does (`new Action(name, dur, at, { atk, dist: 0.6 })` with `dur` / `at` from `animCatalog.ts`), step it to the load,
impact and follow-through times, and measure the weapon in the actor's own frame (forward = the way he faces):
- thrusts (`wl_spear` poke, `cx_sword` poke / lunge, `wl_shield` lunge): at impact the weapon's tip is ≥ 0.9 m in front of the hips
  (lunge ≥ 1.1 m) at a height between 0.8 and 1.5 m, and the weapon's long axis is within 25° of horizontal-forward;
- `cx_guard` cut: the tip is above the head at load and in front of the chest at impact (forward ≥ 0.5 m), lower at follow-through than
  at impact;
- `hj_brute` slam: the hammer head above the head at load, within 0.25 m of the ground and ≥ 0.6 m in front at impact; sweep: the head at
  0.6–1.3 m high at impact, in front (forward ≥ 0.6 m), and it moved from his right side (load) to his left (follow-through);
- `wl_xbow` shoot: the crossbow's long axis within 15° of horizontal-forward at impact, at 1.2–1.6 m;
- `hj_archer`: the bow in front of him at shoulder height (forward ≥ 0.35 m, 1.1–1.6 m) at load and impact, the right hand at least
  0.3 m behind the bow at load;
- `xp_frost` sow: whatever you chose, the rod's tip within 0.2 m of the ground at impact.

Find the weapon's tip from the model (the weapon bone, its length along the bone's axis; `ModelDef.tip` is the tip in cells along the
weapon joint's +z for most models). Put the numbers you measured in the notes as a table (load / impact / follow per move).

## Hand-in

`NOTES_WEAPONATK.md`: per file what changed; per move how it now goes (one or two lines); the table of measurements; what you could not
do. I then look at every move in the preview page from the side and the battle camera and judge.
