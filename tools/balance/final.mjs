// 复验最终方案候选：秘传软上限 + 源头降率、精英掉钱修正、商店价、保底行商、聚财跨关封顶、斩头目回血
import { roomStats, CFG, rewardFor, POL, avg, rnd } from './sim.mjs';
const N = 8, ODDS = { normal: [.7, .25, .05], elite: [0, .55, .45], scroll: [.15, .6, .25] };
const tierOf = (src) => { const o = ODDS[src], x = rnd(); return x < o[0] ? 0 : x < o[0] + o[1] ? 1 : 2; };
function doors(from, visited, ri, P) {
  const next = from + 1; if (next >= N) return []; if (next === N - 1) return [{ type: 'boss', reward: null }];
  const cur = visited[visited.length - 1], mk = (t) => ({ type: t, reward: rewardFor(t, ri) });
  if (['rest', 'shop', 'boon'].includes(cur)) { const ff = rnd() < 2 / 3; return [ff ? 'fight' : 'elite', ff ? 'elite' : 'fight'].map(mk); }
  const w = [['fight', 3.2], ['elite', next >= 1 ? 1.4 : 0], ['shop', next >= 2 && !visited.includes('shop') ? 1 : 0], ['rest', next >= 3 && !visited.includes('rest') ? 0.9 : 0], ['boon', next >= 1 && !visited.includes('boon') ? 0.75 : 0]];
  const draw = (not) => { const ws = w.filter(([t]) => t !== not), tot = ws.reduce((s, [, n]) => s + n, 0); let x = rnd() * tot; for (const [t, n] of ws) { x -= n; if (x <= 0 && n > 0) return t; } return (ws.find(([, n]) => n > 0) || ['fight'])[0]; };
  let a = draw(), b = draw(a);
  if (next === N - 2 && !visited.includes('shop') && !visited.includes('rest') && a !== 'shop' && a !== 'rest') b = rnd() < 0.5 ? 'rest' : 'shop';
  if (P.shopGuard && next >= N - 3 && !visited.includes('shop') && a !== 'shop' && b !== 'shop') b = 'shop';
  return [a, b].map(mk);
}
function simRun2(policy, P) {
  Object.assign(CFG, { pBoon: P.pBoon, eliteBoon: P.eliteBoon, goldFix: P.goldFix, eliteBonus: P.eliteBonus });
  const S = { tiers: [], ups: 0, waste: 0, manuals: 0, coins: 0, earned: 0, spent: 0, interest: 0, capAt: -1, gi: 0, hpDoors: 0, R: [] };
  const cap = Math.min(16, P.cap ?? 16);
  const upgrade = () => { const i = S.tiers.findIndex(t => t < 2); if (i >= 0) { S.tiers[i]++; S.ups++; } else S.waste++; };
  const offered = (src) => { if (S.tiers.length < cap) { S.tiers.push(tierOf(src)); if (S.tiers.length === cap && S.capAt < 0) S.capAt = S.gi; } else if (P.cap) upgrade(); else S.waste++; };
  const score = (d) => (P.wantShop && d.type === 'shop') ? 99 : POL[policy](d);
  for (let ri = 0; ri < 5; ri++) {
    const R = { n0: S.tiers.length, in: 0, shop: 0, cost: 0, heal: 0 };
    if (ri > 0 && P.interest) { const g = Math.min(P.interest.cap, Math.round(S.coins * P.interest.rate)); S.coins += g; S.interest += g; }
    const visited = []; let plan = { type: 'fight', reward: ri === 0 || ri === 2 ? { k: 'manual' } : P.firstBoon.includes(ri) ? { k: 'boon' } : { k: 'coins', n: 45 + ri * 10 } };
    for (let room = 0; room < 8; room++) {
      const t = plan.type; visited.push(t);
      if (t === 'fight' || t === 'elite' || t === 'boss') {
        const st = roomStats(ri, t, room); let c = st.coins; if (t === 'elite') c += CFG.eliteBonus;
        const rw = plan.reward;
        if (t === 'boss') { if (ri < 4 && P.bossBoon.includes(ri)) offered('normal'); else if (ri < 4 && P.bossUp) upgrade(); if (P.bossHeal) R.heal += P.bossHeal; }
        else if (rw?.k === 'boon') offered(t === 'elite' ? 'elite' : 'normal');
        else if (rw?.k === 'sharpen') upgrade();
        else if (rw?.k === 'manual') S.manuals++;
        else if (rw?.k === 'coins') c += 12 * Math.round(rw.n / 12);
        else if (rw?.k === 'maxHp') S.hpDoors++;
        else if (rw?.k === 'heal') R.heal += 20;
        S.coins += c; S.earned += c; R.in += c;
      } else if (t === 'shop') {
        R.shop++; const pm = P.shopMul[ri] * P.shopBase, price = { boon: Math.round(60 * pm), sharpen: Math.round(50 * pm), heal: Math.round(30 * pm), sp: Math.round(47 * pm) };
        R.cost = price.boon + price.heal + price.sharpen + price.sp;
        for (const k of ['boon', 'sharpen', 'heal', 'sp']) if (S.coins >= price[k]) { S.coins -= price[k]; S.spent += price[k]; if (k === 'boon') offered('normal'); if (k === 'sharpen') upgrade(); if (k === 'heal') R.heal += 30; }
      } else if (t === 'rest') R.heal += 30;
      else if (t === 'boon') { if (ri >= 1 && S.manuals < 3) S.manuals++; else offered('scroll'); }
      S.gi++;
      const ds = doors(room, visited, ri, P); if (!ds.length) break;
      plan = ds.length === 1 ? ds[0] : (score(ds[0]) >= score(ds[1]) ? ds[0] : ds[1]);
    }
    R.n = S.tiers.length; R.purse = S.coins; S.R.push(R);
  }
  return S;
}
const BASE = { pBoon: 0.36, eliteBoon: 1, bossBoon: [0, 1, 2, 3], firstBoon: [1, 3, 4], goldFix: false, eliteBonus: 40, shopBase: 1, shopMul: [1, 1.25, 1.55, 1.9, 2.3], shopGuard: false };
const C3 = { ...BASE, goldFix: true, cap: 9, pBoon: 0.22, eliteBoon: 0.5, bossBoon: [0, 2], bossUp: true, firstBoon: [1] };
const CASES = {
  '0 现状': BASE,
  '1 只修掉钱（第一批）': { ...BASE, goldFix: true },
  '2 只加软上限9': { ...BASE, goldFix: true, cap: 9 },
  '3 agy：乱兵22% 精英50% 头目1、3关 首间只第2关 上限9': C3,
  '4 更紧：乱兵18% 精英50% 头目2、4关 首间不给 上限9': { ...BASE, goldFix: true, cap: 9, pBoon: 0.18, eliteBoon: 0.5, bossBoon: [1, 3], bossUp: true, firstBoon: [] },
  '5 同 3 但上限 10': { ...C3, cap: 10 },
};
const f = (x, d = 1) => x.toFixed(d);
function report(name, P, pols = ['greedy', 'random', 'safe']) {
  console.log('\n== ' + name);
  for (const pol of pols) {
    const rs = []; for (let i = 0; i < 8000; i++) rs.push(simRun2(pol, P));
    const g = (fn) => avg(rs.map(fn)), capped = rs.filter(r => r.capAt >= 0);
    console.log(' ' + pol + ': 新秘传 ' + f(g(r => r.tiers.length)) + '（各关末 ' + [0, 1, 2, 3, 4].map(i => f(g(r => r.R[i].n))).join('/') + '） 到上限的局 ' + f(capped.length / rs.length * 100, 0) + '% 在第 ' + (capped.length ? f(avg(capped.map(r => r.capAt)) + 1, 0) : '-') + ' 间 | 升阶 ' + f(g(r => r.ups)) + ' 白给 ' + f(g(r => r.waste)) + ' 绝品数 ' + f(g(r => r.tiers.filter(t => t === 2).length)) + ' 刀谱 ' + f(g(r => r.manuals)) + ' | 钱 进 ' + f(g(r => r.earned), 0) + ' 花 ' + f(g(r => r.spent), 0) + ' 余 ' + f(g(r => r.R[4].purse), 0) + ' 利息 ' + f(g(r => r.interest), 0) + ' | 上限门 ' + f(g(r => r.hpDoors)));
    console.log('    各关进账 ' + [0, 1, 2, 3, 4].map(i => f(g(r => r.R[i].in), 0)).join('/') + '  进行商次数 ' + [0, 1, 2, 3, 4].map(i => f(g(r => r.R[i].shop), 2)).join('/') + '  一摊全买价 ' + [0, 1, 2, 3, 4].map(i => Math.round((60 + 50 + 30 + 47) * P.shopMul[i] * P.shopBase)).join('/') + '  每关回血% ' + [0, 1, 2, 3, 4].map(i => f(g(r => r.R[i].heal), 0)).join('/'));
  }
}
for (const [n, P] of Object.entries(CASES)) report(n, P);
console.log('\n######## 经济（在方案 3 的秘传节奏上）');
const ECO = {
  'E1 价不动 + 保底行商': { ...C3, shopGuard: true, wantShop: true },
  'E2 基础价×1.3 + 保底行商': { ...C3, shopGuard: true, wantShop: true, shopBase: 1.3 },
  'E3 基础价×1.6 + 保底行商': { ...C3, shopGuard: true, wantShop: true, shopBase: 1.6 },
  'E4 基础价×1.3 + 保底行商 + 精英房奖金 40→20': { ...C3, shopGuard: true, wantShop: true, shopBase: 1.3, eliteBonus: 20 },
  'E5 = E2 + 聚财跨关 25% 封顶 200': { ...C3, shopGuard: true, wantShop: true, shopBase: 1.3, interest: { rate: 0.25, cap: 200 } },
  'E6 = E2 + 斩头目回 30%': { ...C3, shopGuard: true, wantShop: true, shopBase: 1.3, bossHeal: 30 },
};
for (const [n, P] of Object.entries(ECO)) report(n, P, ['greedy', 'random']);
console.log('\n######## 局外进账（全树 残铁 801 / 药引 1088）');
const pay = (w, k, name) => {
  const rw = (upto, bosses) => { let s = 0; for (let i = 0; i < upto; i++) s += 8 * w[i]; return s + Math.max(0, bosses - 1) * k.bossRooms; };
  const r = (rooms, elites, boss, won, kills) => ({ iron: Math.round(k.i0 + k.iRoom * rooms + k.iElite * elites + (boss ? k.iBoss : 0) + (won ? k.iWon : 0)), herb: Math.round(k.i0 + k.hRoom * rooms + Math.floor(kills / 3) * 2 + (won ? k.iWon : 0)) });
  const a = r(7 * w[0], 3, false, false, 60), b = r(rw(2, 1) - w[1], 8, true, false, 125), c = r(rw(3, 2) - w[2], 14, true, false, 190), d = r(rw(5, 5), 22, true, true, 300);
  console.log(' ' + name + ': 死在关1头目 ' + a.iron + '/' + a.herb + '  关2头目 ' + b.iron + '/' + b.herb + '  关3头目 ' + c.iron + '/' + c.herb + '  通关 ' + d.iron + '/' + d.herb + '（占全树 ' + f(d.iron / 801 * 100, 0) + '% / ' + f(d.herb / 1088 * 100, 0) + '%）');
};
const K0 = { i0: 6, iRoom: 5, hRoom: 5, iElite: 8, iBoss: 25, iWon: 20, bossRooms: 15 };
pay([1, 2, 3, 4, 5], K0, '现状');
pay([1, 1.2, 1.4, 1.7, 2.0], { ...K0, iRoom: 3, hRoom: 5, iElite: 4, iBoss: 15, iWon: 15 }, 'agy 原式（头目加成 15 间不动）');
pay([1, 1.2, 1.4, 1.7, 2.0], { ...K0, iRoom: 3, hRoom: 3, iElite: 4, iBoss: 15, iWon: 15, bossRooms: 5 }, '权重压平 + 每间 3 + 头目加成 5 间');
pay([1, 1.2, 1.4, 1.7, 2.0], { ...K0, iRoom: 2.5, hRoom: 3, iElite: 3, iBoss: 12, iWon: 15, bossRooms: 4 }, '再紧一档');
