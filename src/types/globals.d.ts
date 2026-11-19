// Ambient declarations: build-time constants, mini-game globals, and the pxui runtime (plain JS in ../pxui/src).

declare const __DEV__: boolean;
declare const __BUILD__: string;
/** the WeChat mini-game bundle (vite build --mode wechat) */
declare const __WX__: boolean;
declare const __CG__: boolean;
declare const __LANG__: 'zh' | 'en';
/** the debug switches (设置's look / skin / title / font / pixel rows, their keys, the URL switches): true in the dev server and the
 *  desktop web build, false in the WeChat and CrazyGames packages (vite.config.ts) */
declare const __DEBUG_UI__: boolean;

/** WeChat / Douyin mini-game global object (absent in browsers). */
declare const GameGlobal: any;
declare const wx: any;
declare const tt: any;

declare module '*ui/font.js' {
  const font: unknown;
  export default font;
}

declare module 'pxui/platform/index.js' {
  export interface PxPointer { type: 'down' | 'move' | 'up' | 'cancel'; id: number; x: number; y: number; raw?: unknown }
  export interface PxPlatform {
    name: 'browser' | 'wx' | 'tt';
    readonly canvas: any;
    createCanvas(): any;
    dpr(): number;
    canvasSize(): { w: number; h: number };
    safeArea(): { top: number; right: number; bottom: number; left: number };
    now(): number;
    raf(cb: (t?: number) => void): void;
    setTimeout(f: () => void, ms: number): unknown;
    loadImage(url: string): Promise<any>;
    readText(url: string): Promise<string>;
    query(k: string): string | null;
    onPointer(fn: (ev: PxPointer) => boolean | void): void;
    onResize(fn: () => void): void;
    storage: { get(k: string): any; set(k: string, v: any): void };
    audio: { play(url: string, o?: { loop?: boolean; volume?: number }): any };
    log(...a: unknown[]): void;
    attach?(UI: unknown): void;
  }
  export function createPlatform(opts?: { canvas?: any }): PxPlatform;
  export function createMinigamePlatform(api: any, name: 'wx' | 'tt', opts?: { canvas?: any }): PxPlatform;
}

declare module 'pxui/core/pxui.js' {
  import type { PxPlatform, PxPointer } from 'pxui/platform/index.js';
  export interface PxRect { x: number; y: number; w: number; h: number }
  export interface PxNode {
    text: string; label: string; sub: string; value: number; max: number; icon: string; src: string; color: string; frame: string;
    visible: boolean; disabled: boolean;
    set(p: Record<string, unknown>): PxNode;
    on(ev: 'tap' | 'down' | 'up', fn: (ev: PxPointer) => void): PxNode;
    rect(): PxRect | null;
    flash(ms?: number, text?: string): PxNode;
  }
  export interface PxList { render<T>(items: T[], bind: (item: T, h: PxNode, i: number) => void): void }
  export interface PxWorldInst {
    follow(fn: () => { nx: number; ny: number; hide?: boolean } | { x: number; y: number; hide?: boolean }): PxWorldInst;
    node(id: string): PxNode; list(id: string): PxList; remove(): void;
  }
  export interface PxWorld extends PxWorldInst { spawn(key: string | number): PxWorldInst }
  export interface PxUI {
    platform: PxPlatform;
    load(src: string | object): Promise<PxUI>;
    render(): { quads: number; draws?: number } & Record<string, unknown>;
    node(id: string): PxNode;
    list(id: string): PxList;
    world(id: string): PxWorld;
    slot(id: string): { rect(): PxRect | null };
    show(...names: string[]): void; hide(...names: string[]): void; only(...names: string[]): void;
    isShown(name: string): boolean; screens(): string[];
    registerState(id: string, o: { label?: string; group?: string; setup?: () => void | Promise<void> }): PxUI;
    setState(id: string): Promise<boolean>;
    onPointer(fn: (ev: PxPointer) => boolean | void): void;
    hitTest(x: number, y: number): string | null;
    rect(id: string): PxRect | null;
    setFont(f?: unknown): void;
  }
  export function createUI(opts: { platform: PxPlatform; gl?: WebGLRenderingContext | WebGL2RenderingContext; three?: unknown; font?: unknown; base?: string; assets?: Record<string, string> }): PxUI;
}

// The decoder bundled with three.js r162.
declare module 'three/examples/jsm/libs/fflate.module.js' {
  export function inflateSync(data: Uint8Array): Uint8Array;
  export function strFromU8(data: Uint8Array): string;
}
