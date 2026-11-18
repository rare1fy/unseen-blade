import type { Mesh } from 'three';
import { expect, it } from 'vitest';
import { VoxWorld } from '../src/present/look/voxkit';

// A greedy rectangle can split a different way when the backing store walks
// tiles in a different order. Compare its visible unit faces, including AO.
function unitFaces(meshes: Mesh[]) {
  const faces: string[] = [];
  for (const mesh of meshes) {
    if (mesh.name === 'shadowTile') continue;
    const { position, normal, color } = mesh.geometry.attributes;
    for (let i = 0; i < position.count; i += 4) {
      const n = [normal.getX(i), normal.getY(i), normal.getZ(i)];
      const axis = n.findIndex((v) => v !== 0),
        u = (axis + 1) % 3,
        v = (axis + 2) % 3;
      const corners = Array.from({ length: 4 }, (_, j) => [position.getX(i + j), position.getY(i + j), position.getZ(i + j)]);
      const colors = Array.from({ length: 4 }, (_, j) => [color.getX(i + j), color.getY(i + j), color.getZ(i + j)].join(','));
      const tag = [
        axis,
        n[axis],
        corners[0][axis],
        (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material).type,
        colors.join('/'),
      ].join(':');
      const us = corners.map((p) => p[u]),
        vs = corners.map((p) => p[v]);
      for (let x = Math.min(...us); x < Math.max(...us); x++) {
        for (let y = Math.min(...vs); y < Math.max(...vs); y++) faces.push(tag + ':' + x + ',' + y);
      }
    }
  }
  return faces.sort();
}

it('keeps terrain faces, colours and glow across signed tile boundaries and cuts', () => {
  const reference = new VoxWorld(1),
    terrain = new VoxWorld(1, true);
  for (const world of [reference, terrain]) {
    world.box(-9, -2, -34, 9, 3, 34, 0x8a6f50);
    world.box(4, 2, 29, -4, -1, -29, null);
    world.box(9, 3, 34, 7, 1, 31, 0xdaad28, 1);
    world.set(-8, 3, -32, null).set(8, 4, 32, 0x445533);
    world.get(0, 3, 0)!.c = 0xbb4433;
  }
  expect(terrain.cells.size).toBe(reference.cells.size);
  expect([...terrain.cells.keys()].sort()).toEqual([...reference.cells.keys()].sort());
  const meshes = [reference, terrain].map((world) => world.build({ tile: 1000 }));
  expect(unitFaces(meshes[1])).toEqual(unitFaces(meshes[0]));
  for (const group of meshes) for (const mesh of group) mesh.geometry.dispose();
});
