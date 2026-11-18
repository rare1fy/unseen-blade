import EN from './en.json';
import { preferences } from '../../platform/preferences';

const english: Readonly<Record<string, string>> = EN;
const LANG_KEY = 'ub.language';
type Language = 'zh' | 'en';
const saved = preferences.get(LANG_KEY);
export let language: Language = saved === 'zh' || saved === 'en' ? saved : __LANG__;
const listeners = new Set<() => void>();

export function setLanguage(next: Language) {
  if (language === next) return;
  language = next;
  preferences.set(LANG_KEY, next);
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
