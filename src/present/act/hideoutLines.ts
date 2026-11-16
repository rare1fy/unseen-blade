// 据点人物的台词和局外成长的文案（agy 写，我核对；act-20）。who 用 dialogue.ts CAST 的 id。
/** a word when the heroine walks up to someone and presses 斩 (one picked at random) */
export const NPC_LINES: Record<string, string[]> = {"duwu": ["阿烬哥，肉饼刚出炉，揣两块路上垫肚子！", "我这三根指头搓的麻绳，结实着呢，带上？", "阿烬哥，水囊灌满烈酒了，外头风硬，暖暖身。", "别省那几个钱，阿烬哥，吃饱了才有力气砍人！"], "sunao": ["裹胸布勒那么紧，不怕闷死？过来下针。", "死丫头命真硬，流这么多血还没断气。", "别拿瞎眼唬老身，我剩这只眼比你亮堂。", "药罐子煨着呢，想多活几日就把衣裳褪了。"], "fengtiebi": ["（用腕上铁锤轻磕砧台，朝你的刀鞘努了努嘴。）", "（独手舀了瓢温水递来，目光扫过你染血的袖口。）", "（往炉膛添了把碎炭，低头摩挲着寒山坞的旧刀铭。）", "（抬起套着铁锤的右臂，拍了拍火炉旁的矮凳。）"], "luzhao": ["仇家的脑袋还在脖子上，你倒有空歇脚。", "洛阳来的密信刚到，拿命去换，还是拿钱？", "我要借你的刀铺路，你自然不能死得太早。", "名册上又添了三个名字，今晚去勾哪一个？"], "huanyue": ["瞎子，你的命是我的，死在外头算怎么回事！", "断发之仇还没算，你不准死在杂碎手里。", "步子虚成这样？接着，多出来的金创药。", "等你身上的伤养利索了，再来接我三剑。"]};
/** the line before the smith's / the healer's upgrade list */
export const UP_LINES: Record<string, string[]> = {"sunao": ["沸血药引备好了，忍着点，扎偏一寸可不怪我。", "坐稳了，这几针下去，鬼门关前也能抢回条命。"], "fengtiebi": ["（左掌按住刀脊，腕上铁锤已举到火光里。）", "（把百辟残铁扫进炉火，抬头看了你一眼。）"]};
/** not enough to pay */
export const POOR_LINES: Record<string, string> = {"sunao": "药引不够，老身总不能拿白水给你熬命。", "fengtiebi": "（拨了拨见底的铁篓，摇摇头，垂下了铁锤。）"};
/** the upgrades' names and two lines (meta.ts ids) */
export const UP_COPY: Record<string, [string, string, string]> = {"blade": ["百辟刀身", "残铁重打，刀口更狠", "斩击伤害每级+10%"], "darts": ["袖底镖匣", "匣槽改宽，暗器趁手", "随身飞镖每级多1枚"], "manual": ["寒山旧谱", "每局动身出窑之前", "可先挑一本旧刀谱"], "vigor": ["沸血筋骨", "烈药行针，身子骨硬", "生命上限每级+15"], "breath": ["绝处闭息", "每局一次受致命伤时", "强吊一口气留三成血"], "intent": ["出鞘杀气", "每进一间屋子动手前", "随身自带一格杀气"], "ear": ["贯耳听宫", "长针刺穴，耳力更尖", "敌人起手每级慢10%"]};
/** the haul on the way home: alive / dragged back ({iron}, {herb}) */
export const HAUL: [string, string] = ["活着带回：百辟残铁 {iron} · 沸血药引 {herb}", "血里捞回：百辟残铁 {iron} · 沸血药引 {herb}"];

/** 杜五's provisions for the next trip (agy, 11-17): pick one; it goes with her on the next run only */
export const MEALS: Array<{ id: 'feast' | 'purse' | 'wine'; name: string; desc: string }> = [{"id": "feast", "name": "炙肉胡饼", "desc": "这一趟血量上限+15"}, {"id": "purse", "name": "五铢钱囊", "desc": "这一趟出门带40枚铜钱"}, {"id": "wine", "name": "瓦壶烈酒", "desc": "这一趟挨的第一下不掉血"}];
export const MEAL_LINES: { offer: string[]; packed: string[]; after: Record<string, string> } = {"offer": ["阿烬哥，窑里刚拢上火，挑样趁手的带上再走呗。", "外头死人比活人多，俺老杜别的不会，管饱还在行。", "空着肚子咋拼刀子？紧着挑一样，骡车套好等你咧。"], "packed": ["阿烬哥，东西都揣怀里咧，快去快回！", "古窑家底就这点，莫看俺咧，赶紧动身吧。"], "after": {"feast": "俺拿三根指头揉的面，瓷实，吃饱了抗揍！", "purse": "收尸攒下的铜钱，阿烬哥路上也好打点。", "wine": "这酒呛嗓子，闷一口壮胆，挨刀都不觉疼！"}};
