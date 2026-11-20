import { Mesh, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { FINE_WHITE } from '../src/present/act/heroineFine';
import { motionOf } from '../src/present/act/ninjaAct';
import { BattleActor } from '../src/present/bestiary/battle';
import { Action, type Bone } from '../src/present/actors/rig';
import { attackBeats } from '../src/present/act/foes/foe_motion';
import '../src/present/act/foes/hj_models';
import '../src/present/act/foes/hj_poses';
import '../src/present/act/foes/ly_models';
import '../src/present/act/foes/ly_poses';
import '../src/present/act/foes/xp_models';
import '../src/present/act/foes/xp_poses';
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

it('keeps hero motion invariants across idle, sprint, five cuts and spring ribbons', () => {
  const hero = new BattleActor(FINE_WHITE);
  hero.t = 0.2;
  hero.place(new Vector3(), 0);
  const m = motionOf(hero);
  const shLY0 = hero.bones.shL.rest!.p.y;
  const shRY0 = hero.bones.shR.rest!.p.y;

  // 1) Idle: asymmetric breath, no shoulder shrugging, left elbow never locks straight, no NaN
  let chestMin = Infinity, chestMax = -Infinity;
  for (let i = 0; i < 180; i++) {
    hero.update(DT);
    expect(hero.bones.shL.position.y).toBeLessThanOrEqual(shLY0 + 1e-6);
    expect(hero.bones.shR.position.y).toBeLessThanOrEqual(shRY0 + 1e-6);
    expect(hero.bones.foreL.rotation.x).toBeLessThanOrEqual(-0.20);
    chestMin = Math.min(chestMin, hero.bones.chest.rotation.x);
    chestMax = Math.max(chestMax, hero.bones.chest.rotation.x);
    expect(Number.isFinite(hero.bones.bfA1.rotation.x)).toBe(true);
    expect(hero.bones.bfA1.rotation.x).toBeGreaterThanOrEqual(-0.06);
  }
  expect(chestMax - chestMin).toBeGreaterThan(0.05);

  // 2) Sprint: ribbons stream backward smoothly, upper body stays steady (no side sway), left elbow stays bent
  m.run = 1;
  let ribbonRunMax = 0, maxTorsoRoll = 0;
  for (let i = 0; i < 90; i++) {
    m.phase += 6.5 * 2.5 * DT;
    hero.home.z += 6.5 * DT;
    hero.update(DT);
    expect(hero.bones.foreL.rotation.x).toBeLessThanOrEqual(-0.20);
    ribbonRunMax = Math.max(ribbonRunMax, hero.bones.bfA1.rotation.x);
    maxTorsoRoll = Math.max(maxTorsoRoll, Math.abs(hero.bones.hips.rotation.z), Math.abs(hero.bones.spine.rotation.z));
  }
  expect(ribbonRunMax).toBeGreaterThan(0.45);
  expect(maxTorsoRoll).toBeLessThan(0.05);

  // 3) All 5 combo cuts + release: left elbow stays bent, gaze counter-rotates torso twist on k1/k2
  m.run = 0;
  for (const name of ['k1', 'k2', 'k3', 'k4', 'k5', 'rel'] as const) {
    hero.play(new Action(name, 0.5, 0.4));
    let sawCounterGaze = false;
    for (let i = 0; i < 32; i++) {
      hero.update(DT);
      expect(hero.bones.foreL.rotation.x).toBeLessThanOrEqual(-0.20);
      const torsoYaw = hero.bones.hips.rotation.y + hero.bones.spine.rotation.y;
      if (Math.abs(torsoYaw) > 0.35 && hero.bones.neck.rotation.y * torsoYaw < -0.05) sawCounterGaze = true;
    }
    if (name === 'k1' || name === 'k2') expect(sawCounterGaze, `${name} neck counter-rotates`).toBe(true);
  }
  hero.dispose();
});

it('streams Yellow Turban headband tails (scA/scB) dynamically with spring lag during movement', () => {
  const actor = new BattleActor('hj_blade');
  actor.t = 1.0;
  actor.place(new Vector3(), 0);
  actor.setRunning(false, 0);
  for (let i = 0; i < 30; i++) actor.update(DT);
  const idleTail = actor.bones.scA1.rotation.x;
  actor.setRunning(true, 4.0);
  let runTailMax = 0;
  for (let i = 0; i < 60; i++) {
    actor.home.z += 4.0 * DT;
    actor.update(DT);
    expect(Number.isFinite(actor.bones.scA1.rotation.x)).toBe(true);
    expect(actor.bones.scA1.rotation.x).toBeGreaterThanOrEqual(0);
    runTailMax = Math.max(runTailMax, actor.bones.scA1.rotation.x);
  }
  expect(runTailMax).toBeGreaterThan(idleTail + 0.35);
  actor.dispose();
});

it('articulates hero secondary cloth/tassel/hair bones and robed foes without NaN or clipping', () => {
  // 1) Hero FINE_WHITE: swTassel hangs downward in world space; hair/ribbons stay below horizontal in sprint (never float skyward);
  // 3-segment hipSlv1..3 bends dynamically; hairL/R & sashT stay clipped-free.
  const hero = new BattleActor(FINE_WHITE);
  hero.t = 0.5;
  hero.place(new Vector3(), 0);
  for (const b of ['swTassel', 'sashT', 'hipSlv1', 'hipSlv2', 'hipSlv3', 'hairL', 'hairR']) expect(hero.bones[b], `hero bone ${b}`).toBeDefined();
  const m = motionOf(hero);
  m.run = 1;
  let maxSlv = 0, maxTasselQuatDiff = 0, worstRibbonWorldY = -1, worstHairWorldY = -1;
  let hairYMin = 1, hairYMax = -1, hairXMin = 1, hairXMax = -1;
  const q0 = hero.bones.swTassel.quaternion.clone();
  const downDir = new Vector3(0, -1, 0), tmpDir = new Vector3();
  for (let i = 0; i < 60; i++) {
    m.phase += 6.5 * 2.5 * DT;
    hero.home.z += 6.5 * DT;
    hero.update(DT);
    hero.root.updateMatrixWorld(true);
    expect(Number.isFinite(hero.bones.hipSlv1.rotation.x)).toBe(true);
    expect(hero.bones.sashT.rotation.x).toBeLessThanOrEqual(0.025);
    expect(hero.bones.hairL.rotation.z).toBeGreaterThanOrEqual(-0.005);
    expect(hero.bones.hairR.rotation.z).toBeLessThanOrEqual(0.005);
    maxSlv = Math.max(maxSlv, Math.abs(hero.bones.hipSlv1.rotation.x) + Math.abs(hero.bones.hipSlv2.rotation.x));
    maxTasselQuatDiff = Math.max(maxTasselQuatDiff, q0.angleTo(hero.bones.swTassel.quaternion));
    if (i > 15) {
      const bfQ = hero.bones.bfA3.getWorldQuaternion(hero.bones.bfA3.quaternion.clone());
      const hrQ = hero.bones.hrA3.getWorldQuaternion(hero.bones.hrA3.quaternion.clone());
      worstRibbonWorldY = Math.max(worstRibbonWorldY, tmpDir.copy(downDir).applyQuaternion(bfQ).y);
      tmpDir.copy(downDir).applyQuaternion(hrQ);
      worstHairWorldY = Math.max(worstHairWorldY, tmpDir.y);
      hairYMin = Math.min(hairYMin, tmpDir.y); hairYMax = Math.max(hairYMax, tmpDir.y);
      hairXMin = Math.min(hairXMin, tmpDir.x); hairXMax = Math.max(hairXMax, tmpDir.x);
    }
  }
  expect(maxSlv).toBeGreaterThan(0.25);
  expect(maxTasselQuatDiff).toBeGreaterThan(0.15);
  expect(worstRibbonWorldY, 'sprint ribbon stays below horizontal').toBeLessThan(-0.10);
  expect(worstHairWorldY, 'sprint hair stays below horizontal').toBeLessThan(-0.22);
  expect(hairYMax - hairYMin, 'sprint ponytail bounces vertically (not stiff)').toBeGreaterThan(0.14);
  expect(hairXMax - hairXMin, 'sprint ponytail swishes left-right (not stiff)').toBeGreaterThan(0.22);
  hero.dispose();

  // 2) Long-robed enemies: robe1 -> robe2 [-> robe3] + pendants visibly sway/swirl even while WALKING (1.6 m/s) with real step bob
  for (const [id, tiers] of [
    ['hj_taoist', ['robe1', 'robe2', 'robe3', 'pendL', 'pendR', 'gourd', 'swTassel']],
    ['xp_frost', ['robe1', 'robe2', 'robe3']],
    ['cx_boss', ['robe1', 'robe2', 'robe3', 'pendL', 'pendR']],
    ['wl_boss', ['robe1', 'robe2']],
  ] as const) {
    const foe = new BattleActor(id);
    foe.t = 1.0;
    foe.place(new Vector3(), 0);
    for (const b of tiers) expect(foe.bones[b], `${id} bone ${b}`).toBeDefined();
    foe.setRunning(true, 1.6);
    let r1Max = 0, r2Max = 0, swayMax = 0, hipMin = Infinity, hipMax = -Infinity;
    for (let i = 0; i < 60; i++) {
      foe.home.z += 1.6 * DT;
      foe.update(DT);
      expect(Number.isFinite(foe.bones.robe1.rotation.x)).toBe(true);
      expect(Number.isFinite(foe.bones.robe2.rotation.x)).toBe(true);
      r1Max = Math.max(r1Max, foe.bones.robe1.rotation.x);
      r2Max = Math.max(r2Max, foe.bones.robe2.rotation.x);
      swayMax = Math.max(swayMax, Math.abs(foe.bones.robe1.rotation.y) + Math.abs(foe.bones.robe2.rotation.y) + Math.abs(foe.bones.robe1.rotation.z) + Math.abs(foe.bones.robe2.rotation.z));
      hipMin = Math.min(hipMin, foe.bones.hips.position.y);
      hipMax = Math.max(hipMax, foe.bones.hips.position.y);
    }
    expect(r1Max, `${id} robe1 trails on walk`).toBeGreaterThan(0.045);
    expect(r2Max, `${id} robe2 trails on walk`).toBeGreaterThan(0.055);
    expect(swayMax, `${id} robe visibly sways/swirls on walk`).toBeGreaterThan(0.14);
    expect(hipMax - hipMin, `${id} has real step bob (not gliding)`).toBeGreaterThan(0.015);
    foe.dispose();
  }
});

it('gives hero Liu Bai 4-directional hurt reactions and a grounded kneel-to-side death collapse', () => {
  const hero = new BattleActor(FINE_WHITE);
  hero.t = 0.2;
  hero.place(new Vector3(), 0);
  // 1) All 4 cardinal hurt directions produce distinct directional recoil & torso response
  const sampleHurt = (fromAngle: number) => {
    hero.hurt(1.4, fromAngle);
    for (let i = 0; i < 6; i++) hero.update(DT);
    return {
      ox: hero.off.x, oz: hero.off.z,
      sx: hero.bones.spine.rotation.x, sz: hero.bones.spine.rotation.z,
      fL: hero.bones.foreL.rotation.x,
    };
  };
  const front = sampleHurt(0);
  const back  = sampleHurt(Math.PI);
  const left  = sampleHurt(Math.PI / 2);
  const right = sampleHurt(-Math.PI / 2);
  expect(front.oz).toBeLessThan(-0.15);
  expect(back.oz).toBeGreaterThan(0.15);
  expect(back.sx).toBeGreaterThan(front.sx + 0.5);
  expect(left.ox).toBeLessThan(-0.15);
  expect(right.ox).toBeGreaterThan(0.15);
  expect(left.sz).toBeLessThan(-0.15);
  expect(right.sz).toBeGreaterThan(0.15);
  for (const s of [front, back, left, right]) expect(s.fL).toBeLessThanOrEqual(-0.20);

  // 2) Death collapse: kneels properly with forward-bent knees (shin.x > 0), then lies cleanly on ground (hips.y > 0.14)
  hero.fall(0);
  for (let i = 0; i < 40; i++) hero.update(DT); // ~0.67s -> kneel / blade-prop beat
  expect(hero.bones.shinL.rotation.x).toBeGreaterThan(0.8);
  expect(hero.bones.shinR.rotation.x).toBeGreaterThan(0.8);
  for (let i = 0; i < 70; i++) hero.update(DT); // ~1.83s -> settled on ground & stays dead
  expect(hero.bones.hips.position.y).toBeGreaterThan(0.14);
  expect(hero.bones.hips.position.y).toBeLessThan(0.32);
  expect(Math.hypot(hero.bones.hips.rotation.x, hero.bones.hips.rotation.z)).toBeGreaterThan(0.95);
  expect(hero.bones.shinL.rotation.x).toBeGreaterThan(0.35);
  expect(hero.bones.shinR.rotation.x).toBeGreaterThan(0.25);
  hero.dispose();
});
