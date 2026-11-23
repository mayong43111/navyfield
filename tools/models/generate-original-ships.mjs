import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { JSDOM } from 'jsdom';

const root = new URL('../../', import.meta.url);
const targetURL = new URL('content/data/ships/target.json', root);
const generatorPath = 'tools/models/generate-original-ships.mjs';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => `${JSON.stringify(value, null, 2)}\n`;
const approximation = 'Original procedural low-poly interpretation from general historical silhouette facts; not an exact historical reconstruction, game asset extraction, or reproduction of any source artwork.';
const firingOrigin = 'Main TARGET projectile origins are the numerical mount plus lateral barrel offset (z=0), not the physical tube tip. Muzzle markers sit at physical forward tips; gameplay must retain its existing numerical firing formulas. Auxiliary manual and automatic origins are also numeric simulation points, not these cosmetic markers.';

const visualURL = new URL('content/data/ships/original-visuals.json', root);
const visualSource = JSON.parse(readFileSync(visualURL, 'utf8'));
const editableFields = ['key', 'targetId', 'style', 'stern', 'shoulder', 'color', 'bridge', 'funnels',
  'historicalApproximation', 'targetArmament'];
export const originalShipSpecifications = visualSource.ships.map(ship =>
  Object.fromEntries(editableFields.map(field => [field, ship[field]])));
if (visualSource.schemaVersion !== 1 || originalShipSpecifications.length !== 8 ||
  new Set(originalShipSpecifications.map(ship => ship.key)).size !== 8) throw new Error('Invalid original visual source');
const visualInputSha256 = sha256(json(originalShipSpecifications));

function group(parent, name, x = 0, y = 0, z = 0) {
  const node = new THREE.Group();
  node.name = name; node.position.set(x, y, z); parent.add(node);
  return node;
}

function marker(parent, name, x, y, z) {
  const node = new THREE.Object3D();
  node.name = name; node.position.set(x, y, z); parent.add(node);
  return node;
}

function material(name, color, metalness = 0.12) {
  const result = new THREE.MeshStandardMaterial({ color, roughness: 0.86, metalness, flatShading: true });
  result.name = name;
  return result;
}

function mesh(parent, name, geometry, surface, x = 0, y = 0, z = 0) {
  const node = new THREE.Mesh(geometry, surface);
  node.name = name; node.position.set(x, y, z); parent.add(node);
  geometry.computeBoundingBox();
  return node;
}

function box(parent, name, size, surface, position) {
  return mesh(parent, name, new THREE.BoxGeometry(...size), surface, ...position);
}

function cylinder(parent, name, top, bottom, height, surface, position, sides = 8) {
  return mesh(parent, name, new THREE.CylinderGeometry(top, bottom, height, sides), surface, ...position);
}

function rod(parent, name, start, end, radius, surface) {
  const from = new THREE.Vector3(...start), to = new THREE.Vector3(...end), vector = to.clone().sub(from);
  const node = cylinder(parent, name, radius, radius, vector.length(), surface, from.clone().add(to).multiplyScalar(0.5).toArray(), 6);
  node.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vector.normalize());
  return node;
}

function outline(length, beam, specification) {
  const pairs = [[-0.5, specification.stern], [-0.42, 0.72], [-0.28, 1],
    [specification.shoulder, 1], [0.36, 0.78], [0.45, 0.38]];
  return [...pairs.map(([z, width]) => [-width * beam / 2, z * length]), [0, length / 2],
    ...pairs.toReversed().map(([z, width]) => [width * beam / 2, z * length])];
}

function prism(points, lowerY, upperY, lowerWidth = 1, upperWidth = 1, lowerLength = 1, upperLength = 1) {
  const count = points.length, vertices = [], indices = [];
  for (const [height, width, length] of [[lowerY, lowerWidth, lowerLength], [upperY, upperWidth, upperLength]]) {
    for (const [x, z] of points) vertices.push(x * width, height, z * length);
  }
  const caps = THREE.ShapeUtils.triangulateShape(points.map(([x, z]) => new THREE.Vector2(x, z)), []);
  const add = (a, b, c, outward) => {
    const v = [a, b, c].map(i => new THREE.Vector3().fromArray(vertices, i * 3));
    if (v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0])).dot(outward) < 0) [b, c] = [c, b];
    indices.push(a, b, c);
  };
  for (const triangle of caps) {
    add(...triangle, new THREE.Vector3(0, -1, 0));
    add(...triangle.map(i => i + count), new THREE.Vector3(0, 1, 0));
  }
  for (let i = 0; i < count; i++) {
    const next = (i + 1) % count;
    const center = new THREE.Vector3((points[i][0] + points[next][0]) / 2, 0, (points[i][1] + points[next][1]) / 2);
    add(i, next, next + count, center); add(i, next + count, i + count, center);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

function addMast(parent, prefix, beam, deckY, z, height, surfaces, tripod = false, x = 0) {
  cylinder(parent, `${prefix}-Pole`, beam * 0.035, beam * 0.065, height, surfaces.steel, [x, deckY + height / 2, z], 6);
  box(parent, `${prefix}-Yard`, [beam * 0.62, beam * 0.035, beam * 0.035], surfaces.dark, [x, deckY + height * 0.75, z]);
  box(parent, `${prefix}-Radar`, [beam * 0.3, beam * 0.14, beam * 0.045], surfaces.dark, [x, deckY + height * 0.96, z]);
  if (tripod) for (const side of [-1, 1]) rod(parent, `${prefix}-Brace-${side}`,
    [x + side * beam * 0.18, deckY, z - beam * 0.18], [x, deckY + height * 0.72, z], beam * 0.028, surfaces.steel);
}

function addBridge(ship, specification, length, beam, deckY, surfaces) {
  const [zFraction, width, height] = specification.bridge;
  const isCarrier = specification.style === 'ww2-light-carrier';
  const x = isCarrier ? beam * 0.365 : 0, z = zFraction * length;
  const base = group(ship, isCarrier ? 'StarboardIsland' : 'Bridge', x, deckY, z);
  box(base, 'Bridge-Foundation', [beam * width, beam * height * 0.42, length * 0.075], surfaces.steel, [0, beam * height * 0.21, 0]);
  box(base, 'Bridge-Command', [beam * width * 0.84, beam * height * 0.32, length * 0.055], surfaces.steel, [0, beam * height * 0.58, length * 0.008]);
  box(base, 'Bridge-Windows', [beam * width * 0.87, beam * 0.055, beam * 0.055], surfaces.dark, [0, beam * height * 0.68, length * 0.036]);
  box(base, 'Bridge-Roof', [beam * width * 1.05, beam * 0.055, length * 0.057], surfaces.steel, [0, beam * height * 0.76, length * 0.008]);
  if (specification.style === 'german-heavy-cruiser' || specification.style === 'japanese-heavy-cruiser') {
    cylinder(base, 'Command-Tower', beam * width * 0.27, beam * width * 0.34, beam * height * 0.28,
      surfaces.steel, [0, beam * height * 0.87, -length * 0.007], specification.style.startsWith('german') ? 10 : 6);
    box(base, 'Bridge-Rangefinder', [beam * 0.64, beam * 0.1, beam * 0.12], surfaces.steel, [0, beam * height, 0]);
  }
  if (specification.style === 'us-prewar-cruiser') {
    box(base, 'Prewar-Upper-Bridge', [beam * 0.28, beam * 0.2, length * 0.042], surfaces.steel, [0, beam * height * 0.93, 0]);
  }
  addMast(ship, 'Foremast', beam, deckY + beam * height * 0.7, z - length * 0.025,
    beam * (isCarrier ? 0.9 : 1.18), surfaces, specification.style.startsWith('us-'), x);
  if (specification.style.includes('cruiser')) addMast(ship, 'Aftmast', beam, deckY, -length * 0.39, beam * 1.0, surfaces);
}

function addFunnels(ship, specification, length, beam, deckY, surfaces) {
  const carrier = specification.style === 'ww2-light-carrier';
  const funnels = carrier ? [[0.015, 0.33, 0.12], [-0.035, 0.3, 0.12], [-0.085, 0.27, 0.12], [-0.135, 0.24, 0.12]] : specification.funnels;
  let smoke;
  funnels.forEach(([z, height, width], index) => {
    const x = carrier ? beam * 0.44 : 0;
    const funnel = group(ship, `Funnel-${index}`, x, deckY + beam * 0.14, z * length);
    if (specification.style.startsWith('japanese')) funnel.rotation.x = -0.14;
    cylinder(funnel, `Funnel-${index}-Body`, beam * width * 0.44, beam * width * 0.5, beam * height,
      surfaces.steel, [0, beam * height / 2, 0], 8);
    cylinder(funnel, `Funnel-${index}-Cap`, beam * width * 0.46, beam * width * 0.46, beam * 0.05,
      surfaces.dark, [0, beam * height, 0], 8);
    if (index === 0) smoke = marker(ship, 'FunnelSmoke', x, deckY + beam * (0.17 + height), z * length);
  });
  return smoke;
}

function addDeckDetails(ship, specification, length, beam, deckY, surfaces) {
  const carrier = specification.style === 'ww2-light-carrier';
  if (carrier) {
    const points = [[-beam * 0.44, -length * 0.46], [-beam * 0.47, -length * 0.4], [-beam * 0.47, length * 0.4],
      [-beam * 0.42, length * 0.47], [beam * 0.42, length * 0.47], [beam * 0.47, length * 0.4],
      [beam * 0.47, -length * 0.4], [beam * 0.44, -length * 0.46]];
    box(ship, 'Hangar', [beam * 0.72, beam * 0.27, length * 0.76], surfaces.steel, [0, deckY + beam * 0.135, 0]);
    const flightY = deckY + beam * 0.33;
    mesh(ship, 'FlightDeck', prism(points, flightY - beam * 0.06, flightY), surfaces.flight);
    for (let i = 0; i < 13; i++) box(ship, `Deck-Centerline-${i}`, [beam * 0.025, beam * 0.005, length * 0.028],
      surfaces.marking, [-beam * 0.09, flightY + beam * 0.004, length * (-0.37 + i * 0.06)]);
    for (const z of [-0.22, 0.26]) box(ship, `Elevator-${z}`, [beam * 0.48, beam * 0.005, length * 0.065],
      surfaces.dark, [-beam * 0.06, flightY + beam * 0.002, length * z]);
    for (let i = 0; i < 4; i++) box(ship, `ArrestingWire-${i}`, [beam * 0.73, beam * 0.008, beam * 0.018],
      surfaces.dark, [-beam * 0.04, flightY + beam * 0.008, length * (-0.36 + i * 0.017)]);
    for (const side of [-1, 1]) for (const z of [-0.39, 0.37]) rod(ship, `FlightDeck-Support-${side}-${z}`,
      [side * beam * 0.31, deckY, z * length], [side * beam * 0.44, flightY - beam * 0.04, z * length], beam * 0.045, surfaces.steel);
    marker(ship, 'AircraftLaunch', -beam * 0.09, flightY + beam * 0.12, length * 0.39);
    marker(ship, 'AircraftRecovery', -beam * 0.09, flightY + beam * 0.12, -length * 0.32);
    return flightY;
  }
  const forecastle = outline(length, beam * 0.79, specification).filter(([, z]) => z >= length * 0.18);
  mesh(ship, 'Forecastle', prism(forecastle, deckY, deckY + beam * 0.1), surfaces.deck);
  box(ship, 'AftDeckhouse', [beam * (specification.style.includes('cruiser') ? 0.49 : 0.4), beam * 0.19, length * 0.065],
    surfaces.steel, [0, deckY + beam * 0.095, -length * 0.395]);
  for (const side of [-1, 1]) {
    const boat = cylinder(ship, `Lifeboat-${side}`, beam * 0.055, beam * 0.055, length * 0.045,
      surfaces.deck, [side * beam * 0.32, deckY + beam * 0.17, length * 0.06], 6);
    boat.rotation.x = Math.PI / 2; boat.scale.x = 1.5;
    box(ship, `Anchor-${side}`, [beam * 0.055, beam * 0.12, beam * 0.025], surfaces.dark,
      [side * beam * 0.14, deckY - beam * 0.13, length * 0.46]);
  }
  if (specification.style === 'us-prewar-cruiser' || specification.style === 'japanese-heavy-cruiser') {
    box(ship, 'Aviation-Handling-Deck', [beam * 0.5, beam * 0.05, length * 0.075], surfaces.deck, [0, deckY + beam * 0.22, -length * 0.39]);
    rod(ship, 'Aviation-Crane', [beam * 0.26, deckY, -length * 0.38], [beam * 0.26, deckY + beam * 0.6, -length * 0.38], beam * 0.04, surfaces.steel);
    rod(ship, 'Aviation-Crane-Arm', [beam * 0.26, deckY + beam * 0.6, -length * 0.38], [0, deckY + beam * 0.6, -length * 0.44], beam * 0.03, surfaces.steel);
  }
  return deckY;
}

function addGunRig(ship, index, count, rear, target, surfaces) {
  const beam = target.beam_u, length = target.length_u;
  const turret = group(ship, `Turret-${index}`, 0, beam, length * (0.5 - (index + 1) / (target.main_mounts + 1)));
  turret.rotation.y = rear ? Math.PI : 0;
  cylinder(turret, `Main-Pedestal-${index}`, beam * 0.18, beam * 0.21, beam * 0.18, surfaces.steel, [0, -beam * 0.2, 0]);
  box(turret, `Main-Casing-${index}`, [beam * 0.39, beam * 0.19, beam * 0.38], surfaces.steel, [0, -beam * 0.015, -beam * 0.015]);
  const elevation = group(turret, `Elevation-${index}`);
  const tubeLength = beam * (target.class === 'DD' ? 0.54 : 0.65), barrels = [], muzzles = [];
  for (let j = 0; j < count; j++) {
    const barrel = group(elevation, `Barrel-${index}-${j}`, j - (count - 1) / 2, 0, 0);
    const tube = cylinder(barrel, `Main-Tube-${index}-${j}`, beam * 0.025, beam * 0.034, tubeLength, surfaces.dark, [0, 0, tubeLength / 2]);
    tube.rotation.x = Math.PI / 2;
    marker(barrel, `Muzzle-${index}-${j}`, 0, 0, tubeLength);
    barrels.push(barrel.name); muzzles.push(`Muzzle-${index}-${j}`);
  }
  return { index, node: turret.name, pivot: elevation.name, barrelNodes: barrels, muzzleNames: muzzles,
    position: turret.position.toArray(), baseYaw: rear ? Math.PI : 0, recoilAxis: 'local +Z; translate barrel local Z negatively from zero' };
}

function addAuxiliaryMount(parent, controlId, index, count, weapon, pose, beam, surfaces) {
  const mount = group(parent, `Mount-${controlId}-${index}`, ...pose.position);
  mount.rotation.y = pose.baseYaw;
  const pivot = group(mount, `Pivot-${controlId}-${index}`);
  const torpedo = weapon.kind === 'torpedo';
  cylinder(mount, `Aux-Pedestal-${controlId}-${index}`, beam * 0.09, beam * 0.12, beam * 0.08, surfaces.steel, [0, -beam * 0.045, 0]);
  if (!torpedo) box(pivot, `Aux-Shield-${controlId}-${index}`, [beam * 0.22, beam * 0.1, beam * 0.16], surfaces.steel, [0, beam * 0.015, 0]);
  else box(pivot, `Torpedo-Tray-${controlId}-${index}`, [beam * 0.46, beam * 0.055, beam * 0.39], surfaces.steel, [0, -beam * 0.025, beam * 0.11]);
  const barrelNodes = [], muzzleNames = [], tubeLength = beam * (torpedo ? 0.57 : 0.24);
  for (let j = 0; j < count; j++) {
    const barrel = group(pivot, `WeaponBarrel-${controlId}-${index}-${j}`, (j - (count - 1) / 2) * beam * (torpedo ? 0.105 : 0.045), 0, 0);
    const tube = cylinder(barrel, `Aux-Tube-${controlId}-${index}-${j}`, beam * (torpedo ? 0.04 : 0.012), beam * (torpedo ? 0.045 : 0.017),
      tubeLength, surfaces.dark, [0, 0, tubeLength / 2], 6);
    tube.rotation.x = Math.PI / 2;
    const name = `WeaponMuzzle-${controlId}-${index}-${j}`;
    marker(barrel, name, 0, 0, tubeLength); barrelNodes.push(barrel.name); muzzleNames.push(name);
  }
  return { index, node: mount.name, pivot: pivot.name, barrelNodes, muzzleNames, position: pose.position,
    baseYaw: pose.baseYaw, recoilAxis: 'local +Z; translate WeaponBarrel local Z negatively from zero' };
}

function addDecorativeTorpedoes(ship, length, beam, deckY, surfaces) {
  for (const [index, z] of [0.33, -0.065, -0.365].entries()) {
    const bank = group(ship, `DecorativeTorpedoBank-${index}`, 0, deckY + beam * 0.17, length * z);
    bank.userData = { decorativeOnly: true, historicalTubeCount: 5, note: 'Silhouette detail; no TARGET torpedo weapon/control for scout_dd.' };
    box(bank, `Decorative-Tray-${index}`, [beam * 0.6, beam * 0.07, beam * 0.58], surfaces.steel, [0, -beam * 0.03, 0]);
    for (let tube = 0; tube < 5; tube++) {
      const node = cylinder(bank, `Decorative-Tube-${index}-${tube}`, beam * 0.046, beam * 0.046, beam * 0.6,
        surfaces.dark, [(tube - 2) * beam * 0.115, beam * 0.04, 0], 6);
      node.rotation.x = Math.PI / 2;
    }
  }
}

export function buildOriginalShip(specification, content) {
  const target = content.ships[specification.targetId];
  if (!target) throw new Error(`Missing TARGET ship ${specification.targetId}`);
  const length = target.length_u, beam = target.beam_u, deckY = beam * 0.72;
  const ship = new THREE.Group(); ship.name = 'Ship';
  const surfaces = { steel: material('original-hull-steel', specification.color), deck: material('original-flat-deck', '#afa997', 0),
    dark: material('original-dark-fittings', '#303a3b'), red: material('original-underwater-hull', '#74453c', 0),
    flight: material('original-flight-deck', '#51585a', 0), marking: material('original-deck-markings', '#c8c3ac', 0) };
  const points = outline(length, beam, specification), hull = group(ship, 'Hull');
  mesh(hull, 'UnderwaterHull', prism(points, -beam * 0.28, 0, 0.64, 0.94, 0.94, 1), surfaces.red);
  mesh(hull, 'Freeboard', prism(points, 0, deckY, 0.94, 1), surfaces.steel);
  mesh(ship, 'Waterline', prism(points, 0, beam * 0.035, 0.9402, 0.9431), surfaces.dark);
  mesh(ship, 'Deck', prism(points, deckY, deckY + beam * 0.016), surfaces.deck);
  const upperDeckY = addDeckDetails(ship, specification, length, beam, deckY, surfaces);
  addBridge(ship, specification, length, beam, upperDeckY, surfaces);
  addFunnels(ship, specification, length, beam, upperDeckY, surfaces);
  if (specification.key === 'shimakaze') addDecorativeTorpedoes(ship, length, beam, deckY, surfaces);
  if (specification.key === 'mogami') for (const [side, z] of [[-1, 1 / 6], [1, -1 / 6]]) {
    box(ship, `TorpedoBay-${side}-Roof`, [beam * 0.3, beam * 0.05, length * 0.06], surfaces.steel, [side * beam * 0.34, beam * 1.12, length * z]);
    box(ship, `TorpedoBay-${side}-Bulkhead`, [beam * 0.025, beam * 0.3, length * 0.055], surfaces.dark, [side * beam * 0.23, beam * 0.94, length * z]);
  }
  const groups = [], main = content.weapons[target.main_weapon_id], mainControl = content.controls[`${target.id}:main`];
  const gunMain = main.kind === 'gun';
  const barrels = gunMain ? Array(target.main_mounts).fill(target.main_barrels) : [];
  const rear = barrels.map((_, i) => i >= Math.ceil(target.main_mounts / 2));
  const mainMounts = barrels.map((count, i) => addGunRig(ship, i, count, rear[i], target, surfaces));
  groups.push({ slot: 'main', controlId: mainControl.id, weaponId: main.id, control: mainControl.control, kind: main.kind,
    availableModes: mainControl.available_modes.split('|'), groupNode: 'Ship', bankId: null,
    targetMounts: target.main_mounts, targetBarrels: target.main_barrels, mounts: mainMounts,
    ...(gunMain ? {} : { aircraftLaunch: 'AircraftLaunch', aircraftRecovery: 'AircraftRecovery', note: 'Aircraft squadron counts are not visual gun barrels.' }) });
  const roots = new Map(), offsets = new Map();
  const controlGroup = controlId => {
    if (!roots.has(controlId)) roots.set(controlId, group(ship, `WeaponGroup-${controlId}`));
    return roots.get(controlId);
  };
  const secondary = content.controls[`${target.id}:secondary`];
  if (target.secondary_weapon_id && secondary && secondary.control !== 'automatic') {
    const weapon = content.weapons[target.secondary_weapon_id], parent = controlGroup(secondary.id), mounts = [];
    for (let i = 0; i < target.secondary_mounts; i++) {
      const side = specification.key === 'mogami' ? (i === 0 ? -1 : 1) : 0;
      mounts.push(addAuxiliaryMount(parent, secondary.id, i, target.secondary_barrels, weapon,
        { position: [side * beam * 0.37, beam, length * (0.5 - (i + 1) / (target.secondary_mounts + 1))], baseYaw: side ? side * Math.PI / 2 : 0 }, beam, surfaces));
    }
    offsets.set(secondary.id, target.secondary_mounts);
    groups.push({ slot: 'secondary', controlId: secondary.id, weaponId: weapon.id, control: secondary.control, kind: weapon.kind,
      availableModes: secondary.available_modes.split('|'), bankId: null, groupNode: parent.name,
      targetMounts: target.secondary_mounts, targetBarrels: target.secondary_barrels, mounts });
  }
  const banks = Object.values(content.automation).filter(bank => bank.ship_id === target.id);
  for (const bank of banks) {
    const slot = bank.role === 'aa' ? 'light_aa' : 'secondary', controlId = `${target.id}:${slot}`;
    const control = content.controls[controlId], weapon = content.weapons[bank.weapon_id], parent = controlGroup(controlId);
    if (control?.control !== 'automatic') throw new Error(`Automation control mismatch ${bank.id}`);
    const offset = offsets.get(controlId) ?? 0, mounts = [], baseYaw = bank.bearing_deg * Math.PI / 180;
    for (let i = 0; i < bank.mounts; i++) {
      const index = offset + i;
      const side = bank.role === 'surface' ? (bank.bearing_deg === 270 ? -1 : 1) : (index % 2 ? 1 : -1);
      const z = bank.role === 'surface' ? length * (bank.mounts === 1 ? -0.26 : 0.19 - i * 0.38)
        : length * (-0.37 + ((index * 3 + 1) % 9) * 0.082);
      const y = specification.key === 'independence' ? upperDeckY - beam * 0.045 : deckY + beam * 0.12;
      mounts.push(addAuxiliaryMount(parent, controlId, index, bank.barrels, weapon,
        { position: [side * beam * 0.4, y, z], baseYaw }, beam, surfaces));
    }
    offsets.set(controlId, offset + bank.mounts);
    groups.push({ slot, controlId, weaponId: weapon.id, control: control.control, kind: weapon.kind,
      availableModes: control.available_modes.split('|'), bankId: bank.id, groupNode: parent.name,
      role: bank.role, bearingDeg: bank.bearing_deg, arcDeg: bank.arc_deg,
      targetMounts: bank.mounts, targetBarrels: bank.barrels, mounts });
  }
  const loadedName = name => THREE.PropertyBinding.sanitizeNodeName(name);
  for (const entry of groups) {
    entry.loadedGroupNode = loadedName(entry.groupNode);
    for (const mount of entry.mounts) {
      mount.loadedNode = loadedName(mount.node); mount.loadedPivot = loadedName(mount.pivot);
      mount.loadedBarrelNodes = mount.barrelNodes.map(loadedName); mount.loadedMuzzleNames = mount.muzzleNames.map(loadedName);
    }
  }
  ship.updateMatrixWorld(true);
  ship.userData.shipModel = { key: specification.key, hull: { length, beam, height: beam },
    maxHeight: new THREE.Box3().setFromObject(ship).max.y, barrels, rear };
  ship.userData.visualWeaponGroups = groups;
  ship.userData.originalGeometry = { author: 'navyfield project contributors', license: 'CC-BY-4.0', generator: generatorPath,
    targetId: target.id, historicalApproximation: specification.historicalApproximation, targetArmament: specification.targetArmament,
    numericFiringOriginNote: firingOrigin,
    naming: 'GLB node names retain controlId colons; Three GLTFLoader sanitizes colons. Use loadedNode/loadedPivot/loadedMuzzleNames after loading (or userData.name for original names).',
    aiming: 'Forward is local +Z, up is +Y. Main Turret yaw is absolute ship-local yaw; Elevation rotation.x = -elevation. Auxiliary Mount stores rest baseYaw; animate Mount to absolute ship-local yaw and Pivot.rotation.x = -elevation. Rear/rest bank yaw must not be added twice. Recoil translates barrel local Z negatively from zero; never translate the pivot or muzzle independently.' };
  return ship;
}

export function geometryManifest(ship) {
  const meshes = []; let triangles = 0;
  ship.updateMatrixWorld(true);
  ship.traverse(node => {
    if (!node.isMesh) return;
    const geometry = node.geometry, position = geometry.attributes.position;
    const indices = geometry.index ? [...geometry.index.array] : Array.from({ length: position.count }, (_, i) => i);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    if (!position || [...position.array].some(value => !Number.isFinite(value))) throw new Error(`Non-finite geometry: ${node.name}`);
    for (let i = 0; i < indices.length; i += 3) {
      a.fromBufferAttribute(position, indices[i]); b.fromBufferAttribute(position, indices[i + 1]); c.fromBufferAttribute(position, indices[i + 2]);
      if (b.sub(a).cross(c.sub(a)).lengthSq() <= 1e-12) throw new Error(`Degenerate triangle: ${node.name}/${i / 3}`);
    }
    const count = indices.length / 3; triangles += count;
    meshes.push({ name: node.name, triangles: count, vertices: position.count,
      positionSha256: sha256(Buffer.from(position.array.buffer, position.array.byteOffset, position.array.byteLength)),
      indexSha256: sha256(json(indices)), transform: node.matrixWorld.elements.map(n => Number(n.toFixed(9))),
      material: node.material.name, color: node.material.color.getHexString() });
  });
  return { triangles, meshCount: meshes.length, geometrySha256: sha256(json(meshes)), meshes };
}

export async function exportOriginalShip(ship) {
  const dom = new JSDOM(), saved = { FileReader: globalThis.FileReader, Blob: globalThis.Blob };
  globalThis.FileReader = dom.window.FileReader; globalThis.Blob = dom.window.Blob;
  try {
    return Buffer.from(await new GLTFExporter().parseAsync(ship, { binary: true, onlyVisible: true, trs: true }));
  } finally {
    if (saved.FileReader === undefined) delete globalThis.FileReader; else globalThis.FileReader = saved.FileReader;
    if (saved.Blob === undefined) delete globalThis.Blob; else globalThis.Blob = saved.Blob;
    dom.window.close();
  }
}

const licenseText = `Original procedural geometry — navyfield project contributors\n\nCopyright navyfield project contributors.\nThis newly generated original geometry and its procedural design are licensed\nunder Creative Commons Attribution 4.0 International (SPDX: CC-BY-4.0).\nLicense: https://creativecommons.org/licenses/by/4.0/\nLegal terms: https://creativecommons.org/licenses/by/4.0/legalcode\n\nYou may share and adapt this geometry, including commercially, subject to the\nlicense terms. Give appropriate credit to 'navyfield project contributors',\nprovide a link to the license, and indicate if changes were made. No endorsement\nis implied. No additional restrictions may be imposed contrary to the license.\n\nSuggested attribution: Original low-poly ship interpretation by navyfield project\ncontributors, generated with tools/models/generate-original-ships.mjs, CC-BY-4.0.\n\nThese are original non-exact interpretations based only on general historical\nsilhouette facts and TARGET ship names. They are not historical reconstructions.\nNo third-party/game meshes, textures, source artwork, or scans were downloaded,\ncopied, traced, converted or embedded. Materials are untextured original colors.\nTARGET armament and scale differ from historical vessels; see source.json.\n\nThis license does NOT relicense Three.js, GLTFExporter, jsdom, Node.js, or other\nthird-party tools; each retains its own license. Generator provenance and\ngeometry/GLB digests are retained in source.json and conversion.json.\n`;

export async function generateOriginalShips({ verify = false } = {}) {
  const input = readFileSync(targetURL), content = JSON.parse(input), generatorSha256 = sha256(readFileSync(new URL(generatorPath, root)));
  const specs = [];
  const persist = (url, bytes) => {
    const result = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    if (verify) {
      let current;
      try { current = readFileSync(url); } catch { throw new Error(`Missing generated file: ${fileURLToPath(url)}`); }
      if (!current.equals(result)) throw new Error(`Generated output differs: ${fileURLToPath(url)}; run generator without --verify.`);
    } else { mkdirSync(new URL('./', url), { recursive: true }); writeFileSync(url, result); }
  };
  for (const specification of originalShipSpecifications) {
    const ship = buildOriginalShip(specification, content), geometry = geometryManifest(ship), bytes = await exportOriginalShip(ship);
    const assetPath = `content/assets/ships/${specification.key}/`, bounds = new THREE.Box3().setFromObject(ship);
    const glbSha256 = sha256(bytes);
    const source = { schemaVersion: 1, title: `${content.ships[specification.targetId].name} — original low-poly interpretation`,
      key: specification.key, targetId: specification.targetId, author: 'navyfield project contributors', status: 'original-procedural',
      license: 'CC-BY-4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', runtimeFile: `${specification.key}.glb`,
      generator: generatorPath, generatorSha256, visualInput: 'content/data/ships/original-visuals.json', visualInputSha256,
      targetInput: 'content/data/ships/target.json', targetInputSha256: sha256(input),
      historicalApproximation: specification.historicalApproximation, targetArmament: specification.targetArmament,
      references: ['TARGET ship name and general public historical facts about nationality, class, hull, bridge, funnel and armament silhouettes; no source artwork reconstructed.'],
      externalMeshes: [], externalTextures: [], downloadedFiles: [], glbSha256, geometrySha256: geometry.geometrySha256,
      numericFiringOriginNote: firingOrigin };
    const conversion = { schemaVersion: 1, method: 'Original deterministic procedural construction using Three primitives and authored polygon hulls; GLTFExporter binary glTF 2.0; no imported geometry or textures.',
      generator: generatorPath, generatorSha256, visualInputSha256, targetInputSha256: sha256(input), ...ship.userData.shipModel,
      bytes: bytes.length, glbSha256, bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
      ...geometry, visualWeaponGroups: ship.userData.visualWeaponGroups, animationConventions: ship.userData.originalGeometry.aiming,
      numericFiringOriginNote: firingOrigin, naming: ship.userData.originalGeometry.naming };
    persist(new URL(`${assetPath}${specification.key}.glb`, root), bytes);
    persist(new URL(`${assetPath}source.json`, root), json(source));
    persist(new URL(`${assetPath}conversion.json`, root), json(conversion));
    persist(new URL(`${assetPath}LICENSE.txt`, root), licenseText);
    specs.push({ ...specification, hull: ship.userData.shipModel.hull, runtimeFile: `${assetPath}${specification.key}.glb`,
      license: 'CC-BY-4.0', glbSha256, geometrySha256: geometry.geometrySha256,
      mainContract: ship.userData.shipModel, visualWeaponGroups: ship.userData.visualWeaponGroups });
    console.log(`${verify ? 'Verified' : 'Generated'} ${specification.key}: ${geometry.triangles} triangles, ${bytes.length} bytes`);
  }
  persist(new URL('content/data/ships/original-visuals.json', root), json({ schemaVersion: 1, generator: generatorPath,
    generatorSha256, visualInputSha256, editableFields, targetInputSha256: sha256(input), author: 'navyfield project contributors', license: 'CC-BY-4.0',
    historicalApproximation: approximation, numericFiringOriginNote: firingOrigin,
    groupSchema: { location: 'Ship.userData.visualWeaponGroups (separate from unchanged Ship.userData.shipModel)',
      grouping: 'One entry per manual group or actual automatic bank; automatic banks sharing a controlId share WeaponGroup-<controlId> and use globally unique mount indices within that control. Main uses the mandatory Turret/Elevation/Barrel/Muzzle hierarchy.',
      names: 'GLB names contain original controlId colons. Three GLTFLoader sanitizes them; use the recorded loaded* names after loading. Auxiliary roots are named WeaponGroup-<controlId>, containing Mount-<controlId>-<index> -> Pivot-<controlId>-<index> -> WeaponBarrel-<controlId>-<index>-<barrel> -> WeaponMuzzle-<controlId>-<index>-<barrel>.',
      aircraft: 'Main aircraft entry has target counts but mounts=[]; distinct AircraftLaunch/AircraftRecovery local points replace visual gun mounts.',
      angles: 'Radians; +Z forward; Mount absolute local yaw, Pivot.rotation.x=-elevation. baseYaw is rest orientation, not an extra angle to add to simulation absolute yaw.',
      recoil: 'Each barrel group starts at local z=0. Apply recoil as negative local Z, restore to zero. Muzzle is a physical-tip child; it is not a numerical firing origin.' },
    ships: specs }));
  return specs;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--verify')) throw new Error('Usage: node tools/models/generate-original-ships.mjs [--verify]');
  await generateOriginalShips({ verify: args.includes('--verify') });
}
