import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { renderShipPreview, turretMuzzle } from './yamato.ts';
import type { ShipInstance } from './yamato.ts';
import { createShip, loadShipModels } from './ships.ts';
import { createShipyard } from './shipyard.ts';
import { createLobby } from './lobby.ts';
import { loadWorldLand } from './lobby-art.ts';
import { renderBerths } from './berth-list.ts';
import { loadOriginalData, findOriginalShip, nationNames, shipClassNames, originalNumber, YAMATO_ID, MUSASHI_ID } from './original-data.ts';
import type { OriginalGun } from './original-data.ts';
import type { Screen, BattleDeployment } from './lobby-state.ts';
import { element, context2d, gunReadout, loadShipModelMatches, renderShipTypes } from './ui.ts';
import { advanceNavigation, advanceRoute, createRoute, wrapAngle, turretCanAim, lowArcElevation, ballisticRange, MAX_SPEED, GRAVITY, RELOAD_SECONDS } from './navigation.ts';
import type { NavigationState, NavigationRoute } from './navigation.ts';
import { createAmmunition, fireGun, includesWeapon } from './ammunition.ts';
import type { Locker, ShellType, FiringSide, GunState } from './ammunition.ts';
import { createCombat, shellPower, applyImpact, resolveBattle, hullIntersection, ballisticVelocity,
  dispersedTarget, enemyCourse, leadTarget, deploymentPoses, sinkingPose, gunBallistics, createBattleLayout, bulgeCapacity } from './combat.ts';
import type { CombatState, Side, ShellPower, GunBallistics, BattleLayout } from './combat.ts';
import { gaugeArtwork, magazineArtwork, selectorArtwork, mapFrameArtwork, enginePanelArtwork, tdaLampArtwork } from './instrument-art.ts';
import { BATTLE_MIN_ZOOM, BATTLE_ZOOM, edgePan, positionBattleCamera, seaViewSize } from './camera.ts';
import './style.css';
import './interface.css';

const lockerName = { A: '甲', B: '乙' };
const shellName = { HE: '高爆弹', AP: '穿甲弹' };

const canvas = element('scene', HTMLCanvasElement);
const status = element('status', HTMLParagraphElement);
const error = element('error', HTMLDivElement);
function reportError(message: string): void {
  console.error(message);
  error.hidden = false;
  error.textContent = message;
}
window.addEventListener('error', event => reportError(`运行错误：${event.message}`));
window.addEventListener('unhandledrejection', event => reportError(`异步错误：${String(event.reason)}`));
canvas.addEventListener('webglcontextlost', event => {
  event.preventDefault();
  reportError('WebGL 上下文已丢失，请刷新页面。');
});

async function start(): Promise<void> {
  status.textContent = '舰队整备中…';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  renderer.shadowMap.enabled = false;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#334c5c');
  scene.fog = new THREE.FogExp2('#334c5c', 0.000035);
  const halfHeight = 580;
  const aspect = canvas.clientWidth / canvas.clientHeight;
  const camera = new THREE.OrthographicCamera(-halfHeight * aspect, halfHeight * aspect, halfHeight, -halfHeight, 1, 15000);
  const battleCameraOffset = new THREE.Vector3(775, 900, 1040);
  const battleCameraDirection = battleCameraOffset.clone().sub(new THREE.Vector3(0, 8, 0));
  camera.position.copy(battleCameraOffset);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 8, 0);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minZoom = BATTLE_MIN_ZOOM;
  controls.maxZoom = 3.5;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  scene.add(new THREE.HemisphereLight('#cdd8db', '#23373c', 1.7));
  const sunlight = new THREE.DirectionalLight('#e5e3d2', 2.7);
  sunlight.position.set(-250, 380, 150);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(2048, 2048);
  Object.assign(sunlight.shadow.camera, { left: -220, right: 220, top: 220, bottom: -220, near: 1, far: 900 });
  sunlight.shadow.bias = -0.0004;
  scene.add(sunlight, sunlight.target);

  const oceanMaterial = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      classic: { value: 1 },
      deep: { value: new THREE.Color('#203c4d') },
      shallow: { value: new THREE.Color('#3b5866') }
    },
    vertexShader: `
      uniform float time;
      varying vec3 surface;
      void main() {
        vec3 p = position;
        p.y += sin(p.x * 0.028 + time * 0.7) * 0.48
             + sin(p.z * 0.043 - time * 0.9) * 0.3;
        surface = p;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform float time;
      uniform float classic;
      uniform vec3 deep;
      uniform vec3 shallow;
      varying vec3 surface;
      float grain(vec2 p) {
        return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453);
      }
      float smoothNoise(vec2 p) {
        vec2 cell = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(grain(cell), grain(cell + vec2(1.0,0.0)), f.x),
                   mix(grain(cell + vec2(0.0,1.0)), grain(cell + vec2(1.0,1.0)), f.x), f.y);
      }
      void main() {
        float dx = cos(surface.x * 0.028 + time * 0.7) * 0.01344
                 + cos(surface.x * 0.19 + surface.z * 0.11 + time) * 0.018;
        float dz = cos(surface.z * 0.043 - time * 0.9) * 0.0129
                 + cos(surface.x * 0.19 + surface.z * 0.11 + time) * 0.011;
        vec3 n = normalize(vec3(-dx, 1.0, -dz));
        vec3 viewDir = normalize(cameraPosition - surface);
        float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
        float wave = sin(surface.x * 0.17 + surface.z * 0.09 + time)
                   + sin(surface.x * 0.31 - surface.z * 0.24 - time * 0.8) * 0.4;
        float glint = pow(max(dot(reflect(normalize(vec3(0.4,-0.8,-0.2)), n), viewDir), 0.0), 80.0);
        vec3 color = mix(deep, shallow, 0.2 + fresnel * 0.75);
        color += wave * 0.009 + (grain(floor(surface.xz * 1.4)) - 0.5) * 0.045
               + glint * vec3(0.1,0.1,0.08);
        float swell = smoothNoise(surface.xz * 0.008 + vec2(time * 0.016, 0.0));
        float ripple = smoothNoise(surface.xz * 0.11 + vec2(0.0, time * 0.018));
        float chop = smoothNoise(vec2(surface.x*.24 + surface.z*.11, surface.z*.52) + time*.05);
        vec3 classicColor = mix(vec3(.039,.064,.087), vec3(.089,.124,.154),
                                swell*.34 + ripple*.41 + chop*.25);
        classicColor += (grain(floor(surface.xz * 1.4)) - 0.5) * .004;
        color = mix(color, classicColor, classic);
        float haze = smoothstep(1800.0, 8000.0, distance(cameraPosition, surface));
        gl_FragColor = vec4(mix(color, vec3(0.2,0.3,0.36), haze), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const oceanGeometry = new THREE.PlaneGeometry(24000, 24000, 32, 32);
  oceanGeometry.rotateX(-Math.PI / 2);
  const ocean = new THREE.Mesh(oceanGeometry, oceanMaterial);
  scene.add(ocean);
  const [models, land, originalData, shipModelMatches] = await Promise.all([
    loadShipModels(), loadWorldLand(), loadOriginalData(), loadShipModelMatches()
  ]);
  if (originalData.failureCount) console.warn(`官网资料有 ${originalData.failureCount} 项未取得，缺失数值不参与配置。`);
  const berths = (['大和', '武藏'] as const).map(name => ({
    name: String(name), typeId: name === '大和' ? YAMATO_ID : MUSASHI_ID,
    weapons: Array.from({ length: 3 }, (): string | null => 'nf-gun-3-341'),
    bulgeLevel: 1,
    ...createShip(models, name === '大和' ? YAMATO_ID : MUSASHI_ID), mount: 0,
    guns: Array.from({ length: 3 }, (): GunState => ({ ammunition: createAmmunition(), reload: 0 }))
  }));
  let activeBerth = berths[0]!;
  let { ship, turrets } = activeBerth;
  scene.add(ship);
  let ally = berths[1]!.ship;
  ally.position.set(-430, 0, -240);
  ally.rotation.y = Math.PI * 0.4;
  scene.add(ally);
  let enemyModel = createShip(models, activeBerth.typeId);
  let enemy = enemyModel.ship;
  enemy.visible = false;
  scene.add(enemy);
  const enemyNavigation: NavigationState = { x: 50, z: -390, heading: Math.PI / 2, speed: 0, throttle: 0 };
  const enemyGuns: GunState[] = Array.from({ length: 3 }, () => ({ ammunition: createAmmunition(), reload: 7 }));
  let combat: CombatState | null = null;
  let battleLayout: BattleLayout | null = null;
  let enemyWeapons: (ReturnType<typeof bankWeapon>)[] = [];
  let resultDelay = 0;
  const deckCanvas = document.createElement('canvas');
  deckCanvas.width = deckCanvas.height = 128;
  const deckContext = context2d(deckCanvas);
  deckContext.fillStyle = '#d7cfb8';
  deckContext.fillRect(0, 0, 128, 128);
  for (let x = 0; x < 128; x += 12) {
    deckContext.fillStyle = x % 24 === 0 ? '#c3b9a0' : '#ddd2b7';
    deckContext.fillRect(x, 0, 11, 128);
    deckContext.fillStyle = '#9c947d';
    deckContext.fillRect(x + 11, 0, 1, 128);
    deckContext.fillRect(x, (x * 7) % 120, 12, 1);
  }
  const deckTexture = new THREE.CanvasTexture(deckCanvas);
  deckTexture.colorSpace = THREE.SRGBColorSpace;
  deckTexture.wrapS = deckTexture.wrapT = THREE.RepeatWrapping;
  deckTexture.repeat.set(0.025, 0.01);
  const deckMaterials: THREE.MeshStandardMaterial[] = [];
  const steelMaterials: THREE.MeshStandardMaterial[] = [];
  const waterShadows = new Map<THREE.Object3D, THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>>();
  function addVesselAppearance(instance: ShipInstance): void {
    instance.ship.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = object.receiveShadow = true;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (!(material instanceof THREE.MeshStandardMaterial)) continue;
        if (material.name === 'teak-deck' && !deckMaterials.includes(material)) deckMaterials.push(material);
        if (material.name === 'hull-steel' && !steelMaterials.includes(material)) steelMaterials.push(material);
      }
    });
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 48),
      new THREE.MeshBasicMaterial({ color: '#0b1822', transparent: true, opacity: 0.25, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(instance.dimensions.beam / 2 + 3, instance.dimensions.length / 2, 1);
    shadow.position.set(2, 0.8, -2);
    instance.ship.add(shadow);
    waterShadows.set(instance.ship, shadow);
  }
  function removeVessel(vessel: THREE.Object3D): void {
    scene.remove(vessel);
    const shadow = waterShadows.get(vessel);
    if (shadow) {
      vessel.remove(shadow); shadow.geometry.dispose(); shadow.material.dispose();
      waterShadows.delete(vessel);
    }
  }
  for (const instance of [activeBerth, berths[1]!, enemyModel]) addVesselAppearance(instance);
  function battleAppearance(enabled: boolean): void {
    oceanMaterial.uniforms['classic']!.value = enabled ? 1 : 0;
    deckMaterials.forEach(material => {
      material.map = enabled ? deckTexture : null;
      material.color.set(enabled ? '#c9c2ad' : '#a38b61');
      material.needsUpdate = true;
    });
    steelMaterials.forEach(material => { material.color.set(enabled ? '#778681' : '#697b85'); });
    waterShadows.forEach(shadow => { shadow.visible = enabled; });
  }
  battleAppearance(true);
  const cloudCanvas = document.createElement('canvas');
  cloudCanvas.width = cloudCanvas.height = 128;
  const cloudContext = context2d(cloudCanvas);
  for (const [x, y, radius] of [[45, 50, 42], [76, 64, 46], [38, 83, 35], [81, 36, 30]]) {
    const gradient = cloudContext.createRadialGradient(x!, y!, 0, x!, y!, radius!);
    gradient.addColorStop(0, '#dae0dfb0');
    gradient.addColorStop(1, '#dae0df00');
    cloudContext.fillStyle = gradient;
    cloudContext.fillRect(0, 0, 128, 128);
  }
  const cloudTexture = new THREE.CanvasTexture(cloudCanvas);
  const clouds = new THREE.Group();
  for (const [x, z] of [[-670, 200], [620, -100], [-350, -610], [460, 450]]) {
    const cloud = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTexture, transparent: true, opacity: 0.35, depthWrite: false }));
    // Keep the entire soft sprite above the water depth plane; intersecting it cuts a hard horizontal seam.
    cloud.position.set(x!, 104, z!);
    cloud.scale.set(260, 160, 1);
    clouds.add(cloud);
  }
  scene.add(clouds);
  const yardSurface = document.createElement('canvas');
  yardSurface.width = yardSurface.height = 512;
  const yardContext = context2d(yardSurface);
  yardContext.fillStyle = '#b4b8b6';
  yardContext.fillRect(0, 0, 512, 512);
  for (let index = 0; index < 24; index++) {
    const x = index * 97 % 512;
    const y = index * 167 % 512;
    const radius = 20 + index * 13 % 60;
    const stain = yardContext.createRadialGradient(x, y, 0, x, y, radius);
    stain.addColorStop(0, '#38403938');
    stain.addColorStop(1, '#38403900');
    yardContext.fillStyle = stain;
    yardContext.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  for (let index = 0; index < 18000; index++) {
    const x = (index * 73) % 512;
    const y = (index * 127 + Math.floor(index / 512) * 29) % 512;
    yardContext.fillStyle = index % 2 ? '#d3d0bb20' : '#3d453c18';
    yardContext.fillRect(x, y, 1 + index % 3, 1);
  }
  yardContext.strokeStyle = '#525c5055';
  yardContext.lineWidth = 2;
  for (let offset = 0; offset < 512; offset += 128) {
    yardContext.beginPath();
    yardContext.moveTo(offset, 0);
    yardContext.lineTo(offset, 512);
    yardContext.moveTo(0, offset);
    yardContext.lineTo(512, offset);
    yardContext.stroke();
  }
  const yardTexture = new THREE.CanvasTexture(yardSurface);
  yardTexture.colorSpace = THREE.SRGBColorSpace;
  yardTexture.wrapS = yardTexture.wrapT = THREE.RepeatWrapping;
  const dock = createShipyard(yardTexture);
  dock.visible = false;
  scene.add(dock);
  const mountMarker = new THREE.Mesh(new THREE.TorusGeometry(13, 0.5, 6, 48),
    new THREE.MeshBasicMaterial({ color: '#58d6cb', depthTest: false }));
  mountMarker.rotation.x = -Math.PI / 2;
  mountMarker.visible = false;
  scene.add(mountMarker);
  let mode: Screen = 'battle';
  const app = element('app', HTMLElement);
  const mapCanvas = element('minimap', HTMLCanvasElement);
  const mapContext = context2d(mapCanvas);
  const shipTag = element('ship-tag', HTMLDivElement);
  const allyTag = element('ally-tag', HTMLDivElement);
  const resultPanel = element('battle-result', HTMLElement);
  const enemyHealth = element('enemy-health', HTMLElement);
  const kills = element('combat-kills', HTMLElement);
  const accuracy = element('combat-accuracy', HTMLElement);
  const damageReadout = element('combat-damage', HTMLElement);
  const healthText = app.querySelector<HTMLElement>('.health > span');
  const healthMeter = app.querySelector<HTMLElement>('.hull-track');
  const healthFill = healthMeter?.querySelector<HTMLElement>('i');
  if (!healthText || !healthMeter || !healthFill) throw new Error('Missing hull durability display');
  const protectionMeter = element('protection', HTMLDivElement);
  const protectionFill = protectionMeter.querySelector<HTMLElement>('i');
  const protectionText = protectionMeter.querySelector<HTMLElement>('small');
  if (!protectionFill || !protectionText) throw new Error('Missing bulge protection display');
  function updateProtection(current: number, maximum: number): void {
    protectionMeter.setAttribute('aria-valuemax', String(Math.max(1, maximum)));
    protectionMeter.setAttribute('aria-valuenow', String(current));
    protectionFill!.style.width = `${maximum > 0 ? current / maximum * 100 : 0}%`;
    protectionText!.textContent = maximum > 0
      ? `防雷装甲 ${current.toLocaleString('zh-CN')} / ${maximum.toLocaleString('zh-CN')}` : '防雷装甲：未配置';
  }
  function berthProtection(): number {
    const nation = findOriginalShip(originalData, activeBerth.typeId).nation;
    const capacity = bulgeCapacity(originalData, nation, activeBerth.bulgeLevel);
    if (capacity === null) throw new Error('该舰防雷装甲资料未取得');
    return capacity;
  }
  const aimLabel = element('aim-label', HTMLDivElement);
  const reloadLabel = element('reload', HTMLElement);
  const battleHeading = element('battle-heading', HTMLElement);
  const battleSpeed = element('battle-speed', HTMLElement);
  const enginePower = element('engine-power', HTMLElement);
  const enginePowerNeedle = element('engine-power-needle', HTMLElement);
  const tdaButton = element('tda', HTMLButtonElement);
  const powerLever = element('power-lever', HTMLElement);
  const powerDial = enginePowerNeedle.parentElement;
  const enginePanel = powerDial?.parentElement;
  const mapPanel = mapCanvas.parentElement;
  if (!powerDial || !enginePanel || !mapPanel) throw new Error('Missing navigation instrument panels');
  powerDial.insertAdjacentHTML('afterbegin', gaugeArtwork('power', 'engine-power'));
  enginePanel.insertAdjacentHTML('afterbegin', enginePanelArtwork());
  mapPanel.insertAdjacentHTML('beforeend', mapFrameArtwork());
  tdaButton.insertAdjacentHTML('beforeend', tdaLampArtwork());
  let tda = false;
  const headingNeedle = element('heading-needle', HTMLElement);
  const speedNeedle = element('speed-needle', HTMLElement);
  const knotsNeedle = element('knots-needle', HTMLElement);
  const reloadNeedles = document.querySelectorAll<HTMLElement>('.reload-needle');
  const gunStates = document.querySelectorAll<HTMLElement>('.gun-dial span');
  let selectedWeapon = 0;
  const firingSide: FiringSide = 'both';
  const shellA = element('shell-a', HTMLSelectElement);
  const shellB = element('shell-b', HTMLSelectElement);
  const gunModel = element('yard-gun-model', HTMLSelectElement);
  const gunStatistics = element('yard-gun-statistics', HTMLParagraphElement);
  function bankWeapon(index: number) {
    const id = activeBerth.weapons[index];
    if (id === undefined) throw new Error('主炮位不存在');
    if (id === null) return null;
    const weapon = originalData.guns.find(gun => gun.id === id);
    if (!weapon) throw new Error(`炮型资料不存在：${id}`);
    return weapon;
  }
  const lockerStation = element('locker-station', HTMLElement);
  const stationBanks = element('station-banks', HTMLDivElement);
  const yardEquipment = element('yard-equipment', HTMLTableSectionElement);
  const yardPins = element('yard-mount-pins', HTMLDivElement);
  const mountInfo = element('mount-info', HTMLParagraphElement);
  function buildBanks() {
    yardPins.replaceChildren(); yardEquipment.replaceChildren(); stationBanks.replaceChildren();
    element('yard-gun-count', HTMLElement).textContent = `${turrets.length} 座主炮`;
    return turrets.map((turret, index) => {
    const pin = document.createElement('button');
    pin.className = 'mount yard-mount-pin';
    pin.dataset['mount'] = String(index);
    pin.type = 'button';
    pin.textContent = `${index + 1}`;
    pin.setAttribute('aria-label', `舰上主炮 ${index + 1} 挂点`);
    yardPins.append(pin);
    const row = document.createElement('tr');
    row.innerHTML = `<td><button class="mount" data-mount="${index}" type="button" aria-label="装备表主炮 ${index + 1}"><b>${index + 1}号</b> ${turret.barrels.length === 2 ? '双联装' : turret.barrels.length === 3 ? '三联装' : `${turret.barrels.length}管`}主炮</button></td><td><span id="yard-gun-${index}-a"></span><span id="yard-gun-${index}-b"></span></td>`;
    yardEquipment.append(row);
    const mount = row.querySelector<HTMLButtonElement>('.mount');
    if (!mount) throw new Error(`Missing shipyard main gun entry: ${index}`);
    const container = document.createElement('div');
    container.className = 'weapon-bank';
    container.dataset['weapon'] = String(index);
    container.innerHTML = `
      <button class="dial station-dial engraved-gauge" type="button" aria-label="选择主炮 ${index + 1} 弹仓" aria-pressed="false">
        ${gaugeArtwork('reload', `reload-${index}`)}
        <span class="instrument-state" id="gun-${index}-state">就绪</span>
        <i id="gun-${index}-reload"></i>
      </button>
      <div class="magazine-readout engraved-magazine">
        ${magazineArtwork(`magazine-${index}`)}
        <span class="station-number">R${index + 1}</span>
        <button class="magazine-toggle" type="button" aria-label="主炮 ${index + 1} 切换 甲乙弹仓">
          ${selectorArtwork()}<span id="gun-${index}-locker">甲</span>
        </button>
        <div><button class="locker-row" data-locker="A" type="button" aria-label="主炮 ${index + 1} 选择 A 弹仓" aria-pressed="true">A <b id="gun-${index}-a">0060</b></button>
        <button class="locker-row" data-locker="B" type="button" aria-label="主炮 ${index + 1} 选择 B 弹仓" aria-pressed="false">B <b id="gun-${index}-b">0060</b></button></div>
      </div>`;
    stationBanks.append(container);
    const dial = container.querySelector<HTMLButtonElement>('.station-dial');
    const toggle = container.querySelector<HTMLButtonElement>('.magazine-toggle');
    if (!dial || !toggle) throw new Error(`Missing weapon controls: ${index}`);
    const control = activeBerth.guns[index]!;
    const bank = {
      index, turret, control, dial, toggle, pin, mount, row, container,
      yardCounts: { A: element(`yard-gun-${index}-a`, HTMLElement), B: element(`yard-gun-${index}-b`, HTMLElement) },
      toggleLabel: element(`gun-${index}-locker`, HTMLElement),
      state: element(`gun-${index}-state`, HTMLElement),
      needle: element(`gun-${index}-reload`, HTMLElement),
      counts: { A: element(`gun-${index}-a`, HTMLElement), B: element(`gun-${index}-b`, HTMLElement) },
      lockers: container.querySelectorAll<HTMLButtonElement>('[data-locker]')
    };
    for (const button of [pin, mount, dial]) button.addEventListener('click', () => {
      selectedWeapon = index; updateAmmunition();
    });
    toggle.addEventListener('click', () => {
      selectedWeapon = index;
      const station = control.ammunition;
      station.selected = station.selected === 'A' ? 'B' : 'A';
      updateAmmunition();
      firingMessage = `${index + 1}号炮 · ${lockerName[station.selected]}仓 · ${shellName[station.lockers[station.selected].shellType]}`;
    });
    bank.lockers.forEach(button => {
      const locker = button.dataset['locker'];
      if (locker !== 'A' && locker !== 'B') throw new Error('Invalid shot locker control');
      button.addEventListener('click', () => {
        selectedWeapon = index; control.ammunition.selected = locker; updateAmmunition();
      });
    });
    return bank;
    });
  }
  let banks = buildBanks();
  const gunConsole = element('battle-gun-console', HTMLDivElement);
  const angleGauges = [
    { rear: false, needle: element('r-front-elevation', HTMLElement), label: element('r-front-angle', HTMLElement) },
    { rear: true, needle: element('r-rear-elevation', HTMLElement), label: element('r-rear-angle', HTMLElement) }
  ];
  for (const [index, gauge] of angleGauges.entries()) {
    const face = gauge.needle.parentElement;
    if (!face) throw new Error('Missing main gun angle gauge');
    face.classList.add('engraved-gauge');
    face.insertAdjacentHTML('afterbegin', gaugeArtwork('angle', `angle-${index}`));
    face.insertAdjacentHTML('beforeend', `<span class="angle-caption">R · ${gauge.rear ? '后' : '前'}</span>`);
    face.setAttribute('role', 'meter');
    face.setAttribute('aria-label', `R 组${gauge.rear ? '后' : '前'}炮仰角（演示值）`);
    face.setAttribute('aria-valuemin', '0');
    face.setAttribute('aria-valuemax', '90');
  }
  function updateAmmunition(): void {
    const vessel = findOriginalShip(originalData, activeBerth.typeId);
    gunModel.replaceChildren();
    const empty = document.createElement('option');
    empty.value = ''; empty.textContent = '未装备'; gunModel.append(empty);
    const selected = banks[selectedWeapon];
    gunModel.disabled = shellA.disabled = shellB.disabled = !selected;
    for (const gun of originalData.guns.filter(gun => selected && gun.mountGroup === String(selected.turret.barrels.length).padStart(2, '0') &&
      (gun.nation === vessel.nation || gun.nation === 0))) {
      const option = document.createElement('option');
      option.value = gun.id; option.textContent = gun.raw['model']!;
      const space = originalNumber(gun.raw['space']);
      option.disabled = space === null || space > (vessel.rMounts[selectedWeapon] ?? 0);
      gunModel.append(option);
    }
    const weapon = selected ? bankWeapon(selectedWeapon) : null;
    gunModel.value = weapon?.id ?? '';
    gunStatistics.textContent = weapon
      ? `基础装填 ${weapon.reloadSeconds} 秒 · 转速表值 ${weapon.raw['rotationSpeed']} · 炮口速度表值 ${weapon.raw['muzzleSpeed']} · 最大仰角 ${weapon.raw['maxAngle']}°`
      : '未装备主炮';
    const ballistics = weapon ? gunBallistics(weapon) : null;
    if (weapon) gunStatistics.textContent += ballistics
      ? ` · 水平射程 ${Math.round(ballisticRange(0, ballistics.maxAngle, ballistics.speed))} 游戏单位`
      : ' · 弹道资料缺失';
    if (weapon) {
      const power = shellPower(originalData, weapon);
      gunStatistics.textContent += ` · 高爆伤害 ${power?.he.toLocaleString('zh-CN') ?? '未取得'} · 穿甲加成 ${power?.apBonus ?? '未取得'}`;
    }
    for (const bank of banks) {
      const station = bank.control.ammunition;
      const installed = bankWeapon(bank.index);
      bank.container.hidden = installed === null;
      bank.mount.title = installed?.raw['model'] ?? '未装备';
      bank.dial.title = installed ? `R${bank.index + 1} · ${installed.raw['model']} · 独立装填` : '未装备';
      bank.dial.classList.toggle('active', bank.index === selectedWeapon);
      bank.dial.setAttribute('aria-pressed', String(bank.index === selectedWeapon));
      bank.row.classList.toggle('active', bank.index === selectedWeapon);
      for (const button of [bank.pin, bank.mount]) {
        button.classList.toggle('active', bank.index === selectedWeapon);
        button.setAttribute('aria-pressed', String(bank.index === selectedWeapon));
      }
      bank.toggleLabel.textContent = lockerName[station.selected];
      bank.toggle.dataset['locker'] = station.selected;
      for (const locker of ['A', 'B'] as const) {
        bank.counts[locker].textContent = String(station.lockers[locker].remaining).padStart(4, '0');
        const button = bank.counts[locker].parentElement;
        if (!button) throw new Error('Missing magazine readout');
        button.title = `${locker} 仓 · ${shellName[station.lockers[locker].shellType]} · ${station.lockers[locker].remaining} 发`;
        button.setAttribute('aria-label', `主炮 ${bank.index + 1} 选择 ${button.title}`);
        bank.yardCounts[locker].textContent = `${lockerName[locker]} · ${shellName[station.lockers[locker].shellType]} ${station.lockers[locker].remaining}`;
      }
      bank.lockers.forEach(button => {
        const active = button.dataset['locker'] === station.selected;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      });
    }
    const installedCount = banks.filter(bank => bankWeapon(bank.index) !== null).length;
    gunConsole.hidden = installedCount === 0;
    stationBanks.style.gridTemplateColumns = `repeat(${Math.max(1, installedCount)}, minmax(0, 1fr))`;
    app.style.setProperty('--battle-gun-width', `${78 + installedCount * 96}px`);
    for (const gauge of angleGauges) {
      const face = gauge.needle.parentElement;
      if (!face) throw new Error('Missing main gun angle gauge');
      face.hidden = !banks.some(bank => bank.turret.rear === gauge.rear && bankWeapon(bank.index) !== null);
    }
    if (!selected) {
      lockerStation.textContent = '无可用主炮';
      mountInfo.textContent = activeBerth.modelKey === 'yorktown' ? '航母外观已接入 · 舰载机战斗尚未实现' : '该模型没有主炮';
      return;
    }
    const station = selected.control.ammunition;
    lockerStation.textContent = `主炮 ${selectedWeapon + 1} 弹仓`;
    shellA.value = station.lockers.A.shellType;
    shellB.value = station.lockers.B.shellType;
    mountInfo.textContent = `${selectedWeapon + 1}号 · ${selected.turret.rear ? '后部主炮' : selectedWeapon === 1 ? '前部背负式主炮' : '前部主炮'}`;
  }
  const navigation: NavigationState = { x: 0, z: 0, heading: Math.PI / 2, speed: 0, throttle: 0 };
  const keys = new Set<string>();
  const pointer = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const waterPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const mapRaycaster = new THREE.Raycaster();
  const mapCorners = [new THREE.Vector2(-1, -1), new THREE.Vector2(1, -1),
    new THREE.Vector2(1, 1), new THREE.Vector2(-1, 1)];
  const aim = new THREE.Vector3(180, 0, -330);
  const hit = new THREE.Vector3();
  let routeTarget: THREE.Vector3 | null = null;
  let routePlan: NavigationRoute | null = null;
  let following = true;
  let battlePointer: { x: number; y: number } | null = null;
  let elapsed = 0;
  let wakeTimer = 0;
  let smokeTimer = 0;
  let firingMessage = '';
  const speedLabel = element('speed', HTMLElement);
  const headingLabel = element('heading', HTMLElement);
  const throttleLabel = element('throttle', HTMLElement);
  const aimMarker = new THREE.Mesh(new THREE.TorusGeometry(7, 0.5, 6, 3),
    new THREE.MeshBasicMaterial({ color: '#f5d146', transparent: true, opacity: 0.9 }));
  aimMarker.rotation.x = -Math.PI / 2;
  scene.add(aimMarker);
  const routeMarker = new THREE.Mesh(new THREE.TorusGeometry(10, 1, 6, 24),
    new THREE.MeshBasicMaterial({ color: '#83dfcf', depthTest: false }));
  routeMarker.rotation.x = -Math.PI / 2;
  routeMarker.visible = false;
  const routeLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineBasicMaterial({ color: '#83dfcf', transparent: true, opacity: 0.7, depthTest: false }));
  routeLine.visible = false;
  scene.add(routeMarker, routeLine);
  function createGunAimLine() {
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineDashedMaterial({
        color: '#91d47c', transparent: true, opacity: 0.85, dashSize: 4, gapSize: 5,
        depthTest: false, depthWrite: false
      }));
    line.renderOrder = 2;
    scene.add(line);
    return line;
  }
  const gunAimLines = turrets.map(createGunAimLine);
  function refreshMountedGuns(): void {
    selectedWeapon = Math.min(activeBerth.mount, Math.max(0, turrets.length - 1));
    banks = buildBanks();
    for (const line of gunAimLines) { scene.remove(line); line.geometry.dispose(); line.material.dispose(); }
    gunAimLines.splice(0, gunAimLines.length, ...turrets.map(createGunAimLine));
    mountMarker.visible = mode === 'yard' && turrets.length > 0;
  }

  interface Particle {
    mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | THREE.Sprite;
    velocity: THREE.Vector3;
    remaining: number;
    lifetime: number;
    growth: number;
    gravity: number;
    kind: 'smoke' | 'fire' | 'spark' | 'ring';
    opacity: number;
  }
  interface Shell {
    mesh: THREE.Mesh;
    velocity: THREE.Vector3;
    trail: THREE.Line;
    history: THREE.Vector3[];
    shellType: ShellType;
    owner: Side;
    power: ShellPower;
    elevation: number;
  }
  const particles: Particle[] = [];
  const shells: Shell[] = [];
  const lights: { light: THREE.PointLight; life: number }[] = [];
  const particleGeometry = new THREE.SphereGeometry(1, 8, 6);
  const ringGeometry = new THREE.RingGeometry(0.93, 1, 48);
  const fireCanvas = document.createElement('canvas');
  fireCanvas.width = fireCanvas.height = 64;
  const fireContext = context2d(fireCanvas);
  const fireGradient = fireContext.createRadialGradient(32, 32, 0, 32, 32, 32);
  fireGradient.addColorStop(0, '#ffffff');
  fireGradient.addColorStop(0.18, '#fff6b8');
  fireGradient.addColorStop(0.45, '#ff9a32dd');
  fireGradient.addColorStop(1, '#ff3e0000');
  fireContext.fillStyle = fireGradient;
  fireContext.fillRect(0, 0, 64, 64);
  const fireTexture = new THREE.CanvasTexture(fireCanvas);
  const fires: { vessel: THREE.Object3D; local: THREE.Vector3; remaining: number; timer: number }[] = [];
  const shellGeometry = new THREE.SphereGeometry(0.65, 8, 6);
  const shellColors: Record<ShellType, string> = { HE: '#ffcd71', AP: '#b4def1' };
  const shellMaterials: Record<ShellType, THREE.MeshBasicMaterial> = {
    HE: new THREE.MeshBasicMaterial({ color: shellColors.HE }),
    AP: new THREE.MeshBasicMaterial({ color: shellColors.AP })
  };
  function particle(position: THREE.Vector3, velocity: THREE.Vector3, color: string,
    radius: number, life: number, growth: number, gravity = 0, kind: Particle['kind'] = 'smoke'): void {
    if (particles.length >= 500) return;
    const opacity = kind === 'smoke' ? 0.65 : kind === 'ring' ? 0.45 : 1;
    const mesh = kind === 'ring' || kind === 'spark' || mode !== 'battle'
      ? new THREE.Mesh(kind === 'ring' ? ringGeometry : particleGeometry,
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false,
          side: kind === 'ring' ? THREE.DoubleSide : THREE.FrontSide,
          blending: kind === 'spark' ? THREE.AdditiveBlending : THREE.NormalBlending }))
      : new THREE.Sprite(new THREE.SpriteMaterial({ map: kind === 'fire' ? fireTexture : cloudTexture,
        color, transparent: true, opacity, depthWrite: false,
        blending: kind === 'fire' ? THREE.AdditiveBlending : THREE.NormalBlending }));
    mesh.position.copy(position);
    if (mesh instanceof THREE.Sprite) mesh.scale.set(radius * 2, radius * (gravity > 0 ? 5 : 2), 1);
    else if (kind === 'spark') {
      mesh.scale.set(radius * 0.3, radius * 2, radius * 0.3);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), velocity.clone().normalize());
    }
    else mesh.scale.setScalar(radius);
    if (kind === 'ring') mesh.rotation.x = -Math.PI / 2;
    scene.add(mesh);
    particles.push({ mesh, velocity, remaining: life, lifetime: life, growth, gravity, kind, opacity });
  }
  function splash(position: THREE.Vector3, shellType: ShellType): void {
    const sprayCount = shellType === 'HE' ? 22 : 12;
    const spraySpeed = shellType === 'HE' ? 10 : 5;
    for (let i = 0; i < sprayCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const magnitude = 3 + Math.random() * spraySpeed;
      particle(position, new THREE.Vector3(Math.sin(angle) * magnitude, 12 + Math.random() * 22,
        Math.cos(angle) * magnitude), '#d2e9e8', 0.8 + Math.random() * 1.4, 2, 0.8, 24);
    }
    const ringCount = shellType === 'HE' ? 12 : 6;
    for (let i = 0; i < ringCount; i++) {
      const angle = i * Math.PI * 2 / ringCount;
      particle(position.clone().setY(0.6), new THREE.Vector3(Math.sin(angle) * 8, 0, Math.cos(angle) * 8),
        '#c8e0dd', 2, 3, 2);
    }
  }
  function impactEffect(position: THREE.Vector3, type: ShellType, scale = 1): void {
    particle(position, new THREE.Vector3(0, 2, 0), '#fff1b8', 10 * scale, 0.35, 14, 0, 'fire');
    const count = type === 'HE' ? 22 : 14;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (12 + Math.random() * 26) * scale;
      particle(position, new THREE.Vector3(Math.cos(angle) * speed, 8 + Math.random() * 28,
        Math.sin(angle) * speed), i % 3 ? '#ffbf63' : '#fff5c5',
        1.8 + Math.random() * 1.5, 0.65 + Math.random() * 0.5, 0, 28, 'spark');
    }
    particle(position, new THREE.Vector3(-2, 7, 0), '#292c2a', 8 * scale, 5, 5);
    particle(position, new THREE.Vector3(3, 4, 1), '#56534b', 6 * scale, 3, 6);
  }
  function ignite(vessel: THREE.Object3D, position: THREE.Vector3, seconds: number): void {
    if (fires.length >= 8) fires.shift();
    const local = vessel.worldToLocal(position.clone());
    local.y = Math.max(local.y, 18);
    fires.push({ vessel, local, remaining: seconds, timer: 0 });
  }
  function sinkingBurst(vessel: THREE.Object3D): void {
    vessel.updateMatrixWorld(true);
    const dimensions = vessel === enemy ? enemyModel.dimensions : activeBerth.dimensions;
    for (const z of [-dimensions.length / 4, 0, dimensions.length / 4]) {
      const position = vessel.localToWorld(new THREE.Vector3(0, dimensions.height * 0.75, z));
      impactEffect(position, 'HE', z === 0 ? 2 : 1.2);
      ignite(vessel, position, 14);
      splash(position.clone().setY(0.6), 'HE');
      particle(position.clone().setY(0.9), new THREE.Vector3(), '#b7d5d5', 20, 7, 20, 0, 'ring');
    }
  }
  function launch(muzzle: THREE.Vector3, target: THREE.Vector3, owner: Side, power: ShellPower,
    shellType: ShellType, ballistics: GunBallistics): void {
    const range = ballisticRange(muzzle.y - target.y, ballistics.maxAngle, ballistics.speed);
    const velocity = ballisticVelocity(muzzle,
      dispersedTarget(muzzle, target, Math.random, range * (1 - 1e-9)), ballistics.speed);
    if (!velocity) throw new Error('炮弹目标超出弹道范围');
    const mesh = new THREE.Mesh(shellGeometry, shellMaterials[shellType]);
    mesh.position.copy(muzzle);
    const trail = new THREE.Line(new THREE.BufferGeometry().setFromPoints([muzzle, muzzle]),
      new THREE.LineBasicMaterial({ color: shellColors[shellType], transparent: true, opacity: 0.6 }));
    scene.add(mesh, trail);
    shells.push({ mesh, trail, velocity: new THREE.Vector3(velocity.x, velocity.y, velocity.z),
      history: [muzzle.clone()], shellType, owner, power,
      elevation: Math.atan2(velocity.y, Math.hypot(velocity.x, velocity.z)) });
    if (!combat) throw new Error('战斗状态尚未建立');
    combat[owner].shots++;
    particle(muzzle, new THREE.Vector3(), '#ffce65', 3.5, 0.14, 10);
    for (let i = 0; i < 5; i++) {
      particle(muzzle, new THREE.Vector3(Math.random() * 4 - 2, 4, Math.random() * 4 - 2),
        '#828b87', 2, 2.5, 3);
    }
  }
  function fire(): void {
    if (mode !== 'battle') {
      firingMessage = mode === 'yard' ? '舰艇停泊中' : '当前页面不可开炮 · 请进入战斗';
      return;
    }
    if (!combat || combat.result || combat.player.hp <= 0) return;
    ship.updateMatrixWorld(true);
    let count = 0;
    const fired: string[] = [];
    const blocked: string[] = [];
    const localAim = ship.worldToLocal(aim.clone());
    for (const bank of banks) {
      const { turret } = bank;
      if (!includesWeapon(firingSide, turret.rear)) continue;
      const relative = localAim.clone().sub(turret.group.position);
      const yaw = Math.atan2(relative.x, relative.z);
      if (!turretCanAim(yaw, turret.rear) || Math.abs(wrapAngle(yaw - turret.group.rotation.y)) > 0.08) continue;
      const station = bank.control.ammunition;
      const weapon = bankWeapon(bank.index);
      if (!weapon) { blocked.push(`${bank.index + 1}号炮未装备`); continue; }
      const power = shellPower(originalData, weapon);
      if (!power) { blocked.push(`${bank.index + 1}号炮弹药资料未取得，不能开火`); continue; }
      const ballistics = gunBallistics(weapon);
      if (!ballistics) { blocked.push(`${bank.index + 1}号炮弹道资料未取得，不能开火`); continue; }
      const muzzle = turretMuzzle(turret);
      const velocity = ballisticVelocity(muzzle, aim, ballistics.speed);
      if (!velocity || Math.atan2(velocity.y, Math.hypot(velocity.x, velocity.z)) > ballistics.maxAngle) {
        blocked.push(`${bank.index + 1}号炮目标超出射程或仰角`); continue;
      }
      const result = fireGun(bank.control, turret.barrels.length, weapon.reloadSeconds);
      const description = `${bank.index + 1}号炮${lockerName[station.selected]}仓`;
      if (!result.fired) {
        blocked.push(result.reason === 'empty' ? `${description} 弹仓备弹不足` : `${description} 正在装填`);
        continue;
      }
      const { shellType } = result;
      const shotDescription = `${description} ${shellName[shellType]}`;
      if (!fired.includes(shotDescription)) fired.push(shotDescription);
      turret.elevation.updateWorldMatrix(true, true);
      for (const muzzleNode of turret.muzzles) {
        const muzzle = muzzleNode.getWorldPosition(new THREE.Vector3());
        launch(muzzle, aim, 'player', power, shellType, ballistics);
        count++;
      }
      turret.recoil = 1.8;
      const light = new THREE.PointLight('#ffc278', 1200, 55, 2);
      light.position.copy(turretMuzzle(turret));
      scene.add(light);
      lights.push({ light, life: 0.16 });
    }
    if (count > 0) {
      firingMessage = `${count} 发 · ${fired.join(' · ')}${blocked.length ? ` · ${blocked.join(' · ')}` : ''}`;
    } else {
      firingMessage = blocked.length ? blocked.join(' · ') : '所选炮塔正在转向或目标超出射界，请稍候 / 改变瞄准方向';
    }
    updateAmmunition();
  }
  function reset(): void {
    if (mode === 'battle') { firingMessage = '战斗中不能重置舰艇'; return; }
    Object.assign(navigation, { x: 0, z: 0, heading: Math.PI / 2, speed: 0, throttle: 0 });
    ship.position.set(0, 0, 0);
    ship.rotation.set(0, Math.PI / 2, 0);
    aim.set(180, 0, -330);
    routeTarget = null;
    firingMessage = '';
    for (const bank of banks) bank.control.ammunition = createAmmunition();
    selectedWeapon = 0;
    tda = false;
    updateTDA();
    updateAmmunition();
    keys.clear();
    clearEffects();
    positionCamera(battleCameraOffset, BATTLE_ZOOM);
    if (mode === 'yard') setMode('yard');
  }
  function positionCamera(offset: THREE.Vector3, zoom: number): void {
    const damping = controls.enableDamping;
    // Consume residual drag before setting a view, otherwise damping rotates it again.
    controls.enableDamping = false;
    controls.update();
    camera.position.copy(offset).add(new THREE.Vector3(navigation.x, 0, navigation.z));
    controls.target.set(navigation.x, 8, navigation.z);
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
    controls.update();
    controls.enableDamping = damping;
  }
  function resizeBattleOcean(): void {
    if (!battleLayout) return;
    const view = seaViewSize(camera, BATTLE_MIN_ZOOM);
    const width = Math.max(24000, battleLayout.width + view.width + 4000);
    const height = Math.max(24000, battleLayout.height + view.height + 4000);
    ocean.geometry.dispose();
    ocean.geometry = new THREE.PlaneGeometry(width, height, 32, 32).rotateX(-Math.PI / 2);
  }
  function clearEffects(): void {
    routeTarget = null;
    routePlan = null;
    routeLine.visible = routeMarker.visible = false;
    for (const turret of turrets) {
      turret.group.rotation.set(0, turret.rear ? Math.PI : 0, 0);
      turret.elevation.rotation.set(0, 0, 0);
      turret.recoil = 0;
      for (const barrel of turret.barrels) barrel.position.z = 0;
    }
    for (const effect of particles) { scene.remove(effect.mesh); effect.mesh.material.dispose(); }
    particles.length = 0;
    fires.length = 0;
    for (const shell of shells) {
      scene.remove(shell.mesh, shell.trail);
      shell.trail.geometry.dispose();
      if (shell.trail.material instanceof THREE.Material) shell.trail.material.dispose();
    }
    shells.length = 0;
    for (const { light } of lights) { scene.remove(light); light.dispose(); }
    lights.length = 0;
    wakeTimer = 0;
    smokeTimer = 0;
    for (const bank of banks) bank.control.reload = 0;
  }
  const previews = new Map<string, string>();
  function shipPreview(typeId: string): string {
    const instance = createShip(models, typeId);
    const cached = previews.get(instance.modelKey);
    if (cached) return cached;
    const image = renderShipPreview(renderer, instance.ship).toDataURL('image/png');
    previews.set(instance.modelKey, image);
    return image;
  }
  const lobby = createLobby((next, deployment) => setMode(next, deployment), land, shipPreview,
    () => ({ name: activeBerth.name, typeId: activeBerth.typeId }), originalData,
    typeId => {
      if (typeId !== activeBerth.typeId) return '单舰对战使用所选舰，请先在船坞为该舰配置主炮，再重新进入房间。';
      if (activeBerth.modelKey === 'yorktown') return '约克镇航母外观已接入，但舰载机战斗尚未实现，当前不能出击。';
      if (!banks.some(bank => {
        const weapon = bankWeapon(bank.index);
        return weapon !== null && shellPower(originalData, weapon) !== null && gunBallistics(weapon) !== null;
      })) return '请先在船坞装备有弹药资料的主炮，再出击。';
      return null;
    });
  element('yard-portrait', HTMLImageElement).src = shipPreview(activeBerth.typeId);
  const berthDialog = element('berth-dialog', HTMLDialogElement);
  const berthSearch = element('berth-search', HTMLInputElement);
  const berthOpen = element('berth-open', HTMLButtonElement);
  const departure = element('yard-depart', HTMLButtonElement);
  const bow = new THREE.Vector3();
  const hullType = element('yard-ship-type', HTMLSelectElement);
  const bulgeLevel = element('yard-bulge-level', HTMLInputElement);
  bulgeLevel.addEventListener('input', () => bulgeLevel.setCustomValidity(''));
  bulgeLevel.addEventListener('change', () => {
    const level = bulgeLevel.valueAsNumber;
    if (!Number.isInteger(level) || level < 0 || level > 10) {
      bulgeLevel.setCustomValidity('防雷装甲档位须为0至10的整数');
      bulgeLevel.reportValidity();
      return;
    }
    activeBerth.bulgeLevel = level;
    refreshVessel();
  });
  renderShipTypes(hullType, originalData.ships, shipModelMatches);
  function refreshVessel(): void {
    const vessel = findOriginalShip(originalData, activeBerth.typeId);
    bulgeLevel.value = String(activeBerth.bulgeLevel);
    const protection = berthProtection();
    updateProtection(protection, protection);
    hullType.value = vessel.id;
    hullType.dataset['modelMatched'] = String(shipModelMatches.has(vessel.id));
    element('yard-vessel', HTMLElement).textContent = activeBerth.name;
    element('yard-vessel-class', HTMLElement).textContent = `${nationNames[vessel.nation]} · ${shipClassNames[vessel.shipClass] ?? '其他'}`;
    element('yard-portrait', HTMLImageElement).src = shipPreview(vessel.id);
    const particulars = element('yard-particulars', HTMLElement);
    particulars.replaceChildren();
    for (const [label, value] of [
      ['舰体耐久', vessel.raw['ShipDurabillity']], ['等级', vessel.raw['ShipLevel']],
      ['标准排水', vessel.raw['ShipDisplacementStandard']], ['最大排水', vessel.raw['ShipDisplacementMaximum']],
      ['转向性能', vessel.raw['ShipTurningForce']], ['结构强度', vessel.raw['ShipStructuralStrength']],
      ['超速比例', vessel.raw['ShipOverheatRatio']], ['主炮位', String(vessel.rMounts.length)],
      ['舷侧/甲板', '未配置'], ['船体外形', activeBerth.modelName],
      ['显示舰长', `${activeBerth.dimensions.length} 游戏单位`],
      ['史实舰长', '未接入'], ['航速上限', `${MAX_SPEED} 单位/秒`],
      ['防雷防护', String(protection)]
    ]) {
      const row = document.createElement('div'), term = document.createElement('dt'), detail = document.createElement('dd');
      term.textContent = label!; detail.textContent = value ?? '—'; row.append(term, detail); particulars.append(row);
    }
    if (vessel.durability === null) throw new Error('舰体耐久资料缺失。');
    element('app', HTMLElement).querySelector('.health > span')!.textContent =
      `${vessel.durability.toLocaleString('zh-CN')} / ${vessel.durability.toLocaleString('zh-CN')}`;
    const meter = element('app', HTMLElement).querySelector('.hull-track')!;
    meter.setAttribute('aria-valuemax', String(vessel.durability));
    meter.setAttribute('aria-valuenow', String(vessel.durability));
    healthFill!.style.width = '100%';
    shipTag.querySelector('b')!.textContent = `◆ ${activeBerth.name}`;
    allyTag.querySelector('b')!.textContent = `◆ 敌舰 · ${activeBerth.name}`;
  }
  hullType.addEventListener('change', () => {
    const vessel = findOriginalShip(originalData, hullType.value);
    if (!vessel.available || vessel.durability === null) throw new Error('此舰型的完整资料尚未取得。');
    activeBerth.mount = 0;
    const instance = createShip(models, vessel.id);
    const oldWeapons = activeBerth.weapons;
    const defaults: Record<string, string> = { bismarck: 'nf-gun-4-393', california: 'nf-gun-1-42' };
    const weapons = instance.turrets.map((turret, index) => {
      const previous = originalData.guns.find(gun => gun.id === oldWeapons[index]);
      const compatible = (gun: OriginalGun | undefined): gun is OriginalGun => gun !== undefined &&
        gun.mountGroup === String(turret.barrels.length).padStart(2, '0') &&
        (gun.nation === vessel.nation || gun.nation === 0) &&
        (originalNumber(gun.raw['space']) ?? Infinity) <= (vessel.rMounts[index] ?? 0);
      if (compatible(previous)) return previous.id;
      const preferred = originalData.guns.find(gun => gun.id === defaults[instance.modelKey]);
      return compatible(preferred) ? preferred.id : null;
    });
    removeVessel(activeBerth.ship);
    Object.assign(activeBerth, instance, { typeId: vessel.id, name: vessel.name, weapons,
      guns: instance.turrets.map((): GunState => ({ ammunition: createAmmunition(), reload: 0 })) });
    ({ ship, turrets } = activeBerth);
    ship.position.set(navigation.x, 0, navigation.z); ship.rotation.set(0, 0, 0);
    scene.add(ship); addVesselAppearance(activeBerth); battleAppearance(false);
    refreshMountedGuns();
    refreshVessel(); refreshBerths(); updateAmmunition();
  });
  gunModel.addEventListener('change', () => {
    if (!banks[selectedWeapon]) throw new Error('该舰没有可配置的主炮');
    const id = gunModel.value;
    const weapon = originalData.guns.find(gun => gun.id === id);
    const vessel = findOriginalShip(originalData, activeBerth.typeId);
    if (id && (!weapon || weapon.mountGroup !== String(turrets[selectedWeapon]?.barrels.length).padStart(2, '0') ||
      (weapon.nation !== vessel.nation && weapon.nation !== 0) ||
      (originalNumber(weapon.raw['space']) ?? Infinity) > (vessel.rMounts[selectedWeapon] ?? 0))) {
      throw new Error('该炮型不符合主炮位的国家或容量要求。');
    }
    activeBerth.weapons[selectedWeapon] = id || null;
    activeBerth.guns[selectedWeapon]!.reload = 0;
    updateAmmunition();
  });
  refreshVessel();
  function chooseBerth(index: number): void {
      const next = berths[index];
      if (!next) throw new Error('泊位不存在');
      berthDialog.close();
      if (next === activeBerth || mode !== 'yard') return;
      activeBerth.mount = selectedWeapon;
      ally = activeBerth.ship;
      ally.visible = false;
      ally.position.set(-430, 0, -240);
      ally.rotation.set(0, Math.PI * .4, 0);
      activeBerth = next;
      ({ ship, turrets } = next);
      ship.visible = true;
      ship.position.set(navigation.x, 0, navigation.z);
      ship.rotation.set(0, 0, 0);
      selectedWeapon = next.mount;
      refreshMountedGuns();
      refreshVessel();
      updateAmmunition();
      firingMessage = `${next.name} · 停泊`;
  }
  function refreshBerths(): void {
    const count = renderBerths(element('berth-list', HTMLDivElement), berths.map(berth => berth.name),
      berths.indexOf(activeBerth), berthSearch.value, chooseBerth);
    element('berth-result', HTMLParagraphElement).textContent = count ? `${count} / ${berths.length} 个泊位` : '没有匹配的泊位';
  }
  berthOpen.addEventListener('click', () => {
    berthSearch.value = '';
    refreshBerths();
    berthDialog.showModal();
    berthSearch.focus();
  });
  berthSearch.addEventListener('input', refreshBerths);
  element('berth-close', HTMLButtonElement).addEventListener('click', () => berthDialog.close());
  function setMode(next: Screen, deployment?: BattleDeployment): void {
    if (next === 'battle' && !deployment) throw new Error('出击缺少所选舰阵位');
    clearEffects();
    resultPanel.hidden = true;
    combat = null;
    resultDelay = 0;
    mode = next;
    app.dataset['mode'] = mode;
    lobby.show(mode);
    dock.visible = mode === 'yard';
    ocean.visible = mode === 'battle' || mode === 'prepare';
    ship.visible = mode === 'battle' || mode === 'yard';
    renderer.shadowMap.enabled = mode === 'yard';
    renderer.toneMappingExposure = mode === 'yard' ? 1 : 0.85;
    clouds.visible = mode === 'battle';
    battleAppearance(mode === 'battle' || mode === 'prepare');
    ally.visible = false;
    enemy.visible = mode === 'battle';
    aimMarker.visible = mode === 'battle';
    gunAimLines.forEach(line => { line.visible = mode === 'battle'; });
    mountMarker.visible = mode === 'yard' && turrets.length > 0;
    navigation.speed = 0;
    navigation.throttle = 0;
    keys.clear();
    following = true;
    battlePointer = null;
    controls.enableRotate = mode === 'yard';
    controls.enabled = mode === 'yard' || mode === 'battle';
    controls.enablePan = false;
    controls.minZoom = mode === 'yard' ? 1.8 : mode === 'battle' ? BATTLE_MIN_ZOOM : 0.55;
    controls.maxZoom = mode === 'yard' ? 6.5 : 3.5;
    camera.far = 15000;
    if (mode === 'battle') {
      removeVessel(enemy);
      enemyModel = createShip(models, activeBerth.typeId); enemy = enemyModel.ship;
      scene.add(enemy); addVesselAppearance(enemyModel); battleAppearance(true);
      enemyGuns.splice(0, enemyGuns.length, ...enemyModel.turrets.map((): GunState =>
        ({ ammunition: createAmmunition(), reload: 7 })));
      const hp = findOriginalShip(originalData, activeBerth.typeId).durability;
      if (hp === null || hp <= 0) throw new Error('无法建立战斗：舰体耐久无效');
      combat = createCombat(hp, hp, berthProtection());
      if (!deployment) throw new Error('出击缺少所选舰阵位');
      ship.updateMatrixWorld(true);
      // Include the maximum heave and hull tilt in the precomputed range bound.
      const maximumHeight = 1 + Math.max(...turrets.map(turret => {
        const pivot = turret.elevation.getWorldPosition(new THREE.Vector3());
        return Math.max(...turret.muzzles.map(muzzle => pivot.y + pivot.distanceTo(muzzle.getWorldPosition(new THREE.Vector3()))));
      }));
      enemyWeapons = banks.map(bank => bankWeapon(bank.index));
      const maximumRange = Math.max(...enemyWeapons.map(weapon => {
        const profile = weapon ? gunBallistics(weapon) : null;
        return profile ? ballisticRange(maximumHeight, profile.maxAngle, profile.speed) : 0;
      }));
      battleLayout = createBattleLayout(maximumRange, deployment.slot);
      const poses = deploymentPoses(deployment, battleLayout);
      Object.assign(navigation, poses.player);
      Object.assign(enemyNavigation, poses.enemy);
      enemy.position.set(enemyNavigation.x, 0, enemyNavigation.z);
      enemy.rotation.set(0, enemyNavigation.heading, 0);
      for (const gun of enemyGuns) { gun.ammunition = createAmmunition(); gun.reload = 7; }
      for (const bank of banks) {
        bank.control.ammunition.lockers.A.remaining = 60;
        bank.control.ammunition.lockers.B.remaining = 60;
      }
      for (const turret of enemyModel.turrets) {
        turret.group.rotation.set(0, turret.rear ? Math.PI : 0, 0);
        turret.elevation.rotation.set(0, 0, 0);
        turret.recoil = 0;
      }
      aim.set(navigation.x + Math.sin(navigation.heading) * maximumRange * 0.5, 0.5, navigation.z);
      shipTag.querySelector('span')!.textContent =
        `${deployment.team === 'alpha' ? '甲' : '乙'}-${String(deployment.slot + 1).padStart(3, '0')}`;
      routeTarget = null;
      updateProtection(combat.player.protection, combat.player.maxProtection);
      updateAmmunition();
      allyTag.querySelector('b')!.textContent = `◆ 敌舰 · ${activeBerth.name}`;
    } else {
      battleLayout = null;
      if (ocean.geometry.parameters.width !== 24000 || ocean.geometry.parameters.height !== 24000) {
        ocean.geometry.dispose();
        ocean.geometry = new THREE.PlaneGeometry(24000, 24000, 32, 32).rotateX(-Math.PI / 2);
      }
      refreshVessel();
    }
    if (mode === 'yard') {
      ship.rotation.y = 0;
      const zoom = THREE.MathUtils.clamp((canvas.clientWidth - 210) / canvas.clientHeight * 3.8, 2, 5.4);
      positionCamera(new THREE.Vector3(430, 420, 400), zoom);
      // Reserve the sidebar and lower equipment window without tilting the dock view.
      const shift = new THREE.Vector3(-18, -15, 35);
      camera.position.add(shift);
      controls.target.add(shift);
      controls.update();
      firingMessage = '右键旋转，滚轮缩放';
    } else if (mode === 'prepare') {
      positionCamera(battleCameraOffset, 1.2);
      firingMessage = '';
    } else {
      positionCamera(battleCameraOffset, BATTLE_ZOOM);
      firingMessage = '';
    }
    if (mode === 'battle') {
      positionBattleCamera(camera, controls.target, battleCameraDirection);
      resizeBattleOcean();
    }
  }
  function toggleCamera(): void {
    if (mode === 'battle') {
      following = true;
      battlePointer = null;
      positionCamera(battleCameraOffset, camera.zoom);
      positionBattleCamera(camera, controls.target, battleCameraDirection);
      firingMessage = '视角已返回本舰 · 边缘移屏 / C回舰';
      return;
    }
    if (mode !== 'yard') return;
    following = !following;
    controls.enablePan = !following;
  }
  function updateTDA(): void {
    tdaButton.setAttribute('aria-pressed', String(tda));
    tdaButton.setAttribute('aria-label', `炮塔转动加速，${tda ? '开启' : '关闭'}`);
  }
  function toggleTDA(): void {
    if (mode !== 'battle') return;
    tda = !tda;
    updateTDA();
    firingMessage = tda ? '炮塔加速开启' : '炮塔加速关闭';
  }
  function changePower(step: number): void {
    if (mode !== 'battle' || combat?.result) return;
    navigation.throttle = THREE.MathUtils.clamp(navigation.throttle + step, -0.3, 1);
    routeTarget = null;
    firingMessage = `发动机动力 ${Math.round(navigation.throttle * 100)}%`;
  }
  element('battle-exit', HTMLButtonElement).addEventListener('click', () => setMode('warzone'));
  element('battle-result-exit', HTMLButtonElement).addEventListener('click', () => setMode('warzone'));
  departure.addEventListener('click', () => setMode('warzone'));
  element('fire', HTMLButtonElement).addEventListener('click', fire);
  for (const [locker, select] of [['A', shellA], ['B', shellB]] as const) {
    select.addEventListener('change', () => {
      const shellType = select.value;
      if (shellType !== 'HE' && shellType !== 'AP') throw new Error('Invalid shell type');
      const bank = banks[selectedWeapon];
      if (!bank) throw new Error('Missing selected main gun');
      bank.control.ammunition.lockers[locker].shellType = shellType;
      firingMessage = `${selectedWeapon + 1}号炮${lockerName[locker]}仓已改装${shellName[shellType]}`;
      updateAmmunition();
    });
  }
  updateAmmunition();
  tdaButton.addEventListener('click', toggleTDA);
  element('power-up', HTMLButtonElement).addEventListener('click', () => changePower(0.1));
  element('power-down', HTMLButtonElement).addEventListener('click', () => changePower(-0.1));
  function setOrder(button: number, point: THREE.Vector3): void {
    if (mode !== 'battle' || !combat || combat.result) return;
    if (button === 0) {
      aim.copy(point).setY(0.5);
      firingMessage = '瞄准点已锁定 · 空格齐射';
    } else if (button === 2) {
      routePlan = createRoute(navigation, point);
      routeTarget = point.clone().setY(0.9);
      firingMessage = '航线已设定 · F/V切换手动推进';
    }
  }
  function battleMapScale(): number {
    return battleLayout ? Math.max(battleLayout.width / 200, battleLayout.height / 130) : 80;
  }
  window.addEventListener('pointermove', event => {
    const target = event.target;
    if (mode !== 'battle' || event.pointerType !== 'mouse' || event.buttons
      || (target instanceof Element && target.closest('button,input,select,textarea,a,dialog,[role="button"],[contenteditable="true"]'))
      || (target instanceof Node && (mapPanel.contains(target) || enginePanel.contains(target) || resultPanel.contains(target)))
      || (target instanceof HTMLCanvasElement && target !== canvas)) {
      battlePointer = null;
      return;
    }
    const rect = canvas.getBoundingClientRect();
    battlePointer = event.clientX >= rect.left && event.clientX <= rect.right
      && event.clientY >= rect.top && event.clientY <= rect.bottom
      ? { x: event.clientX - rect.left, y: event.clientY - rect.top } : null;
  });
  window.addEventListener('pointerdown', () => { battlePointer = null; });
  window.addEventListener('pointerout', event => { if (!event.relatedTarget) battlePointer = null; });
  canvas.addEventListener('pointerdown', event => {
    if (mode !== 'battle' || (event.button !== 0 && event.button !== 2)) return;
    const rect = canvas.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    if (!raycaster.ray.intersectPlane(waterPlane, hit)) {
      firingMessage = '该位置无法设定海面指令';
      return;
    }
    setOrder(event.button, hit);
  });
  mapCanvas.addEventListener('pointerdown', event => {
    if (mode !== 'battle' || (event.button !== 0 && event.button !== 2)) return;
    const rect = mapCanvas.getBoundingClientRect(), scale = battleMapScale();
    setOrder(event.button, new THREE.Vector3(((event.clientX - rect.left) / rect.width * 220 - 110) * scale,
      0.5, ((event.clientY - rect.top) / rect.height * 150 - 75) * scale));
  });
  for (const surface of [canvas, mapCanvas]) surface.addEventListener('contextmenu', event => {
    if (mode === 'battle') event.preventDefault();
  });
  window.addEventListener('keydown', event => {
    if (mode !== 'battle' && mode !== 'yard') return;
    if (berthDialog.open || (mode === 'yard' && event.code === 'Space' && event.target instanceof HTMLButtonElement)) return;
    if (event.target instanceof HTMLElement && event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
    if (['KeyA', 'KeyD', 'KeyF', 'KeyV', 'Space', 'KeyC', 'KeyR', 'KeyY', 'ControlLeft', 'ControlRight'].includes(event.code)) event.preventDefault();
    if (mode === 'battle' && ['KeyF', 'KeyV', 'KeyA', 'KeyD'].includes(event.code)) routeTarget = null;
    keys.add(event.code);
    if (event.repeat) return;
    if (event.code === 'Space') fire();
    if (event.code === 'KeyC') toggleCamera();
    if (event.code === 'KeyR') reset();
    if (event.code === 'ControlLeft' || event.code === 'ControlRight') toggleTDA();
    if (event.code === 'KeyY' && mode === 'battle') {
      const reference = banks.find(bank => bank.index === selectedWeapon && includesWeapon(firingSide, bank.turret.rear))
        ?? banks.find(bank => includesWeapon(firingSide, bank.turret.rear));
      if (!reference) throw new Error('No selected weapon bank');
      selectedWeapon = reference.index;
      const locker: Locker = reference.control.ammunition.selected === 'A' ? 'B' : 'A';
      for (const bank of banks) {
        if (includesWeapon(firingSide, bank.turret.rear)) bank.control.ammunition.selected = locker;
      }
      firingMessage = `炮组已切换至${lockerName[locker]}仓`;
      updateAmmunition();
    }
  });
  window.addEventListener('keyup', event => keys.delete(event.code));
  window.addEventListener('blur', () => { keys.clear(); battlePointer = null; });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { keys.clear(); battlePointer = null; }
  });
  new ResizeObserver(() => {
    if (!canvas.clientWidth || !canvas.clientHeight) return;
    camera.left = -halfHeight * canvas.clientWidth / canvas.clientHeight;
    camera.right = -camera.left;
    camera.updateProjectionMatrix();
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    if (mode === 'battle') resizeBattleOcean();
  }).observe(canvas);
  let lastTime = performance.now();
  function advanceEnemy(dt: number): void {
    if (!combat || combat.result || combat.enemy.hp <= 0) return;
    const course = enemyCourse(enemyNavigation, navigation);
    enemyNavigation.throttle = course.throttle;
    advanceNavigation(enemyNavigation, 0, course.rudder, dt);
    enemy.position.set(enemyNavigation.x, Math.sin(elapsed * 0.75) * 0.3, enemyNavigation.z);
    enemy.rotation.set(0, enemyNavigation.heading, 0);
    enemy.updateMatrixWorld(true);
    for (const [index, turret] of enemyModel.turrets.entries()) {
      const gun = enemyGuns[index]!;
      gun.reload = Math.max(0, gun.reload - dt);
      const weapon = enemyWeapons[index];
      if (!weapon) continue;
      const power = shellPower(originalData, weapon);
      if (!power) continue;
      const ballistics = gunBallistics(weapon);
      if (!ballistics) continue;
      const muzzle = turretMuzzle(turret);
      const target = leadTarget(muzzle, navigation, ballistics.speed);
      const point = new THREE.Vector3(target.x, target.y, target.z);
      const local = enemy.worldToLocal(point.clone()).sub(turret.group.position);
      const desired = Math.atan2(local.x, local.z);
      if (!turretCanAim(desired, turret.rear)) continue;
      turret.group.rotation.y += THREE.MathUtils.clamp(wrapAngle(desired - turret.group.rotation.y), -dt * 0.7, dt * 0.7);
      const velocity = ballisticVelocity(muzzle, target, ballistics.speed);
      if (!velocity) continue;
      const elevation = Math.atan2(velocity.y, Math.hypot(velocity.x, velocity.z));
      if (elevation > ballistics.maxAngle) continue;
      turret.elevation.rotation.x = -elevation;
      turret.recoil = Math.max(0, turret.recoil - dt * 3);
      for (const barrel of turret.barrels) barrel.position.z = -turret.recoil;
      if (Math.abs(wrapAngle(desired - turret.group.rotation.y)) > 0.08) continue;
      if (!fireGun(gun, turret.barrels.length, weapon.reloadSeconds).fired) continue;
      turret.elevation.updateWorldMatrix(true, true);
      for (const node of turret.muzzles) launch(node.getWorldPosition(new THREE.Vector3()), point, 'enemy', power, 'HE', ballistics);
      turret.recoil = 1.8;
    }
  }
  function updateCombat(dt: number): void {
    if (!combat) return;
    healthText!.textContent = `${combat.player.hp.toLocaleString('zh-CN')} / ${combat.player.maxHp.toLocaleString('zh-CN')}`;
    healthMeter!.setAttribute('aria-valuenow', String(combat.player.hp));
    healthFill!.style.width = `${combat.player.hp / combat.player.maxHp * 100}%`;
    updateProtection(combat.player.protection, combat.player.maxProtection);
    enemyHealth.textContent = `${combat.enemy.hp.toLocaleString('zh-CN')} / ${combat.enemy.maxHp.toLocaleString('zh-CN')}`;
    kills.textContent = combat.enemy.hp <= 0 ? '1' : '0';
    accuracy.textContent = `${combat.player.shots ? Math.round(combat.player.hits / combat.player.shots * 100) : 0}%`;
    damageReadout.textContent = combat.player.damage.toLocaleString('zh-CN');
    const result = resolveBattle(combat);
    for (const [side, vessel] of [['player', ship], ['enemy', enemy]] as const) {
      const state = combat[side];
      if (state.hp > 0) continue;
      if (state.sinking === 0 && dt > 0) sinkingBurst(vessel);
      const before = state.sinking;
      state.sinking += dt;
      const pose = sinkingPose(state.sinking);
      vessel.position.y = pose.depth;
      vessel.rotation.z = pose.roll;
      vessel.rotation.x = pose.pitch;
      vessel.visible = pose.visible;
      if (state.sinking < 15 && Math.floor(before * 2) !== Math.floor(state.sinking * 2)) {
        const position = vessel.position.clone().setY(0.8);
        particle(position, new THREE.Vector3(), '#a2c4c9', 26, 4, 14, 0, 'ring');
        for (const side of [-1, 1]) {
          const edge = vessel.localToWorld(new THREE.Vector3(side * 18, 0, Math.sin(state.sinking) * 95));
          edge.y = 0.6;
          particle(edge, new THREE.Vector3(side * 5, 8, 0), '#cde0df', 3, 2, 2, 12);
        }
      }
    }
    if (result) {
      routeTarget = null;
      keys.clear();
      navigation.speed = navigation.throttle = enemyNavigation.speed = enemyNavigation.throttle = 0;
      resultDelay += dt;
      firingMessage = result === 'victory' ? '敌舰已击沉' : result === 'defeat' ? '本舰已沉没' : '双方舰艇均已沉没';
      if (resultDelay > 5 && resultPanel.hidden) {
        element('battle-result-title', HTMLElement).textContent = result === 'victory' ? '战斗胜利' : result === 'defeat' ? '战斗失利' : '双方沉没';
        element('battle-result-stats', HTMLElement).textContent =
          `击沉 ${combat.enemy.hp <= 0 ? 1 : 0} 艘 · 命中 ${combat.player.hits} / ${combat.player.shots} 发\n造成伤害 ${combat.player.damage.toLocaleString('zh-CN')}\n剩余耐久 ${combat.player.hp.toLocaleString('zh-CN')}`;
        resultPanel.hidden = false;
        element('battle-result-exit', HTMLButtonElement).focus();
      }
    }
  }
  function frame(now: number): void {
    const dt = document.hidden ? 0 : Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;
    elapsed += dt;
    oceanMaterial.uniforms['time']!.value = elapsed;
    const oldX = navigation.x;
    const oldZ = navigation.z;
    const playerBefore = { ...navigation }, enemyBefore = { ...enemyNavigation };
    if (mode === 'battle' && combat && !combat.result && combat.player.hp > 0) {
      if (routeTarget) {
        if (!routePlan) throw new Error('舰船航线尚未规划');
        if (advanceRoute(navigation, routePlan, dt)) {
          routeTarget = null;
          firingMessage = '已到达航点';
        }
      } else {
        advanceNavigation(navigation, Number(keys.has('KeyF')) - Number(keys.has('KeyV')),
          Number(keys.has('KeyD')) - Number(keys.has('KeyA')), dt);
      }
    }
    ship.position.set(navigation.x, mode === 'battle' ? Math.sin(elapsed * 0.75) * 0.3 : 0, navigation.z);
    ship.rotation.set(mode === 'battle' ? Math.sin(elapsed * 0.6) * 0.002 : 0,
      mode === 'battle' ? navigation.heading : mode === 'prepare' ? Math.PI / 2 : 0,
      mode === 'battle' ? Math.sin(elapsed * 0.8) * 0.004 : 0);
    dock.position.set(navigation.x, 0, navigation.z);
    if (following) {
      camera.position.x += navigation.x - oldX;
      camera.position.z += navigation.z - oldZ;
      controls.target.x += navigation.x - oldX;
      controls.target.z += navigation.z - oldZ;
    }
    if (mode === 'battle' && battleLayout) {
      positionBattleCamera(camera, controls.target, battleCameraDirection);
      if (battlePointer && dt > 0 && canvas.clientWidth > 0 && canvas.clientHeight > 0) {
        const delta = edgePan(camera, battlePointer, { width: canvas.clientWidth, height: canvas.clientHeight }, dt);
        if (delta.lengthSq() > 0) {
          if (following) firingMessage = '浏览远处 · C返回本舰';
          following = false;
          const oldTargetX = controls.target.x, oldTargetZ = controls.target.z;
          const boundX = battleLayout.width / 2 + 1000, boundZ = battleLayout.height / 2 + 1000;
          controls.target.x = THREE.MathUtils.clamp(oldTargetX + delta.x, Math.min(-boundX, oldTargetX), Math.max(boundX, oldTargetX));
          controls.target.z = THREE.MathUtils.clamp(oldTargetZ + delta.z, Math.min(-boundZ, oldTargetZ), Math.max(boundZ, oldTargetZ));
          camera.position.x += controls.target.x - oldTargetX;
          camera.position.z += controls.target.z - oldTargetZ;
        }
      }
    }
    controls.update();
    clouds.position.set(navigation.x, 0, navigation.z);
    if (mode === 'battle') advanceEnemy(dt);
    sunlight.position.set(navigation.x - 250, 380, navigation.z + 150);
    sunlight.target.position.set(navigation.x, 0, navigation.z);
    ship.updateMatrixWorld(true);
    aimMarker.position.copy(aim).setY(0.8);
    routeLine.visible = routeMarker.visible = mode === 'battle' && routeTarget !== null;
    if (routeTarget) {
      routeMarker.position.copy(routeTarget);
      const positions = routeLine.geometry.getAttribute('position');
      positions.setXYZ(0, navigation.x, 0.9, navigation.z);
      positions.setXYZ(1, routeTarget.x, 0.9, routeTarget.z);
      routeLine.geometry.computeBoundingSphere();
      positions.needsUpdate = true;
    }
    if (mode === 'battle') {
      aimLabel.textContent = `目标 ${Math.hypot(aim.x - navigation.x, aim.z - navigation.z).toFixed(0)} 单位`;
    }
    ship.updateMatrixWorld(true);
    const localAim = ship.worldToLocal(aim.clone());
    for (const [index, turret] of turrets.entries()) {
      const bank = banks[index];
      if (!bank) throw new Error('Missing mounted gun state');
      const installed = bankWeapon(bank.index);
      const ballistics = installed ? gunBallistics(installed) : null;
      bank.control.reload = Math.max(0, bank.control.reload - dt);
      const delta = localAim.clone().sub(turret.group.position);
      const desired = Math.atan2(delta.x, delta.z);
      if (mode === 'battle' && !combat?.result && turretCanAim(desired, turret.rear)) {
        const turnStep = dt * (tda ? 2.1 : 0.7);
        turret.group.rotation.y += THREE.MathUtils.clamp(wrapAngle(desired - turret.group.rotation.y), -turnStep, turnStep);
        const world = turret.elevation.getWorldPosition(new THREE.Vector3());
        const distance = Math.hypot(aim.x - world.x, aim.z - world.z);
        const elevation = ballistics ? lowArcElevation(distance, world.y - aim.y, ballistics.speed) : null;
        if (elevation !== null) turret.elevation.rotation.x = -elevation;
      }
      turret.recoil = Math.max(0, turret.recoil - dt * 3);
      for (const barrel of turret.barrels) barrel.position.z = -turret.recoil;
      const line = gunAimLines[index];
      if (!line) throw new Error('Missing main gun sight');
      line.visible = mode === 'battle' && ballistics !== null;
      if (line.visible) {
        const muzzleNode = turret.muzzles[0];
        if (!muzzleNode) throw new Error('舰炮缺少炮口');
        const muzzle = turretMuzzle(turret);
        const direction = muzzleNode.getWorldDirection(new THREE.Vector3());
        if (!ballistics) throw new Error('舰炮弹道资料缺失');
        direction.y = 0;
        direction.normalize();
        const length = ballisticRange(0, ballistics.maxAngle, ballistics.speed);
        const positions = line.geometry.getAttribute('position');
        positions.setXYZ(0, muzzle.x, 1, muzzle.z);
        positions.setXYZ(1, muzzle.x + direction.x * length, 1, muzzle.z + direction.z * length);
        positions.needsUpdate = true;
        line.geometry.computeBoundingSphere();
        line.computeLineDistances();
        const selected = includesWeapon(firingSide, turret.rear);
        line.material.color.set(selected ? '#91d47c' : '#869992');
        line.material.opacity = selected ? 0.85 : 0.45;
      }
      const muzzle = turretMuzzle(turret);
      const velocity = ballistics ? ballisticVelocity(muzzle, aim, ballistics.speed) : null;
      const reachable = velocity !== null && ballistics !== null &&
        Math.atan2(velocity.y, Math.hypot(velocity.x, velocity.z)) <= ballistics.maxAngle;
      const aimState = !reachable || !turretCanAim(desired, turret.rear) ? 'limited'
        : Math.abs(wrapAngle(desired - turret.group.rotation.y)) > 0.08 ? 'turning' : 'aligned';
      const readout = gunReadout(bank.control, turret.barrels.length, installed?.reloadSeconds ?? null, aimState);
      const state = mode === 'yard' ? '停泊' : readout.status;
      const label = gunStates[index];
      if (label) label.textContent = `${index + 1} ${state}`;
      const powerAvailable = installed !== null && shellPower(originalData, installed) !== null;
      bank.state.textContent = !installed ? '未装备' : !ballistics ? '弹道资料缺失' : !powerAvailable ? '弹药资料缺失'
        : mode === 'battle' && combat?.result ? '战斗结束' : state;
      bank.dial.classList.toggle('ready', mode === 'battle' && !combat?.result && powerAvailable && readout.canFire);
      bank.needle.style.transform = `rotate(${readout.progress * 360}deg)`;
    }
    for (const gauge of angleGauges) {
      const turret = banks.find(bank => bank.turret.rear === gauge.rear && bankWeapon(bank.index) !== null)?.turret;
      if (!turret) continue;
      const elevation = -turret.elevation.rotation.x * 180 / Math.PI;
      gauge.needle.style.transform = `rotate(${-130 + elevation / 90 * 260}deg)`;
      gauge.label.textContent = `${Math.round(elevation)}°`;
      gauge.needle.parentElement!.setAttribute('aria-valuenow', elevation.toFixed(1));
    }
    for (let i = shells.length - 1; i >= 0; i--) {
      const shell = shells[i]!;
      const before = shell.mesh.position.clone();
      shell.mesh.position.addScaledVector(shell.velocity, dt);
      shell.mesh.position.y -= 0.5 * GRAVITY * dt * dt;
      shell.velocity.y -= GRAVITY * dt;
      shell.history.push(shell.mesh.position.clone());
      if (shell.history.length > 18) shell.history.shift();
      shell.trail.geometry.dispose();
      shell.trail.geometry = new THREE.BufferGeometry().setFromPoints(shell.history);
      const target = shell.owner === 'player' ? 'enemy' : 'player';
      const collision = combat && !combat.result && combat[target].hp > 0
        ? hullIntersection(before, shell.mesh.position, target === 'enemy' ? enemyBefore : playerBefore,
          target === 'enemy' ? enemyNavigation : navigation,
          target === 'enemy' ? enemyModel.dimensions : activeBerth.dimensions) : null;
      const water = shell.mesh.position.y <= 0 ? before.y / (before.y - shell.mesh.position.y) : Infinity;
      const hitHull = collision !== null && collision <= water;
      if (hitHull || water !== Infinity) {
        if (hitHull && combat) {
          const impact = before.clone().lerp(shell.mesh.position, collision);
          const damage = applyImpact(combat, shell.owner, shell.power, shell.shellType, shell.elevation);
          if (damage > 0) {
            impactEffect(impact, shell.shellType);
            if (shell.shellType === 'HE') ignite(target === 'enemy' ? enemy : ship, impact, 10);
            firingMessage = shell.owner === 'player' ? `命中敌舰 · 伤害 ${damage}` : `本舰中弹 · 损失 ${damage}`;
          }
        } else if (water !== Infinity) {
          splash(before.clone().lerp(shell.mesh.position, water).setY(0.5), shell.shellType);
        }
        scene.remove(shell.mesh, shell.trail);
        shell.trail.geometry.dispose();
        if (shell.trail.material instanceof THREE.Material) shell.trail.material.dispose();
        shells.splice(i, 1);
      }
    }
    if (mode === 'battle') updateCombat(dt);
    for (let i = fires.length - 1; i >= 0; i--) {
      const fire = fires[i]!;
      fire.remaining -= dt;
      fire.timer -= dt;
      fire.vessel.updateMatrixWorld(true);
      const position = fire.vessel.localToWorld(fire.local.clone());
      if (fire.remaining <= 0 || position.y < 0 || !fire.vessel.visible) {
        fires.splice(i, 1);
      } else if (fire.timer <= 0) {
        fire.timer = 0.22;
        const fade = Math.min(1, fire.remaining / 2);
        particle(position, new THREE.Vector3(Math.random() * 2 - 1, 9, 0), '#ffad4a',
          6 * fade, 0.8, 5, 0, 'fire');
        particle(position, new THREE.Vector3(-3, 7, 1), '#292e2e', 6 * fade, 5, 5);
      }
    }
    wakeTimer += dt;
    smokeTimer += dt;
    if (mode === 'battle' && smokeTimer > 0.28) {
      smokeTimer = 0;
      for (const [side, emitter] of [['player', activeBerth.funnel], ['enemy', enemyModel.funnel]] as const) {
        if (combat && combat[side].hp <= 0) continue;
        particle(emitter.getWorldPosition(new THREE.Vector3()), new THREE.Vector3(-3, 2, -1),
          '#253036', 2.4, 6, 1.8);
      }
    }
    if (Math.abs(navigation.speed) > 0.5 && wakeTimer > 0.08) {
      wakeTimer = 0;
      const position = ship.localToWorld(new THREE.Vector3(0, 0,
        (navigation.speed > 0 ? -1 : 1) * activeBerth.dimensions.length * 0.48));
      position.y = 0.7;
      const velocity = new THREE.Vector3(0, 0, -Math.sign(navigation.speed) * 1.2)
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), navigation.heading);
      particle(position, velocity, '#b5d9d5', 2.5, 8, 0.9);
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const effect = particles[i]!;
      effect.remaining -= dt;
      effect.velocity.y -= effect.gravity * dt;
      effect.mesh.position.addScaledVector(effect.velocity, dt);
      if (effect.kind === 'spark' && effect.velocity.lengthSq() > 0) {
        effect.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), effect.velocity.clone().normalize());
      }
      effect.mesh.scale.addScalar(effect.growth * dt);
      effect.mesh.material.opacity = Math.max(0, effect.remaining / effect.lifetime) * effect.opacity;
      if (effect.remaining <= 0 || effect.mesh.position.y < -1) {
        scene.remove(effect.mesh);
        effect.mesh.material.dispose();
        particles.splice(i, 1);
      }
    }
    for (let i = lights.length - 1; i >= 0; i--) {
      const entry = lights[i]!;
      entry.life -= dt;
      if (entry.life <= 0) { scene.remove(entry.light); entry.light.dispose(); lights.splice(i, 1); }
    }
    const reload = Math.max(0, ...banks.map(bank => bank.control.reload));
    speedLabel.textContent = navigation.speed.toFixed(1);
    battleSpeed.textContent = speedLabel.textContent;
    headingLabel.textContent = `${String(Math.round((navigation.heading * 180 / Math.PI + 360) % 360)).padStart(3, '0')}°`;
    battleHeading.textContent = `航向 ${headingLabel.textContent}`;
    throttleLabel.textContent = `${Math.round(navigation.throttle * 100)}%`;
    enginePower.textContent = throttleLabel.textContent;
    enginePowerNeedle.style.transform = `rotate(${-130 + Math.abs(navigation.throttle) * 260}deg)`;
    powerLever.style.top = `${8 + (1 - navigation.throttle) / 1.3 * 23}px`;
    reloadLabel.textContent = mode === 'yard' ? '停泊' : reload > 0 ? `${reload.toFixed(1)} 秒` : '就绪';
    headingNeedle.style.transform = `rotate(${navigation.heading * 180 / Math.PI}deg)`;
    speedNeedle.style.transform = `rotate(${-130 + Math.abs(navigation.throttle) * 260}deg)`;
    knotsNeedle.style.transform = `rotate(${-130 + Math.abs(navigation.speed) / MAX_SPEED * 260}deg)`;
    reloadNeedles.forEach((needle, index) => {
      const bank = banks[index];
      if (bank) needle.style.transform = `rotate(${-130 + (1 - bank.control.reload / (bankWeapon(index)?.reloadSeconds ?? RELOAD_SECONDS)) * 260}deg)`;
    });
    function labelAt(label: HTMLElement, position: THREE.Vector3): void {
      const projected = position.project(camera);
      label.style.left = `${(projected.x + 1) * canvas.clientWidth / 2}px`;
      label.style.top = `${(1 - projected.y) * canvas.clientHeight / 2}px`;
      label.style.visibility = Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1 ? 'hidden' : 'visible';
    }
    labelAt(shipTag, ship.position.clone().add(new THREE.Vector3(0, 50, 0)));
    labelAt(allyTag, enemy.position.clone().add(new THREE.Vector3(0, 50, 0)));
    labelAt(aimLabel, aim.clone());
    if (mode === 'yard') {
      const turret = turrets[selectedWeapon];
      labelAt(departure, ship.localToWorld(bow.set(0, 9, activeBerth.dimensions.length / 2 + 1)));
      if (turret) mountMarker.position.copy(turret.group.getWorldPosition(new THREE.Vector3())).add(new THREE.Vector3(0, 9, 0));
      for (const bank of banks) {
        labelAt(bank.pin, bank.turret.group.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 13, 0)));
      }
    }
    mapContext.clearRect(0, 0, 220, 150);
    mapContext.fillStyle = mode === 'battle' ? '#0a192bbb' : '#0b2430';
    mapContext.fillRect(0, 0, 220, 150);
    mapContext.strokeStyle = mode === 'battle' ? '#49637522' : '#55797e44';
    for (let x = 0; x <= 220; x += mode === 'battle' ? 44 : 22) { mapContext.beginPath(); mapContext.moveTo(x, 0); mapContext.lineTo(x, 150); mapContext.stroke(); }
    for (let y = 0; y <= 150; y += mode === 'battle' ? 30 : 15) { mapContext.beginPath(); mapContext.moveTo(0, y); mapContext.lineTo(220, y); mapContext.stroke(); }
    const mapScale = mode === 'battle' ? battleMapScale() : 12;
    const mapCenterX = mode === 'battle' && battleLayout ? 0 : navigation.x;
    const mapCenterZ = mode === 'battle' && battleLayout ? 0 : navigation.z;
    if (mode === 'battle' && battleLayout) {
      for (const region of battleLayout.regions) {
        const x = 110 + (region.minX - mapCenterX) / mapScale;
        const y = 75 + (region.minZ - mapCenterZ) / mapScale;
        const width = (region.maxX - region.minX) / mapScale;
        const height = (region.maxZ - region.minZ) / mapScale;
        mapContext.fillStyle = region.team === 'alpha' ? '#5ba58c55' : '#d1767655';
        mapContext.fillRect(x, y, width, height);
        mapContext.strokeStyle = region.team === 'alpha' ? '#84c3ad' : '#d99090';
        mapContext.strokeRect(x, y, width, height);
        mapContext.font = '12px "Microsoft YaHei"';
        mapContext.fillStyle = '#dfebdc';
        mapContext.textAlign = region.team === 'alpha' ? 'left' : 'right';
        mapContext.fillText(`${region.team === 'alpha' ? '甲' : '乙'}${region.zone + 1}`,
          region.team === 'alpha' ? x + width + 4 : x - 4, y + height / 2 + 4);
      }
      mapContext.textAlign = 'left';
      if (routeTarget) {
        mapContext.strokeStyle = '#83dfcf';
        mapContext.beginPath();
        mapContext.moveTo(110 + navigation.x / mapScale, 75 + navigation.z / mapScale);
        mapContext.lineTo(110 + routeTarget.x / mapScale, 75 + routeTarget.z / mapScale);
        mapContext.stroke();
      }
    }
    mapContext.strokeStyle = mode === 'battle' ? '#76aa72' : '#dbcd8a';
    if (mode === 'battle') {
      mapContext.beginPath();
      for (const [index, corner] of mapCorners.entries()) {
        mapRaycaster.setFromCamera(corner, camera);
        const point = mapRaycaster.ray.intersectPlane(waterPlane, new THREE.Vector3());
        if (!point) continue;
        const x = 110 + (point.x - mapCenterX) / mapScale;
        const y = 75 + (point.z - mapCenterZ) / mapScale;
        if (index === 0) mapContext.moveTo(x, y);
        else mapContext.lineTo(x, y);
      }
      mapContext.closePath();
      mapContext.stroke();
    } else {
      mapContext.strokeRect(101, 66, 18, 18);
    }
    function mapPoint(x: number, z: number, color: string): void {
      const px = 110 + (x - mapCenterX) / mapScale;
      const py = 75 + (z - mapCenterZ) / mapScale;
      if (mode === 'battle') {
        const glow = mapContext.createRadialGradient(px, py, 0, px, py, 5);
        glow.addColorStop(0, color);
        glow.addColorStop(1, color + '00');
        mapContext.fillStyle = glow;
        mapContext.fillRect(px - 5, py - 5, 10, 10);
      }
      mapContext.fillStyle = color;
      mapContext.fillRect(px - 1, py - 1, 2, 2);
    }
    mapPoint(navigation.x, navigation.z, '#84f2da');
    if (mode === 'battle') {
      if (combat && combat.enemy.hp > 0) mapPoint(enemy.position.x, enemy.position.z, '#ff766b');
      mapPoint(aim.x, aim.z, '#f2d34d');
      if (routeTarget) mapPoint(routeTarget.x, routeTarget.z, '#83dfcf');
    }
    if (mode === 'battle') {
      mapContext.strokeStyle = '#162b3780';
      for (let y = 0; y < 150; y += 3) {
        mapContext.beginPath(); mapContext.moveTo(0, y); mapContext.lineTo(220, y); mapContext.stroke();
      }
    }
    status.textContent = mode !== 'battle' && mode !== 'yard' ? lobby.getStatus()
      : firingMessage || (banks.some(bank => bankWeapon(bank.index) !== null)
        ? '左键锁定瞄准 · 右键航线 · 空格齐射 · F加速/V减速'
        : '未装备主炮 · 请在船厂配置');
    if (mode === 'battle' || mode === 'yard' || mode === 'prepare') renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  setMode('warzone');
  requestAnimationFrame(frame);
}
start().catch(reason => {
  reportError(`无法载入舰船或启动三维场景：${String(reason)}`);
});
