// 自己改模型（MagicaVoxel 来回）：导出再读回必须一格不差；改动要落在对的位置、对的部件上；轴不能镜像。
import { describe, it, expect } from 'vitest';
import { ROSTER } from '../src/present/bestiary/models';
import '../src/present/act/ninjaAct';
import { readVox, writeVox, voxWorld } from '../src/present/look/vox';
import { modelToVox, applyVox } from '../src/present/bestiary/voxEdit';

const snap = (v: { cells: Map<number, { x: number; y: number; z: number; c: number; g: number; part: string }> }) =>
  [...v.cells.values()].map(c => `${c.x},${c.y},${c.z},${c.c},${c.g},${c.part}`).sort();

describe('vox round trip', () => {
  for (const id of ['slim_hat', 'slim_white']) it(`${id}: export → bytes → read → apply is exact`, () => {
    const def = ROSTER.find(d => d.id === id)!; expect(def).toBeTruthy();
    const f = readVox(writeVox(modelToVox(def.build())));
    expect(f.models.length).toBeGreaterThan(10);
    // every object shares one even-sized frame; names are bones
    for (const m of f.models) { expect(m.size.every(n => n % 2 === 0)).toBe(true); expect(m.name).toMatch(/^[a-zA-Z0-9]+$/); }
    const back = applyVox(def.build(), f);
    expect(snap(back)).toEqual(snap(def.build()));
  });
  it('an added voxel lands on its part at the right cell, axes unmirrored', () => {
    const def = ROSTER.find(d => d.id === 'slim_hat')!, f = readVox(writeVox(modelToVox(def.build())));
    const head = f.models.find(m => m.name === 'head')!, hand = f.models.find(m => m.name === 'handL')!;
    // one voxel 3 cells to the right (+x), 2 up (+y game = +z vox), 1 toward the front (+z game = −y vox) of the head's first voxel
    const [x, y, z, c] = head.voxels[0]; head.voxels.push([x + 3, y - 1, z + 2, c]);
    const v = applyVox(def.build(), f), [wx, wy, wz] = voxWorld(head, x, y, z), g0 = [wx, wz, -wy - 1];
    const added = v.get(g0[0] + 3, g0[1] + 2, g0[2] + 1);
    expect(added?.part).toBe('head');
    // the left hand is on the model's left (+x; front = +z), in the file too: MagicaVoxel x matches game x
    const hx = hand.voxels.reduce((a, q) => a + voxWorld(hand, q[0], q[1], q[2])[0], 0) / hand.voxels.length;
    const cellsL = [...def.build().cells.values()].filter(c => c.part === 'handL'), gx = cellsL.reduce((a, c) => a + c.x, 0) / cellsL.length;
    expect(Math.abs(hx - gx)).toBeLessThan(0.01);
  });
  it('a part left out of the file keeps the code cells; an emptied part goes', () => {
    const def = ROSTER.find(d => d.id === 'slim_hat')!, f = readVox(writeVox(modelToVox(def.build())));
    f.models = f.models.filter(m => m.name !== 'hat'); f.models.find(m => m.name === 'blade')!.voxels = [];
    const v = applyVox(def.build(), f), orig = def.build();
    expect([...v.cells.values()].filter(c => c.part === 'hat').length).toBe([...orig.cells.values()].filter(c => c.part === 'hat').length);
    expect([...v.cells.values()].filter(c => c.part === 'blade').length).toBe(0);
  });
});
