// 微信小游戏「游戏圈」平台适配层（https://developers.weixin.qq.com/minigame/dev/guide/open-ability/game-club.html）
// 关键实战要点：
//   1. 游戏圈仅能通过原生浮层 wx.createGameClubButton() 响应真实用户点击唤起，且不支持动态 setStyle，
//      位置/尺寸变更必须先 destroy() 再重建；平时切换显隐仅调用 hide()/show() 零开销。
//   2. Android 部分微信基础库对 type:'text' + rgba(0,0,0,0) 会渲染黑/白块，因此自定义像素牌匾模式统一用
//      type:'image' + 1×1 全透明 PNG（assets/px_blank.png，67 字节）覆盖在游戏自绘 UiLayer 牌匾热区上，iOS/Android 100% 稳定。
//   3. 严格避让微信右上角胶囊（wx.getMenuButtonBoundingClientRect）与刘海屏安全区（safeArea），并在进入战斗、
//      打开选牌/对话/典藏阁/暂停二级页/转场竹帘时立即 hide()，绝不挡住游戏 UI 或操作。

export interface GameClubRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface SafeAreaRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

export interface GameClubConfig {
  /** 留空默认跳本小游戏官方游戏圈首页；如需直跳指定活动/攻略帖，在微信 MP 后台获取 openlink 填入即可 */
  openlink: string;
  /** 是否开启微信原生红点（基础库 >= 2.30.3 支持） */
  hasRedDot: boolean;
  /** true 时使用微信自带原生 icon，false 时用 1×1 全透明 PNG 覆盖游戏内自绘硬边像素牌匾 */
  useNativeIcon: boolean;
  /** useNativeIcon=true 时的原生图标样式：'green' | 'white' | 'dark' | 'light' */
  nativeIcon: 'green' | 'white' | 'dark' | 'light';
  /** 本地 1×1 全透明贴图路径（由 tools/build-wechat.mjs 写入主包，仅 67 字节） */
  transparentImage: string;
}

export const GAME_CLUB_CONFIG: GameClubConfig = {
  openlink: '',
  hasRedDot: false,
  useNativeIcon: false,
  nativeIcon: 'dark',
  transparentImage: 'assets/px_blank.png',
};

interface WxGameClubBtn {
  show(): void;
  hide(): void;
  destroy(): void;
  onTap?(cb: (res?: unknown) => void): void;
  offTap?(cb: (res?: unknown) => void): void;
}

let btn: WxGameClubBtn | null = null;
let btnVisible = false;
let lastKey = '';
let lastRect: GameClubRect | null = null;
let tapHandler: (() => void) | null = null;
const boundTap = () => {
  try {
    tapHandler?.();
  } catch { /* ignore */ }
};

function getWx(): any {
  return typeof wx !== 'undefined' && wx ? wx : null;
}

/** 是否具备微信小游戏原生游戏圈按钮能力（TapTap 小游戏端不展示微信游戏圈） */
export function gameClubSupported(): boolean {
  const g = typeof GameGlobal !== 'undefined' ? GameGlobal : globalThis;
  if ((g as { __ubTapMiniGame?: boolean }).__ubTapMiniGame) return false;
  const w = getWx();
  return !!(w && typeof w.createGameClubButton === 'function');
}

/** 读取微信逻辑窗口尺寸与刘海屏安全区（优先 wx.getWindowInfo，回退 getSystemInfoSync） */
export function wxWindowSafeArea(fallbackW: number, fallbackH: number): SafeAreaRect {
  const w = getWx();
  let info: any = null;
  try {
    if (w && typeof w.getWindowInfo === 'function') info = w.getWindowInfo();
    else if (w && typeof w.getSystemInfoSync === 'function') info = w.getSystemInfoSync();
  } catch { /* ignore */ }
  const ww = Number(info?.windowWidth) || fallbackW;
  const wh = Number(info?.windowHeight) || fallbackH;
  const sa = info?.safeArea;
  if (sa && typeof sa.left === 'number' && typeof sa.right === 'number' && sa.right > sa.left) {
    return {
      left: Math.max(0, sa.left),
      right: Math.min(ww, sa.right),
      top: Math.max(0, sa.top ?? 0),
      bottom: Math.min(wh, sa.bottom ?? wh),
      width: ww,
      height: wh,
    };
  }
  return { left: 0, right: ww, top: 0, bottom: wh, width: ww, height: wh };
}

/** 读取微信右上角原生胶囊按钮区域（用于据点和平态精准避让，防重叠） */
export function wxMenuButtonRect(): GameClubRect | null {
  const w = getWx();
  if (!w || typeof w.getMenuButtonBoundingClientRect !== 'function') return null;
  try {
    const r = w.getMenuButtonBoundingClientRect();
    if (r && typeof r.left === 'number' && typeof r.top === 'number' && r.width > 0 && r.height > 0) {
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    }
  } catch { /* ignore */ }
  return null;
}

function normalizeRect(r: GameClubRect): GameClubRect {
  // 微信原生 GameClubButton 建议最小触控区域 >= 40x40 逻辑像素
  const width = Math.max(40, Math.round(r.width));
  const height = Math.max(40, Math.round(r.height));
  const left = Math.max(0, Math.round(r.left));
  const top = Math.max(0, Math.round(r.top));
  return { left, top, width, height };
}

/**
 * 同步微信原生游戏圈按钮的显示与位置：
 * - `rect === null`：立刻隐藏（不销毁，零重建开销）
 * - `rect !== null`：若矩形未变仅 show()；若坐标/尺寸改变则安全 destroy() 后按新坐标重建
 */
export function syncGameClubButton(rect: GameClubRect | null, onTap?: () => void): boolean {
  tapHandler = onTap ?? null;
  const w = getWx();
  if (!w || typeof w.createGameClubButton !== 'function') return false;

  if (!rect) {
    if (btn && btnVisible) {
      try { btn.hide(); } catch { /* ignore */ }
      btnVisible = false;
    }
    return false;
  }

  const nr = normalizeRect(rect);
  const cfg = GAME_CLUB_CONFIG;
  const key = `${nr.left},${nr.top},${nr.width},${nr.height}|${cfg.useNativeIcon ? cfg.nativeIcon : cfg.transparentImage}|${cfg.openlink}|${cfg.hasRedDot ? 1 : 0}`;

  if (btn && key === lastKey) {
    if (!btnVisible) {
      try { btn.show(); } catch { /* ignore */ }
      btnVisible = true;
    }
    return true;
  }

  // 坐标或样式变化：微信原生按钮不支持动态修改 style，需先销毁旧实例再重建
  destroyGameClubButton();
  try {
    const opts: Record<string, unknown> = {
      type: 'image',
      style: {
        left: nr.left,
        top: nr.top,
        width: nr.width,
        height: nr.height,
      },
    };
    if (cfg.useNativeIcon) {
      opts.icon = cfg.nativeIcon;
    } else {
      opts.image = cfg.transparentImage;
    }
    if (cfg.openlink) opts.openlink = cfg.openlink;
    if (cfg.hasRedDot) opts.hasRedDot = true;

    btn = w.createGameClubButton(opts) as WxGameClubBtn;
    lastKey = key;
    lastRect = nr;
    if (btn && typeof btn.onTap === 'function') btn.onTap(boundTap);
    if (btn && typeof btn.show === 'function') btn.show();
    btnVisible = true;
    return true;
  } catch {
    btn = null;
    btnVisible = false;
    lastKey = '';
    lastRect = null;
    return false;
  }
}

/** 彻底销毁当前微信原生游戏圈按钮实例 */
export function destroyGameClubButton() {
  if (btn) {
    try { btn.offTap?.(boundTap); } catch { /* ignore */ }
    try { btn.hide?.(); } catch { /* ignore */ }
    try { btn.destroy?.(); } catch { /* ignore */ }
    btn = null;
  }
  btnVisible = false;
  lastKey = '';
  lastRect = null;
}

/** 调试与单测状态查询 */
export function getGameClubState() {
  return {
    supported: gameClubSupported(),
    mounted: !!btn,
    visible: btnVisible,
    rect: lastRect ? { ...lastRect } : null,
  };
}

/** 可选能力包装：读取游戏圈互动数据（wx.getGameClubData，需基础库 >= 2.25.4 与后台开通） */
export function fetchGameClubData(dataTypeList: Array<{ type: number; subKey?: string }>): Promise<any | null> {
  const w = getWx();
  if (!w || typeof w.getGameClubData !== 'function') return Promise.resolve(null);
  return new Promise(resolve => {
    try {
      w.getGameClubData({
        dataTypeList,
        success: (res: unknown) => resolve(res),
        fail: () => resolve(null),
      });
    } catch {
      resolve(null);
    }
  });
}
