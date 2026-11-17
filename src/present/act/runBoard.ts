// The route board at each road out of a room (act-17): a wooden notice board (高札) on two posts with a little roof; burned into
// the face: the room type's glyph and its two-character name (agy: 乱兵 / 死士 / 行商 / 歇脚 / 遗卷 / 渠帅), and below what
// clearing it gives — a school's boon (太平道 雷 / 江东水师 寒 / 散人), copper coins, or healing — plus the place's name.
import * as THREE from 'three';
import { toon } from '../look/toon';
import { icon, text, textW, PIX_H } from '../v2/overlay';
import { bodyText, onBodyFontChange } from '../ui3d/bodyFont';
import { ROOM_INFO, SCHOOL_NAME, type RoomPlan } from './run';
import { SCROLL_GLYPH } from './manuals';

const GLYPH: Record<string, string[]> = {
  fight: ['........##', '.......##.', '......##..', '.....##...', '#...##....', '##.##.....', '.###......', '.##.......', '#.##......', '...#......'],
  elite: ['#........#', '##......##', '.##....##.', '..######..', '.########.', '##########', '##.####.##', '##########', '.#.#..#.#.', '..........'],
  rest: ['....#.....', '...##.....', '...###.#..', '..#####...', '..######..', '.###oo##..', '.##oooo#..', '..######..', '#.#.##.#.#', '##########'],
  shop: ['..######..', '.#......#.', '#..####..#', '#..#..#..#', '#..####..#', '.#......#.', '..######..', '....##....', '..######..', '....##....'],
  boon: ['.########.', '#oooooooo#', '#o######o#', '#oooooooo#', '#o#####oo#', '#oooooooo#', '#o######o#', '#oooooooo#', '.########.', '..........'],
  boss: ['....##....', '..######..', '.##....##.', '##..##..##', '#..####..#', '#..####..#', '##..##..##', '.##....##.', '..######..', '....##....'],
  coins: ['..######..', '.#oooooo#.', '#oo####oo#', '#oo#..#oo#', '#oo#..#oo#', '#oo####oo#', '.#oooooo#.', '..######..', '..........', '..........'],
  heal: ['.##...##..', '####.####.', '#########.', '#########.', '.#######..', '..#####...', '...###....', '....#.....', '..........', '..........'],
};
const INK = '#2a170c', WOOD = '#c09464', WOOD_D = '#8a6440', ACC = '#7a2a1e';
const SCHOOL_MARK: Record<string, { ch: string; col: string }> = { tp: { ch: '雷', col: '#8a6a10' }, jd: { ch: '寒', col: '#1e5a7a' }, sr: { ch: '散', col: ACC } };

function face(p: RoomPlan, place: string) {
  const W = 160, H = 104, S = 3, c = document.createElement('canvas'); c.width = W * S; c.height = H * S; const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  const paint = () => {
    g.setTransform(S, 0, 0, S, 0, 0);
    g.fillStyle = WOOD; g.fillRect(0, 0, W, H);
    g.fillStyle = WOOD_D; g.fillRect(0, 34, W, 2); g.fillRect(0, 70, W, 2); g.fillRect(0, 0, W, 4); g.fillRect(0, H - 4, W, 4); g.fillRect(0, 0, 4, H); g.fillRect(W - 4, 0, 4, H);
    icon(g, GLYPH[p.type], 10, 8, 5, { main: INK, acc: ACC, dark: INK });
    // (act-35: the 16 px 长坂点宋 — the name two board units per font pixel, in the top band; the school mark in the bottom band)
    const nk = PIX_H >= 16 ? 2 : 3, k = ROOM_INFO[p.type].name; text(g, k, 66 + (84 - textW(k, nk)) / 2, PIX_H >= 16 ? 3 : 12, nk, INK, 'left', null);
    const r = p.reward;
    if (r?.k === 'boon') { const m = SCHOOL_MARK[r.school]; if (PIX_H >= 16) { g.setTransform(1, 0, 0, 1, 0, 0); text(g, m.ch, 10 * S, 73 * S, 5, m.col, 'left', null); g.setTransform(S, 0, 0, S, 0, 0); } else text(g, m.ch, 12, 70, 2, m.col, 'left', null); }
    else if (r?.k === 'manual') icon(g, SCROLL_GLYPH, 10, 66, 3, { main: INK, acc: ACC, dark: INK });
    else if (r) icon(g, GLYPH[r.k === 'coins' ? 'coins' : 'heal'], 10, 66, 3, { main: INK, acc: ACC, dark: INK });
    const sub = r?.k === 'boon' ? SCHOOL_NAME[r.school] : r?.k === 'coins' ? `铜钱 ${r.n}` : r?.k === 'heal' ? '回血' : r?.k === 'manual' ? '刀谱' : place;
    g.setTransform(1, 0, 0, 1, 0, 0);
    bodyText(g, sub.slice(0, 6), 46 * S, 73 * S, 15 * S, INK);
  };
  paint();
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = false;
  return { t, paint };
}
/** a 高札 for one road */
export function runBoard(p: RoomPlan, place: string) {
  const g = new THREE.Group(), post = toon(0x4a3422), roof = toon(0x2e2a28), { t: tex, paint } = face(p, place);
  const faceMat = toon(0xffffff, { map: tex }); faceMat.emissive.set(0xffffff); faceMat.emissiveMap = tex; faceMat.emissiveIntensity = 0.28;
  const back = toon(0x7a5636);
  for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.3, 0.14), post); m.position.set(s * 0.82, 1.15, 0); m.castShadow = true; g.add(m); }
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.04, 0.08), [back, back, back, back, faceMat, back]); board.position.set(0, 1.55, 0.08); board.castShadow = true; g.add(board);
  const r1 = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.1, 0.5), roof); r1.position.set(0, 2.16, 0.05); g.add(r1);
  const r2 = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 0.3), roof); r2.position.set(0, 2.26, 0.05); g.add(r2);
  let mounted = false; const unlisten = onBodyFontChange(() => { if (g.parent) mounted = true; else if (mounted) { unlisten(); return; } paint(); tex.needsUpdate = true; });
  return { g, board, faceMat };
}
