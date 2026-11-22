import * as THREE from 'three';
import type { ShipInstance } from '../yamato.ts';
import { context2d } from '../ui.ts';
import { createShipyard } from './shipyard.ts';

export function createEnvironment(scene: THREE.Scene, oceanMaterial: THREE.ShaderMaterial) {
  const deckCanvas = document.createElement('canvas'); deckCanvas.width = deckCanvas.height = 128;
  const deckContext = context2d(deckCanvas); deckContext.fillStyle = '#d7cfb8'; deckContext.fillRect(0, 0, 128, 128);
  for (let x = 0; x < 128; x += 12) {
    deckContext.fillStyle = x % 24 === 0 ? '#c3b9a0' : '#ddd2b7'; deckContext.fillRect(x, 0, 11, 128);
    deckContext.fillStyle = '#9c947d'; deckContext.fillRect(x + 11, 0, 1, 128); deckContext.fillRect(x, (x * 7) % 120, 12, 1);
  }
  const deckTexture = new THREE.CanvasTexture(deckCanvas); deckTexture.colorSpace = THREE.SRGBColorSpace;
  deckTexture.wrapS = deckTexture.wrapT = THREE.RepeatWrapping; deckTexture.repeat.set(0.025, 0.01);
  const deckMaterials: THREE.MeshStandardMaterial[] = [], steelMaterials: THREE.MeshStandardMaterial[] = [];
  const shadows = new Map<THREE.Object3D, THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>>();
  function add(instance: ShipInstance): void {
    scene.add(instance.ship);
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
    shadow.rotation.x = -Math.PI / 2; shadow.scale.set(instance.dimensions.beam / 2 + 3, instance.dimensions.length / 2, 1);
    shadow.position.set(2, 0.8, -2); instance.ship.add(shadow); shadows.set(instance.ship, shadow);
  }
  function remove(ship: THREE.Object3D): void {
    scene.remove(ship); const shadow = shadows.get(ship);
    if (shadow) { ship.remove(shadow); shadow.geometry.dispose(); shadow.material.dispose(); shadows.delete(ship); }
  }
  function appearance(battle: boolean): void {
    oceanMaterial.uniforms['classic']!.value = battle ? 1 : 0;
    for (const material of deckMaterials) {
      material.map = battle ? deckTexture : null; material.color.set(battle ? '#c9c2ad' : '#a38b61'); material.needsUpdate = true;
    }
    for (const material of steelMaterials) material.color.set(battle ? '#778681' : '#697b85');
    for (const shadow of shadows.values()) shadow.visible = battle;
  }
  const cloudCanvas = document.createElement('canvas'); cloudCanvas.width = cloudCanvas.height = 128;
  const cloudContext = context2d(cloudCanvas);
  for (const [x, y, radius] of [[45, 50, 42], [76, 64, 46], [38, 83, 35], [81, 36, 30]]) {
    const gradient = cloudContext.createRadialGradient(x!, y!, 0, x!, y!, radius!);
    gradient.addColorStop(0, '#dae0dfb0'); gradient.addColorStop(1, '#dae0df00');
    cloudContext.fillStyle = gradient; cloudContext.fillRect(0, 0, 128, 128);
  }
  const cloudTexture = new THREE.CanvasTexture(cloudCanvas), clouds = new THREE.Group();
  for (const [x, z] of [[-670, 200], [620, -100], [-350, -610], [460, 450]]) {
    const cloud = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTexture, transparent: true, opacity: 0.35, depthWrite: false }));
    // Keep the whole soft sprite above the water depth plane, avoiding a hard seam.
    cloud.position.set(x!, 104, z!); cloud.scale.set(260, 160, 1); clouds.add(cloud);
  }
  scene.add(clouds);
  const surface = document.createElement('canvas'); surface.width = surface.height = 512;
  const context = context2d(surface); context.fillStyle = '#b4b8b6'; context.fillRect(0, 0, 512, 512);
  for (let index = 0; index < 24; index++) {
    const x = index * 97 % 512, y = index * 167 % 512, radius = 20 + index * 13 % 60;
    const stain = context.createRadialGradient(x, y, 0, x, y, radius);
    stain.addColorStop(0, '#38403938'); stain.addColorStop(1, '#38403900');
    context.fillStyle = stain; context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  for (let index = 0; index < 18000; index++) {
    context.fillStyle = index % 2 ? '#d3d0bb20' : '#3d453c18';
    context.fillRect((index * 73) % 512, (index * 127 + Math.floor(index / 512) * 29) % 512, 1 + index % 3, 1);
  }
  context.strokeStyle = '#525c5055'; context.lineWidth = 2;
  for (let offset = 0; offset < 512; offset += 128) {
    context.beginPath(); context.moveTo(offset, 0); context.lineTo(offset, 512);
    context.moveTo(0, offset); context.lineTo(512, offset); context.stroke();
  }
  const yardTexture = new THREE.CanvasTexture(surface); yardTexture.colorSpace = THREE.SRGBColorSpace;
  yardTexture.wrapS = yardTexture.wrapT = THREE.RepeatWrapping;
  const dock = createShipyard(yardTexture); dock.visible = false; scene.add(dock);
  return { add, remove, appearance, clouds, cloudTexture, dock };
}
