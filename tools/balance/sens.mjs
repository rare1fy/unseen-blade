// agy critique 1: real fights interrupt combos. Attack windows ~ Exp(mean W); after each window a 0.6 s dodge gap, combo restarts at cut 1.
const ATK = 6, FIN = 18, SPD = 0.84, GAP = 0.6;
const CH = { k1: 0.25, k2: 0.25, k3: 0.46, k4: 0.36, k5: 0.56 };
const base = { k1: [ATK], k2: [ATK], k3: [ATK], k4: [5, 5], k5: [FIN] };
const W = {
  "寒山": [["k1", 1, 1, 1, 0], ["k2", 1, 1, 1, 0], ["k3", 1, 1, 1, 0], ["k4", 1, 1, 1, 0], ["k5", 1, 1, 1, 1]],
  "惊雷": [["k1", 1.24, 1.28, 1.35, 0], ["k2", 1.26, 1.38, 1.55, 1], ["k5", 1.15, 1.48, 1.85, 1, 1]],
  "霜鳞": [["k1", .72, .74, .85, 0], ["k2", .72, .76, .85, 0], ["k4", .76, .80, .95, 0], ["k1", .70, .78, .85, 0], ["k3", .74, .86, 1.0, 0], ["k5", .74, .96, 1.15, 1]],
  "无锋": [["k1", .85, .84, 1.1, 0], ["k2", .84, .92, 1.25, 0]],
};
let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
function run(name, mean, trade) {
  const cuts = W[name]; let T = 0, dmg = 0, poise = 0, fin = 0, hits = 0, traded = 0, full = 0, starts = 0;
  for (let n = 0; n < 200000; n++) {
    const L = mean === Infinity ? 30 : Math.max(0.25, -Math.log(1 - rnd()) * mean); let t = 0, i = 0, used = L; starts++;
    for (;;) {
      const [pose, dur, dm, pm, heavy, armor] = cuts[i], len = CH[pose] * dur / SPD, ht = t + len * 0.5;
      const lands = ht <= L || (trade && armor && t < L);
      if (!lands) break;
      if (ht > L) { traded++; used = ht; }
      for (const b of base[pose]) { dmg += Math.round(b * dm); hits++; }
      poise += Math.round((heavy ? 15 : 8) * pm) * base[pose].length;
      if (i === cuts.length - 1) { fin++; if (i > 0) full++; }
      t += len; i = (i + 1) % cuts.length; if (t >= L) break;
    }
    T += used + GAP;
  }
  return { dps: dmg / T, poise: poise / T, fin: fin / T, hps: hits / T, traded: traded / starts };
}
const f = (x, d = 1) => x.toFixed(d);
for (const mean of [Infinity, 2.5, 1.6, 1.0]) {
  console.log("\n== 平均可输出窗口 " + (mean === Infinity ? "无限（木桩）" : mean + "s") + "，每次被打断后 0.6s 闪避再从第一刀起");
  const ref = run("寒山", mean, false).dps;
  for (const n of Object.keys(W)) {
    const a = run(n, mean, false);
    let s = " " + n + ": DPS " + f(a.dps) + "（寒山的 " + f(a.dps / ref, 2) + " 倍） 削韧/秒 " + f(a.poise) + " 收尾刀/10秒 " + f(a.fin * 10, 2) + " 命中/秒 " + f(a.hps, 2);
    if (n === "惊雷") { const b = run(n, mean, true); s += " | 末刀霸体硬换: DPS " + f(b.dps) + "（" + f(b.dps / ref, 2) + " 倍）收尾刀/10秒 " + f(b.fin * 10, 2) + " 每窗口硬吃 " + f(b.traded, 2) + " 下"; }
    console.log(s);
  }
}
