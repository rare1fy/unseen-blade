import * as THREE from 'three';

/** One transparent draw for ground contacts, including on WebGL1 without instancing. */
export class ContactBatch {
  private capacity = 32;
  private count = 0;
  private data!: THREE.BufferAttribute;
  private mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    vertexShader: 'varying vec2 disk; void main(){disk=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'varying vec2 disk; void main(){gl_FragColor=vec4(0.038,0.023,0.031,0.54*(1.-smoothstep(0.05,1.,dot(disk,disk))));}',
  }));
  constructor(parent: THREE.Object3D) {
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 2; this.mesh.visible = false;
    parent.add(this.mesh); this.allocate();
  }
  private allocate() {
    const old = this.data, geo = this.mesh.geometry;
    geo.dispose();
    this.data = new THREE.BufferAttribute(new Float32Array(this.capacity * 12), 3).setUsage(THREE.DynamicDrawUsage);
    if (old) this.data.array.set(old.array);
    const uv = new Float32Array(this.capacity * 8), index = [];
    for (let i = 0; i < this.capacity; i++) {
      const n = i * 4; index.push(n, n + 2, n + 1, n, n + 3, n + 2);
      uv.set([-1,-1, 1,-1, 1,1, -1,1], i * 8);
    }
    geo.setIndex(index); geo.setAttribute('position', this.data); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }
  begin() { this.count = 0; }
  add(x: number, z: number, rx: number, rz = rx, y = 0.025) {
    if (this.count === this.capacity) { this.capacity *= 2; this.allocate(); }
    let i = this.count++ * 4;
    this.data.setXYZ(i++, x-rx, y, z-rz); this.data.setXYZ(i++, x+rx, y, z-rz);
    this.data.setXYZ(i++, x+rx, y, z+rz); this.data.setXYZ(i, x-rx, y, z+rz);
  }
  end() {
    this.mesh.visible = this.count > 0;
    this.mesh.geometry.setDrawRange(0, this.count * 6);
    if (this.count) { this.data.clearUpdateRanges(); this.data.addUpdateRange(0, this.count * 12); this.data.needsUpdate = true; }
  }
  dispose() { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}
