// 11-18 微信帧率: UnrealBloomPass without its last step. Its render() ends by blending the composite back over the input, full screen;
// the pixel look and the UI layer read the blurred mips themselves and set that blend's opacity to 0 — a whole-screen pass that drew
// nothing (on a 3× phone, the UI layer's was 2532 × 1170). This runs the same steps and stops at the composite
// (renderTargetsHorizontal[0]).
import * as THREE from 'three';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

interface Inner {
  fsQuad: { material: THREE.Material; render(r: THREE.WebGLRenderer): void }; clearColor: THREE.Color; nMips: number;
  highPassUniforms: Record<string, THREE.IUniform>; materialHighPassFilter: THREE.Material; renderTargetBright: THREE.WebGLRenderTarget;
  separableBlurMaterials: THREE.ShaderMaterial[]; renderTargetsHorizontal: THREE.WebGLRenderTarget[]; renderTargetsVertical: THREE.WebGLRenderTarget[];
  compositeMaterial: THREE.ShaderMaterial; bloomTintColors: THREE.Vector3[];
}
const BX = new THREE.Vector2(1, 0), BY = new THREE.Vector2(0, 1), CC = new THREE.Color();
/** bright pass + blur + composite of `src` into pass.renderTargetsHorizontal[0] (returned) */
export function bloomMips(pass: UnrealBloomPass, r: THREE.WebGLRenderer, src: THREE.WebGLRenderTarget): THREE.Texture {
  const p = pass as unknown as Inner & UnrealBloomPass; r.getClearColor(CC);
  const ca = r.getClearAlpha(), ac = r.autoClear; r.autoClear = false; r.setClearColor(p.clearColor, 0);
  p.highPassUniforms.tDiffuse.value = src.texture; p.highPassUniforms.luminosityThreshold.value = p.threshold;
  p.fsQuad.material = p.materialHighPassFilter; r.setRenderTarget(p.renderTargetBright); r.clear(); p.fsQuad.render(r);
  let input = p.renderTargetBright;
  for (let i = 0; i < p.nMips; i++) {
    const m = p.separableBlurMaterials[i]; p.fsQuad.material = m;
    m.uniforms.colorTexture.value = input.texture; m.uniforms.direction.value = BX; r.setRenderTarget(p.renderTargetsHorizontal[i]); r.clear(); p.fsQuad.render(r);
    m.uniforms.colorTexture.value = p.renderTargetsHorizontal[i].texture; m.uniforms.direction.value = BY; r.setRenderTarget(p.renderTargetsVertical[i]); r.clear(); p.fsQuad.render(r);
    input = p.renderTargetsVertical[i];
  }
  const c = p.compositeMaterial; p.fsQuad.material = c;
  c.uniforms.bloomStrength.value = p.strength; c.uniforms.bloomRadius.value = p.radius; c.uniforms.bloomTintColors.value = p.bloomTintColors;
  r.setRenderTarget(p.renderTargetsHorizontal[0]); r.clear(); p.fsQuad.render(r);
  r.setClearColor(CC, ca); r.autoClear = ac;
  return p.renderTargetsHorizontal[0].texture;
}
/** where the GPU can't render into half-float targets: the bloom's own targets in 8 bits too (set before their first use) */
export function bloom8bit(pass: UnrealBloomPass) {
  const p = pass as unknown as Inner;
  for (const t of [p.renderTargetBright, ...p.renderTargetsHorizontal, ...p.renderTargetsVertical]) t.texture.type = THREE.UnsignedByteType;
}
/** can this renderer draw into half-float colour targets? (WebGL2: EXT_color_buffer_(half_)float; WebGL1: both half-float extensions) */
export function halfFloatOk(r: THREE.WebGLRenderer) {
  const e = r.extensions;
  return r.capabilities.isWebGL2 ? e.has('EXT_color_buffer_float') || e.has('EXT_color_buffer_half_float') : e.has('OES_texture_half_float') && e.has('EXT_color_buffer_half_float');
}
