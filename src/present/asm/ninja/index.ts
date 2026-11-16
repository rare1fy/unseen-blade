// 忍之章（忍者主题）的地点。每个地点一个文件（可带 <id>_*.ts 子文件），由各自的代理负责；这里只登记。
import type { Locale } from '../types';
import { temple } from './temple';
import { village } from './village';
import { wilds } from './wilds';
import { town } from './town';
import { castle } from './castle';

export const NINJA_LOCALES: Locale[] = [temple, village, wilds, town, castle];
