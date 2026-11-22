import { language, msg, t as localize } from './i18n';
// The route board at each road out of a room (act-17): a wooden notice board (高札) on two posts with a little roof; burned into
// the face: the room type's glyph and its two-character name (agy: 乱兵 / 死士 / 行商 / 歇脚 / 遗卷 / 渠帅), and below what
// clearing it gives — a boon, copper coins, or healing — plus the place's name.
import * as THREE from 'three';
import { toon } from '../look/toon';
import { icon, text as pixText, textW as pixTextW, PIX_H } from '../v2/overlay';
import { bodyText, bodyW, onBodyFontChange } from '../ui3d/bodyFont';
import { roomInfo, type RoomPlan } from './run';
import { ARCH_INFO } from './boons';
import { SCROLL_GLYPH } from './manuals';

const GLYPH: Record<string, string[]> = {
  fight: ['........##', '.......##.', '......##..', '.....##...', '#...##....', '##.##.....', '.###......', '.##.......', '#.##......', '...#......'],
  elite: ['#........#', '##......##', '.##....##.', '..######..', '.########.', '##########', '##.####.##', '##########', '.#.#..#.#.', '..........'],
  rest: ['....#.....', '...##.....', '...###.#..', '..#####...', '..######..', '.###oo##..', '.##oooo#..', '..######..', '#.#.##.#.#', '##########'],
  shop: ['..######..', '.#......#.', '#..####..#', '#..#..#..#', '#..####..#', '.#......#.', '..######..', '....##....', '..######..', '....##....'],
  boon: ['.########.', '#oooooooo#', '#o######o#', '#oooooooo#', '#o#####oo#', '#oooooooo#', '#o######o#', '#oooooooo#', '.########.', '..........'],
  event: ['....##....', '....##....', '..######..', '####oo####', '..##oo##..', '...####...', '..##..##..', '.##....##.', '..........', '..........'],
  boss: ['....##....', '..######..', '.##....##.', '##..##..##', '#..####..#', '#..####..#', '##..##..##', '.##....##.', '..######..', '....##....'],
  coins: ['..######..', '.#oooooo#.', '#oo####oo#', '#oo#..#oo#', '#oo#..#oo#', '#oo####oo#', '.#oooooo#.', '..######..', '..........', '..........'],
  heal: ['.##...##..', '####.####.', '#########.', '#########.', '.#######..', '..#####...', '...###....', '....#.....', '..........', '..........'],
  meta: ['..........', '.########.', '##########', '..######..', '...####...', '...####...', '..######..', '.########.', '..........', '..........'],
};
const INK = '#2a170c', WOOD = '#c09464', WOOD_D = '#8a6440', ACC = '#7a2a1e';
const BOON_MARK = ['....##....', '....##....', '....##....', '....##....', '....##....', '....##....', '..######..', '..#oooo#..', '..######..', '..........'];
/** act-122: distinct header strip / accent tones by room risk & value so forks read at a glance */
const BOARD_THEME: Record<string, { band: string; title: string; acc: string }> = {
  elite: { band: '#6c1e18', title: '#ffe6b0', acc: '#a4261c' },
  boss: { band: '#541414', title: '#ffd480', acc: '#b02418' },
  boon: { band: '#284a42', title: '#e8fff2', acc: '#2d6858' },
  event: { band: '#7c5414', title: '#fff0b8', acc: '#c8922c' },
  shop: { band: '#6e4c1c', title: '#fff0c4', acc: '#94621e' },
  rest: { band: '#5a361e', title: '#ffdfb0', acc: '#a04a20' },
  fight: { band: '#a87d50', title: INK, acc: ACC },
};

function boardSub(p: RoomPlan, place: string): string {
  const r = p.reward;
  if (p.type === 'elite') return r?.k === 'up' ? '秘传升阶' : r?.k === 'coins' ? msg`铜钱 ${r.n}` : r?.k === 'boon' && r.arch ? msg`${ARCH_INFO[r.arch].name}·珍绝` : '珍绝秘传';
  if (p.type === 'boss') return '终战';
  if (p.type === 'event') return '信物·加护';
  if (p.type === 'boon') return '稀世遗卷';
  if (p.type === 'shop') return '四摊百货';
  if (p.type === 'rest') return '调息三选';
  if (r?.k === 'boon') return r.arch ? msg`${ARCH_INFO[r.arch].name}秘传` : '秘传';
  return r?.k === 'coins' ? msg`铜钱 ${r.n}` : r?.k === 'maxHp' ? msg`气血+${r.n}` : r?.k === 'meta' ? '残铁药引' : r?.k === 'heal' ? '回血' : r?.k === 'manual' ? '刀谱' : place;
}

function face(p: RoomPlan, place: string) {
  const W = 160, H = 104, S = 3, c = document.createElement('canvas'); c.width = W * S; c.height = H * S; const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  const theme = BOARD_THEME[p.type] ?? BOARD_THEME.fight;
  const paint = () => {
    g.setTransform(S, 0, 0, S, 0, 0);
    g.fillStyle = WOOD; g.fillRect(0, 0, W, H);
    // act-122: colored top header band differentiates high-risk/high-reward forks (死士/遗卷/行商/歇脚/渠帅)
    g.fillStyle = theme.band; g.fillRect(4, 4, W - 8, 30);
    g.fillStyle = WOOD_D; g.fillRect(0, 34, W, 2); g.fillRect(0, 68, W, 2); g.fillRect(0, 0, W, 4); g.fillRect(0, H - 4, W, 4); g.fillRect(0, 0, 4, H); g.fillRect(W - 4, 0, 4, H);
    icon(g, GLYPH[p.type], 10, 8, 5, { main: p.type === 'fight' ? INK : theme.title, acc: theme.acc, dark: INK });
    const rawTitle = roomInfo(p.type, p.region ?? 0).name;
    const title = language === 'en' ? localize(rawTitle) : rawTitle;
    const r = p.reward;
    const archCol = r?.k === 'boon' && r.arch ? ARCH_INFO[r.arch].col : null;
    if (r?.k === 'boon' || p.type === 'boon' || p.type === 'elite') icon(g, BOON_MARK, 10, 71, 3, { main: archCol ?? INK, acc: archCol ?? theme.acc, dark: INK });
    else if (r?.k === 'manual') icon(g, SCROLL_GLYPH, 10, 71, 3, { main: INK, acc: theme.acc, dark: INK });
    else if (r) icon(g, GLYPH[r.k === 'coins' ? 'coins' : r.k === 'meta' ? 'meta' : 'heal'], 10, 71, 3, { main: INK, acc: theme.acc, dark: INK });
    else icon(g, GLYPH[p.type], 10, 71, 3, { main: INK, acc: theme.acc, dark: INK });
    const sub = boardSub(p, place);
    g.setTransform(1, 0, 0, 1, 0, 0);
    // Top band: chunky pixel font for Chinese (bold & legible at 3D pixel resolution), bodyText for English
    if (language === 'en') {
      const tPx = Math.min(20 * S, 20 * S * (92 * S) / Math.max(1, bodyW(title, 20 * S)));
      bodyText(g, title, 106 * S, 19 * S - tPx * 0.48, tPx, theme.title, 'center');
    } else {
      const sc = Math.max(1, Math.min(2 * S, Math.floor((92 * S) / Math.max(1, pixTextW(title, 1)))));
      pixText(g, title, 106 * S - pixTextW(title, sc) / 2, 19 * S - (PIX_H * sc) / 2, sc, theme.title, 'left', null);
    }
    // Middle band: concise place name so the route also hints at the locale
    const locTxt = (language === 'en' ? localize(place) : place).slice(0, 8);
    if (locTxt) {
      if (language === 'en') {
        const mPx = Math.min(13 * S, 13 * S * (100 * S) / Math.max(1, bodyW(locTxt, 13 * S)));
        bodyText(g, locTxt, 106 * S, 51 * S - mPx * 0.48, mPx, '#4e3018', 'center');
      } else {
        const sc = Math.max(1, Math.min(S, Math.floor((104 * S) / Math.max(1, pixTextW(locTxt, 1)))));
        pixText(g, locTxt, 106 * S - pixTextW(locTxt, sc) / 2, 51 * S - (PIX_H * sc) / 2, sc, '#4e3018', 'left', null);
      }
    }
    // Bottom band: reward / payoff line (high-contrast crimson for 死士重赏 / jade for 遗卷)
    const line = language === 'en' ? localize(sub) : sub.slice(0, 6);
    const subInk = p.type === 'elite' || p.type === 'boss' ? '#7a1610' : p.type === 'boon' ? '#1e4e40' : INK;
    if (language === 'en') {
      const px = Math.min(15 * S, 15 * S * (106 * S) / Math.max(1, bodyW(line, 15 * S)));
      bodyText(g, line, 44 * S, 86 * S - px * 0.48, px, subInk);
    } else {
      const sc = Math.max(1, Math.min(Math.round(1.35 * S), Math.floor((108 * S) / Math.max(1, pixTextW(line, 1)))));
      pixText(g, line, 44 * S, 86 * S - (PIX_H * sc) / 2, sc, subInk, 'left', null);
    }
  };
  paint();
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = false;
  return { t, paint };
}
/** a 高札 for one road (with automatic GreaterDepth see-through rescue so foreground roofs/walls/actors NEVER hide the label) */
export function runBoard(p: RoomPlan, place: string) {
  const g = new THREE.Group(), post = toon(0x4a3422), roof = toon(0x2e2a28), { t: tex, paint } = face(p, place);
  const faceMat = toon(0xffffff, { map: tex }); faceMat.emissive.set(0xffffff); faceMat.emissiveMap = tex; faceMat.emissiveIntensity = 0.34;
  const back = toon(0x7a5636);
  for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.55, 0.14), post); m.position.set(s * 0.82, 1.275, 0); m.castShadow = true; g.add(m); }
  const plaque = new THREE.Group();
  plaque.position.set(0, 1.78, 0.08);
  plaque.rotation.x = -0.18; // lean slightly upward toward the isometric camera for crisp legibility
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.64, 1.08, 0.08), [back, back, back, back, faceMat, back]);
  board.castShadow = true;
  plaque.add(board);
  // Occlusion-proof pixel plaque overlay: draws ONLY on pixels occluded by foreground buildings/roofs/pillars/actors
  // via standard WebGL1 THREE.GreaterDepth (0 pixels drawn when unobstructed; 100% readable when behind any model!)
  const xrayBorder = new THREE.Mesh(
    new THREE.PlaneGeometry(1.74, 1.18),
    new THREE.MeshBasicMaterial({
      color: 0xffd27a, transparent: true, opacity: 0.78,
      depthTest: true, depthFunc: THREE.GreaterDepth, depthWrite: false, toneMapped: false,
    }),
  );
  xrayBorder.position.z = 0.045;
  xrayBorder.renderOrder = 27;
  const xrayFace = new THREE.Mesh(
    new THREE.PlaneGeometry(1.64, 1.08),
    new THREE.MeshBasicMaterial({
      map: tex, transparent: true, opacity: 0.94,
      depthTest: true, depthFunc: THREE.GreaterDepth, depthWrite: false, toneMapped: false,
    }),
  );
  xrayFace.position.z = 0.046;
  xrayFace.renderOrder = 28;
  plaque.add(xrayBorder, xrayFace);
  g.add(plaque);
  const r1 = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.1, 0.52), roof); r1.position.set(0, 2.42, 0.05); g.add(r1);
  const r2 = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.1, 0.32), roof); r2.position.set(0, 2.52, 0.05); g.add(r2);
  let mounted = false; const unlisten = onBodyFontChange(() => { if (g.parent) mounted = true; else if (mounted) { unlisten(); return; } paint(); tex.needsUpdate = true; });
  return { g, board, faceMat };
}
