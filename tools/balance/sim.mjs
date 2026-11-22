// 不见刀 act-154 数值模型（规则照 d6bb485 源码抄；假设写在注释里）
const HP_CURVE = [1.15, 1.65, 2.25, 3.0, 3.9], SHOP_MUL = [1, 1.25, 1.55, 1.9, 2.3];
const F = { // hp, gold
  hj_blade: [48, 4], hj_brute: [115, 10], hj_taoist: [34, 5], hj_mob: [18, 2], hj_archer: [32, 4], hj_hound: [28, 3], hj_sickle: [35, 3], hj_jar: [27, 3], hj_boss: [540, 40],
  ly_halberd: [46, 4], ly_rider: [70, 6], ly_shield: [64, 5], ly_xbow: [30, 4], ly_torch: [32, 4], ly_looter: [22, 2], ly_boss: [740, 50],
  xp_assassin: [34, 5], xp_needle: [26, 4], xp_frost: [32, 5], xp_diver: [40, 5], xp_chain: [120, 8], xp_conscript: [22, 2], xp_boss: [660, 50],
  wl_spear: [22, 2], wl_chain: [58, 5], wl_oil: [34, 4], wl_xbow: [36, 4], wl_diver: [40, 5], wl_shield: [90, 7], wl_boss: [760, 60],
  cx_club: [26, 2], cx_sword: [64, 6], cx_shade: [38, 6], cx_guard: [96, 8], cx_zhu: [30, 5], cx_boss: [1100, 80],
};
const NOELITE = new Set(['hj_mob', 'hj_sickle', 'hj_jar', 'ly_looter', 'xp_conscript', 'wl_spear', 'cx_club']);
const BOSS = ['hj_boss', 'ly_boss', 'xp_boss', 'wl_boss', 'cx_boss'];
let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length) % a.length];

function waves(ri, type, d) {
  if (ri === 0) {
    if (type === 'boss') return [['hj_blade', 'hj_taoist', 'hj_sickle', 'hj_mob'], ['hj_boss', 'hj_archer', 'hj_mob']];
    if (type === 'elite') {
      const h = pick(['hj_blade', 'hj_brute', 'hj_taoist', 'hj_archer', 'hj_hound']) + '*', h2 = pick(['hj_blade', 'hj_brute', 'hj_hound']) + '*', s = pick(['hj_archer', 'hj_taoist', 'hj_jar']);
      return [[h, s, 'hj_sickle', 'hj_mob'], [d >= 4 ? h2 : 'hj_brute', 'hj_blade', 'hj_hound', pick(['hj_archer', 'hj_taoist', 'hj_jar'])]];
    }
    if (d === 0) return [['hj_blade', 'hj_archer', 'hj_sickle', 'hj_mob'], ['hj_blade', 'hj_hound', 'hj_jar', 'hj_mob']];
    if (d === 1) return [['hj_blade', 'hj_taoist', 'hj_sickle', 'hj_mob'], ['hj_brute', 'hj_archer', 'hj_mob', 'hj_mob']];
    const w1 = ['hj_blade', pick(['hj_brute', 'hj_hound']), pick(['hj_archer', 'hj_taoist']), 'hj_sickle', 'hj_mob'];
    const w2 = [d >= 3 ? pick(['hj_blade', 'hj_hound', 'hj_taoist']) + '*' : 'hj_brute', 'hj_blade', pick(['hj_archer', 'hj_taoist', 'hj_jar']), 'hj_hound', 'hj_mob'];
    return d >= 5 ? [w1, w2, [pick(['hj_blade', 'hj_brute']) + '*', 'hj_taoist', 'hj_archer', 'hj_sickle']] : [w1, w2];
  }
  if (ri === 1) {
    const B = ['ly_xbow', 'ly_torch'], Fr = ['ly_halberd', 'ly_shield'];
    if (type === 'boss') return [['ly_shield', 'ly_halberd', 'ly_xbow', 'ly_torch', 'ly_looter'], ['ly_boss', 'ly_looter', 'ly_looter']];
    if (type === 'elite') { const h = pick(['ly_halberd', 'ly_shield', 'ly_rider', 'ly_xbow', 'ly_torch']) + '*'; return [[h, pick(B), pick(Fr), 'ly_looter'], [d >= 2 ? pick(Fr) + '*' : 'ly_shield', 'ly_rider', pick(B), 'ly_halberd']]; }
    if (d === 0) return [['ly_halberd', 'ly_xbow', 'ly_looter', 'ly_looter'], ['ly_shield', 'ly_halberd', 'ly_torch', 'ly_looter']];
    if (d === 1) return [['ly_shield', 'ly_xbow', 'ly_torch', 'ly_looter'], ['ly_rider', 'ly_halberd', 'ly_xbow', 'ly_looter']];
    const w1 = [pick(Fr), pick(Fr), pick(B), 'ly_rider', 'ly_looter'], w2 = [d >= 3 ? pick(['ly_halberd', 'ly_shield', 'ly_rider']) + '*' : pick(Fr), pick(B), 'ly_rider', pick(['ly_torch', 'ly_xbow']), 'ly_looter'];
    return d >= 5 ? [w1, w2, [pick(['ly_shield', 'ly_halberd']) + '*', 'ly_rider', 'ly_xbow', 'ly_torch']] : [w1, w2];
  }
  if (ri === 2) {
    const FAR = ['xp_needle', 'xp_frost'], NEAR = ['xp_assassin', 'xp_chain', 'xp_diver'];
    if (type === 'boss') return [['xp_chain', 'xp_needle', 'xp_frost', 'xp_diver', 'xp_conscript'], ['xp_boss', 'xp_assassin', 'xp_conscript']];
    if (type === 'elite') { const h = pick(['xp_assassin', 'xp_chain', 'xp_diver', 'xp_needle', 'xp_frost']) + '*'; return [[h, pick(FAR), pick(NEAR), 'xp_conscript'], [d >= 2 ? pick(FAR) + '*' : 'xp_chain', 'xp_assassin', pick(['xp_chain', 'xp_diver']), pick(FAR)]]; }
    if (d === 0) return [['xp_diver', 'xp_needle', 'xp_conscript', 'xp_conscript'], ['xp_assassin', 'xp_frost', 'xp_diver', 'xp_conscript']];
    if (d === 1) return [['xp_chain', 'xp_needle', 'xp_conscript', 'xp_conscript'], ['xp_assassin', 'xp_diver', 'xp_frost', 'xp_needle']];
    const w1 = [pick(NEAR), 'xp_chain', pick(FAR), 'xp_conscript', 'xp_conscript'], w2 = [d >= 3 ? pick(['xp_assassin', 'xp_chain', 'xp_diver']) + '*' : pick(NEAR), pick(NEAR), pick(FAR), pick(FAR), 'xp_conscript'];
    return d >= 5 ? [w1, w2, [pick(['xp_chain', 'xp_assassin']) + '*', 'xp_diver', 'xp_frost', 'xp_needle']] : [w1, w2];
  }
  if (ri === 3) {
    const MID = ['wl_chain', 'wl_oil', 'wl_xbow', 'wl_diver'];
    if (type === 'boss') return [['wl_shield', 'wl_xbow', 'wl_chain', 'wl_oil', 'wl_spear'], ['wl_boss', 'wl_spear', 'wl_spear']];
    if (type === 'elite') { const h = pick(['wl_chain', 'wl_shield', 'wl_xbow', 'wl_diver']) + '*'; return [[h, 'wl_shield', pick(MID), 'wl_spear', 'wl_spear'], [d >= 2 ? pick(MID) + '*' : 'wl_shield', pick(MID), 'wl_xbow', 'wl_oil', 'wl_spear']]; }
    if (d === 0) return [['wl_shield', 'wl_chain', 'wl_spear', 'wl_spear'], ['wl_oil', 'wl_xbow', 'wl_chain', 'wl_diver', 'wl_spear']];
    if (d === 1) return [['wl_shield', 'wl_xbow', 'wl_oil', 'wl_spear', 'wl_spear'], ['wl_diver', 'wl_chain', 'wl_xbow', 'wl_shield', 'wl_spear']];
    const w1 = ['wl_shield', pick(MID), pick(MID), 'wl_spear', 'wl_spear'], w2 = [pick(MID) + '*', 'wl_shield', 'wl_xbow', pick(['wl_oil', 'wl_diver', 'wl_chain']), d >= 3 ? 'wl_xbow' : 'wl_spear'];
    return d >= 5 ? [w1, w2, ['wl_shield*', pick(MID), 'wl_xbow', 'wl_oil']] : [w1, w2];
  }
  const MID = ['cx_sword', 'cx_shade', 'cx_guard', 'cx_zhu'];
  if (type === 'boss') return [['cx_guard', 'cx_sword', 'cx_sword', 'cx_zhu', 'cx_club'], ['cx_boss']];
  if (type === 'elite') { const h = pick(MID) + '*'; return [[h, 'cx_zhu', 'cx_sword', 'cx_club', 'cx_club'], [d >= 2 ? 'cx_guard*' : 'cx_guard', pick(MID), 'cx_shade', 'cx_sword']]; }
  if (d === 0) return [['cx_sword', 'cx_zhu', 'cx_club', 'cx_club'], ['cx_guard', 'cx_shade', 'cx_sword', 'cx_club', 'cx_club']];
  if (d === 1) return [['cx_guard', 'cx_zhu', 'cx_sword', 'cx_club', 'cx_club'], ['cx_shade', 'cx_guard', 'cx_sword', 'cx_zhu', 'cx_club']];
  const w1 = ['cx_guard', 'cx_sword', pick(MID), 'cx_club', 'cx_club'], w2 = [pick(MID) + '*', 'cx_zhu', 'cx_guard', 'cx_shade', d >= 3 ? 'cx_sword*' : 'cx_sword'];
  return d >= 5 ? [w1, w2, ['cx_guard*', 'cx_sword*', 'cx_zhu', 'cx_shade']] : [w1, w2];
}
const foeOf = (s) => { let el = s.endsWith('*'); const id = el ? s.slice(0, -1) : s; if (NOELITE.has(id)) el = false; return { id, el }; };
/** one room: total non-boss hp, kills, elites, coins from kills (killFoe: gold × 3 for elites whose gold is already ×2+4; boss 60) */
export function roomStats(ri, type, d) {
  let hp = 0, kills = 0, elites = 0, coins = 0, bossHp = 0, maxOne = 0;
  for (const w of waves(ri, type, d)) for (const s of w) {
    const { id, el } = foeOf(s), [h, g] = F[id], boss = BOSS.includes(id);
    const H = Math.round(h * HP_CURVE[ri] * (el ? 2.5 : 1)); kills++; if (el) elites++;
    if (boss) { bossHp = H; coins += 60; }
    else { hp += H; maxOne = Math.max(maxOne, H); const tot = el ? (CFG.goldFix ? g * 3 : (g * 2 + 4) * 3) : g, n = Math.min(10, tot); coins += n * Math.max(1, Math.round(tot / n)); }
  }
  return { hp, kills, elites, coins, bossHp, maxOne };
}
// ---------- run structure (run.ts doorsFrom / rewardFor) ----------
export const CFG = { pBoon: 0.36, eliteBoon: 1, bossBoon: [0,1,2,3], firstBoon: [1,3,4], goldFix: false, eliteBonus: 40 };
function rewardFor(type, ri) {
  if (type !== 'fight' && type !== 'elite') return null;
  if (type === 'elite') return rnd() < CFG.eliteBoon ? { k: 'boon' } : { k: 'sharpen' };
  const x = rnd();
  if (x < CFG.pBoon) return { k: 'boon' };
  if (x < CFG.pBoon + 0.26) return { k: 'coins', n: 45 + ri * 10 };
  if (x < CFG.pBoon + 0.44) return { k: 'maxHp' };
  if (x < CFG.pBoon + 0.56) return { k: 'meta' };
  return { k: 'heal' };
}
function doorsFrom(from, visited, ri) {
  const next = from + 1, N = 8;
  if (next >= N) return [];
  if (next === N - 1) return [{ type: 'boss', reward: null }];
  const cur = visited[visited.length - 1];
  if (['rest', 'shop', 'boon', 'event'].includes(cur)) { const ff = rnd() < 2 / 3; return [ff ? 'fight' : 'elite', ff ? 'elite' : 'fight'].map(t => ({ type: t, reward: rewardFor(t, ri) })); }
  const w = [['fight', 3.2], ['elite', next >= 1 ? 1.4 : 0], ['shop', next >= 2 && !visited.includes('shop') ? 1 : 0], ['rest', next >= 3 && !visited.includes('rest') ? 0.9 : 0], ['boon', next >= 1 && !visited.includes('boon') ? 0.75 : 0]];
  const draw = (not) => { const ws = w.filter(([t]) => t !== not), tot = ws.reduce((s, [, n]) => s + n, 0); let x = rnd() * tot; for (const [t, n] of ws) { x -= n; if (x <= 0 && n > 0) return t; } return (ws.find(([, n]) => n > 0) || ['fight'])[0]; };
  const a = draw(); let b = draw(a);
  if (next === N - 2 && !visited.includes('shop') && !visited.includes('rest') && a !== 'shop' && a !== 'rest') b = rnd() < 0.5 ? 'rest' : 'shop';
  return [a, b].map(t => ({ type: t, reward: rewardFor(t, ri) }));
}
/** how a player picks between two doors */
const POL = {
  greedy: (d) => d.type === 'boon' ? 9 : d.type === 'elite' ? 8 : (d.type === 'fight' && d.reward?.k === 'boon') ? 7 : d.type === 'shop' ? 6 : d.type === 'rest' ? 5 : d.reward?.k === 'maxHp' ? 4 : d.reward?.k === 'coins' ? 3.5 : 2,
  safe: (d) => d.type === 'rest' ? 9 : d.type === 'shop' ? 8 : d.type === 'boon' ? 7.5 : d.reward?.k === 'heal' ? 7 : (d.type === 'fight' && d.reward?.k === 'boon') ? 6 : d.reward?.k === 'maxHp' ? 5 : d.type === 'fight' ? 4 : 1,
  random: () => rnd(),
};
export function simRun(policy, opt = {}) {
  const S = { boons: 0, picks: 0, duds: 0, manuals: 0, coins: 0, earned: 0, spent: 0, exhaustAt: -1, perRegion: [], interest: 0, eliteRooms: 0, kills: 0, elites: 0, gi: 0 };
  const offered = () => { S.picks++; if (S.boons < 16) { S.boons++; if (S.boons === 16 && S.exhaustAt < 0) S.exhaustAt = S.gi; } else S.duds++; };
  for (let ri = 0; ri < 5; ri++) {
    const R = { boons0: S.boons, fights: 0, elites: 0, shop: 0, rest: 0, scroll: 0, healDoor: 0, maxHp: 0, coinDoor: 0, meta: 0, coinsIn: 0, shopCost: 0, heal: 0 };
    const visited = []; let plan = { type: 'fight', reward: ri === 0 || ri === 2 ? { k: 'manual' } : CFG.firstBoon.includes(ri) ? { k: 'boon' } : { k: 'coins', n: 45 + ri * 10 } };
    for (let room = 0; room < 8; room++) {
      if (room > 0 && opt.interest && S.coins > 0) { const g = Math.max(1, Math.round(S.coins * opt.interest)); S.coins += g; S.interest += g; }
      const t = plan.type; visited.push(t);
      if (t === 'fight' || t === 'elite' || t === 'boss') {
        const st = roomStats(ri, t, room); S.coins += st.coins; S.earned += st.coins; R.coinsIn += st.coins; S.kills += st.kills; S.elites += st.elites;
        if (t === 'elite') { S.coins += CFG.eliteBonus; S.earned += CFG.eliteBonus; R.coinsIn += CFG.eliteBonus; R.elites++; S.eliteRooms++; } else if (t === 'fight') R.fights++;
        const rw = plan.reward;
        if (t === 'boss') { if (ri < 4 && CFG.bossBoon.includes(ri)) offered(); }
        else if (rw?.k === 'boon') offered();
        else if (rw?.k === 'manual') S.manuals++;
        else if (rw?.k === 'coins') { const c = 12 * Math.round(rw.n / 12); S.coins += c; S.earned += c; R.coinsIn += c; R.coinDoor++; }
        else if (rw?.k === 'maxHp') R.maxHp++;
        else if (rw?.k === 'meta') R.meta++;
        else if (rw?.k === 'heal') { R.healDoor++; R.heal += 20; }
      } else if (t === 'shop') {
        R.shop++; const pm = SHOP_MUL[ri];
        const price = { boon: Math.round(60 * pm), heal: Math.round(30 * pm), sharpen: Math.round(50 * pm), sp: Math.round(47 * pm) };
        R.shopCost = price.boon + price.heal + price.sharpen + price.sp;
        for (const k of (opt.buy || ['boon', 'heal', 'sharpen', 'sp'])) if (S.coins >= price[k]) { S.coins -= price[k]; S.spent += price[k]; if (k === 'boon') offered(); if (k === 'heal') R.heal += 30; R['b_' + k] = 1; }
      } else if (t === 'rest') { R.rest++; R.heal += 30; }
      else if (t === 'boon') { R.scroll++; if (ri >= 1 && S.manuals < 3) S.manuals++; else offered(); }
      S.gi++;
      const ds = doorsFrom(room, visited, ri); if (!ds.length) break;
      plan = ds.length === 1 ? ds[0] : (POL[policy](ds[0]) >= POL[policy](ds[1]) ? ds[0] : ds[1]);
    }
    R.boons = S.boons - R.boons0; R.boonsEnd = S.boons; R.coinsEnd = S.coins; S.perRegion.push(R);
  }
  return S;
}
const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const pct = (a, p) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(p * (b.length - 1))]; };

if (process.argv[2] === 'run') {
  for (const pol of ['greedy', 'safe', 'random']) {
    const N = 20000, rs = []; for (let i = 0; i < N; i++) rs.push(simRun(pol));
    console.log('\n== 路线策略 ' + pol + ' (N=' + N + ')');
    console.log(' 秘传选牌次数/局 均值', avg(rs.map(r => r.picks)).toFixed(1), ' P10~P90', pct(rs.map(r => r.picks), .1), '~', pct(rs.map(r => r.picks), .9), ' 池子拿空后的选牌', avg(rs.map(r => r.duds)).toFixed(1));
    const ex = rs.filter(r => r.exhaustAt >= 0);
    console.log(' 16张拿空的局占比', (ex.length / N * 100).toFixed(0) + '%', ' 拿空时的房间序号(0..39) 均值', ex.length ? avg(ex.map(r => r.exhaustAt)).toFixed(1) : '-');
    console.log(' 刀谱/局', avg(rs.map(r => r.manuals)).toFixed(2), ' 精英房/局', avg(rs.map(r => r.eliteRooms)).toFixed(1), ' 击杀', avg(rs.map(r => r.kills)).toFixed(0), ' 精英击杀', avg(rs.map(r => r.elites)).toFixed(1));
    for (let ri = 0; ri < 5; ri++) {
      const g = k => avg(rs.map(r => r.perRegion[ri][k] || 0));
      console.log('  关' + (ri + 1) + ': 秘传+' + g('boons').toFixed(1) + ' 累计' + g('boonsEnd').toFixed(1) + ' | 战斗房' + g('fights').toFixed(1) + ' 精英房' + g('elites').toFixed(1) + ' 行商' + g('shop').toFixed(2) + ' 歇脚' + g('rest').toFixed(2) + ' 遗卷' + g('scroll').toFixed(2) + ' 回血门' + g('healDoor').toFixed(2) + ' 上限门' + g('maxHp').toFixed(2) + ' | 铜钱进账' + g('coinsIn').toFixed(0) + ' 整摊价' + g('shopCost').toFixed(0) + ' 关末余钱' + g('coinsEnd').toFixed(0) + ' | 回血合计' + g('heal').toFixed(0) + '%');
    }
    console.log(' 全局铜钱 进账', avg(rs.map(r => r.earned)).toFixed(0), ' 花掉', avg(rs.map(r => r.spent)).toFixed(0));
  }
  console.log('\n== 聚财（只囤不买 / 照常买）');
  for (const rate of [0.10, 0.18, 0.25]) for (const buy of [[], ['boon', 'heal', 'sharpen', 'sp']]) {
    const rs = []; for (let i = 0; i < 4000; i++) rs.push(simRun('greedy', { interest: rate, buy }));
    console.log(' 利率' + (rate * 100) + '% ' + (buy.length ? '照常买' : '只囤不买') + ': 各关末余钱', [0, 1, 2, 3, 4].map(ri => avg(rs.map(r => r.perRegion[ri].coinsEnd)).toFixed(0)).join(' / '), ' 利息总额', avg(rs.map(r => r.interest)).toFixed(0), ' 本金进账', avg(rs.map(r => r.earned)).toFixed(0));
  }
  console.log('\n== 各关一间屋的总血量');
  for (let ri = 0; ri < 5; ri++) {
    const m = (t, d) => { const a = []; for (let i = 0; i < 400; i++) a.push(roomStats(ri, t, d)); return a; };
    const f2 = m('fight', 2), f6 = m('fight', 6), e4 = m('elite', 4), b = roomStats(ri, 'boss', 7);
    console.log(' 关' + (ri + 1) + ': 战斗房d2 ' + avg(f2.map(x => x.hp)).toFixed(0) + 'HP/' + avg(f2.map(x => x.kills)).toFixed(0) + '只  d6 ' + avg(f6.map(x => x.hp)).toFixed(0) + 'HP/' + avg(f6.map(x => x.kills)).toFixed(0) + '只  精英房d4 ' + avg(e4.map(x => x.hp)).toFixed(0) + 'HP  头目间 小怪' + b.hp + '+头目' + b.bossHp + ' | 掉钱 d2 ' + avg(f2.map(x => x.coins)).toFixed(0) + ' d6 ' + avg(f6.map(x => x.coins)).toFixed(0) + ' 精英房 ' + (avg(e4.map(x => x.coins)) + 40).toFixed(0));
  }
}
export { doorsFrom, rewardFor, POL, SHOP_MUL, avg, pct, rnd, pick };
