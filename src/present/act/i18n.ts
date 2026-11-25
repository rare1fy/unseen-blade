import { strFromU8 } from 'three/examples/jsm/libs/fflate.module.js';
import EN from './en.json';
import { preferences } from '../../platform/preferences';

// In WeChat builds, tools/wxAssets.ts replaces en.json with its subpackage file path ("i18n/en.json") so the 126 KB table stays out
// of the engine bundle until the player actually switches to English.
const enSource: unknown = EN;
let english: Readonly<Record<string, string>> = typeof enSource === 'string' ? {} : (enSource as Record<string, string>);
let enLoading: Promise<void> | null = typeof enSource === 'string' ? null : Promise.resolve();
const LANG_KEY = 'ub.language';
type Language = 'zh' | 'en';
const saved = preferences.get(LANG_KEY);
export let language: Language = saved === 'zh' || saved === 'en' ? saved : __LANG__;
const listeners = new Set<() => void>();

function ensureEnglish() {
  if (enLoading || typeof enSource !== 'string') return;
  const filePath = enSource;
  const api = typeof wx !== 'undefined' ? wx : (globalThis as { wx?: any }).wx;
  if (!api?.getFileSystemManager) return;
  const subName = filePath.split('/')[0];
  enLoading = new Promise<void>((resolve, reject) => {
    const read = () => api.getFileSystemManager().readFile({
      filePath,
      encoding: 'utf8',
      success: (res: { data: string | ArrayBuffer }) => {
        try {
          const text = typeof res.data === 'string' ? res.data : strFromU8(new Uint8Array(res.data));
          english = JSON.parse(text);
          resolve();
        } catch (e) { reject(e); }
      },
      fail: reject,
    });
    const g = (typeof GameGlobal !== 'undefined' ? GameGlobal : globalThis) as { __ubSinglePkg?: boolean; __ubSubpackages?: Record<string, boolean> | null };
    const needSub = g.__ubSubpackages ? !!g.__ubSubpackages[subName] : (!g.__ubSinglePkg && !!subName && subName !== 'assets');
    if (api.loadSubpackage && needSub) {
      api.loadSubpackage({ name: subName, success: read, fail: () => read() });
    } else read();
  }).then(() => {
    if (language === 'en') for (const notify of listeners) notify();
  }).catch((e) => {
    enLoading = null;
    console.warn('[i18n] failed to load English pack', e);
  });
}

if (language === 'en') ensureEnglish();

export function setLanguage(next: Language) {
  if (language === next) return;
  language = next;
  preferences.set(LANG_KEY, next);
  if (next === 'en') ensureEnglish();
  for (const notify of listeners) notify();
}

export function onLanguageChange(notify: () => void) {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

/** The original Chinese line is the key, so changing the source invalidates an old translation. */
export function t(source: string): string {
  return language === 'en' && Object.prototype.hasOwnProperty.call(english, source) ? english[source] : source;
}

/** Interpolate after translation so word order can differ. An array gives numbered placeholders. */
export function format(source: string, values: Readonly<Record<string, string | number>> | readonly (string | number)[]) {
  const args = values as Readonly<Record<string, string | number>>;
  return t(source).replace(/\{(\w+)\}/g, (whole, key: string) => Object.prototype.hasOwnProperty.call(args, key) ? String(args[key]) : whole);
}

/** Tagged template for UI strings with dynamic values. Keep Chinese source punctuation intact. */
export function msg(parts: TemplateStringsArray, ...values: (string | number)[]) {
  const source = parts.reduce((out, part, i) => i ? out + '{' + (i - 1) + '}' + part : part, '');
  return format(source, values.map(value => typeof value === 'string' ? t(value) : value));
}

/** Fit English on word boundaries. Measure the full text before revealing individual glyphs. */
export function wrapWords(value: string, maxWidth: number, measure: (text: string) => number): string[] {
  const rows: string[] = [];
  let row = '';
  for (const word of value.split(' ')) {
    const candidate = row ? row + ' ' + word : word;
    if (row && measure(candidate) > maxWidth) { rows.push(row); row = word; }
    else row = candidate;
  }
  if (row) rows.push(row);
  return rows;
}
