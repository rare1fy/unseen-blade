/// <reference types="vitest" />
// 不见刀: dev server (http://127.0.0.1:5237) + single-file web build (dist/index.html, everything inlined: one file to open or share)
// + the WeChat mini-game bundle (vite build --mode wechat → dist-wx/game.js + wx-assets.json; tools/build-wechat.mjs packs the project).
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { realpathSync, readFileSync } from 'node:fs';
import type { Plugin } from 'vite';
import { wxAssets } from './tools/wxAssets';

const ROOT = realpathSync.native(path.dirname(fileURLToPath(import.meta.url)));
const stamp = () => { const d = new Date(), z = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`; };   // local time
const PXUI = path.resolve(ROOT, 'src/vendor/pxui');   // pxui's platform layer, copied in (src/vendor/pxui/README.md)

/** MagicaVoxel files the user edits (vox/*.vox, bestiary/voxEdit.ts): imported as their bytes in base64, the same in the dev server,
 *  the build and the tests (Vite's own ?inline only inlines at build time); the dev server reloads when one is saved */
const voxBytes = (): Plugin => ({ name: 'vox-bytes', enforce: 'pre', load(id) { const f = id.split('?')[0]; if (!f.endsWith('.vox')) return null; this.addWatchFile(f); return `export default ${JSON.stringify(readFileSync(f).toString('base64'))};`; } });

/** Strip debug-only tools (animPreview / lab / tunePanel) and unused alternate body fonts (serif / sans) from release packages (!__DEBUG_UI__). */
const stripReleaseDead = (): Plugin => ({
  name: 'strip-release-dead',
  enforce: 'pre',
  load(id) {
    const f = id.split('?')[0].replace(/\\/g, '/');
    if (/\/fonts\/body\/(?:serif|sans)\.woff2$/.test(f)) return 'export default "";';
    if (/\/src\/present\/act\/animPreview\.ts$/.test(f)) return 'export function openAnimPreview() {}';
    if (/\/src\/present\/act\/movesPreview\.ts$/.test(f)) return 'export function openMovesPreview() {}';
    if (/\/src\/present\/act\/lab\.ts$/.test(f)) return 'export function openLab() {}';
    if (/\/src\/present\/act\/tunePanel\.ts$/.test(f)) return 'export function installActTune() {}';
    return null;
  },
});

const englishHtml = (crazy: boolean): Plugin => ({
  name: 'unseen-blade-english-html',
  transformIndexHtml: {
    order: 'pre',
    handler: html => ({
      html: html.replace('lang="zh-CN"', 'lang="en"').replace('<title>不见刀</title>', '<title>Unseen Blade</title>'),
      tags: crazy ? [{ tag: 'script', attrs: { id: 'crazygames-sdk', async: true, src: 'https://sdk.crazygames.com/crazygames-sdk-v3.js' }, injectTo: 'head' }] : [],
    }),
  },
});

export default defineConfig(({ command, mode }) => { const WX = command === 'build' && mode === 'wechat', CG = mode === 'crazygames', EN = !WX && (CG || process.env.VITE_LANG === 'en'); return {
  root: ROOT, // Use one canonical path for HTML proxy modules, including mapped worktree drives.
  base: CG ? './' : '/',
  cacheDir: path.resolve(ROOT, '.vite'), // Keep worktree caches local when node_modules is shared by junction.
  resolve: {
    alias: [{ find: /^pxui\//, replacement: PXUI + '/' }],
    dedupe: ['three'],
  },
  define: {
    __DEV__: JSON.stringify(command === 'serve'),
    __BUILD__: JSON.stringify(stamp()),
    __WX__: JSON.stringify(WX),
    __CG__: JSON.stringify(CG),
    __LANG__: JSON.stringify(EN ? 'en' : 'zh'),
    // 11-18 (用户：「调试只在我们本地打的桌面包里面存在就行了」): the debug switches — the look / skin / title / font / pixel rows in 设置,
    // their keys and the URL switches — only in the dev server and the desktop web page; the WeChat and CrazyGames packages ship without
    __DEBUG_UI__: JSON.stringify(!WX && !CG),
  },
  optimizeDeps: { entries: ['index.html'] },
  server: {
    host: '127.0.0.1', port: 5237, strictPort: false, fs: { allow: [ROOT] },
    hmr: { overlay: false },   // errors go to the console / cap.mjs log.txt, not over the screenshots
    watch: { ignored: ['**/docs/**', '**/out/**', '**/dist/**'] },
  },
  plugins: WX
    ? [stripReleaseDead(), wxAssets(ROOT)]
    : [
        voxBytes(),
        ...(process.env.VITEST ? [{
          name: 'vitest-worktree-globals',
          enforce: 'pre' as const,
          resolveId(id: string) { return id === 'vitest' ? '\0vitest-globals' : null; },
          load(id: string) {
            return id === '\0vitest-globals'
              ? 'const g = globalThis; export const { describe, it, test, expect, vi, beforeAll, afterAll, beforeEach, afterEach } = g;'
              : null;
          },
        }] : []),
        ...(CG ? [stripReleaseDead()] : []),
        ...(EN ? [englishHtml(CG)] : []),
        ...(command === 'build' ? [viteSingleFile()] : []),
      ],
  build: WX ? {
    // the mini-game: one script (no HTML), the sounds / portraits / fonts as files
    // (11-18: ES2015 — WeChat's upload compiler doesn't take ?. / ?? and the like: 「invalid file: game.js … SyntaxError: Unexpected token .」;
    // esbuild lowers them, tools/build-wechat.mjs then parses the whole game.js as ES2015 before it writes the project)
    outDir: 'dist-wx', emptyOutDir: true, target: 'es2015', assetsInlineLimit: 0, chunkSizeWarningLimit: 8000, reportCompressedSize: false, modulePreload: false,
    rollupOptions: { input: path.resolve(ROOT, 'src/main.ts'), output: { format: 'iife', entryFileNames: 'game.js', inlineDynamicImports: true } },
  } : {
    outDir: CG ? 'dist-cg' : 'dist',
    emptyOutDir: true,
    target: 'es2020',
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 8000,
    reportCompressedSize: false,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globals: true,
  },
}; });
