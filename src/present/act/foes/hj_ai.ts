import { R, V3 } from '../../engine/world';
import { VoxChar } from '../../look/voxkit';
import { CELL } from '../../bestiary/kit';
import { fxChips, fxSmoke } from '../../fx/fx';
import { cue } from '../../../audio/cues';
import { addFoes, Arrow, canStrike, FOE_AI, setFoeState, startAttack, steerFoe, turnFoe, type FoeWorld } from '../enemy';
import { inside, Tele, type TeleShape } from '../tele';
import { clayJar, HJ_DEFS } from './hj_models';

addFoes({
  hj_sickle: { model: HJ_DEFS.sickle.id, name: HJ_DEFS.sickle.name, hp: 35, r: 0.43, speed: 2.9, mass: 1, poise: 0, gold: 3, role: 'ext' },
  hj_jar: { model: HJ_DEFS.jar.id, name: HJ_DEFS.jar.name, hp: 27, r: 0.43, speed: 2.5, mass: 0.9, poise: 0, gold: 3, role: 'ext' },
});

FOE_AI.hj_sickle = {
  think(f, w, dt, dist, dir, yaw) {
    const can = canStrike(f, w);
    if (can && dist < 2.12 && (w.sees?.(f) ?? true)) {
      startAttack(f, w, { k: 'cone', r: 2.05, half: 1.16 }, 0.82, 9, yaw, { atk: 'reap', low: true, act: { name: 'hjReap', imp: 0.61 } });
      return;
    }
    const want = dist > 1.75 ? w.way?.(f) ?? dir : V3(dir.z, 0, -dir.x).multiplyScalar(f.strafe);
    steerFoe(f, want, f.d.speed, dt, yaw, dist < 1.75);
  },
  windup(f, _w, dt, p, yaw) {
    if (p < 0.44) f.teleYaw = yaw;
    turnFoe(f, f.teleYaw, dt, 18);
    return true;
  },
  recover: () => 0.72,
};

FOE_AI.hj_jar = {
  think(f, w, dt, dist, dir, yaw) {
    const sees = w.sees?.(f) ?? true;
    if (sees && canStrike(f, w) && dist > 2.5 && dist < 9) {
      const spot = w.heroPos.clone().setY(0);
      w.clamp(spot, 0.2);
      startAttack(f, w, null, 0.62, 10, yaw, { atk: 'lob', at: spot, anchor: true, act: { name: 'hjLob', imp: 0.57 } });
      f.cd = R(2.35, 2.75);
      return;
    }
    const want = !sees || dist > 7.5 ? w.way?.(f) ?? dir
      : dist < 4.8 ? dir.clone().negate()
      : V3(dir.z, 0, -dir.x).multiplyScalar(f.strafe);
    steerFoe(f, want, f.d.speed, dt, yaw, sees);
  },
  windup(f, _w, dt) { turnFoe(f, f.teleYaw, dt, 18); return true; },
  strike(f, w) {
    w.arrows.push(new ClayLob(f.a.bonePos('jar'), f.telePos.clone(), f.dmg));
    cue('whoosh', 0.65);
    setFoeState(f, 'strike', 0.20);
    return true;
  },
  recover: () => 0.63,
};

const jarShape: TeleShape = { k: 'circle', r: 1.23, ahead: 0 };
const jarVox = new VoxChar(CELL / 2);
clayJar(jarVox, 'root', 0, 0, 0);
let jarModel: ReturnType<typeof jarVox.build>['root'] | undefined;

/** The landing marker and the projectile share one clock, including hitstop. */
class ClayLob extends Arrow {
  private readonly warning = new Tele(jarShape);
  private readonly flight: number;
  private elapsed = 0;
  private landed = false;

  constructor(private readonly from: ReturnType<typeof V3>, private readonly at: ReturnType<typeof V3>, dmg: number) {
    super(from.clone(), 0, dmg, 0, true);
    this.friendly = true; // area hazard, like a falling rock
    this.flight = Math.min(0.84, Math.max(0.61, from.distanceTo(at) / 10.5));
    jarModel ??= jarVox.build().root;
    this.body.add(jarModel.clone());
    this.warning.set(at.x, at.z, 0, 0, this.flight);
  }

  update(dt: number, w: FoeWorld) {
    if (this.dead) return;
    this.elapsed += dt;
    this.warning.update(dt);
    if (this.landed) { if (this.warning.done) this.kill(); return; }

    const k = Math.min(1, this.elapsed / this.flight);
    this.p.lerpVectors(this.from, this.at, k);
    this.p.y += 0.12 * k + 1.48 * 4 * k * (1 - k);
    this.g.position.copy(this.p);
    this.body.rotation.set(k * 6.7, k * 0.7, k * 1.8);
    this.warning.set(this.at.x, this.at.z, 0, k, Math.max(0, this.flight - this.elapsed));
    if (k < 1) return;

    this.landed = true;
    this.body.visible = false;
    this.warning.flash();
    const impact = this.at.clone().setY(0.11);
    fxChips(impact, [0x9e5335, 0x603a2d, 0xb87950], 15, { speed: 3.5, up: 2.4, size: 0.12 });
    fxSmoke(impact, 0xa38a69, 7, { r: 0.45, spd: 1.6, up: 0.7, life: 0.5 });
    cue('wallSlam', 0.52);
    if (!w.heroAlive) return;
    const { x, z } = w.heroPos;
    if (w.heroDodge && inside(jarShape, this.at.x, this.at.z, 0, x, z, w.heroR + 0.5)) w.dodged(impact);
    else if (inside(jarShape, this.at.x, this.at.z, 0, x, z, w.heroR)) w.hurtHero(this.dmg, impact);
  }

  kill() { this.warning.dispose(); super.kill(); }
}
