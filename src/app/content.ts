import { loadShipModels } from '../ships.ts';
import { loadWorldLand } from '../lobby-art.ts';
import { loadTargetContent, createTargetOriginalData } from '../adapters/content/target-content.ts';
import modelCatalog from '../../content/manifests/ship-model-catalog.json';

export type GameContent = Awaited<ReturnType<typeof loadGameContent>>;

export async function loadGameContent() {
  const [models, land, target] = await Promise.all([
    loadShipModels(), loadWorldLand(), loadTargetContent()
  ]);
  const originalData = createTargetOriginalData(target);
  const shipModelMatches = new Map(modelCatalog.targetModels.filter(entry => entry.runtimeAsset !== null).map(entry => [entry.shipId, 'integrated' as const]));
  return { models, land, target, originalData, shipModelMatches, modelCatalog };
}
