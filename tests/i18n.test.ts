import ts from 'typescript';
import { afterEach, expect, test } from 'vitest';
import EN from '../src/present/act/en.json';
import SCRIPT from '../src/present/act/scriptData.json';
import { format, msg, setLanguage, t } from '../src/present/act/i18n';
import font from '../ui/font.js';

const translations: Readonly<Record<string, string>> = EN;
const han = /\p{Script=Han}/u;
const skippedFiles = /(?:^|\/)(?:lab|tune|tunePanel|animPreview|hanshan_people|[^/]+_models)\.ts$/;   // (animPreview: the other window's animation tool page, not in the game)
// These are search terms, scene metadata or developer-only controls, even when their files also contain player text.
const internal: Record<string, RegExp> = {
  'show.ts': /^(?:界面风格：.*点这里换.*|震动：\{0\}（\{1\}）|这台设备支持|iPhone iOS .*|17 及以下|这个浏览器不支持|(?:开始画面|造型|像素)：.*点这里换.*|跳过剧情.*|打不死：.*|全部招式：.*|演出 \/ 对话还在放，放完再切|一二三四五六七八|·头目|·精英|据点的人|第[一二三四五]关 · .{2})$/,   // (the last few: the animation tool page's groups)
  'hideout.ts': /^(?:据点五人|节点|户外)$/,
};

function missingKeys() {
  const missing = new Set<string>();
  const source = (key: string, where: string) => {
    if (han.test(key) && !translations[key]?.trim()) missing.add(key + ' (' + where + ')');
  };
  for (const [id, lines] of Object.entries(SCRIPT)) lines.forEach((line, i) => source(line.text, 'scriptData.json/' + id + '/' + i));

  const walkFiles = (files: Record<string, string>, localesOnly = false) => {
    for (const [filename, code] of Object.entries(files)) {
      if (skippedFiles.test(filename)) continue;
      const name = filename.split('/').pop()!;
      const file = ts.createSourceFile(filename, code, ts.ScriptTarget.Latest, true);
      const visit = (node: ts.Node) => {
        let key = '';
        if (ts.isStringLiteralLike(node) && !ts.isLiteralTypeNode(node.parent)) key = node.text;
        if (ts.isTemplateExpression(node)) key = node.head.text + node.templateSpans.map((span, i) => '{' + i + '}' + span.literal.text).join('');
        const prop = node.parent;
        // Assembled geometry names stay internal. Locale names with a theme flow into room banners and route boards.
        const playerLocale = prop && ts.isPropertyAssignment(prop) && prop.name.getText(file) === 'name' &&
          ts.isObjectLiteralExpression(prop.parent) && prop.parent.properties.some(p => p.name?.getText(file) === 'theme');
        let isMatchToken = false;
        for (let p = node.parent; p; p = p.parent) {
          if (ts.isVariableDeclaration(p) && ['KEYS', 'KEY_HINTS'].includes(p.name.getText(file))) { isMatchToken = true; break; }
        }
        if (key && !isMatchToken && (!localesOnly || playerLocale) && !internal[name]?.test(key)) {
          source(key, filename.replace('../', '') + ':' + (1 + file.getLineAndCharacterOfPosition(node.getStart(file)).line));
        }
        ts.forEachChild(node, visit);
      };
      visit(file);
    }
  };
  walkFiles(import.meta.glob<string>(['../src/present/act/**/*.ts', '../src/present/look/quality.ts', '../src/present/look/craft.ts', '../src/present/ui3d/bodyFont.ts'], { query: '?raw', import: 'default', eager: true }));
  walkFiles(import.meta.glob<string>('../src/present/asm/**/*.ts', { query: '?raw', import: 'default', eager: true }), true);
  return [...missing].sort();
}

afterEach(() => setLanguage('zh'));

test('player copy and all imported dialogue have English translations', () => {
  expect(missingKeys(), '补全 src/present/act/en.json 的中文原文 key').toEqual([]);
});

test('English placeholders agree with the source and fit the baked pixel alphabet', () => {
  const error: string[] = [];
  const glyphs = new Set((font as { chars: string }).chars);
  const placeholders = (value: string) => (value.match(/\{\w+\}/g) ?? []).sort().join();
  for (const [key, value] of Object.entries(translations)) {
    if (placeholders(key) !== placeholders(value)) error.push(key + ': placeholders');
    if (han.test(value) || [...value].some(character => !glyphs.has(character))) error.push(key + ': unsupported English glyph');
  }
  expect(error).toEqual([]);
});

test('language toggling keeps the Chinese originals and translates dynamic labels in order', () => {
  expect(t('刘白')).toBe('刘白');
  expect(msg`手上${'残铁'} ${10}`).toBe('手上残铁 10');
  setLanguage('en');
  expect(t('刘白')).toBe('Liu Bai');
  expect(msg`手上${'残铁'} ${10}`).toBe('You have 10 Blade Scrap');
  expect(format('伤害 {v}', { v: '150%' })).toBe('150% damage');
  expect(t('还没翻译')).toBe('还没翻译');
  setLanguage('zh');
  expect(t('刘白')).toBe('刘白');
});
