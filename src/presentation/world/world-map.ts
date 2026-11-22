import { context2d } from '../../ui/legacy-helpers.ts';
import { battles } from '../../battles.ts';
import type { GeoPoint, LandPolygon } from '../../adapters/content/world-land.ts';

// Pacific-centered equirectangular projection, shared by coastlines and battle markers.
export function worldPoint(longitude: number, latitude: number): GeoPoint {
  return [((longitude - 110 + 540) % 360) / 360, (90 - latitude) / 180];
}

export function unwrapRing(ring: readonly GeoPoint[]): GeoPoint[] {
  const result: GeoPoint[] = [];
  for (const [index, point] of ring.entries()) {
    let [x, y] = worldPoint(point[0], point[1]);
    const previous = result[result.length - 1];
    const sourcePrevious = ring[index - 1];
    if (previous && sourcePrevious && Math.abs(point[1]) === 90 && point[1] === sourcePrevious[1]) {
      // The polar closing edge spans 360 degrees; collapsing it draws a false coastline.
      x = previous[0] + (point[0] - sourcePrevious[0]) / 360;
    } else if (previous) x += Math.round(previous[0] - x);
    result.push([x, y]);
  }
  return result;
}

export function paintLobby(canvas: HTMLCanvasElement, polygons: readonly LandPolygon[]): void {
  const ratio = Math.min(devicePixelRatio, 1.25);
  canvas.width = Math.max(1, Math.round(canvas.clientWidth * ratio));
  canvas.height = Math.max(1, Math.round(canvas.clientHeight * ratio));
  const ctx = context2d(canvas);
  ctx.scale(canvas.width / 1000, canvas.height / 500);
  const sea = ctx.createLinearGradient(0, 0, 0, 500);
  sea.addColorStop(0, '#355d6c');
  sea.addColorStop(1, '#132f43');
  ctx.fillStyle = sea;
  ctx.fillRect(0, 0, 1000, 500);
  ctx.strokeStyle = '#a5bec52b';
  ctx.lineWidth = .8;
  for (let longitude = -180; longitude < 180; longitude += 30) {
    const x = worldPoint(longitude, 0)[0] * 1000;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 500); ctx.stroke();
  }
  for (let latitude = -60; latitude <= 60; latitude += 30) {
    const y = worldPoint(0, latitude)[1] * 500;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1000, y); ctx.stroke();
  }
  for (const polygon of polygons) {
    const outer = polygon[0];
    if (!outer?.length) continue;
    const rings = polygon.map(unwrapRing);
    const anchor = rings[0]?.[0]?.[0];
    if (anchor === undefined) throw new Error('世界地图缺少外环。');
    for (const shift of [-1, 0, 1]) {
      const path = new Path2D();
      for (const ring of rings) {
        const first = ring[0];
        if (!first) continue;
        const align = Math.round(anchor - first[0]);
        ring.forEach(([x, y], index) => {
          const px = (x + align + shift) * 1000, py = y * 500;
          if (index === 0) path.moveTo(px, py);
          else path.lineTo(px, py);
        });
        path.closePath();
      }
      ctx.strokeStyle = '#83a6a184';
      ctx.lineWidth = 4.5;
      ctx.stroke(path);
      ctx.fillStyle = '#a89e79';
      ctx.fill(path, 'evenodd');
      ctx.strokeStyle = '#c5c2a0';
      ctx.lineWidth = .9;
      ctx.stroke(path);
    }
  }
  ctx.font = '24px "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#cedddf';
  for (const [text, longitude, latitude] of [
    ['太平洋', -150, -12], ['大西洋', -30, 12], ['印度洋', 75, -30]
  ] as const) {
    const [x, y] = worldPoint(longitude, latitude);
    ctx.fillText(text, x * 1000, y * 500);
  }
  for (const battle of battles) {
    const [x, y] = worldPoint(battle.longitude, battle.latitude);
    const [dx, dy] = battle.labelOffset ?? [0, 0];
    ctx.strokeStyle = '#e4c67f';
    ctx.beginPath(); ctx.moveTo(x * 1000, y * 500);
    ctx.lineTo(x * 1000 + dx * 1000 / canvas.clientWidth, y * 500 + dy * 500 / canvas.clientHeight);
    ctx.stroke();
    ctx.fillStyle = '#fff0ae';
    ctx.beginPath(); ctx.arc(x * 1000, y * 500, 2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.save();
  ctx.translate(938, 409);
  ctx.strokeStyle = '#e3d3a5'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.stroke();
  for (let axis = 0; axis < 4; axis++) {
    ctx.fillStyle = '#e3d3a5';
    ctx.beginPath(); ctx.moveTo(0,-29); ctx.lineTo(5,0); ctx.lineTo(0,0); ctx.fill();
    ctx.fillStyle = '#496371';
    ctx.beginPath(); ctx.moveTo(0,-29); ctx.lineTo(-5,0); ctx.lineTo(0,0); ctx.fill();
    ctx.rotate(Math.PI / 2);
  }
  ctx.restore();
}
