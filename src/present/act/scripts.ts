// 第一章的立绘对话台词（agy 写，docs/STORY.md 第 8 节，我核对）。who 用 dialogue.ts CAST 的 id。
import type { Line } from './dialogue';
const L = (who: string, text: string): Line => ({ who, text });

/** the first time she wakes in the hideout (after the opening) */
export const WAKE_DUWU: Line[] = [
  L('duwu', '白哥！别乱动，你肋下还插着孙婆婆的银针！'),
  L('jiangjin', '……刀呢。'),
  L('duwu', '在炉边烤着呢！我把你从长社死人堆里刨出来的。'),
  L('jiangjin', '褚雷还在破庙？'),
  L('duwu', '在！那贼道士刚抓了一批流民，今晚子时祭旗。'),
  L('jiangjin', '把我的斗笠拿来。子时前，他得死。'),
];
export const WAKE_SUNAO: Line[] = [
  L('sunao', '醒了？命比乱葬岗的野狗还硬，肺管子差一寸就破了。'),
  L('jiangjin', '闭息散还有多少？'),
  L('sunao', '省着点嚼！老身这把骨头，经不起三天两头给你缝皮。'),
  L('jiangjin', '死不了就行。银针拔了，我要出门。'),
  L('sunao', '裹胸布给你换过了。女娃娃家，非要往刀口上撞？'),
  L('jiangjin', '那个女人六年前就死了。这袋碎银，买你的药。'),
];
/** chapter 1's boss, before and after the fight */
export const CHULEI_BEFORE: Line[] = [
  L('chulei', '哪来的瞎眼野狗，敢踹本渠帅的山门？'),
  L('jiangjin', '熹平六年，腊月廿三，汝南寒山坞。'),
  L('chulei', '……寒山坞？那三十七户打铁的，早烧成炉渣了！'),
  L('jiangjin', '风箱底下，有个十一岁的丫头没死透。'),
  L('chulei', '是你？！当年那把生石灰，竟没把你毒死在坑里！'),
  L('jiangjin', '你泼灰的时候，左手铜镯响了三声。跟刚才一样。'),
  L('chulei', '找死！天公将军赐我五雷正法，今日便劈碎你的骨头！'),
  L('jiangjin', '雷声太大，吵耳朵。拔刀吧。'),
];
export const CHULEI_AFTER: Line[] = [
  L('chulei', '饶命……石灰是阎虎让我泼的！刀谱也不在我手！'),
  L('jiangjin', '阎虎在哪。'),
  L('chulei', '在洛阳！他投了西凉董卓的飞熊军，在洛阳掌兵！'),
  L('jiangjin', '当年你们烧我眼窝的炉灰，我还给你。'),
];
/** what they say when she is dragged back after a death (one line each, picked at random) */
export const DEATH_POOL: Record<string, string[]> = {
  duwu: ['白哥！我顺着刀环声才在泥沟里摸到你，险些晚了！', '黄巾贼换了巡山哨卡，下次走东边麦田，我挂了铜铃。', '别硬撑了，你吐出来的全是黑血，先喝口热米汤！',
    '那帮杂碎怕了！听说他们把破庙前院全埋上了火油罐。', '我的灰驴都累吐沫子了，白哥，咱歇半个时辰再去成吗？', '你的暗红腰布掉死人堆里了，我拼死给你捡回来了，洗净了。'],
  sunao: ['又被抬回来了？再偏半寸，老身就直接给你钉棺材板了。', '咬碎闭息散的狠劲倒是利索，张嘴，把这碗乌头汤咽下去！', '耳后听宫穴给你扎透了，下次那群杂碎放冷箭，听准点！', '肩骨裂了三道缝，别拿你那双死人眼瞪我，忍着疼！'],
  fengtiebi: ['（默默指了指刀刃上崩出的三个缺口，一锤砸扁烧红的铁块）', '（抓起刘白发抖的右手按在温热的刀鞘上，重重敲了两下铁砧）', '（从怀里掏出打磨一新的十枚柳叶镖塞进她袖袋，转身拉动风箱）', '（用火钳夹起一块寒山坞残铁熔入刀脊，对她比了个「斩」的手势）'],
};
/** a random line from someone's death pool, as a one-line scene */
export function deathLine(who: keyof typeof DEATH_POOL, rnd = Math.random): Line[] {
  const pool = DEATH_POOL[who]; return [L(who, pool[Math.floor(rnd() * pool.length) % pool.length])];
}
