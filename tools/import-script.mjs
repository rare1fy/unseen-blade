// 剧本导入（act-30）：用户找 agy 写好 docs/对白/剧本.md（格式见 docs/对白/给agy的说明.md 第 5 节），跑 `npm run script`，
// 台词按段落编号写进 src/present/act/scriptData.json，scripts.ts 读它；文件里没有的段落游戏照旧用代码里的台词。
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
// `npm run script` reads docs/对白/剧本.md; `npm run script -- 剧本2.md` reads another file in that folder
const arg = process.argv.slice(2).find(x => x.endsWith('.md'));
const src = path.join(root, 'docs', '对白', arg ?? '剧本.md'), out = path.join(root, 'src', 'present', 'act', 'scriptData.json');
const WHO = { 刘白: 'jiangjin', 杜五: 'duwu', 孙媪: 'sunao', 冯铁臂: 'fengtiebi', 褚雷: 'chulei', 字幕: 'caption', 卢昭: 'luzhao', 桓越: 'huanyue' };
if (!fs.existsSync(src)) { console.error(`没有找到 ${src}`); process.exit(1); }
const text = fs.readFileSync(src, 'utf8').replace(/\r/g, '');
const data = {}, warn = []; let cur = null;
for (const [n, raw] of text.split('\n').entries()) {
  const line = raw.trim(); if (!line) continue;
  const h = /^##\s*([a-z0-9_]+)/.exec(line); if (h) { cur = h[1]; data[cur] = []; continue; }
  if (!cur || !line.startsWith('-')) continue;
  const body = line.replace(/^-\s*/, '');
  const act = /^[（(](.+)[)）]$/.exec(body); if (act) { data[cur].push({ who: 'act', text: `（${act[1]}）` }); continue; }
  const m = /^([^：:]{1,4})[：:]\s*(.+)$/.exec(body);
  if (!m || !WHO[m[1]]) { warn.push(`第 ${n + 1} 行看不懂：${line}`); continue; }
  const t = m[2].trim(); if ([...t].length > 26) warn.push(`第 ${n + 1} 行偏长（${[...t].length} 字）：${t}`);
  data[cur].push({ who: WHO[m[1]], text: t });
}
fs.writeFileSync(out, JSON.stringify(data, null, 1) + '\n');
console.log(`读进 ${Object.keys(data).length} 段：${Object.entries(data).map(([k, v]) => `${k}(${v.length})`).join(' ')}`);
for (const w of warn) console.warn('  ' + w);
