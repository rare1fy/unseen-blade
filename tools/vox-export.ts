// 把游戏里的模型导出成 MagicaVoxel 文件给用户改（act-20）：npm run vox -- slim_hat slim_white  → vox/slim_hat.vox …
// 已经有的文件不覆盖（那是用户改过的真源）；确实要从代码重新导出时加 --force。不带 id 时列出所有能导出的模型。
import fs from 'node:fs';
import path from 'node:path';
import { ROSTER } from '../src/present/bestiary/models';
import '../src/present/act/ninjaAct';           // registers the heroes (blind / blind2 / the ninja) in ROSTER
import '../src/present/act/enemy';              // the foes
import '../src/present/act/hideout_people';     // the hideout's people
import { exportVox, modelToVox } from '../src/present/bestiary/voxEdit';

const args = process.argv.slice(2).filter(a => a !== '--'), force = args.includes('--force'), ids = args.filter(a => !a.startsWith('--'));
const dir = path.resolve(import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '../vox');
if (!ids.length) { console.log('models:', ROSTER.map(d => `${d.id}(${d.name})`).join(' ')); process.exit(0); }
fs.mkdirSync(dir, { recursive: true });
for (const id of ids) {
  const def = ROSTER.find(d => d.id === id); if (!def) { console.error(`no model ${id}`); process.exitCode = 1; continue; }
  const out = path.join(dir, `${id}.vox`);
  if (fs.existsSync(out) && !force) { console.log(`skip ${id}: vox/${id}.vox exists (edited by hand? --force overwrites)`); continue; }
  const f = modelToVox(def.build()), bytes = exportVox(def);
  fs.writeFileSync(out, bytes);
  console.log(`vox/${id}.vox  ${def.name}  ${f.models.length} parts: ${f.models.map(m => `${m.name}(${m.voxels.length})`).join(' ')}  frame ${f.models[0]?.size.join('×')}  ${f.palette.length} colours`);
}
