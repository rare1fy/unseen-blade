// 不见刀 act-154：四把刀的连段 DPS / 削韧、秘传贡献、各关清房与头目 TTK、容错（挨几下死）
// 假设（都是可改的旋钮，输出里会再写一遍）：
//   连段循环 = 每刀到「可接下一刀」的时间之和 ÷ atkSpeed；最后一刀按「推摇杆取消收招」算（hero.ts 703 行），不取消另列
//   打头目的出手占比 0.45，清杂兵 0.55；清杂兵一刀平均砍到 1.5 个
import { roomStats } from './sim.mjs';
const ATK = 6, FIN = 18, SPD = 0.84;
const CH = { k1: [0.25, 0.46], k2: [0.25, 0.46], k3: [0.46, 0.62], k4: [0.36, 0.58], k5: [0.56, 0.88] };
const base = { k1: () => [ATK], k2: () => [ATK], k3: () => [ATK], k4: () => { const d = Math.max(2, Math.round(ATK * 0.8)); return [d, d]; }, k5: () => [FIN] };
const W = {
  寒山: [['k1', 1, 1, 1, 0], ['k2', 1, 1, 1, 0], ['k3', 1, 1, 1, 0], ['k4', 1, 1, 1, 0], ['k5', 1, 1, 1, 1]],
  惊雷: [['k1', 1.24, 1.28, 1.35, 0], ['k2', 1.26, 1.38, 1.55, 1], ['k5', 1.15, 1.48, 1.85, 1]],
  霜鳞: [['k1', .72, .74, .85, 0], ['k2', .72, .76, .85, 0], ['k4', .76, .80, .95, 0], ['k1', .70, .78, .85, 0], ['k3', .74, .86, 1.0, 0], ['k5', .74, .96, 1.15, 1]],
  无锋: [['k1', .85, .84, 1.1, 0], ['k2', .84, .92, 1.25, 0]],
};
/** [time of hit (s), base dmg, poise, heavy, pose] for one combo cycle, and the cycle length */
function cycle(name, cancel = true) {
  const cuts = W[name], hits = []; let t = 0;
  cuts.forEach(([pose, dur, dm, pm, heavy], i) => {
    const last = i === cuts.length - 1, len = (last && !cancel ? CH[pose][1] : CH[pose][0]) * dur / SPD;
    for (const b of base[pose]()) hits.push({ t: t + len * 0.5, dmg: Math.round(b * dm), poise: Math.round((heavy ? 15 : 8) * pm), heavy, pose });
    t += len;
  });
  return { hits, T: t };
}
const TIERS = { bladeWind: [80, 115, 150], extra: [30, 45, 60], bleed: [1, 1.5, 2], spin: [110, 125, 140], pierce: [85, 110, 135] };
/** single-target DPS over a long fight: M = (1+加法池) × 暴击期望；boons = {id: tier}; blood2 = 血刃两件 */
function dps(name, M, boons = {}, o = {}) {
  const { hits, T } = cycle(name, o.cancel ?? true); const N = 60; let dmg = 0, flat = 0, poise = 0, nHits = 0;
  let bleed = 0, bleedT = 9, tick = 0, now = 0; const v = boons.bleed != null ? TIERS.bleed[boons.bleed] : 0, cap = 5 + (o.bleedCap ?? 0);
  const advance = (to) => { let dt = to - now; while (dt > 1e-9) { const st = Math.min(dt, 0.05); if (bleed > 0) { const act = Math.min(st, Math.max(0, 3 - bleedT)); bleedT += st; tick += act; while (tick >= 1) { tick -= 1; flat += bleed * v; } if (bleedT >= 3) { bleed = 0; tick = 0; } } dt -= st; } now = to; };
  for (let c = 0; c < N; c++) for (const h of hits) {
    advance(c * T + h.t);
    const blade = (d, heavyFin) => { dmg += d; nHits++; if (v) { bleed = Math.min(cap, bleed + 1); bleedT = 0; if (bleed >= 3 && (heavyFin || (o.blood2 && bleed >= 4))) { flat += Math.max(4, Math.round(bleed * v * 3.2 * (o.blood2 ? 1.35 : 1))); poise += Math.round(bleed * v * 3.2 * (o.blood2 ? 1.35 : 1) * 0.6); bleed = 1; bleedT = 0; } } };
    let d = h.dmg;
    if (h.pose === 'k3' && boons.spin != null) d = Math.round(h.dmg * TIERS.spin[boons.spin] / 100);
    blade(d, h.pose === 'k5'); poise += h.poise;
    if (h.pose === 'k5') {
      if (boons.bladeWind != null) dmg += Math.round(FIN * 0.7 * TIERS.bladeWind[boons.bladeWind] / 100);
      if (boons.extra != null) blade(h.dmg * TIERS.extra[boons.extra] / 100, false);
    }
    if (h.pose === 'k4' && boons.pierce != null && h === hits.filter(x => x.pose === 'k4').pop()) blade(Math.round(h.dmg * TIERS.pierce[boons.pierce] / 100), false);
  }
  const total = N * T;
  return { dps: dmg * M / total + flat / total, scaled: dmg * M / total, flat: flat / total, poise: poise / total, hps: nHits / total, T };
}
const f1 = (x) => x.toFixed(1), f0 = (x) => x.toFixed(0);
console.log('== 一、四把刀裸连段（M=1，单体，持续输出）');
for (const n of Object.keys(W)) { const a = dps(n, 1), b = dps(n, 1, {}, { cancel: false }); console.log(' ' + n + ': 循环 ' + a.T.toFixed(2) + 's  DPS ' + f1(a.dps) + '（末刀不取消 ' + f1(b.dps) + '）  削韧/秒 ' + f1(a.poise) + '  命中/秒 ' + a.hps.toFixed(2)); }
console.log('\n== 二、单张秘传给寒山刀加多少单体 DPS（M=1 白板 / M=2.2 满配），凡/珍/绝');
for (const M of [1, 2.2]) { const b0 = dps('寒山', M).dps; for (const id of ['bladeWind', 'extra', 'pierce', 'spin', 'bleed']) console.log('  M=' + M + ' ' + id + ': ' + [0, 1, 2].map(t => '+' + f1(dps('寒山', M, { [id]: t }).dps - b0) + '(' + f0((dps('寒山', M, { [id]: t }).dps / b0 - 1) * 100) + '%)').join(' / ')); }
console.log('  见红+血刃两件（绝）在四把刀上（M=1）：' + Object.keys(W).map(n => n + ' +' + f1(dps(n, 1, { bleed: 2 }, { blood2: true }).dps - dps(n, 1).dps) + ' 削韧/秒 ' + f1(dps(n, 1, { bleed: 2 }, { blood2: true }).poise)).join('； '));

// ---------- builds ----------
const META = {
  白板: { M: 1.10 * (1 + 0.13 * 0.35), hp: 100, ult: 1, note: '新号；变招 1 档' },
  中配: { M: (1 + 0.2528 + 0.19) * (1 + 0.23 * 0.35), hp: 100 + 24 + 15, ult: 1.126, note: '刀身2 归元1 叠势2 心眼1 筋骨2 + 胡饼' },
  满配: { M: (1 + 0.488 + 0.46) * (1 + 0.39 * 0.35), hp: 100 + 36 + 18 + 15, ult: 1.244, note: '刀身3 归元3 叠势3(变招2档) 心眼3 筋骨3 莲 胡饼' },
};
// in-run boon state per region (random-route averages from sim.mjs: 4.8 / 10.2 / 14.5 / 16 / 16 owned at region end)
const RUN = [
  { boons: {}, other: 1.00 },                                                   // 关1：前半基本裸刀
  { boons: { bladeWind: 0, extra: 0 }, other: 1.05 },                           // 关2
  { boons: { bladeWind: 1, extra: 1, pierce: 0, spin: 0 }, other: 1.08 },       // 关3
  { boons: { bladeWind: 1, extra: 1, pierce: 1, spin: 1 }, other: 1.10 },       // 关4
  { boons: { bladeWind: 2, extra: 1, pierce: 1, spin: 1 }, other: 1.10 },       // 关5
];
const RUN_BLEED = RUN.map((r, i) => ({ boons: { ...r.boons, ...(i >= 1 ? { bleed: Math.min(2, i - 1) } : {}) }, other: r.other, blood2: i >= 2 }));
const ULT = [52, 70, 88, 107, 125], BOSS_HP = [621, 1221, 1485, 2280, 4290], BOSS_ADDS = [213, 393, 668, 852, 1092];
const HIT = [[10, 16, 20], [10, 16, 20], [12, 16, 18], [10, 14, 22], [11, 16, 20]];  // 杂兵常见一下 / 头目常见 / 头目重招（基础值）
const DMG = [1.25, 1.55, 1.85, 2.15, 2.5];
function table(label, runs, weapon = '寒山') {
  console.log('\n== ' + label + '（' + weapon + '）');
  for (const [mn, m] of Object.entries(META)) {
    console.log(' -- ' + mn + '（' + m.note + '，M=' + m.M.toFixed(2) + '，血 ' + m.hp + '）');
    for (let ri = 0; ri < 5; ri++) {
      const r = runs[ri], d = dps(weapon, m.M, r.boons, { blood2: r.blood2 }), st = d.dps * r.other;
      const avgRoom = (t, dd) => { let s = 0; for (let i = 0; i < 300; i++) s += roomStats(ri, t, dd).hp; return s / 300; };
      const ultBoss = Math.min(ULT[ri] * 2, Math.max(30, Math.round(BOSS_HP[ri] * 0.13))) * m.ult, ultMob = ULT[ri] * 4 * m.ult;
      const roomDps = st * 1.5 * 0.55 + ultMob / 28, bossDps = st * 0.45 * 1.06 + ultBoss / 28;
      const f2 = avgRoom('fight', 2), f6 = avgRoom('fight', 6);
      const gate = 2 * 6.5 + 2 * (ri === 0 ? 300 : 500 * [1, 1.65, 2.25, 3, 3.9][ri] / 1.65 * 0.6) / roomDps;
      const tBoss = BOSS_ADDS[ri] / roomDps + BOSS_HP[ri] / bossDps + gate;
      const hits = HIT[ri].map(h => m.hp / Math.round(h * DMG[ri]));
      console.log('   关' + (ri + 1) + ': 单体DPS ' + f1(st) + '（流血占 ' + f0(d.flat / d.dps * 100) + '%）| 清房 第3间 ' + f0(f2 / roomDps + 8) + 's  第7间 ' + f0(f6 / roomDps + 12) + 's | 头目间 ' + f0(tBoss) + 's（本体 ' + f0(BOSS_HP[ri] / bossDps) + 's）| 挨几下死：杂兵 ' + f1(hits[0]) + ' 头目 ' + f1(hits[1]) + ' 重招 ' + f1(hits[2]));
    }
  }
}
table('三、不拿见红的常规构筑', RUN);
table('四、拿了见红（关2起）+ 血刃两件（关3起）', RUN_BLEED);
table('五、无锋断刃 + 见红血刃（对照：命中数最高的刀）', RUN_BLEED, '无锋');
table('六、惊雷陌刀 常规构筑（对照：裸伤最高的刀）', RUN, '惊雷');
console.log('\n== 七、不见刀（大招）单目标预算 ÷ 目标血量');
for (let ri = 0; ri < 5; ri++) { const b = ULT[ri], boss = Math.min(b * 2, Math.max(30, Math.round(BOSS_HP[ri] * 0.13))); console.log('  关' + (ri + 1) + ': 基础 ' + b + ' | 头目 ' + boss + ' = ' + (boss / BOSS_HP[ri] * 100).toFixed(1) + '% | 普通怪上限 ' + b + '（该关 60 基础血的中型怪 ' + Math.round(60 * [1.15, 1.65, 2.25, 3, 3.9][ri]) + ' 血 → ' + Math.min(100, b / (60 * [1.15, 1.65, 2.25, 3, 3.9][ri]) * 100).toFixed(0) + '%）'); }
console.log('\n== 八、局外货币：全树价格 vs 一局进账');
const iron = (10 + 22 + 40) + (14 + 32) + (16 + 36) + 35 + (8 + 18 + 32) + (12 + 26 + 44) + (16 + 32 + 54) + (18 + 36 + 60) * 2 + (20 + 40 + 66);
const herb = (8 + 18 + 32) + (12 + 26 + 44) + (10 + 14 + 16 + 18 + 22 + 26 + 32) + (42 + 48 + 48 + 58 + 68 + 64 + 70 + 74 + 86) + (12 + 20 + 30 + 44 + 62 + 84);
console.log('  残铁全买 ' + iron + '  药引全买 ' + herb);
const reward = (rooms, elites, boss, won, kills) => ({ iron: 6 + 5 * rooms + 8 * elites + (boss ? 25 : 0) + (won ? 20 : 0), herb: 6 + 5 * rooms + Math.floor(kills / 3) * 2 + (won ? 20 : 0) });
const cases = [['死在关1头目', 7, 3, false, false, 60, 0], ['死在关2头目', 8 + 14, 8, true, false, 125, 1], ['死在关3头目', 8 + 16 + 21, 14, true, false, 190, 2], ['通关', 120, 30, true, true, 300, 5]];
for (const [n, rw, el, boss, won, kills, bosses] of cases) { const r = reward(rw + Math.max(0, bosses - 1) * 15, el, boss, won, kills); console.log('  ' + n + ': 残铁 +' + r.iron + '  药引 +' + r.herb + '（另有局内残铁药引门 / 歇脚 / 宝箱 / 药圃）'); }
