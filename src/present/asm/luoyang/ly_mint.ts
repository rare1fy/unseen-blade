// 铸钱场（ly_mint）（11-18，占位：子代理接着做成真正的地点；这个文件先让登记、类型检查和 __dh.scene 能跑）。
import { M, AREA } from '../../scenes/props';
import type { Locale } from '../types';

export const lyMint: Locale = {
  id: 'ly_mint', name: '铸钱场', theme: 'luoyang',
  layouts: ['axis'], landmarks: [], groups: [], seasons: ['autumn', 'summer'],
  floor(c) { for (let X = M(AREA.x0 - 6); X <= M(AREA.x1 + 6); X++) for (let Z = M(AREA.z0 - 8); Z <= M(AREA.z1 + 4); Z++) c.w.set(X, -1, Z, 0x3c3430); },
};