import { loadShipModels } from '../ships.ts';
import { loadWorldLand } from '../lobby-art.ts';
import { loadOriginalData } from '../original-data.ts';
import { loadShipModelMatches } from '../ui.ts';

export type GameContent = Awaited<ReturnType<typeof loadGameContent>>;

export async function loadGameContent() {
  const [models, land, originalData, shipModelMatches] = await Promise.all([
    loadShipModels(), loadWorldLand(), loadOriginalData(), loadShipModelMatches()
  ]);
  if (originalData.failureCount) console.warn(`官网资料有 ${originalData.failureCount} 项未取得，缺失数值不参与配置。`);
  return { models, land, originalData, shipModelMatches };
}
