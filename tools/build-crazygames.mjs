import { build } from 'vite';
import { mkdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const tag = option('--tag');
if (!/^act-\d+$/.test(tag ?? '') || (args.includes('--out') && !option('--out'))) {
  throw new Error('Usage: npm run cg -- --tag act-NN [--out <folder>]');
}
const out = path.resolve(option('--out') ?? path.join(homedir(), 'Desktop'));
const zip = path.join(out, `不见刀_CrazyGames_${tag}.zip`);
await build({ configFile: path.join(root, 'vite.config.ts'), mode: 'crazygames' });
mkdirSync(out, { recursive: true });
// archive files from inside dist-cg so the portal sees index.html at the archive's root
const dist = path.join(root, 'dist-cg');
if (process.platform === 'win32') {
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Compress-Archive -LiteralPath $env:UB_CG_HTML -DestinationPath $env:UB_CG_ZIP -Force'], {
    env: { ...process.env, UB_CG_HTML: path.join(dist, 'index.html'), UB_CG_ZIP: zip }, stdio: 'inherit',
  });
} else execFileSync('zip', ['-j', zip, 'index.html'], { cwd: dist, stdio: 'inherit' });
console.log(`${zip} (${statSync(zip).size} bytes)`);
