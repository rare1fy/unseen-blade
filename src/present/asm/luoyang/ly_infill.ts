import type { Locale } from '../types';
import { M } from '../../scenes/props';
import { frame, palaceWall, charPost, rubble, ingots, qianfan, LY } from './ly_kit';

/** All pieces land in the stage voxel batch. Leave the outline wall its seven cells. */
export function burntInfill(place: 'road' | 'ward' | 'mint'): NonNullable<Locale['infill']> {
  return (c, { rect, p, back }) => {
    const w = M(rect.x1 - rect.x0), d = M(rect.z1 - rect.z0);
    const B = frame(c.w, rect.x0, rect.z0, 0);
    const x = Math.floor(w / 2), z = Math.floor(d / 2);
    B(0, -1, 0, w - 1, -1, d - 1, place === 'mint' ? LY.slag : LY.ashD);
    if (place === 'mint') {
      qianfan(B, x, z, 0, { bronze: true });
      if (w >= 52) { ingots(B, x - 16, z, 4); ingots(B, x + 16, z, 3); }
      return;
    }
    const rear = back ? z : 8, near = d - 9, span = Math.min(34, x - 9);
    if (span >= 18 && near - rear >= 15) {
      // The ward has a remnant of red plaster under a tiled coping. The street's house is a burnt timber bay.
      if (place === 'ward') {
        palaceWall(B, x - span, x + span, rear + 1, rear + 5, 23, { seed: p.seed, drops: [[x + 2, x + span, 11]] });
      } else {
        charPost(B, x - span + 3, rear + 4, 23);
        charPost(B, x + 1, rear + 4, 23);
        B(x - span, 24, rear + 2, x + 4, 27, rear + 6, LY.charL);
        charPost(B, x + span - 3, near - 4, 11, { broken: true });
      }
      // Two broad overlapping sheets of fallen tile, with a broken ridge beam.
      B(x - span, 0, near - 6, x + span, 2, near, LY.tileD);
      B(x - span + 5, 3, near - 5, x + 2, 4, near - 1, LY.tile);
      B(x - 3, 3, near - 3, x + span - 3, 5, near - 1, LY.char);
    } else {
      rubble(B, x, z, Math.min(x - 8, 18), Math.min(z - 8, 10), 2);
    }
  };
}
