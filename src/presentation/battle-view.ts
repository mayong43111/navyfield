import * as THREE from 'three';
import { createShip } from '../ships.ts';
import { renderShipPreview, turretMuzzle } from '../yamato.ts';
import type { ShipInstance } from '../yamato.ts';
import type { BattleConfig, BattleEvent, DeepReadonly, NavigationState, Observation, Point, ShipModelId } from '../domain/battle.ts';
import type { VesselVisualContract } from '../domain/port.ts';
import type { Screen } from '../game/lobby-state.ts';
import { freeze } from '../simulation/config.ts';
import { ballisticRange } from '../simulation/navigation.ts';
import { sinkingPose } from '../simulation/combat.ts';
import { createBattleStage } from './stage.ts';
import { createEnvironment } from './environment.ts';
import { createBattleEffects } from './battle-effects.ts';
import { updateVisualWeaponGroups } from './ships/weapon-rig.ts';
import { BATTLE_MIN_ZOOM, BATTLE_ZOOM, positionBattleCamera, seaViewSize, edgePan } from './camera.ts';

export interface Projection { x: number; y: number; visible: boolean }
export interface ViewFrame {
  navigation: Readonly<NavigationState>; aim: Readonly<Point>; corners: Point[];
  ship: Projection; enemy: Projection; aimLabel: Projection; departure: Projection; pins: Projection[];
  browsing: boolean;
}
export function createBattleView(canvas: HTMLCanvasElement, models: Parameters<typeof createShip>[0],
  createVessel: (typeId: string) => ShipInstance = typeId => createShip(models, typeId)) {
  const { renderer, scene, camera, controls, halfHeight, battleCameraOffset, battleCameraDirection,
    sunlight, ocean, oceanMaterial } = createBattleStage(canvas);
  const environment = createEnvironment(scene, oceanMaterial);
  const vessels = new Map<string, { typeId: string; instance: ShipInstance }>(), previews = new Map<string, string>();
  const contracts = new Map<string, DeepReadonly<VesselVisualContract>>();
  let player: ShipInstance | null = null, enemy: ShipInstance | null = null;
  let mode: Screen = 'warzone', elapsed = 0, wakeTimer = 0, smokeTimer = 0, following = true;
  let navigation: Readonly<NavigationState> = { x: 0, z: 0, heading: Math.PI / 2, speed: 0, throttle: 0 };
  let config: DeepReadonly<BattleConfig> | null = null;
  const lastSinking = { player: 0, enemy: 0 };
  const aircraftMarkers = new Map<string, THREE.Mesh>();
  const aircraftGeometry = new THREE.ConeGeometry(9, 24, 3).rotateX(Math.PI / 2);
  const aircraftMaterials = { player: new THREE.MeshBasicMaterial({ color: '#74e0c4' }), enemy: new THREE.MeshBasicMaterial({ color: '#ff946f' }) };
  const raycaster = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const corners = [new THREE.Vector2(-1, -1), new THREE.Vector2(1, -1), new THREE.Vector2(1, 1), new THREE.Vector2(-1, 1)];
  const marker = (radius: number, width: number, segments: number, color: string, depthTest = true) => {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, width, 6, segments),
      new THREE.MeshBasicMaterial({ color, depthTest, transparent: true, opacity: 0.9 }));
    mesh.rotation.x = -Math.PI / 2; mesh.visible = false; scene.add(mesh); return mesh;
  };
  const aimMarker = marker(7, 0.5, 3, '#f5d146'), routeMarker = marker(10, 1, 24, '#83dfcf', false);
  const mountMarker = marker(13, 0.5, 48, '#58d6cb', false);
  const routeLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineBasicMaterial({ color: '#83dfcf', transparent: true, opacity: 0.7, depthTest: false }));
  routeLine.visible = false; scene.add(routeLine);
  const aimLines: THREE.Line<THREE.BufferGeometry, THREE.LineDashedMaterial>[] = [];
  const effects = createBattleEffects(scene, environment.cloudTexture, () => mode === 'battle', side => {
    const instance = side === 'player' ? player : enemy;
    if (!instance) throw new Error('舰艇表现尚未建立'); return instance;
  });
  function instance(): ShipInstance { if (!player) throw new Error('本舰表现尚未建立'); return player; }
  function selectVessel(id: string, typeId: string): void {
    const cached = vessels.get(id);
    if (cached?.typeId === typeId && player === cached.instance) return;
    for (const entry of vessels.values()) entry.instance.ship.visible = false;
    if (cached && cached.typeId !== typeId) { environment.remove(cached.instance.ship); vessels.delete(id); }
    let entry = vessels.get(id);
    if (!entry) {
      entry = { typeId, instance: createVessel(typeId) }; vessels.set(id, entry); environment.add(entry.instance);
    }
    player = entry.instance; player.ship.visible = mode === 'yard' || mode === 'battle';
    environment.appearance(mode === 'battle' || mode === 'prepare');
    for (const line of aimLines) { scene.remove(line); line.geometry.dispose(); line.material.dispose(); }
    aimLines.length = 0;
    for (const _turret of player.turrets) {
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
        new THREE.LineDashedMaterial({ color: '#91d47c', transparent: true, opacity: 0.85,
          dashSize: 4, gapSize: 5, depthTest: false, depthWrite: false }));
      line.renderOrder = 2; scene.add(line); aimLines.push(line);
    }
  }
  function contract(typeId: string): DeepReadonly<VesselVisualContract> {
    let value = contracts.get(typeId);
    if (!value) {
      const model = createVessel(typeId);
      value = freeze({ modelKey: model.modelKey as ShipModelId, modelName: model.modelName, dimensions: { ...model.dimensions },
        mounts: model.turrets.map(t => ({ rear: t.rear, barrelCount: t.barrels.length })) });
      contracts.set(typeId, value);
    }
    return value;
  }
  function preview(typeId: string): string {
    const model = createVessel(typeId), cached = previews.get(typeId);
    if (cached) return cached;
    const value = renderShipPreview(renderer, model.ship).toDataURL('image/png'); previews.set(typeId, value); return value;
  }
  function clear(): void {
    effects.clear(); wakeTimer = smokeTimer = 0; lastSinking.player = lastSinking.enemy = 0;
    for (const mesh of aircraftMarkers.values()) scene.remove(mesh);
    aircraftMarkers.clear();
    routeLine.visible = routeMarker.visible = false;
    for (const model of [player, enemy]) for (const turret of model?.turrets ?? []) {
      turret.group.rotation.set(0, turret.rear ? Math.PI : 0, 0); turret.elevation.rotation.set(0, 0, 0); turret.recoil = 0;
      for (const barrel of turret.barrels) barrel.position.z = 0;
    }
  }
  function positionCamera(offset: THREE.Vector3, zoom: number): void {
    const damping = controls.enableDamping; controls.enableDamping = false; controls.update();
    camera.position.copy(offset).add(new THREE.Vector3(navigation.x, 0, navigation.z));
    controls.target.set(navigation.x, 8, navigation.z); camera.zoom = zoom; camera.updateProjectionMatrix();
    controls.update(); controls.enableDamping = damping;
  }
  function resizeOcean(): void {
    const size = seaViewSize(camera, BATTLE_MIN_ZOOM);
    const width = config ? Math.max(24000, config.layout.width + size.width + 4000) : 24000;
    const height = config ? Math.max(24000, config.layout.height + size.height + 4000) : 24000;
    if (ocean.geometry.parameters.width === width && ocean.geometry.parameters.height === height) return;
    ocean.geometry.dispose(); ocean.geometry = new THREE.PlaneGeometry(width, height, 32, 32).rotateX(-Math.PI / 2);
  }
  function show(screen: Screen, battleConfig: DeepReadonly<BattleConfig> | null, observation: Observation | null): void {
    if (screen === 'battle' && battleConfig && battleConfig !== config) {
      if (enemy) environment.remove(enemy.ship);
      enemy = createVessel(battleConfig.ships.find(ship => ship.side === 'enemy')!.definitionId);
      environment.add(enemy);
    }
    clear(); mode = screen; config = battleConfig; following = true;
    navigation = observation?.ships.find(s => s.side === 'player')?.navigation ?? { ...navigation, speed: 0, throttle: 0 };
    environment.dock.visible = mode === 'yard'; environment.clouds.visible = mode === 'battle';
    ocean.visible = mode === 'battle' || mode === 'prepare'; instance().ship.visible = mode === 'battle' || mode === 'yard';
    if (enemy) enemy.ship.visible = mode === 'battle';
    environment.appearance(mode === 'battle' || mode === 'prepare'); aimMarker.visible = mode === 'battle';
    renderer.shadowMap.enabled = mode === 'yard'; renderer.toneMappingExposure = mode === 'yard' ? 1 : 0.85;
    controls.enableRotate = mode === 'yard'; controls.enabled = mode === 'yard' || mode === 'battle'; controls.enablePan = false;
    controls.minZoom = mode === 'yard' ? 1.8 : mode === 'battle' ? BATTLE_MIN_ZOOM : 0.55;
    controls.maxZoom = mode === 'yard' ? 6.5 : 3.5; camera.far = 15000;
    if (mode === 'yard') {
      const zoom = THREE.MathUtils.clamp((canvas.clientWidth - 210) / canvas.clientHeight * 3.8, 2, 5.4);
      positionCamera(new THREE.Vector3(430, 420, 400), zoom);
      const shift = new THREE.Vector3(-18, -15, 35); camera.position.add(shift); controls.target.add(shift); controls.update();
    } else positionCamera(battleCameraOffset, mode === 'prepare' ? 1.2 : BATTLE_ZOOM);
    if (mode === 'battle') positionBattleCamera(camera, controls.target, battleCameraDirection);
    resizeOcean();
  }
  function returnCamera(): void {
    if (mode === 'battle') {
      following = true; positionCamera(battleCameraOffset, camera.zoom); positionBattleCamera(camera, controls.target, battleCameraDirection);
    } else if (mode === 'yard') { following = !following; controls.enablePan = !following; }
  }
  function present(event: DeepReadonly<BattleEvent>, observation: Observation): void {
    for (const ship of observation.ships) {
      const model = ship.side === 'player' ? player : enemy;
      if (model) { model.ship.position.set(ship.navigation.x, 0, ship.navigation.z);
        model.ship.rotation.set(0, ship.navigation.heading, 0); model.ship.updateMatrixWorld(true); }
    }
    effects.present(event);
  }
  function project(position: THREE.Vector3): Projection {
    const p = position.project(camera);
    return { x: (p.x + 1) * canvas.clientWidth / 2, y: (1 - p.y) * canvas.clientHeight / 2,
      visible: Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 };
  }
  function aimPoint(x: number, y: number, height = 0): Point | null {
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
    const aimPlane = height === 0 ? plane : new THREE.Plane(new THREE.Vector3(0, 1, 0), -height);
    const point = raycaster.ray.intersectPlane(aimPlane, new THREE.Vector3());
    return point ? { x: point.x, y: point.y, z: point.z } : null;
  }
  function waterPoint(x: number, y: number): Point | null { return aimPoint(x, y); }
  function render(observation: Observation | null, selectedWeapon: number, dt: number,
    pointer: { x: number; y: number } | null): ViewFrame {
    const model = instance(), oldX = navigation.x, oldZ = navigation.z;
    navigation = observation?.ships.find(s => s.side === 'player')?.navigation ?? navigation;
    elapsed += dt; oceanMaterial.uniforms['time']!.value = elapsed;
    model.ship.position.set(navigation.x, mode === 'battle' ? Math.sin(elapsed * 0.75) * 0.3 : 0, navigation.z);
    model.ship.rotation.set(mode === 'battle' ? Math.sin(elapsed * 0.6) * 0.002 : 0,
      mode === 'battle' ? navigation.heading : mode === 'prepare' ? Math.PI / 2 : 0,
      mode === 'battle' ? Math.sin(elapsed * 0.8) * 0.004 : 0);
    environment.dock.position.set(navigation.x, 0, navigation.z);
    if (following) {
      camera.position.x += navigation.x - oldX; camera.position.z += navigation.z - oldZ;
      controls.target.x += navigation.x - oldX; controls.target.z += navigation.z - oldZ;
    }
    let browsing = false;
    if (mode === 'battle' && config) {
      positionBattleCamera(camera, controls.target, battleCameraDirection);
      if (pointer && dt > 0 && canvas.clientWidth && canvas.clientHeight) {
        const delta = edgePan(camera, pointer, { width: canvas.clientWidth, height: canvas.clientHeight }, dt);
        if (delta.lengthSq() > 0) {
          browsing = following; following = false;
          const x = controls.target.x, z = controls.target.z, boundX = config.layout.width / 2 + 1000, boundZ = config.layout.height / 2 + 1000;
          controls.target.x = THREE.MathUtils.clamp(x + delta.x, Math.min(-boundX, x), Math.max(boundX, x));
          controls.target.z = THREE.MathUtils.clamp(z + delta.z, Math.min(-boundZ, z), Math.max(boundZ, z));
          camera.position.x += controls.target.x - x; camera.position.z += controls.target.z - z;
        }
      }
    }
    controls.update(); environment.clouds.position.set(navigation.x, 0, navigation.z);
    sunlight.position.set(navigation.x - 250, 380, navigation.z + 150); sunlight.target.position.set(navigation.x, 0, navigation.z);
    for (const state of observation?.ships ?? []) {
      const ship = state.side === 'player' ? player : enemy; if (!ship) continue;
      if (state.side === 'enemy') {
        ship.ship.position.set(state.navigation.x, Math.sin(elapsed * 0.75) * 0.3, state.navigation.z);
        ship.ship.rotation.set(0, state.navigation.heading, 0);
      }
      for (const [index, turret] of ship.turrets.entries()) {
        const weapon = state.weapons[index];
        if (!weapon) continue;
        turret.group.rotation.y = weapon.yaw; turret.elevation.rotation.x = -weapon.elevation; turret.recoil = weapon.recoil;
        for (const barrel of turret.barrels) barrel.position.z = -weapon.recoil;
      }
      updateVisualWeaponGroups(ship.auxiliaryGroups ?? [], state.side, observation!);
      const combat = observation!.combat[state.side];
      if (combat.hp <= 0) {
        const before = lastSinking[state.side]; lastSinking[state.side] = combat.sinking;
        const pose = sinkingPose(combat.sinking);
        ship.ship.position.y = pose.depth; ship.ship.rotation.z = pose.roll; ship.ship.rotation.x = pose.pitch; ship.ship.visible = pose.visible;
        if (combat.sinking < 15 && Math.floor(before * 2) !== Math.floor(combat.sinking * 2)) {
          effects.particle(ship.ship.position.clone().setY(0.8), new THREE.Vector3(), '#a2c4c9', 26, 4, 14, 0, 'ring');
          for (const side of [-1, 1]) {
            const edge = ship.ship.localToWorld(new THREE.Vector3(side * 18, 0, Math.sin(combat.sinking) * 95)).setY(0.6);
            effects.particle(edge, new THREE.Vector3(side * 5, 8, 0), '#cde0df', 3, 2, 2, 12);
          }
        }
      }
    }
    model.ship.updateMatrixWorld(true);
    const target = observation?.aim ?? { x: 180, y: 0.5, z: -330 }, aim = new THREE.Vector3(target.x, target.y, target.z);
    aimMarker.position.copy(aim).setY(0.8);
    const route = observation?.ships.find(s => s.side === 'player')?.route?.target;
    routeLine.visible = routeMarker.visible = mode === 'battle' && !!route;
    if (route) {
      routeMarker.position.set(route.x, 0.9, route.z);
      const positions = routeLine.geometry.getAttribute('position');
      positions.setXYZ(0, navigation.x, 0.9, navigation.z); positions.setXYZ(1, route.x, 0.9, route.z);
      positions.needsUpdate = true; routeLine.geometry.computeBoundingSphere();
    }
    for (const [index, turret] of model.turrets.entries()) {
      const line = aimLines[index]!, profile = config?.ships.find(s => s.side === 'player')?.weapons[index];
      line.visible = mode === 'battle' && !!profile?.ballistics;
      if (!line.visible || !profile?.ballistics) continue;
      const muzzle = turretMuzzle(turret), direction = turret.muzzles[0]!.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
      const length = ballisticRange(0, profile.ballistics.maxAngle, profile.ballistics.speed), positions = line.geometry.getAttribute('position');
      positions.setXYZ(0, muzzle.x, 1, muzzle.z); positions.setXYZ(1, muzzle.x + direction.x * length, 1, muzzle.z + direction.z * length);
      positions.needsUpdate = true; line.geometry.computeBoundingSphere(); line.computeLineDistances();
    }
    mountMarker.visible = mode === 'yard' && model.turrets.length > 0;
    const turret = model.turrets[selectedWeapon];
    if (turret) mountMarker.position.copy(turret.group.getWorldPosition(new THREE.Vector3())).add(new THREE.Vector3(0, 9, 0));
    wakeTimer += dt; smokeTimer += dt;
    if (mode === 'battle' && smokeTimer > 0.28) {
      smokeTimer = 0;
      for (const [side, ship] of [['player', player], ['enemy', enemy]] as const) {
        if (ship && observation!.combat[side].hp > 0) effects.particle(ship.funnel.getWorldPosition(new THREE.Vector3()),
          new THREE.Vector3(-3, 2, -1), '#253036', 2.4, 6, 1.8);
      }
    }
    if (Math.abs(navigation.speed) > 0.5 && wakeTimer > 0.08) {
      wakeTimer = 0;
      const position = model.ship.localToWorld(new THREE.Vector3(0, 0, Math.sign(navigation.speed) * -model.dimensions.length * 0.48)).setY(0.7);
      const velocity = new THREE.Vector3(0, 0, -Math.sign(navigation.speed) * 1.2).applyAxisAngle(new THREE.Vector3(0, 1, 0), navigation.heading);
      effects.particle(position, velocity, '#b5d9d5', 2.5, 8, 0.9);
    }
    const currentAircraft = new Set(observation?.aircraft?.map(a => a.id) ?? []);
    for (const [id, mesh] of aircraftMarkers) if (!currentAircraft.has(id)) { scene.remove(mesh); aircraftMarkers.delete(id); }
    for (const aircraft of observation?.aircraft ?? []) {
      let mesh = aircraftMarkers.get(aircraft.id);
      if (!mesh) { mesh = new THREE.Mesh(aircraftGeometry, aircraftMaterials[aircraft.owner]); aircraftMarkers.set(aircraft.id, mesh); scene.add(mesh); }
      mesh.position.set(aircraft.position.x, aircraft.position.y, aircraft.position.z);
      mesh.rotation.y = Math.atan2(aircraft.velocity.x, aircraft.velocity.z);
      mesh.visible = mode === 'battle';
    }
    effects.update(dt, observation);
    const frame: ViewFrame = { navigation, aim: target, browsing,
      corners: corners.flatMap(p => { const hit = waterPoint(p.x, p.y); return hit ? [hit] : []; }),
      ship: project(model.ship.position.clone().add(new THREE.Vector3(0, 50, 0))),
      enemy: project((enemy?.ship.position.clone() ?? new THREE.Vector3()).add(new THREE.Vector3(0, 50, 0))),
      aimLabel: project(aim.clone()), departure: project(model.ship.localToWorld(new THREE.Vector3(0, 9, model.dimensions.length / 2 + 1))),
      pins: model.turrets.map(t => project(t.group.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 13, 0)))) };
    if (mode === 'battle' || mode === 'yard' || mode === 'prepare') renderer.render(scene, camera);
    return frame;
  }
  const resize = new ResizeObserver(() => {
    if (!canvas.clientWidth || !canvas.clientHeight) return;
    camera.left = -halfHeight * canvas.clientWidth / canvas.clientHeight; camera.right = -camera.left; camera.updateProjectionMatrix();
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false); resizeOcean();
  });
  resize.observe(canvas);
  function dispose(): void { resize.disconnect(); clear(); aircraftGeometry.dispose();
    for (const material of Object.values(aircraftMaterials)) material.dispose();
    controls.dispose(); renderer.dispose(); }
  function resetPortView(): void {
    navigation = { x: 0, z: 0, heading: Math.PI / 2, speed: 0, throttle: 0 }; show('yard', null, null);
  }
  return { selectVessel, contract, preview, show, present, render, returnCamera, waterPoint, aimPoint, resetPortView, dispose };
}
