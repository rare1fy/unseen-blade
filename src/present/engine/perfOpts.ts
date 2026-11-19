// 11-18 微信帧率: switches for each optimisation, so the same room can be measured with and without it (__dh.opt({ ... })).
// Everything is on by default; the quality tier (look/quality.ts) sets the rest.
/** 11-18 微信小游戏: what the GPU context can do (set by gfx.ts when the renderer is made). The WeChat devtools' simulator gives a
 *  WebGL1 context without ANGLE_instanced_arrays and without float textures: instanced meshes can't draw there (three said so every
 *  frame) and neither can a SkinnedMesh (the part batches). Phones give WebGL2, or a WebGL1 with both. */
export const CAPS = { gl2: true, instancing: true, boneTex: true, /** dFdx / dFdy (the block bevel, flat shading): WebGL2, or WebGL1's OES_standard_derivatives — the devtools have neither */ derivatives: true };

export const OPT = {
  roomPacks: true, packedLighting: true, roomAhead: true, slicedRoom: true,
  foeContacts: true, bannerFaces: true, propBatch: true, mobileTargets: true, effectBudget: true, bakedShadows: true, cameraTiles: true,
  poseLod: true, cheapVoxels: true, singleMusic: true, greedyActors: true,
  /** big places cast their shadow from 12 m position-only tiles (engine/shadowTiles.ts) */
  shadowTiles: true,
  /** a character's body parts drawn as one skinned mesh per material (engine/rigidBatch.ts) */
  batch: true,
  /** the UI layer's composite only over the screen rectangles the UI covers (look/uiPass.ts) */
  uiScissor: true,
  uiBatch: true,
  pointLights: true,
  fightWarmup: true,
  dirtyUploads: true,
  staticMatrices: true,
};
