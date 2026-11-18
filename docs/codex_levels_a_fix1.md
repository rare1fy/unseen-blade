# Codex task: batch A, review round 1 — the rooms work, now they must look like what they are (不见刀 · cx/levels-a)

Same worktree and rules as `docs/codex_levels_a_task.md` (read its "Rules" again: no `hero.ts` / `bestiary/**` / `foes/**`, not the six files
another window owns, ES2015, platform layer, `CAPS.derivatives` for `dFdx`, memory: `npx tsc --noEmit` + your own tests, the full suite once
at the end). Don't commit; leave the changes in the working tree and write `NOTES_LEVELS_A_FIX1.md` at the end.

## What I found (I built every room and played every puzzle with real blows)

**Works, keep it exactly as it is:** the plate (on → gate opens, off → stays 5 s, shuts), the wheel (four blows → drains in 1.5 s → floor), the
hollow wall (three blows → open → the reward inside), the oil jar (one blow → the barricade burns), the bells (the order plays, struck in order →
the granary gate opens), the stages, the calm yards' stations, region-level picking. 打谷场 and the two yards look right. Don't change the maps'
layouts (the ASCII) or any puzzle's logic.

**Does not look right** (the attached pictures: `lvA_cam.jpg`, `lvA_cam2.jpg` — the battle camera on the left, a higher oblique view on the
right; `cam_fallen_hall.png`; `bt.jpg` — a bell tree from the battle camera and up close):

1. **铸钱场's molten pit is one flat red-orange rectangle.** No edge, no crust, no light on anything round it, nothing moving. It reads as a
   placeholder, not molten bronze. The two bridges are plain planks; the two minting presses (`o`) don't read as presses; the room is a big dark
   empty square.
2. **Region two's `#` blocks read as empty low-wall boxes** — 铜驼大街, 焦砖小院, 宫道长廊: a ring of low wall with bare floor inside. They
   must read as burnt, half-fallen houses / ruins filling the whole block. `ly_infill.ts` places too little.
3. **铜驼大街's toppled bronze camel (`0`) is not there to the eye** — a small green lump. It is the street's landmark and its big cover.
4. **塌殿's two caved-in holes are neat rectangular trenches with a light bluish floor** — they read as pools or drains, not as a hall's floor
   that fell in. And the "hall" reads as an open yard with thin posts, not a palace hall with columns.
5. **The bells on 打谷场's trees can't be seen from the battle camera**: each bell hangs under the canopy, inside the tree's silhouette.
6. **Fog**: 宫道长廊 (mist) and 塌殿 (rain) wash out the far half of the room from the battle camera, and everything from the higher view.

## What to do

### 1. The molten pit (`shapeBuild.ts`, `'molten'`)
- **Surface**: not one colour. A base of dark red-orange (≈ `0xc8401a`), big bright seams / cracks of orange-yellow (≈ `0xffb040`, emissive),
  and **floating crust**: a handful of big dark slabs (≈ `0x3a2622`, `0x5a3420`), axis-aligned plates of 1–3 m, not per-cell speckle. A
  **dark crust rim** one cell (or half a cell) wide round the pit's edge — the slag cooled against the stone — with the glow showing in thin
  bright lines where it meets the molten surface.
- **The drop**: the floor's stone edge stands visibly above the surface (the surface ≈ 0.5–0.7 m below floor level), the lip's inner face lit
  orange from below.
- **Life**: the seams' brightness breathes slowly (≈ 0.8–1.0 over ~2.5 s, not in sync across the pit); embers rise all the time (a few per
  second over the pit); now and then a bubble bursts (a small ring + a spark burst) at a random spot, every 1–2 s. Use the existing FX
  (`fxEmbers`, `fxRing`, `fxFlare`, …) — no new post-process (`look/post.ts` is not yours).
- **Light round it**: the floor near the pit, the bridges' undersides and the nearest walls tinted warm. If the scene has a way to add a warm
  point light (find how braziers / torches light their surroundings), use one or two; otherwise vertex-colour the floor cells within ~2 m of the
  pit warmer. Say which.
- **Bridges** (`=`): stone, in the 铸钱场's own kit's colours, with a low curb or iron chain posts along both sides, scorched dark near the pit.
- **The presses (`o`)**: a minting press reads as a big timber frame (two posts, a heavy cross-beam, a screw / ram in the middle) on a stone
  block, ≈ 2 × 2 m and 2.2 m tall, with a stack of coin moulds / bronze ingots by it. Also along the walls: a few furnaces / crucibles, ingot
  stacks, coal heaps — the 铸钱场 kit (`luoyang/ly_mint.ts`) already has some of this; use it.

### 2. Region two's infill (`luoyang/ly_infill.ts`) — every `#` block filled
- From the battle camera **no bare floor may show inside a `#` block**. Fill each block with the ruin of what stood there: a stone /
  rammed-earth base course along its edges; charred timber posts at corners and along the edges (1.5–2.5 m, some broken short); fallen beams
  lying **axis-aligned** across it; **heaps of fallen roof tiles** and rubble as big flat-topped masses in 2–3 tiers (no stair-step diagonals,
  no per-cell speckle — see `docs/LEVEL_DESIGN.md` and the user's rule: big masses, few tiers); a few half-standing wall pieces with the
  place's colour (the red-lacquered 坊墙 of `ly_ward`, the grey brick of `ly_road`); soot-black and ash-grey, a few small dim ember spots
  (emissive) in 铜驼大街 and 焦砖小院 (burnt not long ago).
- The height rule stays the same as `hanmo/hj_infill.ts` (don't hide the floor behind a block from the battle camera — read how it does it and
  do the same); within that, fill the block's area.
- Vary block to block by the map's seed (which ruin goes where), but the same every time for the same map.
- 宫道长廊's blocks are palace-ward buildings (`ly_ward`): red walls, grey roof-tile heaps, a fallen 斗拱 or two.

### 3. The toppled bronze camel (`0` in 铜驼大街)
A big, recognisable bronze camel lying on its side, ≈ 3.5–4 m long and ≈ 1.6 m high as it lies, the humps and the long neck readable from the
battle camera; green-bronze patina (≈ `0x4a7a62`, `0x6a9a7a`, darker `0x2f4f40`, a little bright bronze `0xb08a3a` where it is worn); its broken
stone plinth beside it. It is cover: its collision covers its body (about 2 × 1 cells, or as its footprint needs — keep floor widths ≥ 3 cells
round it; if the map's `0` cell needs a neighbour to hold it, adjust the cover's footprint, not the map's layout).

### 4. 塌殿 — a fallen-in palace hall
- **The holes**: a caved-in floor — **dark** depth (the bottom near black-brown, not a lit floor), the rim **broken**: big chunks of floor slab
  standing proud or sunk by 0.1–0.25 m along the edge (axis-aligned, a few big pieces, not speckle), a fallen roof beam lying across each hole
  (decoration, not a bridge — keep it out of the walkable grid), dust.
- **The hall**: the floor in big stone tiles (the palace's), the `t` / `o` as **thick red-lacquered columns** (≈ 0.6 m square, on stone bases),
  some broken off at different heights, the fallen pieces lying by them; at the room's back, the remains of the hall's back wall. It should read
  as the inside of a great hall whose roof has gone.
- The sluice's water channel stays as it is (it reads fine).

### 5. The bells on the trees (`puzzles.ts` `bell()` with `bellTrees`)
Hang each bell from a low branch that reaches out **toward the camera (+z)**, so the bell hangs **in front of and below the canopy**: its mouth
at ≈ 1.2–1.4 m, the bell ≈ 0.5 m tall, polished bronze (≈ `0xc8902a`, highlight `0xf0c060`, dark `0x8a5a1a`), a red cord. Check it numerically:
from the battle camera's usual offset (`TUNE.camH`, `TUNE.camD` from the bell), the bell's centre must not be inside the canopy's box as seen
along the view ray (a test).

### 6. Fog
宫道长廊: `weather: 'clear'` (dusk stays). 塌殿: keep the rain if the rain can be had without the heavy ground mist; otherwise `'clear'` at
dawn. From the battle camera the far wall of each room must be readable.

## Budget and checks
- Draw calls: merge the infill and the dressing into the room's static voxel geometry (as `hj_infill.ts` does) — a room must not grow more than
  ~15 draw calls over batch one's rooms. Say what you merged.
- No change to the walkable grid except the camel's footprint if it needs it (keep every test of `tests/roomMaps.test.ts` passing; add one for
  the bell visibility and one that every `#` block of region two's maps gets infill covering ≥ 60 % of its cells' area).
- Hand-in `NOTES_LEVELS_A_FIX1.md`: per item what you did, the colours and sizes you used, what you merged, what you could not do.
