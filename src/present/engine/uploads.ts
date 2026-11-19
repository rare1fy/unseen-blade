import type * as THREE from 'three';
import { OPT } from './perfOpts';

// r162 uses element offsets. Keep pending edits when the object was hidden or culled;
// WebGLAttributes clears the ranges only after uploading them.
export function dirtyRange(a: THREE.BufferAttribute, start: number, count: number) {
  if (!OPT.dirtyUploads) { a.clearUpdateRanges(); a.needsUpdate = true; return; }
  if (!count) return;
  const pending = a.updateRanges[0];
  if (pending) {
    const end = Math.max(pending.start + pending.count, start + count);
    pending.start = Math.min(pending.start, start); pending.count = end - pending.start;
  } else a.addUpdateRange(start, count);
  a.needsUpdate = true;
}
export function instanceMatrix(m: THREE.InstancedMesh, i: number, matrix: THREE.Matrix4) {
  if (!OPT.dirtyUploads) { m.setMatrixAt(i, matrix); return; }
  const a = m.instanceMatrix, j = i * 16;
  for (let k = 0; k < 16; k++) if (a.array[j+k] !== Math.fround(matrix.elements[k])) {
    m.setMatrixAt(i, matrix); dirtyRange(a, j, 16); return;
  }
}
export function instanceColor(m: THREE.InstancedMesh, i: number, c: THREE.Color) {
  if (!OPT.dirtyUploads) { m.setColorAt(i, c); return; }
  const a = m.instanceColor, j = i * 3;
  if (a && a.array[j] === Math.fround(c.r) && a.array[j+1] === Math.fround(c.g) && a.array[j+2] === Math.fround(c.b)) return;
  m.setColorAt(i, c); dirtyRange(m.instanceColor!, j, 3);
}
export function finishInstances(m: THREE.InstancedMesh) {
  if (OPT.dirtyUploads) return;
  dirtyRange(m.instanceMatrix, 0, 0);
  if (m.instanceColor) dirtyRange(m.instanceColor, 0, 0);
}
