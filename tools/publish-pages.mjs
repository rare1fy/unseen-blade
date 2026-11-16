// Publish one built single-file HTML to GitHub Pages: https://rare1fy.github.io/unseen-blade/
//   node tools/publish-pages.mjs dist/index.html [label]   (after npm run build; the label defaults to the tag on HEAD)
// User 2026-11-16 asked for the static page (「你布静态页没有，github」); gh-pages keeps only the latest build.
// So: an orphan commit holding index.html + .nojekyll, made with git plumbing (the working tree, the index and the
// current branch are never touched — no checkout / stash), force-pushed to origin/gh-pages. Pages serves it ~1 min later.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const [file, label0] = process.argv.slice(2);
if (!file || !fs.existsSync(file)) {
  console.error('usage: node tools/publish-pages.mjs <built index.html> [label, e.g. act-13]');
  process.exit(1);
}
const git = (args, input) => execFileSync('git', args, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'] }).trim();
const tryGit = (args) => { try { return git(args); } catch { return ''; } };

const html = git(['hash-object', '-w', '--no-filters', file]);   // byte-exact, no eol conversion
const empty = git(['hash-object', '-w', '--stdin'], '');           // .nojekyll: serve the file as is
const tree = git(['mktree'], `100644 blob ${empty}\t.nojekyll\n100644 blob ${html}\tindex.html\n`);
const label = label0 || tryGit(['describe', '--tags', '--exact-match', 'HEAD']) || tryGit(['rev-parse', '--short', 'HEAD']);
const stamp = new Date().toLocaleString('sv-SE').slice(0, 16);   // local time, YYYY-MM-DD HH:MM
const msg = `Pages: ${label} (${stamp}, ${(fs.statSync(file).size / 1e6).toFixed(1)} MB)\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
const commit = git(['commit-tree', tree, '-m', msg]);
git(['push', '--force', 'origin', `${commit}:refs/heads/gh-pages`]);
console.log(`gh-pages ← ${commit.slice(0, 7)} (${label}). Live in ~1 min: https://rare1fy.github.io/unseen-blade/`);
