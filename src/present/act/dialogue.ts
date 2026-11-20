import { language, t, wrapWords } from './i18n';
// 立绘对话（act-20，用户：「对话就弄立绘对话的形式，不要用timeline演对话」；老街机手绘像素立绘风格）：
// act-114 全面打磨：
//   - InkLine 去掉平滑渐变黑晕与雾带，改硬边像素墨托 + 像素刻线，严格符合体素/像素风格铁律；
//   - InkLine 与 Dialogue.advance() 完全同步：点击一次立刻全显当前旁白，再点翻页；
//   - Dialogue / InkLine 画布尺寸不变时复用 CanvasTexture（零高频 GPU 纹理创建销毁）并统一走 makeCanvas；
//   - 新增标点微顿、无配音行轻敲音（textTick）、高潮关键句微震/闪白、长按跳过当前对话（像素方环）、自动播放；
//   - 名将名册补全：赵云 / 吕布 / 夏侯惇 / 陆逊。
import * as THREE from 'three';
import type { UiLayer } from '../ui3d/layer';
import { text, textW, type Overlay } from '../v2/overlay';
import { bodyText, bodyW, BODY_FONT, NOTR } from '../ui3d/bodyFont';
import { PIX_H } from '../v2/pix';
import { cue } from '../../audio/cues';
import { sayLine } from '../../audio/voice';
import { audio } from '../../audio/audio';
import { GL } from '../engine/world';
import { GRADE } from '../look/post';
import { shake } from '../engine/clock';
import { loadImage, makeCanvas } from '../../platform/index';
import { paintPixelSkipRing } from './timeline';

export interface Line { who: string; text: string; mood?: string }
interface Speaker { name: string; side: 'L' | 'R'; mute?: boolean }
/** the cast: ids match the portrait files (src/assets/portraits/<id>.png) and docs/STORY.md */
export const CAST: Record<string, Speaker> = {
  jiangjin: { name: '刘白', side: 'L' }, duwu: { name: '杜五', side: 'R' }, sunao: { name: '孙婆婆', side: 'R' }, fengtiebi: { name: '冯铁臂', side: 'R', mute: true },
  luzhao: { name: '卢昭', side: 'R' }, huanyue: { name: '韩越', side: 'R' }, chulei: { name: '石雷', side: 'R' }, yanhu: { name: '阎虎', side: 'R' },
  fengzhen: { name: '封寒', side: 'R' }, zhouan: { name: '周默', side: 'R' }, cuixuan: { name: '崔玄', side: 'R' },
  /** act-114 三国名将客串 */
  zhaoyun: { name: '赵云', side: 'R' }, lubu: { name: '吕布', side: 'R' }, xiahoudun: { name: '夏侯惇', side: 'R' }, luxun: { name: '陆逊', side: 'R' },
  /** 11-19 / act-127: the snowy village's two sentries (sly skinny sentry + burly scowling sentry2) */
  sentry: { name: '黄巾哨兵', side: 'R' },
  sentry2: { name: '黄巾哨兵', side: 'R' },
  /** act-29: a line of action (in brackets, grey, no name): nobody speaks, both portraits slide out */
  act: { name: '', side: 'L', mute: true },
};
const files = import.meta.glob('../../assets/portraits/*.png', { eager: true, query: '?inline', import: 'default' }) as Record<string, string>;
const PORTRAIT: Record<string, string> = {};
for (const [p, url] of Object.entries(files)) PORTRAIT[p.split('/').pop()!.replace('.png', '')] = url;

/** Resolve the expressive portrait variant for a spoken line based on character, costume state (Liu Bai hat on/off), explicit mood, and dialogue emotion cues. */
export function resolvePortrait(who: string, text: string, mood?: string, heroHat = true): string {
  let want = who;
  if (who === 'jiangjin') {
    if (mood === 'hurt' || (!heroHat && /肋|血|痛|伤口|醒|……|刀呢|我的刀|银针|躺/.test(text))) want = 'jiangjin_hurt';
    else if (heroHat) {
      if (mood === 'fierce' || /百辟刀|还文家|命|斩|杀|滚|拿稳|仇|死|销了|欠|债|闭嘴|放开|来|拔刀|谁/.test(text)) want = 'jiangjin_hat_fierce';
      else want = 'jiangjin_hat';
    } else want = 'jiangjin';
  } else if (who === 'duwu') {
    if (mood === 'shock' || /娘哎|活、活的|诈尸|别乱动|不要命|吓|？！/.test(text)) want = 'duwu_shock';
    else if (mood === 'worry' || /吐|血|麦饼|热米汤|歇|保重|小心|活着|白发|惨|缝|衣裳|肉饼|水囊|暖暖|吃饱/.test(text)) want = 'duwu_worry';
  } else if (who === 'sunao') {
    if (mood === 'stern' || /别乱挺|张嘴|闭嘴|瞪|忍着|咽下去|扎透|钉棺材|木棍|推回去|裹胸布|死丫头|唬老身|忍着点|不够/.test(text)) want = 'sunao_stern';
    else if (mood === 'soft' || /好重的仇|可怜|烤烤手|热水|活着回来|苦|叹|留了|去吧|熬|药罐|接骨|铜钱/.test(text)) want = 'sunao_soft';
  } else if (who === 'cuixuan') {
    if (mood === 'defeat' || /阿皎|亲爹|不全是为了|动手吧|来吧|够了|了结|名字是我起|认出/.test(text)) want = 'cuixuan_defeat';
    else if (mood === 'blade' || /刀在我这|四个人|看看你的手|听好了|配|拔刀|杀|第几柄|灯灭/.test(text)) want = 'cuixuan_blade';
  } else if (who === 'chulei') {
    if (mood === 'panic' || /饶|别杀|不是我|求|饶命|放过|我说|供|崔|洛阳|阎虎/.test(text)) want = 'chulei_panic';
  } else if (who === 'yanhu') {
    if (mood === 'defeat' || /崔府|乐伎|逃出来|封寒|下邳|吐血|咳|不是铁匠/.test(text)) want = 'yanhu_defeat';
    else if (mood === 'rage' || /哈！|老子|野狗|烧得|砸|杀|滚|高炉|推进去/.test(text)) want = 'yanhu_rage';
  } else if (who === 'fengzhen') {
    if (mood === 'defeat' || /灭口|追杀|收账|周默|乌林|咳|替他|每一个/.test(text)) want = 'fengzhen_defeat';
    else if (mood === 'smirk' || /漆匣|拇指|药酒|脉象|故人|试我|新配/.test(text)) want = 'fengzhen_smirk';
  } else if (who === 'zhouan') {
    if (mood === 'bitter' || /亲爹|烧|认出|愧|对不住|姜汤|感念|那夜|连那|贱婢|清掉/.test(text)) want = 'zhouan_bitter';
  } else if (who === 'zhaoyun') {
    if (mood === 'fight' || /并肩|杀出去|枪|迎敌|贼兵|好刀法/.test(text)) want = 'zhaoyun_fight';
  } else if (who === 'lubu') {
    if (mood === 'smirk' || /有点意思|倒敢|不错|哈哈|方天画戟/.test(text)) want = 'lubu_smirk';
  } else if (who === 'xiahoudun') {
    if (mood === 'respect' || /暗处|不在战场|敬|同道|去吧/.test(text)) want = 'xiahoudun_respect';
  } else if (who === 'luxun') {
    if (mood === 'smile' || /巧了|同行|火势已成|走不脱|笑|铁索/.test(text)) want = 'luxun_smile';
  }
  return PORTRAIT[want] ? want : who;
}
const texCache = new Map<string, THREE.Texture>();
function portraitTex(id: string, ready: (t: THREE.Texture) => void) {
  const url = PORTRAIT[id]; if (!url) return null;
  let tx = texCache.get(id);
  if (!tx) {
    tx = new THREE.Texture(); tx.magFilter = THREE.NearestFilter; tx.minFilter = THREE.NearestFilter; tx.generateMipmaps = false; tx.colorSpace = THREE.SRGBColorSpace; texCache.set(id, tx);
    const ref = tx;
    loadImage(url, im => { ref.image = im; ref.needsUpdate = true; ready(ref); }, e => console.warn('[portrait]', id, e));
  } else if (tx.image) ready(tx);
  return tx;
}

const BG = '#14121c', EDGE_G = '#c8963a', EDGE_R = '#a8302a', NAME = '#ffd27a', BODY = '#f2e8d6', MUTE = '#a8a2a8';
const CPS = 34;   // base characters per second (with punctuation micro-pauses)
interface Side { mesh: THREE.Mesh | null; who: string; id: string; k: number; on: number; aspect: number; ih: number; pop: number; was: boolean; away: number }

/** the line's HD body font size (CSS px): 26 on tall screens, 19 on a phone held sideways */
const fontPx = (scale: number) => (scale >= 2 ? 26 : 19);
const tx = (s: string) => t(s);
const rawText = (g: CanvasRenderingContext2D, s: string, x: number, y: number, px: number, col: string) => bodyText(g, NOTR + s, x, y, px, col);
const rawW = (s: string, px: number) => (s ? bodyW(NOTR + s, px) : 0);

/** punctuation micro-pause weights (in extra character-ticks) for natural speech cadence */
function pauseWeight(ch: string): number {
  if (ch === '…' || ch === '—') return 3.2;
  if (ch === '。' || ch === '！' || ch === '？' || ch === '!' || ch === '?') return 3.8;
  if (ch === '，' || ch === '、' || ch === ',' || ch === '；') return 1.8;
  return 0;
}
/** dramatic emphasis detection (subtle box/portrait shake or brief blade flash on pivotal story beats) */
const EMPHASIS_SHAKE = /亲爹|烧干净|阿皎|闭嘴|呕出血|挑飞|断喉|一刀|砸地|画戟|火光骤起|吃曹某|少废话|活、活的|惊醒/;
const EMPHASIS_FLASH = /（[^）]*(?:挑飞|断喉|一送一收|挥刀|斩断|出鞘|砸地|火光骤起)[^）]*）/;

/** act-114 居中像素墨字: hard-stepped pixel ink bar (no smooth radial vignette, no linear fog band),
 *  synced 1:1 with Dialogue's shown count so a tap reveals the entire line immediately, reusing one CanvasTexture */
class InkLine {
  private m: THREE.Mesh;
  private c: HTMLCanvasElement = makeCanvas(64, 32) as HTMLCanvasElement;
  private tex: THREE.CanvasTexture | null = null;
  private texW = 0; private texH = 0;
  private k = 0; private key = ''; private wPx = 0; private hPx = 0;
  constructor(private L: UiLayer, private ov: Overlay | null = null) {
    this.m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    this.m.renderOrder = 61; this.m.visible = false; (ov ? ov.scene : L.scene).add(this.m);
  }
  set(on: boolean, line: Line, shown: number, total: number, dt: number, shakeX = 0, shakeY = 0) {
    this.k += ((on ? 1 : 0) - this.k) * Math.min(1, dt * 8);
    if (on) this.paint(line, shown, total);
    this.place(shakeX, shakeY);
  }
  fadeOut(dt: number) { if (this.k <= 0) return; this.k = Math.max(0, this.k - dt * 7); this.place(0, 0); }
  off() { /* faded out smoothly in fadeOut() */ }
  private paint(line: Line, shown: number, total: number) {
    const L = this.L, dpr = Math.max(1, Math.round(L.dpr || 1));
    const fpx = Math.round((L.h >= 600 ? 30 : 22) * dpr);
    const fullTr = tx(line.text), raw = fullTr.replace(/^（|）$/g, '');
    // map Dialogue's shown count (over fullTr, which may include leading/trailing brackets) onto raw
    const leadTrim = fullTr.startsWith('（') ? 1 : 0;
    const rawTotal = [...raw].length;
    const rawShown = shown >= total ? rawTotal : Math.max(1, Math.min(rawTotal, shown - leadTrim));
    const key = `${raw}|${rawShown}|${L.w}x${L.h}|${dpr}|${BODY_FONT.version}`;
    if (key === this.key) return; this.key = key;

    const maxW = Math.round(Math.min(L.w * 0.72, 860) * dpr);
    const rows: string[] = [];
    if (language === 'en') rows.push(...wrapWords(raw, maxW, s => rawW(s, fpx)));
    else { let r = ''; for (const ch of [...raw]) { if (rawW(r + ch, fpx) > maxW) { rows.push(r); r = ''; } r += ch; } if (r) rows.push(r); }

    const lineH = Math.round(fpx * 1.5), rule = Math.round(Math.min(L.w * 0.055, 56) * dpr), gapX = Math.round(14 * dpr);
    const padX = Math.round(18 * dpr), padY = Math.round(10 * dpr), p = Math.max(1, Math.round(2 * dpr));
    const widest = Math.max(...rows.map(r => rawW(r, fpx)), 1);
    const W = widest + 2 * (rule + gapX + padX), H = rows.length * lineH + padY * 2;
    const c = this.c;
    const resized = c.width !== W || c.height !== H;
    if (resized) { c.width = W; c.height = H; }
    const g = c.getContext('2d')!; g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, W, H);

    // crisp hard-stepped pixel ink plaque (zero smooth gradients, zero full-screen vignette)
    g.fillStyle = '#c8963a';
    g.fillRect(p * 2, 0, W - p * 4, H);
    g.fillRect(p, p, W - p * 2, H - p * 2);
    g.fillStyle = '#12101a';
    g.fillRect(p * 2, p, W - p * 4, H - p * 2);
    g.fillRect(p, p * 2, W - p * 2, H - p * 4);
    // stepped pixel corner rivets in muted gold
    g.fillStyle = '#8b682a';
    for (const [rx, ry] of [[p * 2, p * 2], [W - p * 3, p * 2], [p * 2, H - p * 3], [W - p * 3, H - p * 3]]) g.fillRect(rx, ry, p, p);

    // two crisp pixel flanking rules (stepped thickness, solid color, no fog)
    const sy = Math.round(H / 2);
    const leftX = padX, rightX = W - padX - rule;
    g.fillStyle = '#b99c68';
    g.fillRect(leftX + Math.round(rule * 0.35), sy - Math.round(dpr), Math.round(rule * 0.65), Math.max(1, Math.round(2 * dpr)));
    g.fillRect(rightX, sy - Math.round(dpr), Math.round(rule * 0.65), Math.max(1, Math.round(2 * dpr)));
    g.fillStyle = '#6c5a3e';
    g.fillRect(leftX, sy, Math.round(rule * 0.35), Math.max(1, Math.round(dpr)));
    g.fillRect(rightX + Math.round(rule * 0.65), sy, Math.round(rule * 0.35), Math.max(1, Math.round(dpr)));

    // characters revealed cleanly up to rawShown
    let left = rawShown;
    rows.forEach((r, ri) => {
      if (left <= 0) return;
      const rw = rawW(r, fpx), x = Math.round((W - rw) / 2), y = Math.round(padY + ri * lineH + (lineH - fpx) / 2);
      const chars = [...r], take = Math.min(chars.length, left);
      const part = chars.slice(0, take).join('');
      const o = Math.max(1, Math.round(dpr * 1.2));
      for (const [ox, oy] of [[-o, 0], [o, 0], [0, -o], [0, o]]) rawText(g, part, x + ox, y + oy, fpx, '#06050b');
      rawText(g, part, x, y, fpx, '#f6efe0');
      left -= chars.length;
    });

    // subtle pixel "next" caret when complete
    if (rawShown >= rawTotal) {
      const bx = W - Math.round(18 * dpr), by = H - Math.round(12 * dpr);
      g.fillStyle = NAME;
      for (let r = 0; r < 3; r++) g.fillRect(bx + r * dpr, by + r * dpr, (6 - r * 2) * dpr, dpr);
    }

    const hd = BODY_FONT.current !== 'pixel';
    if (!this.tex || resized) {
      this.tex?.dispose();
      this.tex = new THREE.CanvasTexture(c);
      this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.generateMipmaps = false;
      this.tex.magFilter = this.tex.minFilter = hd ? THREE.LinearFilter : THREE.NearestFilter;
      const mm = this.m.material as THREE.MeshBasicMaterial; mm.map = this.tex; mm.needsUpdate = true;
      this.texW = W; this.texH = H;
    } else {
      this.tex.magFilter = this.tex.minFilter = hd ? THREE.LinearFilter : THREE.NearestFilter;
      this.tex.needsUpdate = true;
    }
    this.wPx = W / dpr; this.hPx = H / dpr;
  }
  private place(sx: number, sy: number) {
    const L = this.L, a = this.k * this.k * (3 - 2 * this.k);
    this.m.visible = a > 0.01 && !!this.tex;
    if (this.m.visible) {
      const cx = Math.round(L.w / 2 + sx), cy = Math.round(L.h * 0.78 + (1 - a) * 10 + sy);
      if (this.ov) { this.m.position.set(cx, -cy, 0); this.m.scale.set(this.wPx, this.hPx, 1); }
      else { L.at(cx, cy, 0, this.m.position); this.m.scale.set(L.px(this.wPx), L.px(this.hPx), 1); }
      (this.m.material as THREE.MeshBasicMaterial).opacity = a;
    }
  }
}

export class Dialogue {
  on = false;
  /** act-114: optional auto-advance (waits for voice + reading beat, toggled via Tab or setting) */
  autoPlay = false;
  /** Whether Liu Bai is currently wearing her conical bamboo hat (true outside / combat, false healing/resting in kiln) */
  heroHat = true;
  private box: THREE.Mesh; private boxTex: THREE.CanvasTexture | null = null;
  private boxW = 0; private boxH = 0;
  private canvas: HTMLCanvasElement = makeCanvas(64, 32) as HTMLCanvasElement;
  private sides: Record<'L' | 'R', Side> = {
    L: { mesh: null, who: '', id: '', k: 0, on: 0, aspect: 0.8, ih: 144, pop: 0, was: false, away: 0 },
    R: { mesh: null, who: '', id: '', k: 0, on: 0, aspect: 0.8, ih: 144, pop: 0, was: false, away: 0 },
  };
  private outK = 0; private lastSpeaker: 'L' | 'R' | null = null;
  private onLine: ((i: number, line: Line) => void) | null = null;
  private ink: InkLine;
  private lines: Line[] = []; private i = 0; private shown = 0; private charBudget = 0; private t = 0;
  private done: (() => void) | null = null; private drawn = -1; private openT = 0;
  private autoWait = 0; private shakeT = 0; private tickCount = 0;
  /** long-press skip for an entire dialogue conversation (0.65 s hold -> pixel square ring) */
  private holding = false; private holdT = 0;
  private skipRing: THREE.Mesh; private skipCanvas: HTMLCanvasElement; private skipTex: THREE.CanvasTexture; private skipStep = -1;

  constructor(private L: UiLayer, ov: Overlay | null = null) {
    this.box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), [0, 0, 0, 0, 0, 0].map((_, i) => new THREE.MeshBasicMaterial({ color: i === 4 ? 0xffffff : 0x0d0b12, transparent: true, depthTest: false, depthWrite: false, toneMapped: false })));
    this.box.renderOrder = 60; this.box.visible = false; L.scene.add(this.box);
    this.ink = new InkLine(L, ov);
    this.skipCanvas = makeCanvas(16, 16) as HTMLCanvasElement; this.skipCanvas.width = 16; this.skipCanvas.height = 16;
    this.skipTex = new THREE.CanvasTexture(this.skipCanvas);
    this.skipTex.magFilter = this.skipTex.minFilter = THREE.NearestFilter; this.skipTex.generateMipmaps = false; this.skipTex.colorSpace = THREE.SRGBColorSpace;
    this.skipRing = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.skipTex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    this.skipRing.renderOrder = 70; this.skipRing.visible = false; L.scene.add(this.skipRing);
  }
  /** play lines; resolves when the last is dismissed (or skipped by long press) */
  play(lines: Line[], onLine?: (i: number, line: Line) => void): Promise<void> {
    this.onLine = onLine ?? null;
    this.lines = lines.filter(l => l.text).map(l => (/^（[^（）]*）$/.test(l.text.trim()) ? { ...l, who: 'act' } : l));
    this.i = 0; this.shown = 0; this.charBudget = 0; this.t = 0; this.drawn = -1; this.on = true; this.openT = 0; this.box.visible = true;
    this.outK = 0; this.autoWait = 0; this.shakeT = 0; this.tickCount = 0; this.holding = false; this.holdT = 0; this.skipStep = -1;
    for (const s of ['L', 'R'] as const) {
      const S = this.sides[s];
      if (S.mesh) { this.L.scene.remove(S.mesh); (S.mesh.material as THREE.Material).dispose(); S.mesh.geometry.dispose(); S.mesh = null; }
      S.who = ''; S.id = ''; S.on = 0; S.k = 0; S.pop = 0; S.was = false; S.away = 0;
    }
    { const l = this.lines[0], sp = l && CAST[l.who]; if (sp && l.who !== 'act') this.setPortrait(sp.side, l.who, resolvePortrait(l.who, l.text, l.mood, this.heroHat)); }
    cue('scroll', 0.4); this.say();
    return new Promise(res => { this.done = res; });
  }
  /** hold Escape / pointer / pad Back for 0.65 s to skip the entire conversation */
  holdSkip(down: boolean) { if (this.on || !down) this.holding = down; }
  toggleAuto() { this.autoPlay = !this.autoPlay; return this.autoPlay; }
  private setPortrait(side: 'L' | 'R', who: string, id: string) {
    const S = this.sides[side];
    if (S.id === id && S.who === who && S.mesh) return;
    const sameChar = S.who === who && !!S.mesh;
    S.who = who; S.id = id;
    if (sameChar) {
      // Same character changing expression/pose: instant crisp swap + subtle pop (no awkward off-screen slide!)
      const m = S.mesh!, mat = m.material as THREE.MeshBasicMaterial;
      S.pop = Math.max(S.pop, 0.72);
      const tex = portraitTex(id, tt => { if (S.id !== id) return; mat.map = tt; mat.needsUpdate = true; const img = tt.image as { width: number; height: number }; S.aspect = img.width / img.height; S.ih = img.height; m.visible = this.on; });
      if (tex) { mat.map = tex; mat.needsUpdate = true; if (tex.image) { const img = tex.image as { width: number; height: number }; S.aspect = img.width / img.height; S.ih = img.height; m.visible = this.on; } }
      return;
    }
    S.k = 0;
    if (S.mesh) { this.L.scene.remove(S.mesh); (S.mesh.material as THREE.Material).dispose(); S.mesh.geometry.dispose(); S.mesh = null; }
    const mat = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, alphaTest: 0.5, color: 0xffffff });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat); m.renderOrder = 59; m.visible = false; this.L.scene.add(m); S.mesh = m;
    const tex = portraitTex(id, tt => { if (S.id !== id) return; mat.map = tt; mat.needsUpdate = true; const img = tt.image as { width: number; height: number }; S.aspect = img.width / img.height; S.ih = img.height; m.visible = this.on; });
    if (!tex) { m.visible = false; return; }
    mat.map = tex; if (tex.image) { const img = tex.image as { width: number; height: number }; S.aspect = img.width / img.height; S.ih = img.height; m.visible = true; }
  }
  /** a tap / Enter / the cut button: completes the current line (including InkLine narration), then advances */
  advance() {
    if (!this.on) return false;
    const line = this.lines[this.i];
    const total = line ? [...t(line.text)].length : 0;
    if (line && this.shown < total) { this.shown = total; return true; }
    this.i++; this.shown = 0; this.charBudget = 0; this.t = 0; this.autoWait = 0; this.tickCount = 0;
    if (this.i >= this.lines.length) { this.close(); return true; }
    const next = this.lines[this.i], sp = CAST[next.who];
    if (sp && next.who !== 'act') this.setPortrait(sp.side, next.who, resolvePortrait(next.who, next.text, next.mood, this.heroHat));
    cue('click', 0.2); this.say(); return true;
  }
  /** skip every remaining line cleanly (firing onLine for any scripted state hooks along the way) */
  skipAll() {
    if (!this.on) return;
    while (this.i + 1 < this.lines.length) { this.i++; const l = this.lines[this.i]; if (l) this.onLine?.(this.i, l); }
    this.close();
  }
  private say() {
    const l = this.lines[this.i]; if (!l) return;
    sayLine(l.who, l.text);
    // act-114: subtle emotional micro-effects on key beats
    if (EMPHASIS_SHAKE.test(l.text)) this.shakeT = 0.24;
    if (l.who === 'act' && EMPHASIS_FLASH.test(l.text)) { GRADE.flash = Math.max(GRADE.flash, 0.28); shake(0.14); }
    this.onLine?.(this.i, l);
  }
  private close() {
    audio.stopVoice();
    this.on = false; this.holding = false; this.holdT = 0; this.skipRing.visible = false;
    this.box.visible = false; this.outK = 1; this.ink.off();
    const d = this.done; this.done = null; d?.();
  }
  /** the box face: name plate + the visible part of the line, reusing CanvasTexture when size is unchanged */
  private paint(line: Line, n: number, wPx: number, hPx: number, scale: number) {
    const sp = CAST[line.who], c = this.canvas, dpr = Math.max(1, Math.round(this.L.dpr || 1)), S = scale * dpr;
    const cw = Math.round(wPx * dpr), ch = Math.round(hPx * dpr);
    const resized = c.width !== cw || c.height !== ch;
    if (resized) { c.width = cw; c.height = ch; }
    const g = c.getContext('2d')!; g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, cw, ch);
    const P = (x: number, y: number, w: number, h: number, col: string) => { g.fillStyle = col; g.fillRect(Math.round(x * dpr), Math.round(y * dpr), Math.round(w * dpr), Math.round(h * dpr)); };
    // the frame: a thin gold line inside a thin red one, notched corners (pixel steps, never diagonal runs)
    P(0, 0, wPx, hPx, EDGE_R); P(2, 2, wPx - 4, hPx - 4, EDGE_G); P(4, 4, wPx - 8, hPx - 8, BG);
    for (const [x, y] of [[0, 0], [wPx - 4, 0], [0, hPx - 4], [wPx - 4, hPx - 4]]) g.clearRect(Math.round(x * dpr), Math.round(y * dpr), Math.round(4 * dpr), Math.round(4 * dpr));
    const nameS = S, name = sp?.name ?? line.who, right = sp?.side === 'R';
    const nx = right ? cw - Math.round(16 * dpr) - textW(name, nameS) : Math.round(16 * dpr);
    text(g, name, nx, Math.round(10 * dpr), nameS, NAME, 'left', '#05040a');
    const fpx = Math.round(fontPx(scale) * dpr), full = t(line.text), chars = [...full].slice(0, n), maxW = cw - Math.round(32 * dpr), lineH = Math.round(fpx * 1.4);
    let row = '', y = Math.round(10 * dpr) + PIX_H * nameS + Math.round(12 * dpr);
    const col = sp?.mute ? MUTE : BODY;
    if (language === 'en') {
      const x = Math.round(16 * dpr);
      let left = n;
      for (const fullRow of wrapWords(full, maxW, str => bodyW(str, fpx))) {
        if (left <= 0) break;
        bodyText(g, fullRow.slice(0, left), x, y, fpx, col);
        left -= fullRow.length + 1; y += lineH;
      }
    } else {
      for (const ch of chars) { if (bodyW(row + ch, fpx) > maxW) { bodyText(g, row, Math.round(16 * dpr), y, fpx, col); row = ''; y += lineH; } row += ch; }
      if (row) bodyText(g, row, Math.round(16 * dpr), y, fpx, col);
    }
    if (n >= [...full].length) {
      const bx = cw - Math.round(26 * dpr), by = ch - Math.round(18 * dpr);
      g.fillStyle = NAME;
      for (let r = 0; r < 4; r++) g.fillRect(bx + r * dpr, by + r * dpr, (8 - r * 2) * dpr, dpr);
    }
    const hd = BODY_FONT.current !== 'pixel';
    if (!this.boxTex || resized || this.boxW !== cw || this.boxH !== ch) {
      this.boxTex?.dispose();
      this.boxTex = new THREE.CanvasTexture(c);
      this.boxTex.generateMipmaps = false; this.boxTex.colorSpace = THREE.SRGBColorSpace;
      this.boxTex.magFilter = this.boxTex.minFilter = hd ? THREE.LinearFilter : THREE.NearestFilter;
      const fm = (this.box.material as THREE.MeshBasicMaterial[])[4]; fm.map = this.boxTex; fm.needsUpdate = true;
      this.boxW = cw; this.boxH = ch;
    } else {
      this.boxTex.magFilter = this.boxTex.minFilter = hd ? THREE.LinearFilter : THREE.NearestFilter;
      this.boxTex.needsUpdate = true;
    }
  }
  update(dt: number) {
    if (!this.on) {
      this.ink.fadeOut(dt);
      if (this.outK > 0) {
        this.outK = Math.max(0, this.outK - dt * 5); this.portraits(dt, this.lastSpeaker, 0, 0);
        if (this.outK <= 0) for (const s of ['L', 'R'] as const) { const S = this.sides[s]; if (S.mesh) S.mesh.visible = false; S.who = ''; S.id = ''; }
      }
      return;
    }
    const L = this.L, line = this.lines[this.i]; if (!line) return;
    this.openT = Math.min(1, this.openT + dt * 5);
    this.t += dt;
    // decay flash smoothly if triggered by emphasis
    if (GRADE.flash > 0) GRADE.flash = Math.max(0, GRADE.flash - dt * 1.6);
    if (this.shakeT > 0) this.shakeT = Math.max(0, this.shakeT - dt);
    const sx = this.shakeT > 0 ? Math.round(Math.sin(this.shakeT * 95) * 4 * (this.shakeT / 0.24)) : 0;
    const sy = this.shakeT > 0 ? Math.round(Math.cos(this.shakeT * 75) * 2.5 * (this.shakeT / 0.24)) : 0;

    // character reveal with punctuation micro-pauses
    const fullChars = [...t(line.text)], total = fullChars.length;
    if (this.shown < total) {
      const rate = CPS * (language === 'en' ? 2.1 : 1) * (line.who === 'act' ? 0.82 : 1);
      this.charBudget += dt * rate;
      while (this.shown < total && this.charBudget >= 1) {
        const ch = fullChars[this.shown];
        const cost = 1 + pauseWeight(ch);
        if (this.charBudget < cost && this.shown > 0) break;
        this.charBudget -= cost;
        this.shown++;
        // subtle tactile tick on unvoiced / mute lines
        if (!audio.voicing && pauseWeight(ch) === 0 && ch !== '（' && ch !== '）' && ch !== ' ') {
          this.tickCount++;
          if (this.tickCount % 3 === 1) cue('textTick', 0.28);
        }
      }
    } else if (this.autoPlay) {
      // wait until voice finishes + short breathing pause, then advance automatically
      if (!audio.voicing) {
        this.autoWait += dt;
        const hold = Math.max(0.75, Math.min(2.2, total * 0.045));
        if (this.autoWait >= hold) { this.advance(); return; }
      }
    }

    // long-press skip entire conversation (0.65 s hold)
    this.holdT = this.holding ? this.holdT + dt : Math.max(0, this.holdT - dt * 3.5);
    this.skipRing.visible = this.holdT > 0.14;
    if (this.skipRing.visible) {
      const step = Math.max(1, Math.min(16, Math.ceil((this.holdT / 0.65) * 16)));
      if (step !== this.skipStep) { this.skipStep = step; paintPixelSkipRing(this.skipCanvas, step); this.skipTex.needsUpdate = true; }
      L.at(L.w - 34, L.h - 34, 0, this.skipRing.position); this.skipRing.scale.setScalar(L.px(32));
    }
    if (this.holdT >= 0.65) { this.skipAll(); return; }

    const scale = L.h >= 600 ? 2 : 1, fpx0 = fontPx(scale), wPx = Math.round(Math.min(L.w * 0.5, fpx0 * 22 + 40, 640));
    const rowsFit = Math.max(1, Math.ceil(bodyW(t(line.text), fpx0) / Math.max(1, wPx - 32))), rows = Math.min(4, Math.max(language === 'en' ? 2 : 1, rowsFit));
    const hPx = Math.round(10 + PIX_H * scale + 12 + rows * Math.round(fpx0 * 1.4) + 12);
    const narr = line.who === 'act';
    this.box.visible = !narr;
    this.ink.set(narr, line, this.shown, total, dt, sx, sy);
    if (!narr) {
      const key = this.i * 10000 + this.shown * 2 + (this.shown >= total ? 1 : 0) + wPx * 1e7 + BODY_FONT.version * 1e11;
      if (key !== this.drawn) { this.drawn = key; this.paint(line, this.shown, wPx, hPx, scale); }
      const y = L.h - hPx / 2 - Math.max(10, L.h * 0.03) + (1 - this.openT) * 30 + sy;
      L.at(L.w / 2 + sx, y, 0, this.box.position); this.box.scale.set(L.px(wPx), L.px(hPx), L.px(8));
    }
    const sp = CAST[line.who]; this.lastSpeaker = line.who === 'act' ? null : sp?.side ?? null;
    this.portraits(dt, this.lastSpeaker, sx, sy);
  }
  private portraits(dt: number, speaker: 'L' | 'R' | null, sx: number, sy: number) {
    const L = this.L, dpr = GL.renderer?.getPixelRatio() || L.dpr || 1, Z = -0.5;
    const snap = (v: number) => Math.round(v * dpr) / dpr;
    for (const s of ['L', 'R'] as const) {
      const S = this.sides[s]; if (!S.mesh) continue;
      const speaking = speaker === s;
      if (speaking && !S.was) S.pop = 1; S.was = speaking;
      S.on += ((speaking ? 1 : 0) - S.on) * Math.min(1, dt * (speaking ? 14 : 7));
      S.k = Math.min(1, S.k + dt * 3.2); S.pop = Math.max(0, S.pop - dt / 0.22);
      const narr = this.on && this.lines[this.i]?.who === 'act'; S.away += ((narr ? 1 : 0) - S.away) * Math.min(1, dt * 9);
      const inK = 1 - Math.pow(1 - S.k, 3), outK = this.on ? 0 : 1 - this.outK * this.outK, dir = s === 'L' ? 1 : -1;
      const pkDev = Math.max(2, Math.round((L.h * dpr) / S.ih)), pk = (pkDev - 1 + S.on) / dpr, hP = S.ih * pk, wP = Math.round(S.ih * S.aspect) * pk;
      const home = s === 'L' ? wP * 0.4 : L.w - wP * 0.4;
      const step = L.w * 0.018 * S.on - L.w * 0.035 * (1 - S.on);
      const cx = home + dir * step - dir * ((1 - inK) + outK + S.away) * wP * 0.95 + (speaking ? sx * 1.2 : 0);
      const top = Math.max(L.h * 0.05, L.h * 1.04 - hP) + (1 - S.on) * L.h * 0.03 - Math.sin(S.pop * Math.PI) * Math.max(6, L.h * 0.014) + (speaking ? sy : 0);
      const left = snap(cx - wP / 2), y0 = snap(top);
      L.at(left + wP / 2, y0 + hP / 2, Z, S.mesh.position); S.mesh.scale.set(L.px(wP, Z), L.px(hP, Z), 1);
      const k = S.on, mat = S.mesh.material as THREE.MeshBasicMaterial;
      mat.color.setRGB(0.17 + 0.83 * k, 0.18 + 0.82 * k, 0.25 + 0.75 * k);
      S.mesh.renderOrder = speaking ? 59 : 58;
      S.mesh.visible = !!mat.map?.image;
    }
  }
}
