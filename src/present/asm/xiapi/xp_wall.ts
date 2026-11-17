// 湿马道（xp_wall）（11-18，占位：子代理接着做成真正的地点；这个文件先让登记、类型检查和 __dh.scene 能跑）。
import { M, AREA } from '../../scenes/props';
import type { Locale } from '../types';

export const xpWall: Locale = {
  id: 'xp_wall', name: '湿马道', theme: 'xiapi',
  layouts: ['axis'], landmarks: [], groups: [], seasons: ['winter'], weathers: ['mist', 'snow', 'clear'],
  floor(c) { for (let X = M(AREA.x0 - 6); X <= M(AREA.x1 + 6); X++) for (let Z = M(AREA.z0 - 8); Z <= M(AREA.z1 + 4); Z++) c.w.set(X, -1, Z, 0x4e555a); },
};