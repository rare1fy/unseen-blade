// 鱼人狂战 — the player: a barrel-chested deep-sea fishman berserker (original design). Teal scales and a cream belly, a flame-orange
// dorsal crest, bulging eyes, an underbite of needle teeth, a turtle-shell pauldron, red war paint, and a whalebone-and-iron cleaver.
// Local front is +Z; its weapon hand is the right (−X).
import * as THREE from 'three';
import { Actor } from './actor';
import { RigBuilder, Action, rot, mov, curve, snap, ball, capsule, limb, type Bone } from './rig';
import { toon, glow } from '../look/toon';
import { V3 } from '../engine/world';

const M = {
  skin: () => toon(0x2f9a92), skinD: () => toon(0x1d6464), belly: () => toon(0xead9b0), fin: () => toon(0xe8623a), finD: () => toon(0xa83a24),
  eye: () => toon(0xfaf6e8, { emissive: 0x222222 }), pupil: () => toon(0x0c1014), mouth: () => toon(0x3a0e16), teeth: () => toon(0xfff6e0),
  shell: () => toon(0x7a5030), shellL: () => toon(0xb08048), red: () => toon(0xc0282e), bone: () => toon(0xe8dcc0), iron: () => toon(0x4a505c), ironD: () => toon(0x2a2c34), rust: () => toon(0xa0502a), edge: () => toon(0xd8dce4, { emissive: 0x202428 }),
};

function fin(points: Array<[number, number]>, depth = 0.05) {
  const s = new THREE.Shape(); points.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1 }); g.translate(0, 0, -depth / 2); return g;
}
function cleaverBlade() {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(0.62, -0.05); s.lineTo(0.72, 0.42); s.lineTo(0.66, 0.9);
  for (let i = 0; i < 5; i++) { s.lineTo(0.5 - i * 0.1, 0.95 - (i % 2) * 0.07); }   // serrated spine
  s.lineTo(0.02, 0.86); s.lineTo(0.12, 0.6); s.lineTo(0, 0.5); s.lineTo(0, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1 }); g.translate(0, 0, -0.03); return g;
}

export class Hero extends Actor {
  readonly height = 2.05;
  aim = 0;          // 0 rest … 1 weapon raised toward enemies (selection readiness)
  breath = 1;       // panting multiplier (low HP)

  constructor() {
    super();
    const R = new RigBuilder(); this.body.add(R.root);
    const hips = R.bone('hips', null, 0, 0.82, 0), spine = R.bone('spine', hips, 0, 0.14, 0), chest = R.bone('chest', spine, 0, 0.42, 0);
    const neck = R.bone('neck', chest, 0, 0.42, 0.04), head = R.bone('head', neck, 0, 0.2, 0.06), jaw = R.bone('jaw', head, 0, -0.08, 0.18);
    const shL = R.bone('shL', chest, 0.56, 0.26, 0), armL = R.bone('armL', shL, 0.06, 0, 0), foreL = R.bone('foreL', armL, 0, -0.42, 0), handL = R.bone('handL', foreL, 0, -0.38, 0);
    const shR = R.bone('shR', chest, -0.56, 0.26, 0), armR = R.bone('armR', shR, -0.06, 0, 0), foreR = R.bone('foreR', armR, 0, -0.42, 0), handR = R.bone('handR', foreR, 0, -0.38, 0);
    const weapon = R.bone('weapon', handR, 0, -0.02, 0);
    const legL = R.bone('legL', hips, 0.26, -0.08, 0), shinL = R.bone('shinL', legL, 0, -0.36, 0), footL = R.bone('footL', shinL, 0, -0.32, 0);
    const legR = R.bone('legR', hips, -0.26, -0.08, 0), shinR = R.bone('shinR', legR, 0, -0.36, 0), footR = R.bone('footR', shinR, 0, -0.32, 0);
    const tail = R.bone('tail', hips, 0, -0.05, -0.38), crest = R.bone('crest', head, 0, 0.38, -0.08), dorsal = R.bone('dorsal', chest, 0, 0.18, -0.4);
    const skin = M.skin(), skinD = M.skinD(), belly = M.belly(), finM = M.fin(), finD = M.finD(), red = M.red();
    // hips and sash
    R.add(hips, ball(0.42), skin, [0, 0, 0], [0, 0, 0], [1.12, 0.78, 0.92]);
    R.add(hips, new THREE.TorusGeometry(0.43, 0.07, 8, 20), red, [0, 0.08, 0], [Math.PI / 2, 0, 0], [1.05, 0.95, 1]);
    R.add(hips, new THREE.BoxGeometry(0.34, 0.42, 0.06), red, [0.05, -0.22, 0.38], [0.1, 0, 0.05]);
    R.add(hips, new THREE.BoxGeometry(0.2, 0.32, 0.05), M.finD(), [-0.16, -0.18, 0.37], [0.1, 0, -0.15]);
    // torso, belly, shell pauldron, dorsal fin
    R.add(chest, ball(0.62), skin, [0, 0.02, 0], [0.12, 0, 0], [1.06, 0.98, 0.86]);
    R.add(chest, ball(0.5), belly, [0, -0.04, 0.24], [0.1, 0, 0], [0.86, 0.98, 0.62]);
    for (let i = 0; i < 4; i++) R.add(chest, new THREE.BoxGeometry(0.5 - i * 0.06, 0.03, 0.04), M.shellL(), [0, -0.3 + i * 0.16, 0.54 - Math.abs(i - 1.5) * 0.04]);
    R.add(spine, ball(0.48), skin, [0, 0.12, 0], [0, 0, 0], [1.02, 0.7, 0.86]);
    R.add(dorsal, fin([[0, 0], [0.05, 0.42], [0.3, 0.3], [0.5, 0.52], [0.66, 0.2], [0.82, 0.36], [0.9, 0]]), finM, [0, 0, 0], [0, -Math.PI / 2, -0.25]);
    R.add(shL, ball(0.36, 1, 0.72, 1), M.shell(), [0.06, 0.1, 0], [0, 0, -0.35]);
    for (let i = 0; i < 3; i++) R.add(shL, new THREE.TorusGeometry(0.3 - i * 0.08, 0.025, 5, 14, Math.PI), M.shellL(), [0.06, 0.16 + i * 0.05, 0], [0, Math.PI / 2, -0.35]);
    R.add(shL, new THREE.ConeGeometry(0.06, 0.18, 6), M.bone(), [0.24, 0.3, 0], [0, 0, -0.9]);
    // head: big round skull, eyes, brows, underbite with needle teeth, war paint, gills, crest and ear fins
    R.add(head, ball(0.5), skin, [0, 0.2, 0], [0, 0, 0], [1.14, 0.96, 1.04]);
    R.add(head, ball(0.44), skinD, [0, 0.0, 0.08], [0, 0, 0], [1.1, 0.6, 1.0]);
    for (const sx of [-1, 1]) {
      R.add(head, ball(0.16), M.eye(), [sx * 0.3, 0.33, 0.33]);
      R.add(head, ball(0.075), M.pupil(), [sx * 0.31, 0.34, 0.47]);
      R.add(head, new THREE.BoxGeometry(0.3, 0.09, 0.12), M.finD(), [sx * 0.27, 0.49, 0.42], [0.2, 0, sx * 0.42]);
      R.add(head, fin([[0, 0], [0.1, 0.3], [0.28, 0.18], [0.24, -0.04]], 0.03), finM, [sx * 0.52, 0.22, -0.05], [0, sx > 0 ? -0.4 : Math.PI + 0.4, 0]);
      for (let g = 0; g < 3; g++) R.add(head, new THREE.BoxGeometry(0.03, 0.16, 0.06), M.mouth(), [sx * (0.5 - g * 0.04), 0.08, 0.06 - g * 0.1], [0, 0, sx * 0.2]);
    }
    R.add(head, new THREE.BoxGeometry(0.86, 0.06, 0.06), red, [0, 0.42, 0.47], [0.2, 0, 0]);       // war paint across the face
    R.add(head, new THREE.BoxGeometry(0.06, 0.24, 0.05), red, [0, 0.58, 0.4], [0.4, 0, 0]);
    R.add(crest, fin([[0, 0], [0.12, 0.34], [0.3, 0.22], [0.42, 0.44], [0.6, 0.18], [0.66, 0]], 0.05), finM, [0, 0, 0], [0, -Math.PI / 2, -0.2]);
    R.add(jaw, ball(0.38), skinD, [0, -0.06, 0.06], [0, 0, 0], [1.14, 0.5, 0.9]);
    R.add(jaw, ball(0.32), M.mouth(), [0, 0.02, 0.1], [0, 0, 0], [1.1, 0.35, 0.9]);
    for (let i = 0; i < 7; i++) { const a = -0.9 + i * 0.3; R.add(jaw, new THREE.ConeGeometry(0.035, 0.12, 5), M.teeth(), [Math.sin(a) * 0.36, 0.08, 0.1 + Math.cos(a) * 0.3]); }
    // arms with forearm fins and webbed mitts
    for (const [sh, arm, fore, hand, sx] of [[shL, armL, foreL, handL, 1], [shR, armR, foreR, handR, -1]] as Array<[Bone, Bone, Bone, Bone, number]>) {
      R.add(sh, ball(0.2), skin);
      R.add(arm, capsule(0.17, 0.26), skin);
      R.add(fore, capsule(0.15, 0.22), skin); R.add(fore, ball(0.165), skin);
      R.add(fore, fin([[0, 0], [0.08, -0.32], [0.24, -0.1]], 0.03), finD, [sx * 0.12, -0.04, -0.06], [0, sx > 0 ? -Math.PI / 2 : Math.PI / 2, 0]);
      R.add(hand, ball(0.17, 1, 0.9, 1.1), skinD, [0, -0.06, 0]);
      R.add(fore, new THREE.TorusGeometry(0.16, 0.035, 6, 14), red, [0, -0.32, 0], [Math.PI / 2, 0, 0]);
    }
    // legs and flipper feet
    for (const [leg, shin, foot] of [[legL, shinL, footL], [legR, shinR, footR]]) {
      R.add(leg, capsule(0.2, 0.18), skin); R.add(shin, capsule(0.17, 0.16), skin);
      R.add(foot, ball(0.2, 1.1, 0.42, 1.6), skinD, [0, -0.04, 0.14]);
      R.add(foot, fin([[0, 0], [-0.18, 0.28], [0, 0.22], [0.18, 0.28]], 0.03), finD, [0, -0.06, 0.38], [-Math.PI / 2, 0, 0]);
    }
    R.add(tail, fin([[0, 0], [-0.26, -0.32], [0, -0.16], [0.26, -0.32]], 0.04), finM, [0, 0, 0], [0.8, 0, 0]);
    // the cleaver: whalebone grip with red wraps, a serrated iron blade with a rusted edge
    R.add(weapon, limb(0.05, 0.045, 0.9), M.bone(), [0, 0.42, 0]);
    for (let i = 0; i < 3; i++) R.add(weapon, new THREE.TorusGeometry(0.055, 0.02, 5, 10), red, [0, 0.1 - i * 0.14, 0], [Math.PI / 2, 0, 0]);
    R.add(weapon, ball(0.08), M.bone(), [0, -0.5, 0]);
    R.add(weapon, cleaverBlade(), M.iron(), [0.02, 0.3, 0], [0, Math.PI / 2, 0], [1.25, 1.25, 1.25]);
    R.add(weapon, new THREE.BoxGeometry(0.075, 1.0, 0.05), M.edge(), [0, 0.86, -0.86], [-0.08, 0, 0]);
    R.add(weapon, new THREE.BoxGeometry(0.08, 0.5, 0.18), M.rust(), [0, 0.72, -0.35], [0.08, 0, 0]);
    R.add(weapon, new THREE.BoxGeometry(0.1, 0.12, 0.12), M.ironD(), [0, 0.32, -0.02]);
    this.bones = R.bones;
    this.finish(R.build());
    this.root.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
  }

  weapon() { return this.bonePos('weapon', 0, 1.05, -0.5); }

  // ---- actions (each returns the Action; await .impact for the hit frame)
  attack(dist: number) { return this.play(new Action('attack', 0.95, 0.52, { dist })); }
  spin(dist: number) { return this.play(new Action('spin', 1.0, 0.55, { dist })); }
  toss() { return this.play(new Action('toss', 0.5, 0.45)); }
  hurt(power = 1) { this.hit(power); return this.play(new Action('hurt', 0.45, 0.1, { power })); }
  block() { return this.play(new Action('block', 0.6, 0.3)); }
  cheer() { return this.play(new Action('cheer', 1.6, 0.3)); }
  bleed() { return this.play(new Action('bleed', 0.6, 0.35)); }
  fall() { this.dead = true; return this.play(new Action('fall', 1.2, 0.6)); }
  setRunning(_on: boolean) { /* procedural fallback hero has no run cycle */ }

  protected pose(dt: number) {
    const b = this.bones, t = this.t, a = this.act, k = a ? a.k : 0, n = a?.name;
    const br = Math.sin(t * 2.4) * this.breath, low = this.lowHp;
    // idle: breathing, swaying, fins fluttering, blinking, cleaver resting on the shoulder
    mov(b.hips, 0, br * 0.015 - low * 0.08, 0); rot(b.spine, 0.06 + low * 0.25 + br * 0.02, Math.sin(t * 0.7) * 0.05, 0); rot(b.chest, 0.04 + br * 0.03, 0, 0);
    rot(b.neck, -0.08 - low * 0.15, Math.sin(t * 0.5) * 0.12, 0); rot(b.head, Math.sin(t * 1.1) * 0.04, 0, Math.sin(t * 0.9) * 0.05);
    rot(b.jaw, 0.06 + Math.max(0, Math.sin(t * 0.8) - 0.92) * 3 + low * 0.2 * (0.5 + 0.5 * Math.sin(t * 6)), 0, 0);
    rot(b.crest, Math.sin(t * 5) * 0.06, 0, 0); rot(b.dorsal, 0, 0, Math.sin(t * 4.2) * 0.05); rot(b.tail, Math.sin(t * 3) * 0.2, Math.sin(t * 2.3) * 0.3, 0);
    rot(b.shL, 0, 0, 0.25); rot(b.armL, 0.2 + br * 0.05, 0, 0.15); rot(b.foreL, -0.5, 0, 0);
    const aim = this.aim;
    rot(b.shR, 0, 0, -0.2); rot(b.armR, -2.5 + aim * 1.2, 0.3, -0.3 + aim * 0.2); rot(b.foreR, -1.0 + aim * 0.4, 0, 0); rot(b.weapon, 0.3 - aim * 0.6, 0, 0);
    rot(b.legL, 0.05, 0, 0.12); rot(b.legR, 0.05, 0, -0.12); rot(b.shinL, -0.12 - low * 0.2, 0, 0); rot(b.shinR, -0.12 - low * 0.2, 0, 0); rot(b.footL, 0.07, 0, 0); rot(b.footR, 0.07, 0, 0);
    const blink = (t % 3.7) < 0.12; if (blink) { this.bones.head.children.forEach(() => {}); }
    this.off.set(0, 0, 0);
    if (!a) return;
    switch (n) {
      case 'attack': {   // wind-up (lean back, cleaver high) → leap → overhead chop → follow-through → walk back
        const d = (a.data.dist as number) || 0;
        const wind = curve(k, [[0, 0], [0.32, 1], [0.48, 1], [0.56, 0], [1, 0]]), chop = snap(k, [[0, 0], [0.45, 0], [0.55, 1], [0.75, 1], [1, 0]]);
        this.off.z = curve(k, [[0, 0], [0.3, -0.2], [0.5, d], [0.72, d], [1, 0]]);
        this.off.y = curve(k, [[0, 0], [0.32, 0], [0.42, 0.55], [0.52, 0], [1, 0]]);
        rot(b.spine, -0.4 * wind + 0.7 * chop, 0, 0); rot(b.chest, -0.2 * wind + 0.3 * chop, 0.3 * wind, 0);
        rot(b.armR, -0.6 * wind + 2.3 * chop, 0, 0.2 * chop); rot(b.foreR, 0.2 * wind + 0.6 * chop, 0, 0); rot(b.weapon, -0.4 * wind + 0.8 * chop, 0, 0);
        rot(b.armL, -1.0 * wind + 0.6 * chop, 0, 0.3); rot(b.jaw, 0.5 * (wind + chop), 0, 0);
        rot(b.legL, -0.5 * chop + 0.3 * wind, 0, 0); rot(b.legR, 0.6 * chop - 0.2 * wind, 0, 0); rot(b.shinL, 0.4 * chop, 0, 0); rot(b.shinR, -0.6 * wind, 0, 0);
        break;
      }
      case 'spin': {     // whirlwind: crouch, spin twice with the cleaver out, plant
        const d = (a.data.dist as number) || 0, s = curve(k, [[0, 0], [0.25, 0], [0.75, 1], [1, 1]]);
        this.off.z = curve(k, [[0, 0], [0.25, -0.1], [0.6, d], [0.8, d], [1, 0]]);
        b.hips.rotation.y += s * Math.PI * 4;
        rot(b.armR, -0.2 * (1 - s) - 1.5 * Math.sin(s * Math.PI), 0, -1.2 * Math.sin(s * Math.PI)); rot(b.weapon, 1.4 * Math.sin(s * Math.PI), 0, 0);
        rot(b.spine, 0.4 * curve(k, [[0, 0], [0.2, 1], [0.8, 0.5], [1, 0]]), 0, 0); rot(b.jaw, 0.5 * Math.sin(s * Math.PI), 0, 0);
        mov(b.hips, 0, -0.15 * curve(k, [[0, 0], [0.2, 1], [0.85, 1], [1, 0]]), 0);
        break;
      }
      case 'toss': {     // underhand toss of the dice with the free hand
        const s = snap(k, [[0, 0], [0.35, -1], [0.5, 1], [1, 0]]);
        rot(b.armL, -1.4 * Math.max(0, s), 0, 0.2); rot(b.armL, 0.8 * Math.max(0, -s), 0, 0); rot(b.spine, 0.15 * Math.max(0, s), -0.2 * s, 0);
        break;
      }
      case 'hurt': {
        const p = (a.data.power as number) || 1, s = snap(k, [[0, 0], [0.12, 1], [1, 0]]) * Math.min(1.5, p);
        rot(b.spine, -0.45 * s, 0, 0.1 * s); rot(b.neck, -0.3 * s, 0, 0); rot(b.jaw, 0.6 * s, 0, 0); rot(b.armL, -0.5 * s, 0, 0.5 * s); this.off.z = -0.35 * s;
        break;
      }
      case 'block': {
        const s = curve(k, [[0, 0], [0.2, 1], [0.7, 1], [1, 0]]);
        rot(b.armR, 1.6 * s, -0.4 * s, 0.9 * s); rot(b.foreR, 0.9 * s, 0, 0); rot(b.weapon, -1.2 * s, 0, 0); rot(b.spine, 0.25 * s, 0, 0); mov(b.hips, 0, -0.1 * s, 0);
        break;
      }
      case 'bleed': {     // drags the cleaver across a fin to pay the blood price
        const s = curve(k, [[0, 0], [0.3, 1], [0.6, 1], [1, 0]]);
        rot(b.armL, -1.2 * s, 0, 0.6 * s); rot(b.foreL, -0.8 * s, 0, 0); rot(b.armR, 1.4 * s, 0, 0.6 * s); rot(b.jaw, 0.4 * s, 0, 0); rot(b.spine, 0.2 * s, 0, 0);
        break;
      }
      case 'cheer': {
        const s = curve(k, [[0, 0], [0.2, 1], [1, 1]]), j = Math.abs(Math.sin(k * Math.PI * 3)) * (1 - k);
        this.off.y = j * 0.5; rot(b.armR, 2.9 * s, 0, -0.3 * s); rot(b.foreR, 0.3 * s, 0, 0); rot(b.weapon, -0.4 * s, 0, 0); rot(b.armL, 2.6 * s, 0, 0.5 * s); rot(b.jaw, 0.7 * s, 0, 0); rot(b.neck, -0.4 * s, 0, 0);
        break;
      }
      case 'fall': {
        const s = curve(k, [[0, 0], [0.6, 1], [1, 1]]);
        rot(b.hips, -1.4 * s, 0, 0.2 * s); mov(b.hips, 0, -0.55 * s, -0.3 * s); rot(b.armR, 0.6 * s, 0, 0.8 * s); rot(b.armL, 0.5 * s, 0, -0.9 * s); rot(b.jaw, 0.5 * s, 0, 0);
        break;
      }
    }
    void dt; void V3; void glow;
  }
}
