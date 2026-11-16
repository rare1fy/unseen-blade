// 出口（act-19，用户：「通道没有特效提示，通道看起来也不像是通道」→ 门洞 + 声纹）：这一间要走的门洞里横着一排木栅；
// 清场后木栅往外倒下、扬尘，门洞里亮一层淡金光幕（底亮上淡，克制），地上从门口一圈圈往场内扩淡金色声纹（敌人预警是红的，
// 出口是金的——主角是瞎子，他「听」见门外的风）。墙、门柱、门楣是场景体素（asm/arena.ts），这里只管会动的部分。
import * as THREE from 'three';
import { VoxWorld } from '../look/voxkit';
import { CELL } from '../bestiary/kit';
import { V3 } from '../engine/world';
import { fxSmoke } from '../fx/fx';
import { shake } from '../engine/clock';
import { cue } from '../../audio/cues';
import type { ArenaPlan, Gate } from '../asm/arena';

const GOLD = 0xffd27a;
/** a barricade: three horizontal logs across the opening, two stakes holding them; built along x, centred, standing on y = 0 */
function barricade(w: number) {
  const vw = new VoxWorld(CELL), half = Math.round(w / CELL / 2) + 2, wood = 0x6e5238, woodD = 0x4a3622, woodL = 0x8e6e4c, rope = 0x8a7650;
  for (const [y0, k] of [[1, 0], [7, 1], [13, 2]] as const) { vw.box(-half, y0, -1, half, y0 + 3, 1, k === 1 ? woodL : wood); vw.box(-half, y0, -1, half, y0, 1, woodD); vw.box(-half, y0 + 3, -1, -half, y0 + 3, 1, woodD); }
  for (const s of [-1, 1]) { const x = s * (half - 5); vw.box(x - 1, 0, -2, x + 1, 19, -2, woodD); vw.box(x - 1, 0, 2, x + 1, 19, 2, woodD); for (const y of [4, 10, 16]) vw.box(x - 1, y, -2, x + 1, y, 2, rope); }
  const g = new THREE.Group(); for (const m of vw.build({ rim: 0.3, edge: 0.16 })) g.add(m); return g;
}
const CURTAIN_FS = `uniform vec3 uCol; uniform float uT, uK; varying vec2 vUv;
void main() { float y = vUv.y, s = 0.75 + 0.25 * sin(uT * 1.7 + vUv.x * 9.0) * sin(uT * 0.9 - vUv.x * 4.0);
  float a = pow(1.0 - y, 1.6) * 0.42 * s * uK; a *= smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
  gl_FragColor = vec4(uCol * (1.0 + 0.4 * (1.0 - y)), a); }`;
const RIPPLE_FS = `uniform vec3 uCol; uniform float uT, uK, uR; varying vec3 vP;
void main() { float d = length(vP.xz) / uR; float band = step(0.72, fract(d * 3.2 - uT * 0.85));
  float a = band * (1.0 - d) * (1.0 - d) * 0.3 * uK + (1.0 - smoothstep(0.0, 0.25, d)) * 0.08 * uK; gl_FragColor = vec4(uCol, a); }`;
const VS_UV = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const VS_P = 'varying vec3 vP; void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';

interface Item { g: Gate; pivot: THREE.Group; fallT: number; curtain: THREE.Mesh; ripple: THREE.Mesh; inward: THREE.Vector3; centre: THREE.Vector3 }
export class Gates {
  root = new THREE.Group(); items: Item[] = []; private t = 0; private opened = false; private openT = 0;
  constructor(parent: THREE.Object3D, plan: ArenaPlan) {
    parent.add(this.root);
    const midOff = plan.wall.gap + plan.wall.thick / 2;
    for (const g of plan.gates) {
      if (!g.open) continue;
      // the gate's centre on the wall's centre line; inward = toward the room
      const inward = V3(-g.out[0], 0, -g.out[1]), centre = V3(g.x + g.out[0] * midOff, 0, g.z + g.out[1] * midOff);
      const yaw = g.along === 'x' ? 0 : Math.PI / 2;
      // the barricade hangs off a pivot at its outer foot, so it can fall outward
      const pivot = new THREE.Group(), bar = barricade(g.w); pivot.position.copy(centre).addScaledVector(V3(g.out[0], 0, g.out[1]), 0.12); pivot.rotation.order = "YXZ"; pivot.rotation.y = yaw;
      // in the pivot's frame the logs run along x and 'out of the room' is ±z
      const lo = g.along === 'x' ? g.out[1] : g.out[0]; bar.position.z = -lo * 0.12;
      pivot.add(bar); this.root.add(pivot);
      const curtain = new THREE.Mesh(new THREE.PlaneGeometry(g.w, 2.3), new THREE.ShaderMaterial({ vertexShader: VS_UV, fragmentShader: CURTAIN_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
        uniforms: { uCol: { value: new THREE.Color(GOLD) }, uT: { value: 0 }, uK: { value: 0 } } }));
      curtain.position.copy(centre).setY(1.15); curtain.rotation.y = yaw; curtain.renderOrder = 6; this.root.add(curtain);
      const R = 4.6, rg = new THREE.CircleGeometry(R, 36, 0, Math.PI); rg.rotateX(-Math.PI / 2);
      const ripple = new THREE.Mesh(rg, new THREE.ShaderMaterial({ vertexShader: VS_P, fragmentShader: RIPPLE_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2,
        uniforms: { uCol: { value: new THREE.Color(GOLD) }, uT: { value: 0 }, uK: { value: 0 }, uR: { value: R } } }));
      // the half disc opens toward the room: CircleGeometry's half (0..π) lies on −z after the rotation; turn it to face inward
      ripple.position.copy(centre).setY(0.045); ripple.rotation.y = Math.atan2(inward.x, inward.z) + Math.PI; ripple.renderOrder = 3; this.root.add(ripple);
      this.items.push({ g, pivot, fallT: -1, curtain, ripple, inward, centre });
    }
  }
  /** the room is clear: the barricades fall outward, the light and the ripples come up */
  open() {
    if (this.opened) return; this.opened = true; this.openT = 0;
    this.items.forEach((it, i) => { it.fallT = -0.12 * i; });
  }
  update(dt: number) {
    this.t += dt; if (this.opened) this.openT += dt;
    for (const it of this.items) {
      if (it.fallT > -1 || this.opened) {
        if (it.fallT < 0 && this.opened) { it.fallT += dt; if (it.fallT >= 0) cue('impact', 0.5); }
        else if (it.fallT >= 0 && it.fallT < 1) {
          const p = it.fallT; it.fallT += dt;
          const k = Math.min(1, it.fallT / 0.5), ang = (Math.PI / 2) * k * k - (k >= 1 ? Math.sin(Math.min(1, (it.fallT - 0.5) / 0.18) * Math.PI) * 0.05 : 0);
          // fall away from the room: about the gate's own span axis
          const lo = it.g.along === 'x' ? it.g.out[1] : it.g.out[0]; it.pivot.rotation.x = lo * ang;
          if (p < 0.5 && it.fallT >= 0.5) {
            const out = V3(it.g.out[0], 0, it.g.out[1]); for (let s = -1; s <= 1; s++) fxSmoke(it.centre.clone().addScaledVector(out, 0.8).add(V3(it.g.along === 'x' ? s * it.g.w * 0.35 : 0, 0.2, it.g.along === 'z' ? s * it.g.w * 0.35 : 0)), 0x9a8a72, 3, { r: 0.4, spd: 1.4, up: 0.4, s: 0.4, life: 0.7 });
            shake(0.08); cue('impact', 0.7);
          }
        }
      }
      const k = this.opened ? Math.min(1, Math.max(0, (this.openT - 0.45) / 0.8)) : 0;
      const cu = (it.curtain.material as THREE.ShaderMaterial).uniforms, ru = (it.ripple.material as THREE.ShaderMaterial).uniforms;
      cu.uT.value = this.t; cu.uK.value = k; ru.uT.value = this.t; ru.uK.value = k;
      it.curtain.visible = it.ripple.visible = k > 0.001;
    }
  }
  /** where the gate's way out starts (for the guiding wind) */
  targets() { return this.items.map(it => it.centre.clone().addScaledVector(V3(it.g.out[0], 0, it.g.out[1]), 1.2)); }
  dispose() {
    for (const it of this.items) for (const m of [it.curtain, it.ripple]) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
    this.root.parent?.remove(this.root); this.items = [];
  }
}
