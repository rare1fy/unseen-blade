// UI 与场景的分层参数。像素量以 720 高度为基准，按实际绘制缓冲高度缩放。
import * as THREE from 'three';
import { dh } from '../../debug/dh';

export const UI_LOOK = {
  /** false 恢复本次处理前的合成，便于同帧对比；曝光与辉光仍可单独调节。 */
  enabled: true,
  exposure: 1.0,
  bloom: 0.9, bloomRadius: 0.45, bloomThreshold: 1.4,
  ink: 0.85, inkW: 2, inkColor: new THREE.Color(0.035, 0.025, 0.02),
  // tuned by screenshot 2026-11-13: a soft dark halo around every UI piece (no offset) separates UI from the busy scene best
  shadowStrength: 0.7, shadowX: 0, shadowY: 3, shadowBlur: 16,
  /** 从屏幕顶端起算的归一化位置；其余强度均为 0～1。 */
  bandStart: 0.72, bandStrength: 0.45, bandDesaturation: 0.3,
  cornerStrength: 0.25, cornerX: 0.09, cornerY: 0.12,
  cornerRadiusX: 0.22, cornerRadiusY: 0.25,
  vignette: 0.1,
  /** 骰子读数带免受新增的背景压暗与去饱和影响，上下羽化各 20/720。 */
  diceTop: 430 / 720, diceBottom: 520 / 720, diceFeather: 20 / 720,
};
dh.add({ uiLook: UI_LOOK });

export const uiSceneUniforms = () => ({
  uUiBand: { value: new THREE.Vector3() },
  uUiCorner: { value: new THREE.Vector4() },
  uUiDim: { value: new THREE.Vector2() },
  uUiDice: { value: new THREE.Vector3() },
});

const unit = (n: number) => THREE.MathUtils.clamp(n, 0, 1);
export function updateUiSceneUniforms(u: Record<string, THREE.IUniform>, active: boolean) {
  const p = UI_LOOK, on = active && p.enabled;
  (u.uUiBand.value as THREE.Vector3).set(THREE.MathUtils.clamp(p.bandStart, 0, 0.9999), on ? unit(p.bandStrength) : 0, on ? unit(p.bandDesaturation) : 0);
  (u.uUiCorner.value as THREE.Vector4).set(p.cornerX, p.cornerY, Math.max(0.001, p.cornerRadiusX), Math.max(0.001, p.cornerRadiusY));
  (u.uUiDim.value as THREE.Vector2).set(on ? unit(p.cornerStrength) : 0, on ? unit(p.vignette) : 0);
  const top = unit(Math.min(p.diceTop, p.diceBottom)), bottom = unit(Math.max(p.diceTop, p.diceBottom));
  (u.uUiDice.value as THREE.Vector3).set(top, bottom, Math.max(0.0001, p.diceFeather));
}

// 在世界色调映射 / sRGB 转换后执行，使 35% 对应最终显示亮度的实际降幅；UI 随后独立合成。
export const UI_SCENE_GLSL = `
uniform vec3 uUiBand, uUiDice;
uniform vec4 uUiCorner;
uniform vec2 uUiDim;
vec3 separateUiBackground(vec3 col, vec2 uv) {
  vec2 p = vec2(uv.x, 1.0 - uv.y);
  float dice = smoothstep(uUiDice.x - uUiDice.z, uUiDice.x, p.y)
             * (1.0 - smoothstep(uUiDice.y, uUiDice.y + uUiDice.z, p.y));
  float allowed = 1.0 - dice;
  float band = smoothstep(uUiBand.x, 1.0, p.y) * allowed;
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(col, vec3(luma), band * uUiBand.z);
  float corner = 1.0 - smoothstep(0.0, 1.0, length((p - uUiCorner.xy) / uUiCorner.zw));
  // 归一化椭圆，任意宽高比下只在边缘渐变，不覆盖中央战场。
  float vig = smoothstep(0.45, 1.0, length((p - 0.5) * 1.41421356));
  return col * (1.0 - band * uUiBand.y)
             * (1.0 - corner * uUiDim.x * allowed)
             * (1.0 - vig * uUiDim.y * allowed);
}`;
