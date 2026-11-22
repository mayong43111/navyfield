import { loadCompressedJsonResource } from './resource-loader.ts';

export type GeoPoint = readonly [number, number];
export type LandPolygon = GeoPoint[][];

function isPoint(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2
    && value.every(number => typeof number === 'number' && Number.isFinite(number));
}

function isPolygon(value: unknown): value is LandPolygon {
  return Array.isArray(value) && value.every(ring => Array.isArray(ring) && ring.every(isPoint));
}

export async function loadWorldLand(): Promise<LandPolygon[]> {
  const data = await loadCompressedJsonResource(new URL('../../../content/data/maps/world-land.geojson.gz.bin', import.meta.url));
  if (!data || typeof data !== 'object' || !('features' in data) || !Array.isArray(data.features)) {
    throw new Error('世界海岸数据不是有效的 GeoJSON FeatureCollection。');
  }
  const polygons: LandPolygon[] = [];
  for (const feature of data.features) {
    if (!feature || typeof feature !== 'object' || !('geometry' in feature)) throw new Error('世界地图缺少 geometry。');
    const geometry: unknown = feature.geometry;
    if (!geometry || typeof geometry !== 'object' || !('type' in geometry) || !('coordinates' in geometry)) {
      throw new Error('世界地图包含无效 geometry。');
    }
    if (geometry.type === 'Polygon' && isPolygon(geometry.coordinates)) polygons.push(geometry.coordinates);
    else if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates) && geometry.coordinates.every(isPolygon)) {
      polygons.push(...geometry.coordinates);
    } else throw new Error('世界地图包含无效陆地多边形。');
  }
  if (!polygons.length) throw new Error('世界海岸数据为空。');
  return polygons;
}
