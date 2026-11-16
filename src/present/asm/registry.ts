// All locales and layouts the assembler knows. Locales are loaded one by one (loadLocales): a locale file that fails to load or throws
// (an agent mid-edit) is skipped and logged, the others keep working. Tests import the static list from ninja/index.ts instead.
import type { Group, Locale } from './types';
import { LAYOUTS } from './layouts';
import type { Registry } from './assemble';

export const LOCALES: Record<string, Locale> = {};
export const REGISTRY: Registry = {
  locales: LOCALES,
  layouts: { ...LAYOUTS },
  groupsByTag(tag: string): Group[] { return Object.values(LOCALES).flatMap(l => l.groups).filter(g => g.tags.includes(tag)); },
};
export function addLocales(list: Locale[]) {
  for (const l of list) { LOCALES[l.id] = l; for (const x of l.extraLayouts ?? []) REGISTRY.layouts[x.id] = x; }
}
/** the browser path: each locale module on its own */
export async function loadLocales() {
  const mods: Array<[string, () => Promise<Record<string, unknown>>]> = [
    ['temple', () => import('./ninja/temple')], ['village', () => import('./ninja/village')], ['wilds', () => import('./ninja/wilds')],
    ['town', () => import('./ninja/town')], ['castle', () => import('./ninja/castle')],
  ];
  const got = await Promise.all(mods.map(async ([k, f]) => { try { return (await f())[k] as Locale; } catch (e) { console.error(`[asm] locale ${k} failed to load`, e); return null; } }));
  addLocales(got.filter((l): l is Locale => !!l));
  return LOCALES;
}
