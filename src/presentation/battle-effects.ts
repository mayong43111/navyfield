import * as THREE from 'three';
import { context2d } from '../ui.ts';
import type { ShipInstance } from '../yamato.ts';
import type { BattleEvent, DeepReadonly, Observation, ProjectileId, ShellType, Side } from '../domain/battle.ts';

interface Particle {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | THREE.Sprite;
  velocity: THREE.Vector3;
  remaining: number; lifetime: number; growth: number; gravity: number;
  kind: 'smoke' | 'fire' | 'spark' | 'ring'; opacity: number;
}
interface Shell {
  id: ProjectileId; mesh: THREE.Mesh; trail: THREE.Line; history: THREE.Vector3[];
}

export function createBattleEffects(scene: THREE.Scene, cloudTexture: THREE.Texture,
  isBattle: () => boolean, vessel: (side: Side) => ShipInstance) {
  const particles: Particle[] = [], shells: Shell[] = [];
  const lights: { light: THREE.PointLight; life: number }[] = [];
  const fires: { vessel: THREE.Object3D; local: THREE.Vector3; remaining: number; timer: number }[] = [];
  const particleGeometry = new THREE.SphereGeometry(1, 8, 6);
  const ringGeometry = new THREE.RingGeometry(0.93, 1, 48);
  const fireCanvas = document.createElement('canvas');
  fireCanvas.width = fireCanvas.height = 64;
  const fireContext = context2d(fireCanvas);
  const fireGradient = fireContext.createRadialGradient(32, 32, 0, 32, 32, 32);
  fireGradient.addColorStop(0, '#ffffff'); fireGradient.addColorStop(0.18, '#fff6b8');
  fireGradient.addColorStop(0.45, '#ff9a32dd'); fireGradient.addColorStop(1, '#ff3e0000');
  fireContext.fillStyle = fireGradient; fireContext.fillRect(0, 0, 64, 64);
  const fireTexture = new THREE.CanvasTexture(fireCanvas);
  const shellGeometry = new THREE.SphereGeometry(0.65, 8, 6);
  const shellColors = { HE: '#ffcd71', AP: '#b4def1' };
  const shellMaterials = {
    HE: new THREE.MeshBasicMaterial({ color: shellColors.HE }),
    AP: new THREE.MeshBasicMaterial({ color: shellColors.AP })
  };
  function particle(position: THREE.Vector3, velocity: THREE.Vector3, color: string,
    radius: number, life: number, growth: number, gravity = 0, kind: Particle['kind'] = 'smoke'): void {
    if (particles.length >= 500) return;
    const opacity = kind === 'smoke' ? 0.65 : kind === 'ring' ? 0.45 : 1;
    const mesh = kind === 'ring' || kind === 'spark' || !isBattle()
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
    } else mesh.scale.setScalar(radius);
    if (kind === 'ring') mesh.rotation.x = -Math.PI / 2;
    scene.add(mesh);
    particles.push({ mesh, velocity, remaining: life, lifetime: life, growth, gravity, kind, opacity });
  }
  function splash(position: THREE.Vector3, type: ShellType): void {
    const count = type === 'HE' ? 22 : 12, speed = type === 'HE' ? 10 : 5;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2, magnitude = 3 + Math.random() * speed;
      particle(position, new THREE.Vector3(Math.sin(angle) * magnitude, 12 + Math.random() * 22,
        Math.cos(angle) * magnitude), '#d2e9e8', 0.8 + Math.random() * 1.4, 2, 0.8, 24);
    }
    const rings = type === 'HE' ? 12 : 6;
    for (let i = 0; i < rings; i++) {
      const angle = i * Math.PI * 2 / rings;
      particle(position.clone().setY(0.6), new THREE.Vector3(Math.sin(angle) * 8, 0, Math.cos(angle) * 8),
        '#c8e0dd', 2, 3, 2);
    }
  }
  function impact(position: THREE.Vector3, type: ShellType, scale = 1): void {
    particle(position, new THREE.Vector3(0, 2, 0), '#fff1b8', 10 * scale, 0.35, 14, 0, 'fire');
    for (let i = 0; i < (type === 'HE' ? 22 : 14); i++) {
      const angle = Math.random() * Math.PI * 2, speed = (12 + Math.random() * 26) * scale;
      particle(position, new THREE.Vector3(Math.cos(angle) * speed, 8 + Math.random() * 28,
        Math.sin(angle) * speed), i % 3 ? '#ffbf63' : '#fff5c5',
        1.8 + Math.random() * 1.5, 0.65 + Math.random() * 0.5, 0, 28, 'spark');
    }
    particle(position, new THREE.Vector3(-2, 7, 0), '#292c2a', 8 * scale, 5, 5);
    particle(position, new THREE.Vector3(3, 4, 1), '#56534b', 6 * scale, 3, 6);
  }
  function ignite(ship: THREE.Object3D, position: THREE.Vector3, seconds: number): void {
    if (fires.length >= 8) fires.shift();
    const local = ship.worldToLocal(position.clone()); local.y = Math.max(local.y, 18);
    fires.push({ vessel: ship, local, remaining: seconds, timer: 0 });
  }
  function present(event: DeepReadonly<BattleEvent>): void {
    switch (event.type) {
      case 'launched': {
        const projectile = event.projectile;
        const muzzle = new THREE.Vector3(projectile.position.x, projectile.position.y, projectile.position.z);
        const mesh = new THREE.Mesh(shellGeometry, shellMaterials[projectile.shellType]); mesh.position.copy(muzzle);
        if (projectile.kind === 'torpedo') mesh.scale.set(2, 2, 9);
        else if (projectile.kind === 'bomb') mesh.scale.setScalar(3);
        else if (projectile.kind === 'aa') mesh.scale.setScalar(1.5);
        const trail = new THREE.Line(new THREE.BufferGeometry().setFromPoints([muzzle, muzzle]),
          new THREE.LineBasicMaterial({ color: shellColors[projectile.shellType], transparent: true, opacity: 0.6 }));
        scene.add(mesh, trail);
        shells.push({ id: projectile.id, mesh, trail, history: [muzzle.clone()] });
        particle(muzzle, new THREE.Vector3(), '#ffce65', 3.5, 0.14, 10);
        for (let i = 0; i < 5; i++) particle(muzzle,
          new THREE.Vector3(Math.random() * 4 - 2, 4, Math.random() * 4 - 2), '#828b87', 2, 2.5, 3);
        break;
      }
      case 'fired': {
        if (event.owner !== 'player') break;
        const light = new THREE.PointLight('#ffc278', 1200, 55, 2);
        light.position.set(event.position.x, event.position.y, event.position.z);
        scene.add(light); lights.push({ light, life: 0.16 }); break;
      }
      case 'impact': {
        const point = new THREE.Vector3(event.position.x, event.position.y, event.position.z);
        impact(point, event.shellType);
        if (event.shellType === 'HE') ignite(vessel(event.target).ship, point, 10);
        break;
      }
      case 'splash': splash(new THREE.Vector3(event.position.x, event.position.y, event.position.z), event.shellType); break;
      case 'aircraft-hit': {
        particle(new THREE.Vector3(event.position.x, event.position.y, event.position.z), new THREE.Vector3(), '#ffeac0', 3, 0.3, 5, 0, 'spark'); break;
      }
      case 'aircraft-shot-down': {
        impact(new THREE.Vector3(event.position.x, event.position.y, event.position.z), 'HE', 0.5); break;
      }
      case 'aircraft-dropped': {
        particle(new THREE.Vector3(event.position.x, event.position.y, event.position.z), new THREE.Vector3(0, -3, 0), '#ffcb6b', 3, 0.5, 2); break;
      }
      case 'sunk': {
        const instance = vessel(event.side), ship = instance.ship; ship.updateMatrixWorld(true);
        for (const z of [-instance.dimensions.length / 4, 0, instance.dimensions.length / 4]) {
          const position = ship.localToWorld(new THREE.Vector3(0, instance.dimensions.height * 0.75, z));
          impact(position, 'HE', z === 0 ? 2 : 1.2); ignite(ship, position, 14);
          splash(position.clone().setY(0.6), 'HE');
          particle(position.clone().setY(0.9), new THREE.Vector3(), '#b7d5d5', 20, 7, 20, 0, 'ring');
        }
        break;
      }
    }
  }
  function removeShell(shell: Shell): void {
    scene.remove(shell.mesh, shell.trail); shell.trail.geometry.dispose();
    if (shell.trail.material instanceof THREE.Material) shell.trail.material.dispose();
  }
  function update(dt: number, observation: Observation | null): void {
    for (let i = shells.length - 1; i >= 0; i--) {
      const shell = shells[i]!, state = observation?.projectiles.find(p => p.id === shell.id);
      if (!state) { removeShell(shell); shells.splice(i, 1); continue; }
      shell.mesh.position.set(state.position.x, state.position.y, state.position.z);
      shell.history.push(shell.mesh.position.clone());
      if (shell.history.length > 18) shell.history.shift();
      shell.trail.geometry.dispose(); shell.trail.geometry = new THREE.BufferGeometry().setFromPoints(shell.history);
    }
    for (let i = fires.length - 1; i >= 0; i--) {
      const fire = fires[i]!; fire.remaining -= dt; fire.timer -= dt;
      fire.vessel.updateMatrixWorld(true);
      const position = fire.vessel.localToWorld(fire.local.clone());
      if (fire.remaining <= 0 || position.y < 0 || !fire.vessel.visible) fires.splice(i, 1);
      else if (fire.timer <= 0) {
        fire.timer = 0.22; const fade = Math.min(1, fire.remaining / 2);
        particle(position, new THREE.Vector3(Math.random() * 2 - 1, 9, 0), '#ffad4a', 6 * fade, 0.8, 5, 0, 'fire');
        particle(position, new THREE.Vector3(-3, 7, 1), '#292e2e', 6 * fade, 5, 5);
      }
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const effect = particles[i]!; effect.remaining -= dt; effect.velocity.y -= effect.gravity * dt;
      effect.mesh.position.addScaledVector(effect.velocity, dt);
      if (effect.kind === 'spark' && effect.velocity.lengthSq() > 0) effect.mesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0), effect.velocity.clone().normalize());
      effect.mesh.scale.addScalar(effect.growth * dt);
      effect.mesh.material.opacity = Math.max(0, effect.remaining / effect.lifetime) * effect.opacity;
      if (effect.remaining <= 0 || effect.mesh.position.y < -1) {
        scene.remove(effect.mesh); effect.mesh.material.dispose(); particles.splice(i, 1);
      }
    }
    for (let i = lights.length - 1; i >= 0; i--) {
      const entry = lights[i]!; entry.life -= dt;
      if (entry.life <= 0) { scene.remove(entry.light); entry.light.dispose(); lights.splice(i, 1); }
    }
  }
  function clear(): void {
    for (const effect of particles) { scene.remove(effect.mesh); effect.mesh.material.dispose(); }
    particles.length = fires.length = 0;
    for (const shell of shells) removeShell(shell);
    shells.length = 0;
    for (const entry of lights) { scene.remove(entry.light); entry.light.dispose(); }
    lights.length = 0;
  }
  return { particle, present, update, clear };
}
