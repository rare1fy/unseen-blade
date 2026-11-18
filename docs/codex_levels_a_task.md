# Codex task: drawn rooms, batch A — the engine's gaps, region one's 打谷场 and yard, region two in full (不见刀 · cx/levels-a)

Work only in this worktree (`GameProtos/unseen-blade-wt/levels_a`, branch `cx/levels-a`). Don't commit (your sandbox can't write `.git`);
leave the changes in the working tree and write `NOTES_LEVELS_A.md` at the end. No browser is available to you: I build every room, look at
it from above and through the battle camera, play every puzzle with real blows and run the bot — so your hand-in must say exactly how to
reach each room (`__dh.room(id)`) and where each puzzle piece is.

Read first, in this order:
1. `CLAUDE.md` §1–§2 (rules, platform rules, the WeChat ES2015 build) and the last entries of §4.
2. `docs/LEVEL_DESIGN.md` — the design the user approved (Chinese). §2 general rules, §3 the six puzzles, §4 the maps, **§6 how batch one was
   built (the format as it really is)**.
3. The engine as it is now: `src/present/asm/roomMaps.ts` (maps → `ShapePlan`; the three rooms of batch one are the reference),
   `src/present/asm/roomShape.ts` (`FixedPlan`, `FloorGrid`: `set`, `zones`), `src/present/asm/shapeBuild.ts` (walls follow the floor's
   outline; pits; bridges; the flooded causeway), `src/present/asm/arena.ts` (`drawnPlan`), `src/present/asm/exits.ts` (`drawnExits`,
   `Layout.drawn`), `src/present/act/puzzles.ts` (`RoomPieces`: doors, hollow walls, barricades, drop-bridges, bells, rewards),
   `src/present/act/show.ts` (search `定死的屋子`: `prepRoom`'s map pick, the stages, `spawnWave`'s zone, `reward()`, the bot walking on),
   `tests/roomMaps.test.ts`.

## Why

The user, after seeing top-down renders of every room: 「这关卡形态确实严重雷同和不够」「我是觉得关卡设计得可以再大点，结构丰富点，甚至可以
加点小解密元素」「还不如都做成几种确定的造型，避免不稳定因素」. Batch one (me) built the engine and three rooms; now:
「之前说的阔图和解密元素可以安排一下了，让codex astra 6.2做，你来审核和指导。」

## Batch A scope

### A1. Engine

1. **压板 (pressure plate, `P`)** in `puzzles.ts`: a flat stone slab flush with the floor (raised one cell, a dark seam round it). Its gate
   (`G`, the nearest one in the same zone or across from it — say how you pair them) is open while something stands on it: a foe (alive,
   knocked or thrown onto it — use the foes' positions) or the heroine; when she steps off it stays open 5 s more, then shuts again (a body
   in the gate's cells when it shuts is pushed out to the near side, never trapped). The plate clicks down (`cue('plate')` exists), a ring
   of sound runs from the plate to its gate, the gate's lock rattles while it is held. Hint: a faint ring at the plate every 2.5 s while
   she is within 7 m and it is up.
2. **开闸 (sluice, `W` + `w`)**: the wheel (a timber frame, a spoked wheel on an axle) at `W`. Holding attack within 1.2 m of it for 1 s
   turns it (she faces it; the hold is the existing attack-hold input — find how `藏锋` reads the held button and use a separate state so
   it does not start the stance there; or count repeated blows on the wheel, 4 within 3 s — say which you chose and why). Then the water
   over the `w` cells (today drawn as nothing: `shapeBuild`'s `'flood'` lays the causeway at y = −1 and leaves the water to the puzzle)
   drains over 1.5 s — a water plane at y −0.2 sinking and fading, bubbles — and those cells become floor (`grid.set`). Before it turns,
   bubbles rise from the `w` water every 2 s (the hint), and the wheel creaks when she is near.
3. **Choosing a room by region, not by place**: `pickMap(locale, …)` takes the maps of one locale, so a place with one map repeats it.
   Make it take the maps of every fight locale of the room's region (`regions/rN.ts` `locales`), not repeating within a run while others
   are left; the room's locale (`spec.locale`, and the banner's place name, and `this.locale` for whatever reads it) becomes the map's.
   Elite rooms (死士) use the same fight maps.
4. **Boss arenas from a map**: `kind: 'boss'` maps are used for the region's boss room (the boss stands at `B` — already wired in
   `spawnWave`); the region's other boss-room code (phases, its adds) unchanged.
5. **Calm yards**: `kind: 'calm'` — one small fixed yard per region for 行商 / 歇脚 / 遗卷. The stations (`act/stations.ts`) stand where the
   map says: add a mark (e.g. `C` = the stations' centre; check `Stations` for how far they spread and size the yard for it). One exit or
   two by the same rules as fight rooms.
6. **Infill for every place** (`Locale.infill`, called by `assemble.ts` on each solid rect): today only `hj_village` and `hj_field` have it, so
   a `#` block anywhere else is bare ground. Add infill for region two's places (`ly_road`, `ly_ward`, `ly_mint`) in their own look — burnt
   half-fallen houses, beams, broken roof tiles, rubble heaps, a toppled 铜驼 for 铜驼大街 — using those places' own kits
   (`src/present/asm/luoyang/`). Rules (the same as `hanmo/hj_infill.ts`): a block that borders the floor on its far side gets nothing
   tall on that side (it would hide the floor from the battle camera); tall things in the half nearer the camera; no stair-step diagonals,
   no per-cell random speckle; big flat masses, a few tiers.

### A2. Rooms (from `docs/LEVEL_DESIGN.md` §4 — the drawings there are sketches: their sizes and character counts don't match; redraw
### each at the stated size with **1 character = 1.96 m** and every row the same width, keeping its character)

| id | name | region / place | kind | what it is (see LEVEL_DESIGN §4) |
|---|---|---|---|---|
| `threshing` | 打谷场 | 1 · `hj_field` | fight | one big floor + a side yard behind a door; a granary on one side; three bells on three trees — the bells open the granary (`G`), reward inside |
| `yard_1` | (第一关小院) | 1 · `hj_village` | calm | a small walled farmyard with a well; the stations' place |
| `palace_road` | 宫道长廊 | 2 · `ly_ward` | fight | two stages along a long road; a side hall that opens with a pressure plate (optional, reward); the stage door between the two |
| `fallen_hall` | 塌殿 | 2 · `ly_ward` | fight | one floor, three rows of pillars (`t` / `o`), two caved-in holes (pits, death), a hollow wall at the back with a hidden room |
| `bronze_street` | 铜驼大街 | 2 · `ly_road` | fight | a wide street cut into lanes by fallen houses and rubble, the toppled bronze camel as big cover (`0`); a back lane shut by a barricade with an oil jar next to it (the shortcut + reward) |
| `mint` | 铸钱场 | 2 · `ly_mint` | boss | a molten pit in the middle (death), a ring of floor, two minting presses as cover, two narrow bridges over the pit; 阎虎 (mounted charges) at `B` |
| `yard_2` | (第二关小院) | 2 · `ly_road` | calm | a burnt courtyard |

Every fight room: 1–2 puzzles at most (most optional, giving a reward; a gating one must announce itself and can never soft-lock: if the
room is clear and she has not solved it after 20 s, its hint grows — a brighter ring every 2 s), ≥ 2 exits (`E` on the box's edge),
`S` near the front (the camera side, +z), floor width ≥ 3 cells wherever a body passes, no 1-cell slivers. Sizes 34–48 m on the long side.
Time of day / weather per room as fits (the region's season stays). The 铸钱场's molten pit: the pit kind needs a glowing molten look —
add a `'molten'` `PitKind` (orange-red surface, a dark crust edge, a glow, embers rising; a foe knocked in burns) in `shapeBuild.ts`.

### A3. Not in this batch

Regions three to five's rooms (batch B), the 破庙 boss arena and the prologue's re-staging (batch C), the puzzle pieces' final art (simple
voxel stand-ins are fine, but they must read as what they are from the battle camera: a slab, a wheel, a gate, a bell).

## Rules

- Everything in a drawn room is fixed (the same every time); the decoration uses the map's own seed.
- Don't change the fight itself (foes, the heroine, damage, AI) beyond spawn positions by zone (already done) and the plate reading foe
  positions. Don't touch `src/present/act/hero.ts`, `bestiary/**`, `foes/**`, and not these files another window owns:
  `engine/gfx.ts`, `look/post.ts`, `look/uiPass.ts`, `look/pixel.ts`, `scenes/stage.ts`, `look/env.ts`.
- WeChat is the main platform: new code goes through the platform layer (no DOM, no `window` events as the only way in, no localStorage);
  the WeChat build is **ES2015** — no regex named groups / lookbehind / `s` flag / `\p{}`, no BigInt, no variable-path dynamic `import()`.
  Shaders: if you write one that uses `dFdx` / `dFdy`, guard it with `CAPS.derivatives` (`engine/perfOpts.ts`).
- New player-facing text (a banner, a place name) needs its English in `src/present/act/en.json` — `npx vitest run tests/i18n.test.ts`
  lists what is missing (names after `docs/ENGLISH_GLOSSARY.md`). Puzzles show no text: sound and rings only.
- Performance: a room's draw calls must not grow more than ~15 over batch one's rooms; merge static puzzle geometry where you can.
- Memory on this machine is tight: `npx tsc --noEmit` and your own test files; the full `npm test` once at the end only.

## Tests (vitest, no browser) — extend `tests/roomMaps.test.ts`

For every new map the existing per-map checks must pass (the map sound; everything reachable once open; S's zone has no exit when there are
stages; each stage's zone holds a wave; widths ≥ 3 cells; built twice the same; exits on the edge; cover and props on the floor).
Add: the plate opens its gate with a foe position on it and shuts 5 s after the heroine leaves (unit-test `RoomPieces` with a fake grid
— `new RoomPieces(new THREE.Group(), shape, new FloorGrid(shape), style, seed)` works without a renderer); the sluice drains the `w` cells
to floor; region-level picking takes every fight map of a region before repeating; calm and boss maps are picked for those rooms.

## Hand-in — `NOTES_LEVELS_A.md`

Per file what changed; each new map as built (the ASCII, its size in metres, where its puzzles and rewards are, how many stages); how the
plate and the sluice are played; how to reach each room (`__dh.room(id)`, `__dh.puzzle()`, `__dh.solve(i)`); the test results; what you
could not do or chose differently from the design and why.
