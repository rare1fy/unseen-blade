import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { padLights, restoreLights, scene } from '../src/present/engine/world';
import { QUALITY } from '../src/present/look/quality';
import { OPT } from '../src/present/engine/perfOpts';
import { VoxChar } from '../src/present/look/voxkit';
import { bakeTerrainLight } from '../src/present/scenes/terrainLight';

function surface(meshes: THREE.Mesh[]) {
  const a = new THREE.Vector3(), b = a.clone(), c = a.clone();
  let area = 0, triangles = 0;
  for (const m of meshes) {
    const g = m.geometry, p = g.attributes.position, idx = g.index!;
    for (let i = 0; i < idx.count; i += 3) {
      a.fromBufferAttribute(p, idx.getX(i)); b.fromBufferAttribute(p, idx.getX(i+1)); c.fromBufferAttribute(p, idx.getX(i+2));
      area += b.sub(a).cross(c.sub(a)).length() / 2; triangles++;
    }
  }
  return { area, triangles };
}

describe('mobile room rendering', () => {
  it('joins exposed faces without losing surface area on a two-colour actor', () => {
    const actor = new VoxChar(0.035);
    actor.box(-4,0,-3,4,6,3,0x452b11).box(-1,4,-3,1,6,3,0xc4a281);
    const saved = OPT.greedyActors;
    try {
      OPT.greedyActors = false; const original = surface(actor.build({ jitter: 0 }).meshes);
      OPT.greedyActors = true; const merged = surface(actor.build({ jitter: 0 }).meshes);
      expect(merged.area).toBeCloseTo(original.area, 6);
      expect(merged.triangles).toBeLessThan(original.triangles);
    } finally { OPT.greedyActors = saved; }
  });

  it('keeps all real lamps on high and restores lamps after the mobile pass', () => {
    const lights = Array.from({ length: 21 }, () => new THREE.PointLight());
    const oldTier = QUALITY.tier;
    scene.add(...lights);
    try {
      QUALITY.tier = 'high'; padLights();
      expect(lights.filter(l => l.visible)).toHaveLength(21);
      restoreLights(); QUALITY.tier = 'mid'; padLights();
      expect(lights.filter(l => l.visible)).toHaveLength(4);
      restoreLights(); expect(lights.every(l => l.visible)).toBe(true);
    } finally { restoreLights(); QUALITY.tier = oldTier; scene.remove(...lights); }
  });

  it('bakes the permanent roof over the floor and excludes a removable prop', () => {
    const floor = new THREE.Mesh(new THREE.BoxGeometry(10, 0.2, 10));
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2, 0.2, 2).translate(-2, 3, 0));
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1).translate(2, 0.5, 0));
    const empty = bakeTerrainLight([floor, roof], [0,1,0])!;
    const withCrate = bakeTerrainLight([floor, roof, crate], [0,1,0])!;
    const at = (x: number) => Math.floor(-empty.back/empty.step)*empty.size + Math.floor((x-empty.left)/empty.step);
    expect(empty.depth[at(-2)]).toBe(255);
    expect(empty.depth[at(2)]).toBe(empty.depth[at(0)]);
    expect(withCrate.depth[at(2)]).toBeGreaterThan(empty.depth[at(2)]);
    expect(bakeTerrainLight([])).toBeNull();
  });
});
