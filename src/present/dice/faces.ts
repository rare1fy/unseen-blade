// Die face geometry: which local face is which, how each face's texture tile is oriented, and the maths that keeps the shown face
// honest — the face that ends on top (or that is turned toward the camera when the dice line up) is always the rolled value, upright.
// History item: v5 showed the wrong face when dice rose into a row (it assumed the value sat on the local +Y face). Here every pose that
// presents a value is computed from that die's own value face (presentQuat), and tests/faces.test.ts checks it for random rolls.
import * as THREE from 'three';

/** Local faces: 0 +X, 1 −X, 2 +Y, 3 −Y, 4 +Z, 5 −Z. U = texture right, V = texture up, N = U × V (outward). */
export const FACE_N = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1)];
export const FACE_U = [new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0)];
export const FACE_V = [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 0)];

/**
 * A cube with each face UV-mapped to tile i of a 6×1 atlas. bevel > 0 (R5, TARGET_MOCKUP "边缘有倒角") cuts a flat 45° chamfer of that
 * width on every edge (no rounding — history item "不能有圆角"): the painted tile fills the flat face inside the chamfers, each edge strip
 * and corner triangle samples the border texels of one neighbouring tile (so a glowing tile frame lights the chamfers too), and the
 * chamfers keep their own flat normal, so the bevel catches the light and the die reads as a thick block, not a paper box.
 */
export function dieGeometry(size: number, bevel = 0): THREE.BufferGeometry {
  const h = size / 2, b = Math.max(0, Math.min(bevel, h * 0.6)), hi = h - b, pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  /** atlas uv of a point on face f's plane (inset keeps chamfer samples off the tile seam) */
  const uvOn = (f: number, p: THREE.Vector3, inset = 0) => {
    const a = THREE.MathUtils.clamp(p.dot(FACE_U[f]) / (hi || h), -1 + inset, 1 - inset), c = THREE.MathUtils.clamp(p.dot(FACE_V[f]) / (hi || h), -1 + inset, 1 - inset);
    return [(f + (a + 1) / 2) / 6, (c + 1) / 2];
  };
  const _n = new THREE.Vector3(), _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3();
  /** a flat polygon (3 or 4 points), wound to face `n` */
  const poly = (pts: THREE.Vector3[], n: THREE.Vector3, uvs: number[][]) => {
    const base = pos.length / 3;
    pts.forEach((p, i) => { pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); uv.push(uvs[i][0], uvs[i][1]); });
    _n.crossVectors(_e1.subVectors(pts[1], pts[0]), _e2.subVectors(pts[2], pts[0]));
    const flip = _n.dot(n) < 0, tri = (i: number, j: number, k: number) => (flip ? idx.push(base + i, base + k, base + j) : idx.push(base + i, base + j, base + k));
    tri(0, 1, 2); if (pts.length === 4) tri(0, 2, 3);
  };
  for (let f = 0; f < 6; f++) {
    const N = FACE_N[f], U = FACE_U[f], V = FACE_V[f], pts: THREE.Vector3[] = [], uvs: number[][] = [];
    for (const [a, c] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      pts.push(N.clone().multiplyScalar(h).addScaledVector(U, a * hi).addScaledVector(V, c * hi));
      uvs.push([(f + (a + 1) / 2) / 6, (c + 1) / 2]);
    }
    poly(pts, N, uvs);
  }
  if (b > 0) {
    const UI = 0.06;   // chamfers sample 6% inside the tile border: the outermost texel ring at 24 texels (R6 numeral faces: the highlight / glow ring), past the 1-texel painted bevel of the 48-texel v1 faces
    // 12 edge strips: faces f < g with perpendicular normals; uv from face f's border
    for (let f = 0; f < 6; f++) for (let g = f + 1; g < 6; g++) {
      const Nf = FACE_N[f], Ng = FACE_N[g]; if (Math.abs(Nf.dot(Ng)) > 0.5) continue;
      const E = new THREE.Vector3().crossVectors(Nf, Ng), n = Nf.clone().add(Ng).normalize(), pts: THREE.Vector3[] = [], uvs: number[][] = [];
      for (const s of [-1, 1]) {
        const pf = Nf.clone().multiplyScalar(h).addScaledVector(Ng, hi).addScaledVector(E, s * hi);
        pts.push(pf); uvs.push(uvOn(f, pf, UI));
      }
      for (const s of [1, -1]) {
        const pg = Ng.clone().multiplyScalar(h).addScaledVector(Nf, hi).addScaledVector(E, s * hi);
        pts.push(pg); uvs.push(uvOn(f, pg, UI));   // the same border texels as the matching point on face f
      }
      poly(pts, n, uvs);
    }
    // 8 corner triangles: uv from the corner of the x face
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      const n = new THREE.Vector3(sx, sy, sz).normalize(), fx = sx > 0 ? 0 : 1;
      const pts = [new THREE.Vector3(sx * h, sy * hi, sz * hi), new THREE.Vector3(sx * hi, sy * h, sz * hi), new THREE.Vector3(sx * hi, sy * hi, sz * h)];
      const u0 = uvOn(fx, pts[0], UI); poly(pts, n, [u0, u0, u0]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeBoundingSphere();
  return g;
}

const _v = new THREE.Vector3();
/** Which local face points most nearly along `dir` (world) for orientation q; align = cosine. */
export function faceToward(q: THREE.Quaternion, dir: THREE.Vector3): { i: number; align: number } {
  let best = 0, bd = -2;
  for (let i = 0; i < 6; i++) { const d = _v.copy(FACE_N[i]).applyQuaternion(q).dot(dir); if (d > bd) { bd = d; best = i; } }
  return { i: best, align: bd };
}
export const UP = new THREE.Vector3(0, 1, 0);
export const topFaceOf = (q: THREE.Quaternion) => faceToward(q, UP);

/** Rotation that snaps q so face i points exactly up (keeps the yaw). */
export function snapFlat(q: THREE.Quaternion, i: number): THREE.Quaternion {
  const nW = FACE_N[i].clone().applyQuaternion(q);
  return new THREE.Quaternion().setFromUnitVectors(nW, UP).multiply(q.clone());
}

/** Quarter turns (0..3) to paint the top tile with so its numeral reads upright for a viewer at `eye` (world, die-local frame same as world). */
export function uprightTurns(qEnd: THREE.Quaternion, top: number, diePos: THREE.Vector3, eye: THREE.Vector3): number {
  const V = FACE_V[top].clone().applyQuaternion(qEnd); V.y = 0; V.normalize();
  const D = new THREE.Vector3(diePos.x - eye.x, 0, diePos.z - eye.z).normalize();   // "away from the viewer" on the ground = text up
  // angle from V to D, measured around +Y (counter-clockwise seen from above)
  const ang = Math.atan2(V.z * D.x - V.x * D.z, V.x * D.x + V.z * D.z);
  return ((Math.round(ang / (Math.PI / 2)) % 4) + 4) % 4;
}
/** The tile's effective "up" after painting it with `turns` quarter turns (counter-clockwise in texture space). */
export function turnedV(face: number, turns: number): THREE.Vector3 {
  const U = FACE_U[face], V = FACE_V[face];
  switch (((turns % 4) + 4) % 4) { case 0: return V.clone(); case 1: return U.clone().negate(); case 2: return V.clone().negate(); default: return U.clone(); }
}

/** Orientation (world) that turns face `face` (painted with `turns`) squarely toward the camera with its numeral upright on screen. */
export function presentQuat(face: number, turns: number, cameraQ: THREE.Quaternion): THREE.Quaternion {
  const N = FACE_N[face], Vt = turnedV(face, turns), Ut = new THREE.Vector3().crossVectors(Vt, N);   // right = up × normal
  // local basis (Ut, Vt, N) must map to camera-space (X, Y, Z): R = [X Y Z]·[Ut Vt N]^T = [Ut Vt N]^T
  const m = new THREE.Matrix4().makeBasis(Ut, Vt, N).transpose();
  return cameraQ.clone().multiply(new THREE.Quaternion().setFromRotationMatrix(m));
}

/** Rotate a die's face numbering so `value` sits on face `top` (a cyclic shift keeps every value once). */
export function assignFaceValues(faces: readonly number[], value: number, top: number): number[] {
  const f = faces.length === 6 ? faces : [1, 2, 3, 4, 5, 6];
  let k = f.indexOf(value); if (k < 0) k = 0;
  const out = f.map((_, j) => f[(j - top + k + 12) % 6]);
  out[top] = value;
  return out;
}
