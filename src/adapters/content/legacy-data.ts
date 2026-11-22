import { loadCompressedJsonResource } from './resource-loader.ts';
const dataUrl = new URL('../../../content/data/legacy/official-data.json.gz.bin', import.meta.url).href;

export const YAMATO_ID = 'nf-3-121';
export const MUSASHI_ID = 'nf-3-415';
export const nationNames = ['中立', '美国', '英国', '日本', '德国', '法国', '苏联', '意大利', '中国'];
export const shipClassNames: Record<string, string> = {
  BB: '战列舰', BC: '战列巡洋舰', CV: '航空母舰', CA: '重巡洋舰', CL: '轻巡洋舰', DD: '驱逐舰',
  FF: '护卫舰', SS: '潜艇', APA: '运输舰', unknown: '其他'
};
const names: Record<string, string> = {
  Yamato: '大和', Musashi: '武藏', 'Super Yamato': '超级大和', 'Yamato (1945)': '大和（1945）',
  Kongo: '金刚', Nagato: '长门', Fuso: '扶桑', Ise: '伊势', Mutsu: '陆奥', Amagi: '天城',
  Atago: '爱宕', Shinano: '信浓', Akagi: '赤城', Kaga: '加贺', Hiryu: '飞龙', Soryu: '苍龙',
  Iowa: '衣阿华', Montana: '蒙大拿', Fletcher: '弗莱彻', Essex: '埃塞克斯', Midway: '中途岛',
  Colorado: '科罗拉多', California: '加利福尼亚', Yorktown: '约克镇',
  'South Dakota': '南达科他', 'North Carolina': '北卡罗来纳',
  Baltimore: '巴尔的摩', Cleveland: '克利夫兰', Atlanta: '亚特兰大', Gearing: '基林',
  Bismarck: '俾斯麦', Tirpitz: '提尔皮茨', Scharnhorst: '沙恩霍斯特', Gneisenau: '格奈森瑙',
  'Prinz Eugen': '欧根亲王', 'H39 Class': 'H39级', 'H44 Class': 'H44级', Hood: '胡德',
  'Lion I': '狮Ⅰ', 'Lion II': '狮Ⅱ', 'Queen Elizabeth': '伊丽莎白女王', Nelson: '纳尔逊',
  'King George V': '乔治五世', 'Prince Of Wales': '威尔士亲王', Vanguard: '前卫',
  Revenge: '复仇', Richelieu: '黎塞留', Alsace: '阿尔萨斯', 'Jean Bart': '让·巴尔',
  Dunkerque: '敦刻尔克', Lyon: '里昂', Sevastopol: '塞瓦斯托波尔',
  'Vittorio Veneto': '维托里奥·维内托', Roma: '罗马', Leningrad: '列宁格勒'
};
export interface OriginalShip {
  id: string;
  name: string;
  originalName: string;
  nation: number;
  shipClass: string;
  source: string;
  available: boolean;
  raw: Record<string, string>;
  durability: number | null;
  level: number | null;
  standardDisplacement: number | null;
  maximumDisplacement: number | null;
  rMounts: number[];
}
export interface OriginalGun {
  id: string;
  nation: number;
  mountGroup: string;
  shellKey: string;
  source: string;
  raw: Record<string, string>;
  reloadSeconds: number;
}
export interface OriginalTable {
  nation: number;
  source: string;
  rows: string[][];
}
export interface OriginalShellTable extends OriginalTable {
  calibre: string;
}
export interface OriginalData {
  ships: OriginalShip[];
  guns: OriginalGun[];
  armor: OriginalTable[];
  shells: OriginalShellTable[];
  capturedAt: string;
  version: string;
  failureCount: number;
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('原版资料格式错误：需要对象。');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('原版资料格式错误：需要字符串。');
  return value;
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('原版资料格式错误：需要列表。');
  return value;
}
function nation(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value >= nationNames.length) {
    throw new Error('原版资料的国家编号无效。');
  }
  return value;
}
function strings(value: unknown): Record<string, string> {
  return Object.fromEntries(Object.entries(record(value)).map(([key, value]) => [key, text(value)]));
}
export function originalNumber(value: string | undefined, suffix = ''): number | null {
  if (value === undefined || value === '' || value === '-') return null;
  const cleaned = value.replaceAll(',', '').trim();
  const numeric = suffix && cleaned.endsWith(suffix) ? cleaned.slice(0, -suffix.length) : cleaned;
  if (!/^\d+(?:\.\d+)?$/.test(numeric)) throw new Error(`原版资料数值格式错误：${value}`);
  const result = Number(numeric);
  if (!Number.isFinite(result)) throw new Error(`原版资料数值超出范围：${value}`);
  return result;
}
export function parseOriginalData(value: unknown): OriginalData {
  const data = record(value);
  const ships = array(data['ships']).map(value => {
    const entry = record(value);
    const available = entry['raw'] !== null;
    const raw = available ? strings(entry['raw']) : {};
    const originalName = raw['ShipName2'] ?? text(entry['treeName']);
    const mounts = raw['ShipRMount'];
    const ship: OriginalShip = {
      id: text(entry['id']), name: names[originalName] ?? originalName, originalName,
      nation: nation(entry['nation']), shipClass: raw['ShipType']?.match(/\((\w+)\)/)?.[1] ?? 'unknown',
      source: text(entry['source']), available, raw,
      durability: originalNumber(raw['ShipDurabillity']), level: originalNumber(raw['ShipLevel']),
      standardDisplacement: originalNumber(raw['ShipDisplacementStandard'], 't'),
      maximumDisplacement: originalNumber(raw['ShipDisplacementMaximum'], 't'),
      rMounts: !mounts || mounts === '-' || mounts === '0' ? [] : mounts.split('/').map(mount => {
        const space = originalNumber(mount.trim());
        if (space === null) throw new Error(`主炮位容量缺失：${mounts}`);
        return space;
      })
    };
    return ship;
  });
  const guns = array(data['guns']).map(value => {
    const entry = record(value);
    const raw = strings(entry['raw']);
    const reloadSeconds = originalNumber(raw['reloadSeconds']);
    if (reloadSeconds === null || reloadSeconds <= 0) throw new Error('舰炮基础装填时间无效。');
    return { id: text(entry['id']), nation: nation(entry['nation']), mountGroup: text(entry['mountGroup']),
      shellKey: text(entry['shellKey']), source: text(entry['source']), raw, reloadSeconds };
  });
  const table = (value: unknown): OriginalTable => {
    const entry = record(value);
    return { nation: nation(entry['nation']), source: text(entry['source']),
      rows: array(entry['rows']).map(row => array(row).map(text)) };
  };
  if (new Set(ships.map(ship => ship.id)).size !== ships.length ||
    new Set(guns.map(gun => gun.id)).size !== guns.length) throw new Error('原版资料存在重复编号。');
  return {
    ships, guns, armor: array(data['armor']).map(table),
    shells: array(data['shells']).map(value => ({ ...table(value), calibre: text(record(value)['calibre']) })),
    capturedAt: text(data['capturedAt']), version: text(data['version']),
    failureCount: array(data['failures']).length
  };
}
export async function loadOriginalData(): Promise<OriginalData> {
  const value = await loadCompressedJsonResource(dataUrl);
  return parseOriginalData(value);
}
export function findOriginalShip(data: OriginalData, id: string): OriginalShip {
  const ship = data.ships.find(ship => ship.id === id);
  if (!ship) throw new Error(`舰型资料不存在：${id}`);
  return ship;
}
