import { Mesh, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { FINE_WHITE } from '../src/present/act/heroineFine';
import { BattleActor } from '../src/present/bestiary/battle';
import { Action, type Bone } from '../src/present/actors/rig';
import { attackBeats } from '../src/present/act/foes/foe_motion';
import '../src/present/act/foes/hj_models';
import '../src/present/act/foes/ly_models';
import '../src/present/act/foes/ly_poses';
import '../src/present/act/foes/r45_models';
import '../src/present/act/foes/r45_pose';

const DT = 1 / 60;
const SPEEDS = [1.5, 2.5, 4];
const SIDES = ['L', 'R'] as const;

function footHeight(foot: Bone) {
  const meshes = foot.children.filter((child): child is Mesh => (child as Mesh).isMesh);
  expect(meshes.length).toBeGreaterThan(0);
  return () => {
    let lowest = Infinity;
    for (const mesh of meshes) {
      const positions = mesh.geometry.getAttribute('position');
      const matrix = mesh.matrixWorld.elements;
      for (let i = 0; i < positions.count; i++) {
        const y = matrix[1] * positions.getX(i) + matrix[5] * positions.getY(i) + matrix[9] * positions.getZ(i) + matrix[13];
        lowest = Math.min(lowest, y);
      }
    }
    return lowest;
  };
}

for (const id of ['hj_blade', 'ly_halberd']) {
  it.each(SPEEDS)(`${id} keeps ground contact and bends its knees at %s m/s`, speed => {
    const actor = new BattleActor(id);
    actor.t = 1.25;
    actor.place(new Vector3(), 0);
    const ankles = SIDES.map(side => actor.bones['foot' + side]);
    const sole = ankles.map(footHeight);
    actor.root.updateMatrixWorld(true);
    const standing = sole.map(height => height());
    actor.setRunning(true, speed);

    const previous = [new Vector3(), new Vector3()];
    const plants = [0, 0], slide = [0, 0], landed = [false, false];
    const knee = [0, 0], cycles: number[] = [];
    let worstSlide = 0, worstHeight = 0, samplesOnGround = 0;
    for (let frame = 1; frame <= 120; frame++) {
      actor.home.z = speed * frame * DT;
      actor.update(DT);
      actor.root.updateMatrixWorld(true);
      const feet = ankles.map(foot => foot.getWorldPosition(new Vector3()));
      const height = sole.map((measure, i) => measure() - standing[i]);
      const lowest = Math.min(...height);
      worstHeight = Math.max(worstHeight, Math.abs(lowest));
      let onGround = false;
      for (const [i, side] of SIDES.entries()) {
        // A lowest sole that is still in flight is not a contact. The 0.1 mm
        // tolerance also includes both feet during the walking transfer.
        const planted = Math.abs(height[i]) < 0.0001 && height[i] - lowest < 0.0001;
        onGround ||= planted;
        if (planted && landed[i]) slide[i] += feet[i].distanceTo(previous[i]);
        if (planted && !landed[i]) {
          if (plants[i]++) cycles.push(knee[i]);
          knee[i] = 0;
          slide[i] = 0;
        }
        worstSlide = Math.max(worstSlide, slide[i]);
        knee[i] = Math.max(knee[i], actor.bones['shin' + side].rotation.x);
        previous[i].copy(feet[i]);
        landed[i] = planted;
      }
      if (onGround) samplesOnGround++;
    }
    actor.dispose();
    const minKnee = Math.min(...cycles);
    console.info(`${id} ${speed} m/s: worst slide ${(worstSlide * 100).toFixed(3)} cm, height error ${(worstHeight * 100).toFixed(3)} cm, min cycle knee ${minKnee.toFixed(3)} rad, contact in ${samplesOnGround}/120 frames`);
    expect(plants.every(count => count >= 2)).toBe(true);
    expect(samplesOnGround).toBeGreaterThanOrEqual(speed >= 2.5 ? 100 : 119);
    expect(worstSlide).toBeLessThanOrEqual(0.03);
    expect(worstHeight).toBeLessThanOrEqual(0.03);
    expect(minKnee).toBeGreaterThanOrEqual(speed >= 3.2 ? 0.8 : 0.4);
  });
}

it('keeps impact at the action marker and carries past it before settling', () => {
  for (const [dur, at] of [[0.52, 0.5], [1.2, 0.6], [1.5, 0.85]]) {
    const a = new Action('attack', dur, at);
    a.t = at * dur - 0.048;
    const lead = attackBeats(a, true);
    expect(lead.hip).toBeGreaterThan(lead.chest);
    expect(lead.chest).toBeGreaterThan(lead.hit);
    a.t = dur * at;
    expect(attackBeats(a, true).hit).toBe(1);
    a.t += Math.min(0.08, (dur - a.t) * 0.24);
    expect(attackBeats(a, true).hit).toBeCloseTo(1.15, 10);
    a.t = dur;
    expect(attackBeats(a, true).hit).toBe(0);
  }
});

it('takes the recoil direction from the existing impulse and buckles before a fall', () => {
  const actor = new BattleActor('hj_blade');
  actor.t = 1.25;
  const velocity = new Vector3();
  actor.setRunning(false, 0, 0, velocity);
  actor.hurt(1.4);
  velocity.x = -1.4;
  actor.update(4 * DT);
  expect(actor.off.x).toBeLessThan(-0.15);
  expect(Math.abs(actor.off.z)).toBeLessThan(0.001);
  expect(actor.bones.chest.rotation.y).toBeLessThan(-0.3);

  actor.fall();
  actor.update(0.2);
  expect(actor.bones.shinL.rotation.x).toBeGreaterThan(0.5);
  expect(Math.abs(actor.bones.hips.rotation.z)).toBeLessThan(0.15);
  actor.update(1.01);
  expect(actor.act).toBeNull();
  expect(actor.off.x).toBeLessThan(-0.25);
  expect(actor.bones.hips.rotation.z).toBeGreaterThan(1.2);
  actor.dispose();
});

it('preserves the oil jar launch point from the original pose', () => {
  const actor = new BattleActor('wl_oil_e');
  actor.t = 1.25;
  actor.lowHp = 0.45;
  actor.root.scale.setScalar(1.15);
  actor.place(new Vector3(2, 0, 3), -0.2);
  const a = actor.play(new Action('attack', 1.2, 0.5, { atk: 'lob' }));
  a.t = 0.58;
  actor.update(0);
  const origin = actor.weapon().toArray().map(n => Number(n.toFixed(10)));
  expect(origin).toEqual([1.3985020322, 2.0253750569, 3.2530642679]);
  expect(actor.weapon().distanceTo(actor.bonePos('handR', 0, -2 * actor.cy, actor.cx))).toBeGreaterThan(0.05);
  actor.dispose();
});

it('preserves every sampled fine_white pose byte for byte', async () => {
  const frames: number[] = [];
  for (const speed of SPEEDS) {
    const hero = new BattleActor(FINE_WHITE);
    hero.t = 1.25;
    hero.place(new Vector3(), 0);
    hero.setRunning(speed > 0.6, speed);
    for (let frame = 1; frame <= 120; frame++) {
      hero.home.z = frame * DT * speed;
      if (frame === 31) hero.attack();
      if (frame === 91) hero.hurt(1.2);
      hero.update(DT);
      const parts = [hero.root, hero.body, ...Object.values(hero.bones)];
      frames.push(...parts.flatMap(part => [...part.position, ...part.quaternion, ...part.scale]));
    }
    hero.dispose();
  }
  const bytes = new DataView(new ArrayBuffer(frames.length * 8));
  frames.forEach((value, index) => bytes.setFloat64(index * 8, value, true));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  expect(Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, '0')).join('')).toBe('4f1875ca38cd49dba198e65aa04cf83779f71592f44b60c0891649311dcd6c03');
});
