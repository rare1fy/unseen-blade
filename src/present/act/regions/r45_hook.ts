// 第四关、第五关接进游戏（wp/regB）：show.ts 只加一行 installR45(this)（另：prepRoom 里「2 倍舞台」的判断改用 bigStage），其余都在
// 这里，只做加法：
//   · 敌人要游戏帮忙的事（FoeWorld 的可选口子）：拽人 / 推人（铁索、拂扇）、头目换阶段时头顶一句话、周黯放火（场边一圈火、往里烧）、
//     崔玄灭灯（画面暗下去）、主角朝向、主角正在破势；
//   · 刀砍到持楯刀士 / 架剑的门客之前先问它挡不挡（挡住了不出血、不出数字）；缴了刀的刀卫挨刀翻倍；
//   · 看不见的敌人（水下的水鬼、烟里的死士、黑暗里的崔玄）：她的出刀吸附、飞镖不找它，头顶不出血条、脚下不出影子；
//   · 击筑客的筑声盖住她的耳朵：附近敌人的预警只在最后 0.45 秒亮；
//   · 头目登场：横幅（名号 · 名字、副标题）+ 头顶一句话（agy 写），不放褚雷的过场；
//   · 调试：__dh.regionFoe(kind, elite)；__dh.r45()（拼某关某间用 show.ts 的 __dh.region(n, room, type) / __dh.boss(n)，n 从 0 起）。
import * as THREE from 'three';
import { V3, R } from '../../engine/world';
import { after, shake } from '../../engine/clock';
import { dh } from '../../../debug/dh';
import { cue } from '../../../audio/cues';
import { audio } from '../../../audio/audio';
import { fxSmoke, fxRing, fxEmbers } from '../../fx/fx';
import { GRADE } from '../../look/post';
import { PLAY, SZ } from '../../scenes/props';
import { addLocales } from '../../asm/registry';
import { FOE_AI, FOE_X, EDEFS, hiddenFoe, spawnFoe, isBoss, type Foe, type FoeWorld, type EKind } from '../enemy';
import { r45Frame, r45Clear, FirePatch, GroundBlow, deafAt } from '../foes/r45_ai';
import { inside } from '../tele';
import { TUNE } from '../tune';
import { WULIN_LOCALES } from '../../asm/wulin';
import { CUI_LOCALES } from '../../asm/cui';
import { Barks } from '../barks';

addLocales(WULIN_LOCALES); addLocales(CUI_LOCALES);

/** the bosses' arrival lines (agy): over his head as he comes in */
export const ARRIVAL: Partial<Record<EKind, string>> = { wl_boss: '那碗姜汤……是你？瞎子也配寻仇？', cx_boss: '天下如棋，你这弃子，走得太远了。' };
/** the hero's blows a guard (a shield, a parrying sword) never turns: the room's props, the ultimate, the parry's own reflect */
const UNBLOCKABLE = new Set(['school', 'ult', 'ultTick', 'parry', 'echo']);
/** each place's room tail (the open river short, the walled garden courts long) [tail s, how much] */
const ROOM_VERB: Record<string, [number, number]> = { wl_dock: [0.4, 0.08], wl_camp: [0.5, 0.1], wl_tower: [0.6, 0.12], cx_court: [0.8, 0.16], cx_gallery: [1.0, 0.18], cx_vault: [1.3, 0.22] };
/** the foes' shouts as a wave comes in (agy): the 曹军 on the river, the 崔府's household — not the 黄巾's */
export const BARKS_R4 = ['拽紧铁索，拖进江里！', '泼油！把栈道全烧了！', '丞相水寨，擅闯者死！', '楼船弩手，齐射！', '水底水鬼，断她下盘！', '举大盾，正面撞死她！',
  '放火！把连环桥烧断！', '曹军大营，寸步难行！', '甩铁索！缠住她的刀！', '水卒挺长矛，攒刺！', '丞相严令，退者立斩！'];
export const BARKS_R5 = ['崔府重地，擅闯者死！', '雪夜闯府，是索命鬼！', '奉主公令，乱棍打死！', '当年旧债，找上门了！', '长史府邸，容你放肆！', '击筑！乱这瞎子的耳！',
  '主公看着呢，别后退！', '关紧府门，雪夜埋尸！', '名士门下，诛灭此贼！', '雪夜煞神，快护主公！'];

/** the show's members this file reaches (the show's fields are private: this is the one place that touches them) */
type ShowAny = Record<string, any>;   // eslint-disable-line @typescript-eslint/no-explicit-any

export function installR45(show: unknown) {
  const S = show as ShowAny, fw: FoeWorld = S.foeWorld, all = S.foes as Foe[];
  // ---- the wave's shouts in the region's own voice (a line given by the caller — a boss's — stays as it is)
  let lastBark = -1;
  const say0 = Barks.prototype.say;
  Barks.prototype.say = function (this: Barks, head: () => THREE.Vector3, line?: string) {
    const loc = S.locale as string, list = loc.startsWith('wl_') ? BARKS_R4 : loc.startsWith('cx_') ? BARKS_R5 : null;
    if (!line && list) { let i = Math.floor(Math.random() * list.length); if (i === lastBark) i = (i + 1) % list.length; lastBark = i; line = list[i]; }
    return say0.call(this, head, line);
  };
  // ---- the hooks the foes call
  let pullTo: THREE.Vector3 | null = null, pullT = 0;
  fw.pull = to => { if (fw.heroParry) return; pullTo = to.clone(); pullT = 0.22; };
  fw.say = (f, line) => S.barks?.say(() => f.a.head(), line);
  fw.burnStage = n => burn(n);
  fw.dark = on => { darkK = on ? 1 : 0; };
  fw.heroFwd = V3(0, 0, 1);
  // ---- a blow the guard turns aside never reaches the game's hit (no blood, no number); a disarmed guard takes double; a dart does
  // not find a foe the hero cannot see (it is under the planks / in its smoke)
  const hit0 = S.hitFoe.bind(S);
  S.hitFoe = (f: Foe, dmg: number, from: THREE.Vector3, o: { knock: number; heavy: boolean; kind: string; stagger?: number }) => {
    if (f.role === 'ext' && f.st !== 'dead') {
      if (o.kind === 'dart' && hiddenFoe(f)) return;
      const ai = FOE_AI[f.kind];
      if (!UNBLOCKABLE.has(o.kind) && ai?.guard?.(f, from, { heavy: o.heavy, dart: o.kind === 'dart' })) return;
      dmg *= ai?.taken?.(f) ?? 1;
    }
    hit0(f, dmg, from, o);
  };
  // ---- the hidden ones are not among the foes the hero's aim and darts look at, nor under the HUD's bars (a boss keeps its top bar)
  // (merge 11-18: show.ts sets heroWorld.foes every frame too — regions two / three hide their 死士 / 水鬼 that way — so the property keeps
  // what it is given and filters this region's hidden ones on top; a getter alone threw on that assignment every frame)
  let given: Foe[] = all;
  Object.defineProperty(S.heroWorld, 'foes', { get: () => given.filter(f => !hiddenFoe(f)), set: (v: Foe[]) => { given = v; }, configurable: true });
  const hudUp = S.hud.update.bind(S.hud);
  S.hud.update = (dt: number, inp: unknown, foes: Foe[]) => hudUp(dt, inp, foes.filter(f => !hiddenFoe(f) || isBoss(f)));
  // ---- the boss of region four / five comes in its own way: the banner, a roar, its line over its head (no 褚雷 cutscene)
  const spawn0 = S.spawnWave.bind(S);
  S.spawnWave = () => {
    const wave: string[] = S.plan?.waves?.[S.wave] ?? [], bi = wave.findIndex(k => { const id = k.replace('*', '') as EKind; return id === 'wl_boss' || id === 'cx_boss'; });
    if (bi < 0) { spawn0(); return; }
    const kind = wave[bi].replace('*', '') as EKind, rest = wave.filter((_, i) => i !== bi);
    S.plan.waves[S.wave] = rest; spawn0(); S.plan.waves[S.wave] = wave;
    after(rest.length * 0.28 + 0.2, () => {
      if (S.phase !== 'fight' || (S as unknown as { bossDefeated?: boolean }).bossDefeated) return;
      const p = V3(0, 0, SZ(-4.6)), f = spawnFoe(kind, p, S.hero.pos.clone()); all.push(f);
      fxSmoke(p.clone().add(V3(0, 0.3, 0)), 0x6a6a74, 14, { r: 0.7, spd: 1.2, up: 0.6, s: 0.4, life: 0.7 }); fxRing(p.clone().setY(0.05), 0xff7a4a, 1.2, { life: 0.4 } as never);
      cue('roar', 0.9); f.a.roar(); shake(0.3 * TUNE.shake); f.cd = 2.2;
      // (11-19 剧情改版: the first time on this save, or the prologue's 崔玄 — the meeting cutscene and the talk; else the banner)
      if ((S as unknown as { bossArrived?: (f: unknown) => boolean }).bossArrived?.(f)) return;
      S.banner.show(EDEFS[kind].name, EDEFS[kind].tag ?? '', 2.2, '#ff8a6a');
      const line = ARRIVAL[kind]; if (line) after(1.0, () => { if (f.st !== 'dead') S.barks?.say(() => f.a.head(), line); });
    });
  };
  // ---- the hidden ones do not shove her (separate() pushes bodies apart): out of the list while it runs
  const sep0 = S.separate.bind(S);
  S.separate = () => { const hid = all.filter(f => hiddenFoe(f)); if (!hid.length) { sep0(); return; } for (const f of hid) all.splice(all.indexOf(f), 1); try { sep0(); } finally { all.push(...hid); } };
  // ---- a foe's own rush (the shield-bearer's charge, the swordsman's stepping thrust) stopped by a prop is not a wall slam: the slam
  // is for a body the hero knocked flying (show.ts pushed() reads the speed alone, so a rush into a jar wounded the rusher)
  const pushed0 = S.pushed.bind(S);
  S.pushed = (f: Foe, dx: number, dz: number) => { if (f.role === 'ext' && f.st === 'strike' && f.lunge) return; pushed0(f, dx, dz); };
  // ---- every frame (after the foes moved): the pull, the deaf ring, the hidden shadows, the fire and the dark
  let darkK = 0, darkNow = 0, fireOn = 0, fireStep = 0, fireT = 0, vig0 = -1, exp0 = -1;
  const fires: FirePatch[] = [];
  function burn(n: 0 | 1) {
    if (n === 1) { fireOn = 1; fireStep = 0; cue('fire', 1); shake(0.3 * TUNE.shake); } else fireStep++;
    // the ring of fire round the deck's edge, one step further in each time (fire patches along the back and both sides)
    const inset = 0.8 + fireStep * 1.4, x0 = PLAY.x0 + inset, x1 = PLAY.x1 - inset, z0 = PLAY.z0 + inset, z1 = PLAY.z1 - inset - 2;
    if (x1 - x0 < 7 || z1 - z0 < 7) return;
    const add = (x: number, z: number) => { const p = new FirePatch(V3(x, 0, z), 1.0, 9.5, Math.round(4 * TUNE.enemyDmg)); fires.push(p); S.arrows.push(p); };
    for (let x = x0; x <= x1; x += 1.8) add(x, z0);
    for (let z = z0 + 1.8; z <= z1; z += 1.8) { add(x0, z); add(x1, z); }
  }
  const undark = () => { if (vig0 >= 0) { GRADE.vig = vig0; GRADE.desat = 0; GRADE.exposure = exp0; vig0 = -1; exp0 = -1; } };
  const frame0 = S.frame.bind(S);
  S.frame = (dt: number, rdt: number) => {
    frame0(dt, rdt);
    const h = S.hero; if (!h) return;
    fw.heroFwd!.copy(h.a.fwd()).setY(0).normalize(); fw.heroParry = !!h.parrying;
    r45Frame(fw, dt);
    if (pullTo && pullT > 0 && h.alive) { pullT -= dt; const k = Math.min(1, dt / Math.max(0.02, pullT + dt)); h.pos.x += (pullTo.x - h.pos.x) * k; h.pos.z += (pullTo.z - h.pos.z) * k; h.vel.set(0, 0, 0); if (pullT <= 0) pullTo = null; S.clamp(h.pos, 0.38); }
    // the deaf ring: inside a sounding 筑's reach, the warnings show only in their last 0.45 s
    const deaf = deafAt(fw, h.pos.x, h.pos.z);
    for (const f of all) {
      if (!f.tele) continue;
      const ud = f.tele.g.userData, near = Math.hypot(f.pos.x - h.pos.x, f.pos.z - h.pos.z) < 9;
      if (deaf && near && f.st === 'windup' && f.kind !== 'cx_zhu' && f.dur - f.t > 0.45) { if (f.tele.g.visible) ud.deaf = 1; f.tele.g.visible = false; for (const e of f.extra) e.t.g.visible = false; }
      else if (ud.deaf) { ud.deaf = 0; f.tele.g.visible = true; for (const e of f.extra) e.t.g.visible = true; }
    }
    // a dart that stuck in one who then went under / into the smoke falls out (it would ride along unseen)
    for (const d of S.darts as Array<{ stuck: unknown; dead: boolean; stop(b?: boolean): void }>) if (d.stuck && !d.dead && hiddenFoe(d.stuck as Foe)) d.stop(false);
    // the hidden ones cast no contact shadow (show.ts lays one per live foe at its feet; hide the ones under hidden foes)
    const sh = S.shadows as THREE.Mesh[]; if (sh?.length) for (const m of sh) if (m.visible) for (const f of all) if (hiddenFoe(f) && Math.abs(m.position.x - f.pos.x) < 1e-3 && Math.abs(m.position.z - f.pos.z) < 1e-3) m.visible = false;
    // 崔玄's dark: the frame sinks and the vignette closes in (eased); lifted when he dies, enters a cutscene, or the room changes
    const boss = all.find(f => isBoss(f) && f.st !== 'dead');
    if (!boss || S.proFalling || S.phase === 'cine' || S.phase === 'talk') darkK = 0;
    darkNow += (darkK - darkNow) * Math.min(1, rdt * (darkK > darkNow ? 2.5 : 4));
    if (darkNow > 0.003) { if (vig0 < 0) { vig0 = GRADE.vig; exp0 = GRADE.exposure; } GRADE.vig = vig0 + 0.6 * darkNow; GRADE.desat = 0.35 * darkNow; GRADE.exposure = exp0 * (1 - 0.32 * darkNow); }
    else undark();
    // 周黯's fire: embers rising over the deck while he lives
    if (fireOn && boss) { fireT -= rdt; if (fireT <= 0) { fireT = 0.06; fxEmbers(V3(R(PLAY.x0, PLAY.x1), 0.2, R(PLAY.z0, PLAY.z1)), 0xff9a3a, 1, { r: 0.3, up: 2.2, life: 1.2 }); } }
    if (!boss && fireOn) { fireOn = 0; for (const p of fires) p.kill(); fires.length = 0; }
  };
  // ---- a room change clears the rings, the stones, the fire and the dark; the river and the gardens get their own room tail;
  // no leaf litter on the decks (the river camp's floor is planks and mud)
  const build0 = S.buildRoom.bind(S);
  S.buildRoom = (first: boolean) => {
    r45Clear(); undark(); darkK = 0; darkNow = 0; fireOn = 0; fires.length = 0; pullTo = null;
    const loading = build0(first);
    const apply = () => {
      const verb = ROOM_VERB[S.locale as string]; if (verb) audio.setRoom(verb);
      if ((S.locale as string).startsWith('wl_') && S.leaves) S.leaves.on = false;
    };
    if (loading) return loading.then(apply);
    apply();
  };
  // ---- the bot (captures / smoke tests): it sees what she sees — the hidden ones are out of its list while it decides — and it steps
  // out of a ground warning about to land on it (the ballista's lane, a stone, the boom) before anything else
  const bot0 = S.bot.bind(S);
  S.bot = () => {
    const h = S.hero; if (!h || !h.alive) { bot0(); return; }
    const I = S.inp, now = (S.arrows as unknown[]).filter((a): a is GroundBlow => a instanceof GroundBlow && a.live && inside(a.area.s, a.area.x, a.area.z, a.area.yaw, h.pos.x, h.pos.z, 0.6));
    if (now.length && (S.phase === 'fight')) {
      const a = now[0].area;
      if (a.low && !h.airborne) { const b = I.b.jump; b.pressed = !b.down; b.down = true; return; }
      // out sideways from the shape's axis (a lane: across it; a circle: away from its centre)
      let dx = h.pos.x - a.x, dz = h.pos.z - a.z;
      if (a.s.k === 'rect') { const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw), along = dx * fx + dz * fz; dx -= fx * along; dz -= fz * along; }
      const l = Math.hypot(dx, dz) || 1; I.move.x = dx / l; I.move.y = -dz / l;
      if (h.dashCd <= 0) { const b = I.b.dash; b.pressed = !b.down; b.down = true; }
      return;
    }
    const hid = all.filter(f => hiddenFoe(f)); if (!hid.length) { bot0(); return; }
    for (const f of hid) all.splice(all.indexOf(f), 1);
    try { bot0(); } finally { all.push(...hid); }
  };
  // ---- the debug entries
  dh.add({
    // (the region rooms themselves: show.ts __dh.region(n, room, type) / __dh.boss(n), n from 0 — 第四关 = 3, 第五关 = 4)
    /** a foe of regions four / five in front of the hero */
    regionFoe: (kind: EKind, elite = false, d = 4) => { const h = S.hero, p = h.pos.clone().add(h.a.fwd().multiplyScalar(d)); const f = spawnFoe(kind, p, h.pos.clone(), elite); f.st = 'move'; all.push(f); return f.uid; },
    /** captures / tests: the foes' state */
    r45: () => all.map(f => ({ kind: f.kind, st: f.st, atk: f.atk, hp: f.hp, hidden: hiddenFoe(f), x: FOE_X.get(f) ?? null, phase: f.phase, pos: [+f.pos.x.toFixed(2), +f.pos.z.toFixed(2)] })),
  });
}
