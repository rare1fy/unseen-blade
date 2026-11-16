// What the show needs from its actors, independent of how they are built (KayKit models or the procedural fallback).
import type { Actor } from './actor';
import type { Action } from './rig';
import { Hero } from './hero';
import { Lich } from './lich';
import { Ghoul } from './ghoul';

export interface HeroLike extends Actor { aim: number; breath: number; attack(d: number): Action; spin(d: number): Action; toss(): Action; hurt(p?: number): Action; block(): Action; cheer(): Action; bleed(): Action; fall(): Action; setRunning(on: boolean): void }
export interface LichLike extends Actor { robeFire: number; cast(): Action; summon(): Action; shield(): Action; hurt(p?: number): Action; roar(): Action; talk(d?: number): Action; collapse(): Action }
export interface GhoulLike extends Actor { walkK: number; lunge(d: number): Action; hurt(p?: number): Action; shriek(): Action; rise?(): Action; die?(): Action; dispose?(): void }
export interface Cast { hero(): HeroLike; lich(): LichLike; ghoul(n: number): GhoulLike }

/** the primitive-built stand-ins, used only if the models fail to load */
export const proceduralCast = (): Cast => ({ hero: () => new Hero() as unknown as HeroLike, lich: () => new Lich(), ghoul: () => new Ghoul() });
