import { Box3, Mesh, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { Action } from '../src/present/actors/rig';
import { BattleActor } from '../src/present/bestiary/battle';
import { movesOf } from '../src/present/act/animCatalog';
import { inside } from '../src/present/act/tele';
import '../src/present/act/foes/hj_models';
import '../src/present/act/foes/hj_poses';
import '../src/present/act/foes/ly_models';
import '../src/present/act/foes/ly_poses';
import '../src/present/act/foes/r45_models';
import '../src/present/act/foes/r45_pose';
import '../src/present/act/foes/xp_models';
import '../src/present/act/foes/xp_poses';

const cases = [
  ['hj_archer', '', '_e'], ['hj_brute', 'slam', '_e'], ['hj_brute', 'sweep', '_e'],
  ['wl_spear', 'poke', '_b'], ['wl_xbow', 'shoot', '_e'], ['wl_xbow', 'cast', '_e'],
  ['cx_sword', 'poke', '_e'], ['cx_sword', 'lunge', '_e'], ['cx_guard', 'cut', '_e'],
  ['wl_shield', 'lunge', '_e'], ['xp_frost', 'sow', '_e'],
];
const origin = new Vector3(2, 0, -3), yaw = 1.19, up = new Vector3(0, 1, 0);
const forward = new Vector3(0, 0, 1);
const v = (x = 0, y = 0, z = 0) => new Vector3(x, y, z);

function vertices(actor: BattleActor, part: string) {
  const points: Vector3[] = [];
  for (const child of actor.bones[part].children) {
    if (!(child as Mesh).isMesh) continue;
    const pos = (child as Mesh).geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) points.push(v().fromBufferAttribute(pos, i));
  }
  return points;
}

/** Midpoint of the distal voxel face, including the stopper beyond the frost rod's nominal tip. */
function tipOf(points: Vector3[]) {
  const z = Math.max(...points.map(p => p.z));
  return new Box3().setFromPoints(points.filter(p => p.z === z)).getCenter(v());
}

it.each([
  ['hj_mob', 1.6], ['hj_mob_b', 1.6], ['ly_looter', 1.6], ['ly_looter_b', 1.6],
  ['xp_conscript', 1.6], ['xp_conscript_b', 1.6], ['xp_diver', 1.8], ['xp_diver_e', 1.8],
] as const)('%s sends the point down its short warning lane', (id, len) => {
  const actor = new BattleActor(id);
  actor.t = 1.25;
  if (id.endsWith('_e')) actor.root.scale.setScalar(1.15);
  actor.place(origin, yaw);
  const spec = movesOf(id).find(m => m.atk === 'poke')!;
  const act = actor.play(new Action(spec.name, spec.dur, spec.at, { atk: 'poke', dist: 0.6 }));
  const held = actor.bones.weapon, tip = tipOf(vertices(actor, 'weapon'));
  const at = act.at * act.dur;
  act.t = at * 0.8;
  actor.update(0);
  const load = held.localToWorld(tip.clone()).sub(origin).applyAxisAngle(up, -yaw);
  act.t = at;
  actor.update(0);
  const hit = held.localToWorld(tip.clone());
  expect(inside({ k: 'rect', len, w: 0.6 }, origin.x, origin.z, yaw, hit.x, hit.z, 0.08)).toBe(true);
  expect(hit.sub(origin).applyAxisAngle(up, -yaw).z - load.z).toBeGreaterThan(0.25);
  actor.dispose();
});

it('Yanhu lands his chop on the bright edge inside the lane', () => {
  const actor = new BattleActor('ly_boss');
  actor.t = 1.25;
  actor.place(origin, yaw);
  const spec = movesOf('ly_boss').find(m => m.name === 'axeChop')!;
  const act = actor.play(new Action(spec.name, spec.dur, spec.at));
  const axe = actor.bones.weapon;
  const edge = vertices(actor, 'weapon').filter(p => p.y < -0.70);
  act.t = spec.at * spec.dur;
  actor.update(0);
  const points = edge.map(p => axe.localToWorld(p));
  expect(points.length).toBeGreaterThan(0);
  expect(Math.min(...points.map(p => p.y))).toBeCloseTo(0, 0);
  expect(points.every(p => inside({ k: 'rect', len: 5.0, w: 1.4 }, origin.x, origin.z, yaw, p.x, p.z, 0.08))).toBe(true);
  actor.dispose();
});

for (const [base, move, variant] of cases) {
  it.each([base, base + variant])('%s ' + (move || 'bow') + ' uses its equipped weapon', id => {
    // Some recordings only contain the other variant's entry for the same move.
    const ids = [id, id === base ? base + variant : base];
    const spec = ids.flatMap(movesOf).find(m => (m.atk || m.name) === (move || 'attack'))!;
    const a = new BattleActor(id);
    a.place(origin, yaw); a.t = 1.25;
    const action = a.play(new Action(spec.name, spec.dur, spec.at, spec.atk ? { atk: spec.atk, dist: 0.6 } : { dist: 0.6 }));
    const b = a.bones, bow = base === 'hj_archer', hammer = base === 'hj_brute';
    const mesh = vertices(a, bow ? 'offhand' : 'weapon');
    const end = tipOf(mesh);
    const head = vertices(a, 'head');
    const skull = new Box3().setFromPoints(head).expandByScalar(-0.040);
    const torso = new Box3(v(hammer ? -0.43 : -0.235, -0.19, hammer ? -0.22 : -0.14),
      v(hammer ? 0.43 : 0.235, hammer ? 0.30 : 0.23, hammer ? 0.22 : 0.14));
    const weapon = bow ? b.offhand : b.weapon;
    const shaft: Vector3[] = [];
    for (let z = Math.min(...mesh.map(p => p.z)); z <= end.z; z += a.cx) {
      shaft.push(v(0, 0, z));
      if (hammer && z > 0.38) {
        for (const x of [-0.12, 0.12]) for (const y of [-0.12, 0.12]) shaft.push(v(x, y, z));
      }
    }
    let worstSupport = 0;
    const local = (bone: string, p = v()) =>
      b[bone].localToWorld(p.clone()).sub(origin).applyAxisAngle(up, -yaw);
    const measure = () => {
      const hips = local('hips'), stock = local('weapon');
      const direction = local('weapon', forward).sub(stock).normalize();
      const tip = bow ? local('offhand') : local('weapon', end);
      // The heavy portion spans absolute cells 12..31 with the grip at z=1.
      const mark = hammer ? local('weapon', v(-0.5 * a.cx, 0, 21 * a.cx)) : tip.clone();
      mark.x -= hips.x; mark.z -= hips.z;
      const left = local('offhand'), right = local('handR', b.weapon.rest!.p);
      const onShaft = b.weapon.worldToLocal(b.offhand.getWorldPosition(v()));
      return {
        mark, tip, right, left, stock, hips, angle: direction.angleTo(forward) * 180 / Math.PI,
        shaftGap: Math.hypot(onShaft.x, onShaft.y), along: onShaft.z,
        stockToShoulder: local('weapon', v(0, 0, -7 * a.cx)).distanceTo(local('armR')),
        bolt: b.bolt?.visible,
        extension: local('handR').distanceTo(local('armR')) / (b.foreR.position.length() + b.handR.position.length()),
        headTop: Math.max(...head.map(p => local('head', p).y)),
        floor: hammer ? Math.min(...mesh.map(p => local('weapon', p).y)) : tip.y,
        foot: local(move === 'cast' ? 'footR' : 'footL'), nock: bow || base === 'wl_xbow' ? local('stringA',
          b.stringB.position.clone().sub(b.stringA.position).multiplyScalar(0.5)) : undefined,
      };
    };
    const tick = (dt: number) => {
      a.update(dt);
      // Check the path between the three measured poses. Insets exclude the
      // overlapping cuffs, jaw and helmet trim of the voxel parts.
      const clipsHead = shaft.some(p => skull.containsPoint(b.head.worldToLocal(weapon.localToWorld(p.clone()))));
      expect(clipsHead, 'weapon in head at k=' + action.k).toBe(false);
      for (const side of ['L', 'R']) {
        for (const part of ['fore', 'hand']) {
          const center = b[part + side].localToWorld(v(0, part === 'fore' ? -0.12 : -0.09, 0));
          const inside = torso.containsPoint(b.chest.worldToLocal(center.clone())) || skull.containsPoint(b.head.worldToLocal(center));
          expect(inside, part + side + ' inside body at k=' + action.k).toBe(false);
        }
      }
      if ((hammer || base === 'wl_spear' || move === 'shoot') && action.k >= action.at * 0.55 && action.k <= action.at + (1 - action.at) * 0.33) {
        const p = b.weapon.worldToLocal(b.offhand.getWorldPosition(v()));
        worstSupport = Math.max(worstSupport, Math.hypot(p.x, p.y));
      }
    };
    const sample = (time: number) => {
      while (action.t + 1 / 60 < time - 1e-10) tick(1 / 60);
      tick(time - action.t);
      return measure();
    };
    const at = action.at * action.dur, tail = action.dur - at;
    const load = sample(at * (move === 'cast' ? 0.38 : 0.80));
    const mid = sample(move === 'cast' ? at * 0.78 : at - 0.03);
    const hit = sample(at);
    const follow = sample(at + Math.min(0.12, tail * 0.5));
    const settle = sample(at + tail * 0.98);
    a.dispose();
    const fmt = (p: Vector3) => p.toArray().map(n => n.toFixed(3)).join('/');
    console.info(id, move || 'bow', [load, hit, follow].map(s => fmt(s.mark)).join(' | '),
      'angle', hit.angle.toFixed(2), 'floor', hit.floor.toFixed(3));
    expect(worstSupport).toBeLessThan(0.07);

    if (bow) {
      for (const s of [load, hit]) {
        expect(s.mark.z).toBeGreaterThanOrEqual(0.35);
        expect(s.mark.y).toBeGreaterThanOrEqual(1.1); expect(s.mark.y).toBeLessThanOrEqual(1.6);
      }
      expect(load.left.z - load.right.z).toBeGreaterThanOrEqual(0.30);
      expect(load.nock!.distanceTo(load.right)).toBeLessThan(0.035);
      expect(mid.nock!.distanceTo(mid.right)).toBeLessThan(0.035);
      expect(hit.nock!.z - hit.right.z).toBeGreaterThan(0.30);
      expect(hit.right.z).toBeLessThan(load.right.z);
      expect(settle.left.y).toBeLessThan(load.left.y - 0.20);
    } else if (hammer) {
      if (move === 'slam') {
        expect(load.mark.y).toBeGreaterThan(load.headTop);
        expect(hit.mark.y).toBeLessThanOrEqual(0.25); expect(Math.abs(hit.floor)).toBeLessThan(0.02);
        expect(follow.mark.y).toBeCloseTo(hit.mark.y, 1);
      } else {
        expect(load.mark.x).toBeLessThan(-0.35); expect(follow.mark.x).toBeGreaterThan(0.35);
        expect(hit.mark.y).toBeGreaterThanOrEqual(0.6); expect(hit.mark.y).toBeLessThanOrEqual(1.3);
      }
      expect(hit.mark.z).toBeGreaterThanOrEqual(0.6);
      for (const s of [load, mid, hit, follow]) {
        expect(s.shaftGap).toBeLessThan(0.085);
        expect(s.along).toBeGreaterThan(-0.29); expect(s.along).toBeLessThan(0.37);
      }
    } else if (move === 'cut') {
      expect(load.mark.y).toBeGreaterThan(load.headTop);
      expect(hit.mark.z).toBeGreaterThanOrEqual(0.5);
      expect(follow.mark.x).toBeGreaterThan(hit.mark.x);
      expect(follow.mark.y).toBeLessThan(hit.mark.y - 0.2);
    } else if (move === 'shoot') {
      expect(hit.angle).toBeLessThanOrEqual(15);
      expect(hit.mark.y).toBeGreaterThanOrEqual(1.2); expect(hit.mark.y).toBeLessThanOrEqual(1.6);
      expect(hit.stock.z).toBeLessThan(load.stock.z - 0.025);
      expect(load.stockToShoulder).toBeLessThan(0.16);
      expect(mid.bolt).toBe(true); expect(hit.bolt).toBe(false);
      expect(hit.nock!.z).toBeGreaterThan(load.nock!.z + 0.20);
      expect(hit.shaftGap).toBeLessThan(0.08);
    } else if (move === 'cast') {
      expect(load.tip.y).toBeGreaterThan(0); expect(load.tip.y).toBeLessThan(0.10);
      expect(Math.hypot(load.tip.x - load.foot.x, load.tip.z - load.foot.z)).toBeLessThan(0.25);
      expect(mid.right.y - load.right.y).toBeGreaterThan(0.13);
      for (const s of [load, mid]) {
        expect(s.right.distanceTo(s.nock!)).toBeLessThan(0.055);
        expect(s.shaftGap).toBeLessThan(0.05);
      }
      expect(mid.bolt).toBe(false); expect(hit.bolt).toBe(true);
      expect(follow.tip.y).toBeGreaterThan(load.tip.y + 0.3);
    } else if (move === 'sow') {
      expect(hit.tip.y).toBeGreaterThanOrEqual(0); expect(hit.tip.y).toBeLessThanOrEqual(0.2);
      expect(load.tip.y).toBeGreaterThan(hit.tip.y + 1);
      expect(settle.tip.y).toBeGreaterThan(hit.tip.y + 0.5);
    } else {
      expect(hit.extension).toBeGreaterThan(0.97);
      expect(hit.mark.z).toBeGreaterThanOrEqual(move === 'lunge' ? 1.1 : 0.9);
      expect(hit.mark.y).toBeGreaterThanOrEqual(0.8); expect(hit.mark.y).toBeLessThanOrEqual(1.5);
      expect(hit.angle).toBeLessThanOrEqual(25);
      expect(hit.foot.z - load.foot.z).toBeGreaterThan(move === 'lunge' ? 0.30 : 0.15);
      expect(hit.right.z - load.right.z).toBeGreaterThan(0.26);
      if (base === 'wl_spear') for (const s of [load, mid, hit, follow]) expect(s.shaftGap).toBeLessThan(0.085);
      if (base === 'wl_shield') {
        expect(hit.left.z).toBeGreaterThan(hit.hips.z + 0.20);
        expect(hit.tip.x).toBeLessThan(hit.left.x - 0.33);
        expect(hit.tip.z).toBeGreaterThan(hit.left.z + 0.50);
      }
    }
  });
}
