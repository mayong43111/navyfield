import { readFileSync, writeFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { read3MF, stlBounds } from './model-import.mjs';

const directory = new URL('../resources/models/', import.meta.url);
const dom = new JSDOM();
globalThis.FileReader = dom.window.FileReader;
globalThis.Blob = dom.window.Blob;
const steel = new THREE.MeshStandardMaterial({ color: '#778681', roughness: 0.85, metalness: 0.15 });
steel.name = 'hull-steel';
const wood = new THREE.MeshStandardMaterial({ color: '#c9c2ad', roughness: 0.9 });
wood.name = 'teak-deck';
const red = new THREE.MeshStandardMaterial({ color: '#743b34', roughness: 0.85 });
red.name = 'underwater-hull';

function* triangles(geometry, matrix = new THREE.Matrix4()) {
  const p = geometry.attributes.position, indices = geometry.index.array;
  for (let i = 0; i < indices.length; i += 3) {
    yield [indices[i], indices[i + 1], indices[i + 2]].map(index =>
      new THREE.Vector3().fromBufferAttribute(p, index).applyMatrix4(matrix).toArray());
  }
}

function* stlTriangles(bytes, matrix) {
  const e = matrix.elements;
  for (let offset = 84; offset < bytes.length; offset += 50) {
    const triangle = [];
    for (let vertex = 0; vertex < 3; vertex++) {
      const p = offset + 12 + vertex * 12;
      const x = bytes.readFloatLE(p), y = bytes.readFloatLE(p + 4), z = bytes.readFloatLE(p + 8);
      triangle.push([e[0] * x + e[4] * y + e[8] * z + e[12],
        e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]]);
    }
    yield triangle;
  }
}

function transformTriangles(input, matrix) {
  return input.map(triangle => triangle.map(point => new THREE.Vector3(...point).applyMatrix4(matrix).toArray()));
}

function simplify(input, tolerance) {
  const cells = new Map(), sums = [], counts = [], indices = [], faces = new Set();
  for (const triangle of input) {
    const ids = triangle.map(point => {
      if (point.some(value => !Number.isFinite(value))) throw new Error('Non-finite imported geometry');
      const key = point.map(value => Math.round(value / tolerance)).join(',');
      let index = cells.get(key);
      if (index === undefined) {
        index = counts.length; cells.set(key, index);
        sums.push(0, 0, 0); counts.push(0);
      }
      for (let axis = 0; axis < 3; axis++) sums[index * 3 + axis] += point[axis];
      counts[index]++;
      return index;
    });
    if (new Set(ids).size < 3) continue;
    const key = [...ids].sort((a, b) => a - b).join(',');
    if (faces.has(key)) continue;
    faces.add(key); indices.push(...ids);
  }
  const positions = new Float32Array(sums.length);
  for (let i = 0; i < positions.length; i++) positions[i] = sums[i] / counts[Math.floor(i / 3)];
  const valid = [], a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < indices.length; i += 3) {
    a.fromArray(positions, indices[i] * 3); b.fromArray(positions, indices[i + 1] * 3); c.fromArray(positions, indices[i + 2] * 3);
    if (b.sub(a).cross(c.sub(a)).lengthSq() > 1e-12) valid.push(indices[i], indices[i + 1], indices[i + 2]);
  }
  if (!valid.length) throw new Error('Mesh simplification produced empty geometry');
  const remap = new Map(), compact = [];
  const compactIndices = valid.map(index => {
    let mapped = remap.get(index);
    if (mapped === undefined) {
      mapped = remap.size; remap.set(index, mapped);
      compact.push(positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]);
    }
    return mapped;
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(compact), 3));
  geometry.setIndex(compactIndices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}

function mesh(name, geometry, deck = false, deckHeight = 15) {
  if (!deck) { const object = new THREE.Mesh(geometry, steel); object.name = name; return object; }
  const positions = geometry.attributes.position, original = geometry.index.array;
  const groups = [[], [], []], a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < original.length; i += 3) {
    a.fromBufferAttribute(positions, original[i]);
    b.fromBufferAttribute(positions, original[i + 1]);
    c.fromBufferAttribute(positions, original[i + 2]);
    const y = (a.y + b.y + c.y) / 3;
    const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    groups[y < -0.8 ? 2 : normal.y > 0.75 && y < deckHeight ? 1 : 0].push(original[i], original[i + 1], original[i + 2]);
  }
  geometry.setIndex(groups.flat());
  let start = 0;
  groups.forEach((indices, material) => { geometry.addGroup(start, indices.length, material); start += indices.length; });
  const uv = new Float32Array(positions.count * 2);
  for (let i = 0; i < positions.count; i++) { uv[i * 2] = positions.getX(i); uv[i * 2 + 1] = positions.getZ(i); }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const object = new THREE.Mesh(geometry, [steel, wood, red]); object.name = name;
  return object;
}

function projectedHull(box, length, forward, draft) {
  const scale = length / box.getSize(new THREE.Vector3())[forward];
  const center = box.getCenter(new THREE.Vector3());
  const matrix = forward === 'y'
    ? new THREE.Matrix4().set(scale, 0, 0, -center.x * scale, 0, 0, scale, -draft,
      0, -scale, 0, center.y * scale, 0, 0, 0, 1)
    : new THREE.Matrix4().set(0, scale, 0, -center.y * scale, 0, 0, scale, -draft,
      scale, 0, 0, -center.x * scale, 0, 0, 0, 1);
  return { matrix, scale, hull: { length, beam: box.getSize(new THREE.Vector3())[forward === 'y' ? 'x' : 'y'] * scale,
    height: Math.max(8, box.max.z * scale - draft + 8) } };
}

function tube(geometry, axis, scale) {
  const p = geometry.attributes.position, box = geometry.boundingBox;
  const root = new THREE.Box3(), tip = new THREE.Box3();
  const start = box[axis > 0 ? 'min' : 'max'].y;
  const end = box[axis > 0 ? 'max' : 'min'].y;
  for (let i = 0; i < p.count; i++) {
    const point = new THREE.Vector3().fromBufferAttribute(p, i);
    if (Math.abs(point.y - start) < 0.05) root.expandByPoint(point);
    if (Math.abs(point.y - end) < 0.05) tip.expandByPoint(point);
  }
  if (root.isEmpty() || tip.isEmpty()) throw new Error('Native barrel root or tip missing');
  const origin = root.getCenter(new THREE.Vector3()), muzzle = tip.getCenter(new THREE.Vector3());
  const rotation = new THREE.Quaternion().setFromUnitVectors(muzzle.clone().sub(origin).normalize(), new THREE.Vector3(0, 0, 1));
  if (axis > 0) rotation.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI));
  const matrix = new THREE.Matrix4().compose(new THREE.Vector3(), rotation, new THREE.Vector3(scale, scale, scale))
    .multiply(new THREE.Matrix4().makeTranslation(-origin.x, -origin.y, -origin.z));
  const result = simplify(triangles(geometry, matrix), 0.025);
  return { geometry: result, length: muzzle.distanceTo(origin) * scale, origin };
}

function addTurret(ship, index, mount, rear, body, elevationPosition, tubes, spacing) {
  const group = new THREE.Group(); group.name = `Turret-${index}`;
  group.position.copy(mount); group.rotation.y = rear ? Math.PI : 0;
  const casing = body.clone(); casing.name = 'Body'; group.add(casing);
  const elevation = new THREE.Group(); elevation.name = `Elevation-${index}`;
  elevation.position.copy(elevationPosition); group.add(elevation);
  tubes.forEach((tube, barrelIndex) => {
    const barrel = new THREE.Group(); barrel.name = `Barrel-${index}-${barrelIndex}`;
    barrel.position.x = spacing[barrelIndex];
    barrel.add(mesh('Tube', tube.geometry));
    const muzzle = new THREE.Object3D(); muzzle.name = `Muzzle-${index}-${barrelIndex}`;
    muzzle.position.z = tube.length; barrel.add(muzzle); elevation.add(barrel);
  });
  ship.add(group);
}

function boundedMesh(factory, name, deckHeight = 15) {
  let tolerance = 0.25;
  for (let attempt = 0; attempt < 5; attempt++) {
    const geometry = simplify(factory(), tolerance);
    if (geometry.index.count / 3 <= 170000) return mesh(name, geometry, true, deckHeight);
    geometry.dispose(); tolerance *= 1.4;
  }
  throw new Error(`Native model exceeds runtime triangle budget: ${name}`);
}

async function save(key, ship, hull, counts, rear, funnel) {
  ship.name = 'Ship';
  const smoke = new THREE.Object3D(); smoke.name = 'FunnelSmoke'; smoke.position.copy(funnel); ship.add(smoke);
  ship.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(ship);
  ship.userData.shipModel = { key, hull, maxHeight: bounds.max.y, barrels: counts, rear };
  let count = 0;
  ship.traverse(object => { if (object.isMesh) count += object.geometry.index.count / 3; });
  if (count > 220000) throw new Error(`Runtime model too dense: ${key} (${count})`);
  const binary = await new GLTFExporter().parseAsync(ship, { binary: true });
  if (binary.byteLength > 12 * 1024 * 1024) throw new Error(`Runtime model too large: ${key}`);
  const source = JSON.parse(readFileSync(new URL(`${key}/source.json`, directory), 'utf8'));
  const report = { source: source.source, license: source.license, author: source.author,
    triangles: count, bytes: binary.byteLength, ...ship.userData.shipModel, bounds,
    method: 'Native assembly transforms; position-cell vertex clustering; collapsed/duplicate faces removed; normals regenerated.',
    modifications: key === 'california'
      ? 'Hull/top mating surfaces aligned. Original twin gun housing/tubes scaled to native pads; one original tube duplicated centrally to provide four triple mounts. Unused printing fittings omitted.'
      : key === 'bismarck'
        ? 'Four native turret sections isolated. Original gun tubes re-seated into housings and assigned independent elevation/recoil nodes.'
        : 'Complete CV-5 STL normalized and simplified. No battleship guns or aircraft combat added.' };
  writeFileSync(new URL(`${key}/${key}.glb`, directory), Buffer.from(binary));
  writeFileSync(new URL(`${key}/conversion.json`, directory), JSON.stringify(report, null, 2) + '\n');
  writeFileSync(new URL(`${key}/LICENSE.txt`, directory),
    `${source.title}\nAuthor: ${source.author}\nSource: ${source.source}\nLicense: ${source.license}\n${source.licenseUrl}\n\n${report.modifications}\n${report.method}\nOriginal downloads remain unchanged. Source-page licensing is not a guarantee of upstream third-party rights; see source.json.\n`);
  console.log(JSON.stringify({ key, triangles: count, bytes: binary.byteLength, hull, mounts: counts }));
}

async function bismarck() {
  const parts = read3MF(new URL('bismarck/Bismarck-all.3mf', directory));
  const box = new THREE.Box3();
  parts.filter(part => Number(part.id) >= 41 && Number(part.id) <= 46).forEach(part => box.union(part.box));
  const { matrix, scale, hull } = projectedHull(box, 250.5, 'y', 9);
  const mounts = [
    { y: 143.469, floor: 64.4, roof: 77.7 },
    { y: 211.254, floor: 76.45, roof: 89.8 },
    { y: 604.849, floor: 76.45, roof: 89.8 },
    { y: 672.641, floor: 64.4, roof: 77.7 }
  ];
  const bodyTriangles = mounts.map(() => []), staticTriangles = [];
  for (const part of parts) {
    if (['14', '15', '20', '21'].includes(part.id)) continue;
    for (const triangle of triangles(part.geometry)) {
      const center = triangle.reduce((sum, point) => sum.add(new THREE.Vector3(...point)), new THREE.Vector3()).multiplyScalar(1 / 3);
      const index = mounts.findIndex(mount => Math.abs(center.x - 87.95) < 31 && Math.abs(center.y - mount.y) < 36 && center.z > mount.floor + 0.01);
      if (index >= 0) {
        if (center.z <= mounts[index].roof) bodyTriangles[index].push(triangle);
      } else staticTriangles.push(triangle);
    }
  }
  const ship = new THREE.Group();
  ship.add(boundedMesh(() => transformTriangles(staticTriangles, matrix), 'Hull'));
  for (const [index, mount] of mounts.entries()) {
    const rear = index > 1;
    const position = new THREE.Vector3(87.95, mount.y, mount.floor).applyMatrix4(matrix);
    const local = new THREE.Matrix4().makeRotationY(rear ? -Math.PI : 0)
      .multiply(new THREE.Matrix4().makeTranslation(-position.x, -position.y, -position.z)).multiply(matrix);
    const body = mesh('Body', simplify(transformTriangles(bodyTriangles[index], local), 0.06));
    const native = (rear ? ['14', '15'] : ['20', '21']).map(id => {
      const part = parts.find(part => part.id === id);
      if (!part) throw new Error(`Missing Bismarck tube: ${id}`);
      return tube(part.geometry, rear ? 1 : -1, scale);
    });
    addTurret(ship, index, position, rear, body, new THREE.Vector3(0, 9.5 * scale, 22 * scale),
      native, [-6.78 * scale, 6.78 * scale]);
  }
  await save('bismarck', ship, hull, [2, 2, 2, 2], [false, false, true, true],
    new THREE.Vector3(87.95, 433, 143).applyMatrix4(matrix));
}

function matingBox(part, z) {
  const result = new THREE.Box3(), p = part.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) if (Math.abs(p.getZ(i) - z) < 0.001) result.expandByPoint(new THREE.Vector3().fromBufferAttribute(p, i));
  if (result.isEmpty()) throw new Error('Native California mating surface missing');
  return result;
}

async function california() {
  const hullParts = read3MF(new URL('california/Cal-Hull.3mf', directory));
  const top = read3MF(new URL('california/California-top.3mf', directory));
  const fittings = read3MF(new URL('california/Cal-GMounts-plane-crane.3mf', directory));
  const hullBody = hullParts.find(part => part.id === '7'), topBody = top.find(part => part.id === '396');
  if (!hullBody || !topBody) throw new Error('Native California hull/top missing');
  const a = matingBox(hullBody, hullBody.box.max.z), b = matingBox(topBody, topBody.box.min.z);
  if (a.getSize(new THREE.Vector3()).distanceTo(b.getSize(new THREE.Vector3())) > 0.2) throw new Error('California mating profiles do not match');
  const offset = a.getCenter(new THREE.Vector3()).sub(b.getCenter(new THREE.Vector3()));
  const alignment = new THREE.Matrix4().makeTranslation(offset.x, offset.y, offset.z);
  const { matrix, scale, hull } = projectedHull(hullBody.box, 190.2, 'x', 8);
  const ship = new THREE.Group();
  ship.add(boundedMesh(function* () {
    for (const part of hullParts) yield* triangles(part.geometry, matrix);
    for (const part of top) yield* triangles(part.geometry, matrix.clone().multiply(alignment));
  }, 'Hull'));
  const casing = fittings.find(part => part.id === '5');
  const barrels = ['6', '7'].map(id => fittings.find(part => part.id === id));
  if (!casing || barrels.some(part => !part)) throw new Error('Native California gun fittings missing');
  const factor = 53.692 / casing.box.getSize(new THREE.Vector3()).x;
  const gunScale = scale * factor;
  const base = casing.box.getCenter(new THREE.Vector3()).setZ(casing.box.min.z);
  const local = new THREE.Matrix4().set(gunScale, 0, 0, -base.x * gunScale, 0, 0, gunScale, -base.z * gunScale,
    0, -gunScale, 0, base.y * gunScale, 0, 0, 0, 1);
  const body = mesh('Body', simplify(triangles(casing.geometry, local), 0.05));
  const tubes = barrels.map(part => tube(part.geometry, -1, gunScale));
  const root = tubes[0].origin.clone().add(tubes[1].origin).multiplyScalar(0.5);
  const elevation = root.clone().applyMatrix4(local);
  const spacing = Math.abs(tubes[0].origin.x - tubes[1].origin.x) / 2 * gunScale;
  const mounts = [[553.148, 0.895, 90.531], [485.777, 0.895, 108.685],
    [128.850, 0.895, 93.777], [61.252, 0.895, 75.643]];
  mounts.forEach((point, index) => addTurret(ship, index,
    new THREE.Vector3(...point).add(offset).applyMatrix4(matrix), index > 1, body, elevation,
    [tubes[0], tubes[0], tubes[1]], [-spacing, 0, spacing]));
  await save('california', ship, hull, [3, 3, 3, 3], [false, false, true, true],
    new THREE.Vector3(330, 0.895, 190).add(offset).applyMatrix4(matrix));
}

async function yorktown() {
  const { bytes, box } = stlBounds(new URL('yorktown/Yorktown_All.stl', directory));
  const { matrix, hull, scale } = projectedHull(box, 251, 'x', 9);
  const planes = new Map();
  for (let offset = 84; offset < bytes.length; offset += 50) {
    if (bytes.readFloatLE(offset + 8) < 0.999) continue;
    const x = bytes.readFloatLE(offset + 12), y = bytes.readFloatLE(offset + 16), z = bytes.readFloatLE(offset + 20);
    const bx = bytes.readFloatLE(offset + 24), by = bytes.readFloatLE(offset + 28), bz = bytes.readFloatLE(offset + 32);
    const cx = bytes.readFloatLE(offset + 36), cy = bytes.readFloatLE(offset + 40), cz = bytes.readFloatLE(offset + 44);
    if (Math.abs(z - bz) > 0.01 || Math.abs(z - cz) > 0.01) continue;
    const area = Math.abs((bx - x) * (cy - y) - (cx - x) * (by - y)) / 2;
    const height = Math.round(z * 10) / 10;
    planes.set(height, (planes.get(height) ?? 0) + area);
  }
  const deck = [...planes].sort((a, b) => b[1] - a[1])[0];
  if (!deck || deck[0] * scale <= 9) throw new Error('Yorktown flight deck could not be identified');
  hull.height = deck[0] * scale - 9;
  const ship = new THREE.Group();
  ship.add(boundedMesh(() => stlTriangles(bytes, matrix), 'Hull', hull.height + 0.25));
  await save('yorktown', ship, hull, [], [], new THREE.Vector3(9, 25, 10));
}

try {
  await bismarck();
  await california();
  await yorktown();
} finally {
  dom.window.close();
}
