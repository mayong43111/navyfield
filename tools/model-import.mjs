import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { unzipSync } from 'three/addons/libs/fflate.module.js';

function attributes(text) {
  return Object.fromEntries([...text.matchAll(/([\w:]+)="([^"]*)"/g)].map(match => [match[1], match[2]]));
}

function transform(value) {
  if (!value) return new THREE.Matrix4();
  const n = value.trim().split(/\s+/).map(Number);
  if (n.length !== 12 || n.some(value => !Number.isFinite(value))) throw new Error('Invalid native 3MF transform');
  return new THREE.Matrix4().set(n[0], n[3], n[6], n[9], n[1], n[4], n[7], n[10], n[2], n[5], n[8], n[11], 0, 0, 0, 1);
}

export function read3MF(path) {
  const archive = unzipSync(readFileSync(path));
  const modelFiles = Object.keys(archive).filter(name => name.endsWith('.model'));
  if (modelFiles.length !== 1) throw new Error('Only single-document native 3MF assemblies are supported');
  const xml = new TextDecoder().decode(archive[modelFiles[0]]);
  const unit = attributes(xml.match(/<model\b([^>]*)>/)?.[1] ?? '').unit ?? 'millimeter';
  if (unit !== 'millimeter') throw new Error(`Unsupported native 3MF unit: ${unit}`);
  const objects = new Map();
  for (const match of xml.matchAll(/<object\b([^>]*)>([\s\S]*?)<\/object>/g)) {
    const info = attributes(match[1]);
    const body = match[2];
    const components = [...body.matchAll(/<component\b([^>]*)\/>/g)].map(match => attributes(match[1]));
    let geometry = null;
    if (body.includes('<mesh>')) {
      const vertices = [...body.matchAll(/<vertex\b([^>]*)\/>/g)];
      const triangles = [...body.matchAll(/<triangle\b([^>]*)\/>/g)];
      const positions = new Float32Array(vertices.length * 3);
      const indices = new Uint32Array(triangles.length * 3);
      for (const [i, vertex] of vertices.entries()) {
        const a = attributes(vertex[1]);
        positions.set([Number(a.x), Number(a.y), Number(a.z)], i * 3);
      }
      for (const [i, triangle] of triangles.entries()) {
        const a = attributes(triangle[1]);
        const values = [Number(a.v1), Number(a.v2), Number(a.v3)];
        if (values.some(value => !Number.isInteger(value) || value < 0 || value >= vertices.length)) throw new Error('Invalid native triangle');
        indices.set(values, i * 3);
      }
      if (positions.some(value => !Number.isFinite(value))) throw new Error('Invalid native vertex');
      geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    }
    objects.set(info.id, { geometry, components, name: info.name ?? info.id });
  }
  const parts = [];
  function visit(id, matrix, ancestors) {
    if (ancestors.has(id)) throw new Error('Cyclic native 3MF assembly');
    const object = objects.get(id);
    if (!object) throw new Error(`Missing native object: ${id}`);
    if (object.geometry) {
      const geometry = object.geometry.clone().applyMatrix4(matrix);
      geometry.computeBoundingBox();
      parts.push({ id, name: object.name, geometry, box: geometry.boundingBox.clone() });
    }
    const next = new Set(ancestors).add(id);
    for (const component of object.components) visit(component.objectid, matrix.clone().multiply(transform(component.transform)), next);
  }
  const build = xml.match(/<build\b[^>]*>([\s\S]*?)<\/build>/)?.[1];
  if (!build) throw new Error('Native 3MF build missing');
  for (const match of build.matchAll(/<item\b([^>]*)\/>/g)) {
    const item = attributes(match[1]);
    visit(item.objectid, transform(item.transform), new Set());
  }
  if (!parts.length) throw new Error('Empty native 3MF assembly');
  return parts;
}

export function stlBounds(path) {
  const bytes = readFileSync(path);
  if (bytes.length < 84 || bytes.length !== 84 + bytes.readUInt32LE(80) * 50) throw new Error(`Invalid binary STL: ${path}`);
  const box = new THREE.Box3();
  const point = new THREE.Vector3();
  for (let offset = 84; offset < bytes.length; offset += 50) {
    for (let vertex = 0; vertex < 3; vertex++) {
      const p = offset + 12 + vertex * 12;
      point.set(bytes.readFloatLE(p), bytes.readFloatLE(p + 4), bytes.readFloatLE(p + 8));
      if (![point.x, point.y, point.z].every(Number.isFinite)) throw new Error('Invalid STL vertex');
      box.expandByPoint(point);
    }
  }
  return { bytes, box };
}
