#!/usr/bin/env node
// TapTap H5 package builder:
//   npm run taptap -- [--tag <label>] [--out <dir>]
// Builds the Chinese release bundle (no __DEBUG_UI__, no CrazyGames SDK, relative base './')
// into dist-taptap/index.html, then archives it in the exact structure TapTap H5 requires:
//   <zip>
//   └── unseen-blade/
//       └── index.html
import { build } from 'vite';
import { mkdirSync, rmSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = name => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);

let tag = option('--tag');
if (!tag) {
  try {
    tag = execFileSync('git', ['describe', '--tags', '--abbrev=0'], { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    tag = 'dev';
  }
}

const dist = path.join(root, 'dist-taptap');
const outDir = path.resolve(option('--out') ?? dist);
const zipName = `unseen-blade-taptap-h5-${tag}.zip`;
const zipPath = path.join(outDir, zipName);

await build({ root, configFile: path.join(root, 'vite.config.ts'), mode: 'taptap' });
mkdirSync(outDir, { recursive: true });
rmSync(zipPath, { force: true });

const htmlPath = path.join(dist, 'index.html');
// Use forward-slash zip entry `unseen-blade/index.html` so TapTap H5 preflight sees
// exactly one top-level game directory with index.html directly inside it.
const py = [
  'import zipfile, sys',
  'src, dst = sys.argv[1], sys.argv[2]',
  'with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:',
  '    z.write(src, "unseen-blade/index.html")',
].join('\n');

try {
  execFileSync('python', ['-c', py, htmlPath, zipPath], { stdio: 'inherit' });
} catch {
  // Fallback to PowerShell staging if python is unavailable
  const stage = path.join(dist, 'unseen-blade');
  mkdirSync(stage, { recursive: true });
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      'Copy-Item -LiteralPath $env:UB_TT_HTML -Destination (Join-Path $env:UB_TT_STAGE "index.html") -Force; Compress-Archive -Path $env:UB_TT_STAGE -DestinationPath $env:UB_TT_ZIP -Force',
    ],
    {
      env: { ...process.env, UB_TT_HTML: htmlPath, UB_TT_STAGE: stage, UB_TT_ZIP: zipPath },
      stdio: 'inherit',
    },
  );
  rmSync(stage, { recursive: true, force: true });
}

const htmlSize = statSync(htmlPath).size;
const zipSize = statSync(zipPath).size;
const mb = n => `${(n / 1024 / 1024).toFixed(2)} MB`;
console.log(`TapTap H5 package ready: ${zipPath}`);
console.log(`  HTML: ${mb(htmlSize)} | ZIP: ${mb(zipSize)} | entry: unseen-blade/index.html`);
