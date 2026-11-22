import { loadJsonResource } from './resource-loader.ts';

export type ShipModelStatus = 'integrated' | 'downloaded' | 'link_only';
export const modelStatusRank = { integrated: 3, downloaded: 2, link_only: 1 };

export function parseShipModelMatches(value: unknown): Map<string, ShipModelStatus> {
  if (!value || typeof value !== 'object' || !('models' in value) || !Array.isArray(value.models)) {
    throw new Error('舰船模型清单格式错误');
  }
  const matches = new Map<string, ShipModelStatus>();
  const models: readonly unknown[] = value.models;
  for (const model of models) {
    if (!model || typeof model !== 'object' || !('shipIds' in model) || !Array.isArray(model.shipIds) || !('status' in model)) {
      throw new Error('舰船模型匹配记录格式错误');
    }
    const status = model.status;
    if (status !== 'integrated' && status !== 'downloaded' && status !== 'link_only') {
      throw new Error('舰船模型匹配状态无效');
    }
    const shipIds: readonly unknown[] = model.shipIds;
    for (const id of shipIds) {
      if (typeof id !== 'string' || !id.trim()) throw new Error('舰船模型匹配编号无效');
      const previous = matches.get(id);
      if (!previous || modelStatusRank[status] > modelStatusRank[previous]) matches.set(id, status);
    }
  }
  return matches;
}

export async function loadShipModelMatches(): Promise<Map<string, ShipModelStatus>> {
  const url = new URL('../../../content/manifests/ship-model-catalog.json', import.meta.url);
  return parseShipModelMatches(await loadJsonResource(url));
}
