// Shared scene vocabulary: moods (light / fog / sky), the chapter palette, and small helpers every scene file uses.
// Owned by the lead; scene files may define their own extra colours and moods locally instead of editing this file.
import { type Mood, type Ctx } from './stage';
import { AREA, patches } from './props';
import { CELL } from '../bestiary/kit';

// Chapter 1 is one endless night (幽暗森林 / Duskwood): cold blue-violet moonlight is the key light everywhere, fog lies on the
// ground and swallows the distance so landmarks float out of it, and warm light is rare — it comes only from a scene's own small
// flames. The camera-side fill is cool too, but strong enough that the battle floor, the actors and the dice stay readable.
export const NIGHT: Mood = { sky: true, bg: 0x0a0a18, fog: 0x1e2240, fogD: 0.022, hemiSky: 0x5c6698, hemiGround: 0x1a1824, hemiI: 1.75, moon: 0xa8b6ff, moonI: 3.3, key: 0xb8b8de, keyI: 0.72, earth: [0x22242c, 0x26292c, 0x202028], mist: 0x7076aa, mistA: 0.1 };
export const SWAMP: Mood = { ...NIGHT, fog: 0x16222a, fogD: 0.024, hemiSky: 0x4a6878, hemiGround: 0x121a1a, moon: 0x9cc0dc, moonI: 2.8, earth: [0x20262a, 0x242a26, 0x1c2024], mist: 0x5a7a88, mistA: 0.13 };
export const DUNGEON: Mood = { sky: false, bg: 0x06060c, fog: 0x0b0b14, fogD: 0.03, hemiSky: 0x747ca0, hemiGround: 0x201e26, hemiI: 1.85, moon: 0xa0a8d0, moonI: 2.3, key: 0xc4c0dc, keyI: 0.5, earth: [0x121016, 0x16141a, 0x100e12], mist: 0x3a3c58, mistA: 0.07 };
export const CAVE: Mood = { sky: false, bg: 0x050408, fog: 0x0a0a12, fogD: 0.028, hemiSky: 0x7a88b4, hemiGround: 0x20222a, hemiI: 2.05, moon: 0x8a9ac8, moonI: 2.2, key: 0xc0c8ff, keyI: 0.4, earth: [0x141216, 0x18161a, 0x121014], mist: 0x3a4660, mistA: 0.08 };
export const HOUSE: Mood = { ...NIGHT, keyI: 0.6, mistA: 0.06 };

export const BARK = 0x3e3638, BARK_D = 0x2a2428, PINE = 0x203634, PINE_T = 0x34504c, MOSS = 0x46523a, MOSS_D = 0x343e2e, EARTH = [0x3e3634, 0x36422e, 0x342e2c];
export const STONE = [0x6c6a7c, 0x666478, 0x716f84], GROUT = 0x2a2832, WOOD = 0x6a4a32, WOOD_D = 0x4a3222, WOOD_L = 0x86603e, ROCK = [0x46444e, 0x3e3c46, 0x52505a], IRON = 0x2c2a36, BONE = 0xe6dcc4, FIRE = 0xffa040, SOUL = 0x5affb0, CURSE = 0xb060ff;

export function floorEarth(c: Ctx, cols = EARTH) { patches(c.w, AREA, cols); }
/** a cobweb card where the old block web stood (y0 and s in blocks, as the block web took them) */
export const cweb = (c: Ctx, x: number, z: number, y0: number, s: number, alongX: boolean) => c.cards.add('web', x, z, { y: (y0 + 2 * s + 1) * CELL, s: ((2 * s + 1) / 32) * 1.25, ry: alongX ? 0 : Math.PI / 2 });
/** the cave rock ring's inner faces, for hanging growth */
export const RING: Array<[number, number, number, number, 'n' | 's' | 'e' | 'w']> = [[-8.4, -11.6, 8.4, -11.6, 's'], [-9.8, -10, -9.8, 4.5, 'e'], [9.8, -10, 9.8, 4.5, 'w']];
