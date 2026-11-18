// 11-18 微信帧率: switches for each optimisation, so the same room can be measured with and without it (__dh.opt({ ... })).
// Everything is on by default; the quality tier (look/quality.ts) sets the rest.
/** 11-18 微信小游戏: what the GPU context can do (set by gfx.ts when the renderer is made). The WeChat devtools' simulator gives a
 *  WebGL1 context without ANGLE_instanced_arrays and without float textures: instanced meshes can't draw there (three said so every
 *  frame) and neither can a SkinnedMesh (the part batches). Phones give WebGL2, or a WebGL1 with both. */
export const CAPS = { gl2: true, instancing: true, boneTex: true };

export const OPT = {
  /** big places cast their shadow from 12 m position-only tiles (engine/shadowTiles.ts) */
  shadowTiles: true,
  /** a character's body parts drawn as one skinned mesh per material (engine/rigidBatch.ts) */
  batch: true,
  /** the UI layer's composite only over the screen rectangles the UI covers (look/uiPass.ts) */
  uiScissor: true,
};
