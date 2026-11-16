/// <reference types="vitest" />
// 不见刀: dev server (http://127.0.0.1:5237) + single-file web build (dist/index.html, everything inlined: one file to open or share).
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { realpathSync } from 'node:fs';

const ROOT = realpathSync.native(path.dirname(fileURLToPath(import.meta.url)));
const stamp = () => { const d = new Date(), z = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`; };   // local time
const PXUI = path.resolve(ROOT, 'src/vendor/pxui');   // pxui's platform layer, copied in (src/vendor/pxui/README.md)

export default defineConfig(({ command }) => ({
  root: ROOT, // Use one canonical path for HTML proxy modules, including mapped worktree drives.
  cacheDir: path.resolve(ROOT, '.vite'), // Keep worktree caches local when node_modules is shared by junction.
  resolve: {
    alias: [{ find: /^pxui\//, replacement: PXUI + '/' }],
    dedupe: ['three'],
  },
  define: {
    __DEV__: JSON.stringify(command === 'serve'),
    __BUILD__: JSON.stringify(stamp()),
  },
  optimizeDeps: { entries: ['index.html'] },
  server: {
    host: '127.0.0.1', port: 5237, strictPort: false, fs: { allow: [ROOT] },
    hmr: { overlay: false },   // errors go to the console / cap.mjs log.txt, not over the screenshots
    watch: { ignored: ['**/docs/**', '**/out/**', '**/dist/**'] },
  },
  plugins: command === 'build' ? [viteSingleFile()] : [],
  build: {
    outDir: 'dist',
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
}));
