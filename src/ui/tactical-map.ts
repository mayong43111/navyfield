import type { BattleLayout, DeepReadonly, Observation, Point, NavigationState } from '../domain/battle.ts';

export function tacticalMapScale(layout: DeepReadonly<BattleLayout> | null): number {
  return layout ? Math.max(layout.width / 200, layout.height / 130) : 80;
}

export function paintTacticalMap(context: CanvasRenderingContext2D, options: {
  battle: boolean; layout: DeepReadonly<BattleLayout> | null; observation: Observation | null;
  navigation: Readonly<NavigationState>; aim: Readonly<Point>; corners: readonly Readonly<Point>[];
}): void {
  const { battle, layout, observation, navigation, aim, corners } = options;
  const scale = battle ? tacticalMapScale(layout) : 12;
  const centerX = battle && layout ? 0 : navigation.x, centerZ = battle && layout ? 0 : navigation.z;
  const route = observation?.ships.find(s => s.side === 'player')?.route?.target;
  context.clearRect(0, 0, 220, 150);
  context.fillStyle = battle ? '#0a192bbb' : '#0b2430'; context.fillRect(0, 0, 220, 150);
  context.strokeStyle = battle ? '#49637522' : '#55797e44';
  for (let x = 0; x <= 220; x += battle ? 44 : 22) {
    context.beginPath(); context.moveTo(x, 0); context.lineTo(x, 150); context.stroke();
  }
  for (let y = 0; y <= 150; y += battle ? 30 : 15) {
    context.beginPath(); context.moveTo(0, y); context.lineTo(220, y); context.stroke();
  }
  if (battle && layout) {
    for (const region of layout.regions) {
      const x = 110 + (region.minX - centerX) / scale, y = 75 + (region.minZ - centerZ) / scale;
      const width = (region.maxX - region.minX) / scale, height = (region.maxZ - region.minZ) / scale;
      context.fillStyle = region.team === 'alpha' ? '#5ba58c55' : '#d1767655';
      context.fillRect(x, y, width, height);
      context.strokeStyle = region.team === 'alpha' ? '#84c3ad' : '#d99090';
      context.strokeRect(x, y, width, height);
      context.font = '12px "Microsoft YaHei"'; context.fillStyle = '#dfebdc';
      context.textAlign = region.team === 'alpha' ? 'left' : 'right';
      context.fillText(`${region.team === 'alpha' ? '甲' : '乙'}${region.zone + 1}`,
        region.team === 'alpha' ? x + width + 4 : x - 4, y + height / 2 + 4);
    }
    context.textAlign = 'left';
    if (route) {
      context.strokeStyle = '#83dfcf'; context.beginPath();
      context.moveTo(110 + navigation.x / scale, 75 + navigation.z / scale);
      context.lineTo(110 + route.x / scale, 75 + route.z / scale); context.stroke();
    }
  }
  context.strokeStyle = battle ? '#76aa72' : '#dbcd8a';
  if (battle) {
    context.beginPath();
    for (const [index, point] of corners.entries()) {
      const x = 110 + (point.x - centerX) / scale, y = 75 + (point.z - centerZ) / scale;
      if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
    }
    context.closePath(); context.stroke();
  } else context.strokeRect(101, 66, 18, 18);
  const point = (x: number, z: number, color: string): void => {
    const px = 110 + (x - centerX) / scale, py = 75 + (z - centerZ) / scale;
    if (battle) {
      const glow = context.createRadialGradient(px, py, 0, px, py, 5);
      glow.addColorStop(0, color); glow.addColorStop(1, color + '00');
      context.fillStyle = glow; context.fillRect(px - 5, py - 5, 10, 10);
    }
    context.fillStyle = color; context.fillRect(px - 1, py - 1, 2, 2);
  };
  point(navigation.x, navigation.z, '#84f2da');
  if (battle) {
    const enemy = observation?.ships.find(s => s.side === 'enemy')?.navigation;
    if (enemy && observation!.combat.enemy.hp > 0) point(enemy.x, enemy.z, '#ff766b');
    point(aim.x, aim.z, '#f2d34d');
    if (route) point(route.x, route.z, '#83dfcf');
    context.strokeStyle = '#162b3780';
    for (let y = 0; y < 150; y += 3) {
      context.beginPath(); context.moveTo(0, y); context.lineTo(220, y); context.stroke();
    }
  }
}
