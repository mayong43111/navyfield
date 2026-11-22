import { readFileSync, writeFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import * as THREE from 'three';
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { unzipSync } from 'three/addons/libs/fflate.module.js';

const dom = new JSDOM();
globalThis.DOMParser = dom.window.DOMParser;
globalThis.FileReader = dom.window.FileReader;
globalThis.Blob = dom.window.Blob;
const directory = new URL('../resources/models/yamato/', import.meta.url);
const source = JSON.parse(readFileSync(new URL('source.json', directory), 'utf8'));
const archive = unzipSync(readFileSync(new URL('3MF_files.zip', directory)));
const loader = new ThreeMFLoader();

function loadPart(name) {
  const bytes = archive[`3MF files/Yamato_${name} 1-250 scale.3mf`];
  if (!bytes) throw new Error(`Missing original 3MF: ${name}`);
  const root = loader.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  root.updateMatrixWorld(true);
  const parts = [];
  root.traverse(object => {
    if (!object.isMesh) return;
    const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
    geometry.computeVertexNormals();
    geometry.applyMatrix4(object.matrixWorld);
    geometry.deleteAttribute('color');
    geometry.computeBoundingBox();
    parts.push({ geometry, box: geometry.boundingBox.clone() });
  });
  if (!parts.length) throw new Error(`No meshes imported from ${name}`);
  return parts;
}

const hull = loadPart('Hull-full-A');
const hullBody = hull.reduce((a, b) =>
  a.geometry.attributes.position.count > b.geometry.attributes.position.count ? a : b);
const hullSize = hullBody.box.getSize(new THREE.Vector3());
const hullCenter = hullBody.box.getCenter(new THREE.Vector3());
const scale = 263 / hullSize.x;
const projection = new THREE.Matrix4().set(
  0, -scale, 0, hullCenter.y * scale,
  0, 0, scale, -10.8,
  -scale, 0, 0, hullCenter.x * scale,
  0, 0, 0, 1
);
const localProjection = projection.clone().setPosition(0, 0, 0);
const project = point => point.clone().applyMatrix4(projection);
const translate = point => new THREE.Matrix4().makeTranslation(-point.x, -point.y, -point.z);
const identity = new THREE.Matrix4();

function material(name, color) {
  const result = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.15 });
  result.name = name;
  return result;
}
const steel = material('hull-steel', '#778681');
const roof = material('roof-steel', '#99a49c');
const wood = material('teak-deck', '#c9c2ad');
const red = material('underwater-hull', '#743b34');
const dark = material('auxiliary-barrels', '#26343a');

function triangles(geometry) {
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  if (!normals || normals.count !== positions.count || positions.count % 3) {
    throw new Error('Invalid imported mesh attributes');
  }
  const result = [];
  for (let index = 0; index < positions.count; index += 3) {
    const triangle = [];
    for (let offset = 0; offset < 3; offset++) {
      triangle.push({
        position: new THREE.Vector3().fromBufferAttribute(positions, index + offset),
        normal: new THREE.Vector3().fromBufferAttribute(normals, index + offset)
      });
    }
    const area = triangle[1].position.clone().sub(triangle[0].position)
      .cross(triangle[2].position.clone().sub(triangle[0].position)).lengthSq();
    if (area < 1e-12) continue;
    result.push(triangle);
  }
  return result;
}

function geometryFrom(tris) {
  const positions = [];
  const normals = [];
  for (const tri of tris) {
    for (const vertex of tri) {
      positions.push(...vertex.position.toArray());
      normals.push(...vertex.normal.toArray());
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return geometry;
}

function section(name, parts, matrix, chooseMaterial) {
  const batches = new Map();
  for (const { geometry } of parts) {
    for (const tri of triangles(geometry)) {
      const center = tri.reduce((sum, vertex) => sum.add(vertex.position), new THREE.Vector3()).divideScalar(3);
      const normal = tri[1].position.clone().sub(tri[0].position)
        .cross(tri[2].position.clone().sub(tri[0].position)).normalize();
      const selected = chooseMaterial(center, normal);
      if (!batches.has(selected)) batches.set(selected, []);
      batches.get(selected).push(tri);
    }
  }
  const root = new THREE.Group();
  root.name = name;
  for (const [selected, tris] of batches) {
    const geometry = geometryFrom(tris);
    geometry.applyMatrix4(matrix);
    const positions = geometry.getAttribute('position');
    const uv = [];
    for (let index = 0; index < positions.count; index++) uv.push(positions.getX(index), positions.getZ(index));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const indexed = mergeVertices(geometry);
    geometry.dispose();
    const mesh = new THREE.Mesh(indexed, selected);
    mesh.name = `${name}-${selected.name}`;
    root.add(mesh);
  }
  if (!root.children.length) throw new Error(`Empty converted section: ${name}`);
  return root;
}

const ship = new THREE.Group();
ship.name = 'Yamato';
ship.userData.source = {
  title: source.title, author: source.author, url: source.source,
  license: source.license, licenseUrl: source.licenseUrl, credits: source.credits
};
ship.add(section('Hull', hull.filter(part => part.box.getSize(new THREE.Vector3()).length() > 1), projection,
  point => point.z * scale < 10.8 ? red : steel));
const deck = loadPart('deck-full').filter(part => part.box.min.z > 60);
ship.add(section('Deck', deck, projection,
  (point, normal) => normal.z > 0.65 ? point.z < 72 ? wood : roof : steel));

// Remove the supplied print-layout lateral offset, keeping the original mesh coordinates.
const superstructure = loadPart('SStructureA').filter(part => part.box.min.z > 60);
const superstructureOffset = new THREE.Vector3(0, 47.0668, 0);
ship.add(section('Superstructure', superstructure,
  projection.clone().multiply(translate(superstructureOffset)), (_, normal) => normal.z > 0.65 ? roof : steel));
const funnelVertices = superstructure.flatMap(part => {
  const positions = part.geometry.getAttribute('position');
  const result = [];
  for (let index = 0; index < positions.count; index++) {
    const point = new THREE.Vector3().fromBufferAttribute(positions, index);
    if (point.x > 260 && point.x < 340 && Math.abs(point.y - superstructureOffset.y) < 20) result.push(point);
  }
  return result;
});
if (!funnelVertices.length) throw new Error('Cannot identify the original funnel');
const funnelTop = Math.max(...funnelVertices.map(point => point.z));
const funnelBox = new THREE.Box3().setFromPoints(funnelVertices.filter(point => point.z > funnelTop - 1));
const funnel = new THREE.Object3D();
funnel.name = 'FunnelSmoke';
funnel.position.copy(project(funnelBox.getCenter(new THREE.Vector3()).setZ(funnelTop + 1).sub(superstructureOffset)));
ship.add(funnel);
const rearDeck = loadPart('Rear Mid Deck').filter(part => part.box.max.z > 50);
const rearBody = rearDeck.reduce((a, b) =>
  a.geometry.attributes.position.count > b.geometry.attributes.position.count ? a : b);
const rearOffset = new THREE.Vector3(0, rearBody.box.getCenter(new THREE.Vector3()).y - hullCenter.y, 0);
ship.add(section('RearDeck', rearDeck, projection.clone().multiply(translate(rearOffset)),
  (_, normal) => normal.z > 0.65 ? wood : steel));

function clip(triangle, x, front) {
  const polygon = [];
  for (let index = 0; index < triangle.length; index++) {
    const a = triangle[index];
    const b = triangle[(index + 1) % triangle.length];
    const insideA = front ? a.position.x <= x : a.position.x >= x;
    const insideB = front ? b.position.x <= x : b.position.x >= x;
    if (insideA) polygon.push(a);
    if (insideA !== insideB) {
      const fraction = (x - a.position.x) / (b.position.x - a.position.x);
      polygon.push({
        position: a.position.clone().lerp(b.position, fraction),
        normal: a.normal.clone().lerp(b.normal, fraction).normalize()
      });
    }
  }
  const result = [];
  for (let index = 1; index < polygon.length - 1; index++) {
    result.push([polygon[0], polygon[index], polygon[index + 1]]);
  }
  return result;
}

const gun = loadPart('18in guns')[0];
const gunTriangles = triangles(gun.geometry);
const gunBaseBox = new THREE.Box3();
const muzzleBoxes = [];
const muzzleVertices = gunTriangles.flat().filter(vertex => vertex.position.x < gun.box.min.x + 0.002)
  .sort((a, b) => a.position.y - b.position.y);
for (const vertex of muzzleVertices) {
  let box = muzzleBoxes.at(-1);
  if (!box || vertex.position.y - box.max.y > 3) {
    box = new THREE.Box3();
    muzzleBoxes.push(box);
  }
  box.expandByPoint(vertex.position);
}
if (muzzleBoxes.length !== 3) throw new Error('Original main gun does not have three identifiable muzzles');
for (const tri of gunTriangles) {
  for (const vertex of tri) {
    if (vertex.position.z < gun.box.min.z + 0.005) gunBaseBox.expandByPoint(vertex.position);
  }
}
const gunBase = gunBaseBox.getCenter(new THREE.Vector3()).setZ(gun.box.min.z);
const planes = new Map();
for (const tri of gunTriangles) {
  for (const { position } of tri) {
    if (position.x < gun.box.min.x + 40 || position.x > gunBase.x - 20) continue;
    const key = Math.round(position.x * 1000) / 1000;
    planes.set(key, (planes.get(key) || 0) + 1);
  }
}
const cutX = [...planes].sort((a, b) => b[1] - a[1])[0]?.[0];
if (cutX === undefined) throw new Error('Cannot identify the original barrel collar plane');
const bodyTriangles = [];
const barrelTriangles = [[], [], []];
const muzzlePoints = muzzleBoxes.map(box => box.getCenter(new THREE.Vector3()));
for (const tri of gunTriangles) {
  bodyTriangles.push(...clip(tri, cutX, false));
  for (const front of clip(tri, cutX, true)) {
    const y = front.reduce((sum, vertex) => sum + vertex.position.y, 0) / 3;
    const distances = muzzlePoints.map(point => Math.abs(point.y - y));
    barrelTriangles[distances.indexOf(Math.min(...distances))].push(front);
  }
}
const barrelRoots = barrelTriangles.map(tris => {
  const box = new THREE.Box3();
  for (const tri of tris) {
    for (const vertex of tri) {
      if (Math.abs(vertex.position.x - cutX) < 0.002) box.expandByPoint(vertex.position);
    }
  }
  if (box.isEmpty()) throw new Error('Cannot identify a main barrel root');
  return box.getCenter(new THREE.Vector3()).setX(cutX);
});
const elevationOrigin = new THREE.Vector3(cutX, gunBase.y,
  barrelRoots.reduce((sum, point) => sum + point.z, 0) / 3);

// Centers and heights measured from the three original circular barbette caps.
const mounts = [
  new THREE.Vector3(-27.0560105, -0.60939884, 72.39320374),
  new THREE.Vector3(60.70294952, -0.71009922, 83.87279510),
  new THREE.Vector3(441.29098511, -0.45834923, 80.34829712)
];
for (const [index, mount] of mounts.entries()) {
  const turret = new THREE.Group();
  turret.name = `Turret-${index}`;
  turret.position.copy(project(mount));
  turret.rotation.y = index === 2 ? Math.PI : 0;
  turret.add(section('Body', [{ geometry: geometryFrom(bodyTriangles) }],
    localProjection.clone().multiply(translate(gunBase)), (_, normal) => normal.z > 0.65 ? roof : steel));
  const elevation = new THREE.Group();
  elevation.name = `Elevation-${index}`;
  elevation.position.copy(elevationOrigin.clone().sub(gunBase).applyMatrix4(localProjection));
  turret.add(elevation);
  for (let barrelIndex = 0; barrelIndex < 3; barrelIndex++) {
    const root = barrelRoots[barrelIndex];
    const muzzle = muzzlePoints[barrelIndex];
    const axis = muzzle.clone().sub(root).transformDirection(localProjection);
    const flatten = new THREE.Quaternion().setFromUnitVectors(axis, new THREE.Vector3(0, 0, 1));
    const barrelGeometry = geometryFrom(barrelTriangles[barrelIndex]);
    barrelGeometry.applyMatrix4(localProjection.clone().multiply(translate(root)));
    barrelGeometry.applyQuaternion(flatten);
    const length = muzzle.distanceTo(root) * scale;
    const barrel = new THREE.Group();
    barrel.name = `Barrel-${index}-${barrelIndex}`;
    barrel.position.copy(root.clone().sub(elevationOrigin).applyMatrix4(localProjection));
    barrel.position.z = 0;
    barrel.add(section('Tube', [{ geometry: barrelGeometry }], identity,
      (point, normal) => point.z > length - 0.3 && normal.z > 0.65 ? dark : steel));
    const tip = new THREE.Object3D();
    tip.name = `Muzzle-${index}-${barrelIndex}`;
    tip.position.z = length;
    barrel.add(tip);
    elevation.add(barrel);
  }
  ship.add(turret);
}

const secondary = loadPart('6in guns').filter(part => Math.abs(part.box.getCenter(new THREE.Vector3()).y) < 18);
const secondaryBase = new THREE.Vector3(128.64756245, -0.18206234, 100.58090894);
for (const [index, mount] of [
  new THREE.Vector3(125.20049667, -0.25694990, 101.39399719),
  new THREE.Vector3(380.36949158, 0.09544992, 97.76909637)
].entries()) {
  const group = section(`Secondary-${index}`, secondary,
    localProjection.clone().multiply(translate(secondaryBase)), (_, normal) => normal.z > 0.65 ? roof : dark);
  group.position.copy(project(mount));
  group.rotation.y = index === 1 ? Math.PI : 0;
  ship.add(group);
}

const aaTemplate = loadPart('5in guns').reduce((a, b) =>
  a.geometry.attributes.position.count > b.geometry.attributes.position.count ? a : b);
const aaBase = aaTemplate.box.getCenter(new THREE.Vector3()).setZ(aaTemplate.box.min.z);
const aaMounts = superstructure.filter(part => {
  const size = part.box.getSize(new THREE.Vector3());
  return size.x > 20 && size.x < 28 && size.y > 20 && size.y < 28 && size.z < 3;
});
if (aaMounts.length !== 4) throw new Error('Unexpected original rooftop AA platform layout');
for (const [index, platform] of aaMounts.entries()) {
  const mount = platform.box.getCenter(new THREE.Vector3()).setZ(platform.box.min.z)
    .sub(superstructureOffset);
  const group = section(`Rooftop-AA-${index}`, [aaTemplate],
    localProjection.clone().multiply(translate(aaBase)), (_, normal) => normal.z > 0.65 ? roof : dark);
  group.position.copy(project(mount));
  group.rotation.y = mount.y > 0 ? Math.PI : 0;
  ship.add(group);
}

ship.updateMatrixWorld(true);
let triangleCount = 0;
ship.traverse(object => {
  if (!object.isMesh) return;
  const positions = object.geometry.getAttribute('position');
  for (const value of positions.array) {
    if (!Number.isFinite(value)) throw new Error('Non-finite converted model vertex');
  }
  triangleCount += (object.geometry.index?.count ?? positions.count) / 3;
});
const binary = await new GLTFExporter().parseAsync(ship, { binary: true });
writeFileSync(new URL('yamato.glb', directory), Buffer.from(binary));
const report = {
  source: source.source, license: source.license, triangles: triangleCount,
  bytes: binary.byteLength, hullLength: 263, hullBeam: hullSize.y * scale,
  draft: 10.8, scale, bounds: new THREE.Box3().setFromObject(ship),
  mounts: mounts.map(point => project(point).toArray()),
  barrelLengths: muzzlePoints.map((point, index) => point.distanceTo(barrelRoots[index]) * scale)
};
writeFileSync(new URL('conversion.json', directory), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
dom.window.close();
