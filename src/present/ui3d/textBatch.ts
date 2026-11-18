import * as THREE from 'three';

// Four independent label textures share a draw without copying their canvases into an atlas.
// Each sampler has a constant index, also accepted by GLSL ES 1.00.
const SLOTS = 4;
type LabelMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
class TextQuads {
  readonly positions = new THREE.BufferAttribute(new Float32Array(SLOTS * 12), 3).setUsage(THREE.DynamicDrawUsage);
  private readonly opacity = new Float32Array(SLOTS);
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  constructor() {
    const geo = new THREE.BufferGeometry(), indices: number[] = [], uv: number[] = [], slots: number[] = [];
    const uniforms: Record<string, THREE.IUniform> = { opacity: { value: this.opacity } };
    for (let i = 0; i < SLOTS; i++) {
      const b = 4 * i;
      indices.push(b, b + 2, b + 1, b + 2, b + 3, b + 1);
      uv.push(0,1, 1,1, 0,0, 1,0); slots.push(i,i,i,i);
      uniforms['label' + i] = { value: null };
    }
    geo.setIndex(indices); geo.setAttribute('position', this.positions);
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('slot', new THREE.Float32BufferAttribute(slots, 1));
    const samplers = Array.from({ length: SLOTS }, (_, i) => 'uniform sampler2D label' + i + ';').join('\n');
    const lookup = Array.from({ length: SLOTS }, (_, i) =>
      (i ? 'else ' : '') + (i < SLOTS - 1 ? 'if (id < ' + (i + 0.5) + ') ' : '') +
      '{ col = texture2D(label' + i + ', st); col.a *= opacity[' + i + ']; }').join('\n');
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms, transparent: true, depthTest: false, depthWrite: false,
      vertexShader: 'attribute float slot; varying vec2 st; varying float id; void main(){st=uv;id=slot;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: samplers + '\nuniform float opacity[4]; varying vec2 st; varying float id; void main(){vec4 col;\n' + lookup +
        '\ngl_FragColor=col;\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
    }));
    this.mesh.frustumCulled = false;
  }
  set(i: number, label: LabelMesh) {
    const { x, y } = label.position, w = label.scale.x / 2, h = label.scale.y / 2, n = i * 4;
    this.positions.setXYZ(n, x-w, y+h, 0); this.positions.setXYZ(n+1, x+w, y+h, 0);
    this.positions.setXYZ(n+2, x-w, y-h, 0); this.positions.setXYZ(n+3, x+w, y-h, 0);
    this.opacity[i] = label.material.opacity;
    this.mesh.material.uniforms['label' + i].value = label.material.map;
  }
  finish(n: number) {
    this.mesh.visible = n > 0;
    for (let i = n; i < SLOTS; i++) this.mesh.material.uniforms['label' + i].value = null;
    if (!n) return;
    this.mesh.geometry.setDrawRange(0, n * 6); this.positions.needsUpdate = true;
  }
}

export class TextBatch {
  readonly scene = new THREE.Scene();
  private groups: TextQuads[] = [];
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    // Gamepad glyphs have a separate painter order. Keep that compositor when one is showing.
    for (const o of scene.children) if (o.visible && o.renderOrder !== 50) {
      renderer.render(scene,camera); return;
    }
    let count = 0;
    for (const o of scene.children) if (o.visible) {
      const index = Math.floor(count / SLOTS);
      let batch = this.groups[index];
      if (!batch) { batch = new TextQuads(); batch.mesh.renderOrder = index; this.groups.push(batch); this.scene.add(batch.mesh); }
      batch.set(count % SLOTS, o as LabelMesh); count++;
    }
    for (let i = 0; i < this.groups.length; i++) this.groups[i].finish(Math.max(0, Math.min(SLOTS, count - i*SLOTS)));
    if (count) renderer.render(this.scene,camera);
  }
}
