export interface HistoricalBattle {
  id: string;
  name: string;
  date: string;
  location: string;
  longitude: number;
  latitude: number;
  description: string;
  source: string;
  labelOffset?: readonly [number, number];
}

const navy = 'https://www.history.navy.mil/content/history/nhhc/';
const iwm = 'https://www.iwm.org.uk/';
export const battles: readonly HistoricalBattle[] = [
  { id: 'pearl', name: '珍珠港', date: '1941-12-07', location: '夏威夷瓦胡岛', longitude: -157.95, latitude: 21.36,
    description: '日本海军航空兵袭击珍珠港及周边基地。', source: `${navy}browse-by-topic/wars-conflicts-and-operations/world-war-ii/1941/pearl-harbor.html` },
  { id: 'midway', name: '中途岛海战', date: '1942-06-04 ~ 06-07', location: '中途岛周边海域', longitude: -177.4, latitude: 28.2,
    description: '太平洋战争的重要航母交战，日本损失四艘主力航空母舰。', source: `${navy}research/library/online-reading-room/title-list-alphabetically/b/battle-of-midway-4-7-june-1942.html` },
  { id: 'coral', name: '珊瑚海海战', date: '1942-05-04 ~ 05-08', location: '珊瑚海', longitude: 155, latitude: -15,
    description: '双方舰队主要通过舰载航空兵交战，盟军阻止了海路进攻莫尔兹比港的行动。', source: `${navy}browse-by-topic/wars-conflicts-and-operations/world-war-ii/1942/battle-of-coral-sea.html`, labelOffset: [-10, 12] },
  { id: 'guadalcanal', name: '瓜达尔卡纳尔海战', date: '1942-11-12 ~ 11-15', location: '所罗门群岛铁底湾附近', longitude: 160, latitude: -9.2,
    description: '围绕岛上增援与机场炮击的一系列海空交战，包含夜间战列舰作战。', source: `${navy}browse-by-topic/wars-conflicts-and-operations/world-war-ii/1942/guadalcanal/naval-battle-of-guadalcanal.html`, labelOffset: [8, -5] },
  { id: 'leyte', name: '莱特湾海战', date: '1944-10-23 ~ 10-26', location: '菲律宾中部诸海域', longitude: 125, latitude: 11,
    description: '由锡布延海、苏里高海峡、萨马岛与恩加尼奥角等多处交战组成。', source: `${navy}browse-by-topic/wars-conflicts-and-operations/world-war-ii/1944/battle-of-leyte-gulf.html`, labelOffset: [-8, 5] },
  { id: 'philippine', name: '菲律宾海海战', date: '1944-06-19 ~ 06-20', location: '塞班岛以西菲律宾海', longitude: 135, latitude: 20,
    description: '马里亚纳群岛战役中的大规模航母交战，日本舰载航空兵遭受重创。', source: `${navy}browse-by-topic/wars-conflicts-and-operations/world-war-ii/1944/battle-philippine-sea.html`, labelOffset: [8, -4] },
  { id: 'java', name: '爪哇海海战', date: '1942-02-27', location: '爪哇岛以北海域', longitude: 112, latitude: -5.5,
    description: '盟军联合舰队与日军舰队在爪哇岛附近的水面交战。', source: `${iwm}collections/item/object/1500025218` },
  { id: 'denmark', name: '丹麦海峡海战', date: '1941-05-24', location: '冰岛与格陵兰之间', longitude: -31, latitude: 64,
    description: '胡德号、威尔士亲王号与俾斯麦号、欧根亲王号交战，胡德号沉没。', source: `${iwm}history/second-world-war/battle-of-the-atlantic/hunting-bismarck` },
  { id: 'north-cape', name: '北角海战', date: '1943-12-26', location: '挪威北角外海', longitude: 27, latitude: 71.7,
    description: '英国舰队拦截沙恩霍斯特号，战斗中使用雷达搜索与火控。', source: `${iwm}history/iwm/hms-belfast/north-cape` },
  { id: 'river-plate', name: '拉普拉塔河口海战', date: '1939-12-13', location: '南大西洋拉普拉塔河口外', longitude: -56, latitude: -35,
    description: '英国巡洋舰编队与施佩伯爵海军上将号交战。', source: `${iwm}history/second-world-war/outbreak/what-you-need-to-know-about-the-battle-of-the-river-plate` },
  { id: 'matapan', name: '马塔潘角海战', date: '1941-03-28', location: '希腊南部外海', longitude: 22.5, latitude: 35.3,
    description: '地中海英意舰队交战，包含英国战列舰参加的夜战；标注主要交战日。', source: `${iwm}collections/item/object/1500025218`, labelOffset: [8, 8] },
  { id: 'taranto', name: '塔兰托袭击', date: '1940-11-11', location: '意大利塔兰托港', longitude: 17.24, latitude: 40.47,
    description: '英国舰载鱼雷机夜间袭击港内意大利舰队；标注行动开始日。', source: `${iwm}collections/item/object/11990`, labelOffset: [-8, -14] }
];

export function findBattle(id: string): HistoricalBattle {
  const battle = battles.find(battle => battle.id === id);
  if (!battle) throw new Error(`Unknown historical battle: ${id}`);
  return battle;
}
