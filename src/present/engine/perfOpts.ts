// 11-18 微信帧率: switches for each optimisation, so the same room can be measured with and without it (__dh.opt({ ... })).
// Everything is on by default; the quality tier (look/quality.ts) sets the rest.
export const OPT = {
  /** big places cast their shadow from 12 m position-only tiles (engine/shadowTiles.ts) */
  shadowTiles: true,
  /** a character's body parts drawn as one skinned mesh per material (engine/rigidBatch.ts) */
  batch: true,
  /** the UI layer's composite only over the screen rectangles the UI covers (look/uiPass.ts) */
  uiScissor: true,
};
