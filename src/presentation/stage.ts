import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BATTLE_MIN_ZOOM } from './camera.ts';
import { createOcean } from './ocean.ts';

export function createBattleStage(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  renderer.shadowMap.enabled = false; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.85;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#334c5c'); scene.fog = new THREE.FogExp2('#334c5c', 0.000035);
  const halfHeight = 580, aspect = canvas.clientWidth / canvas.clientHeight;
  const camera = new THREE.OrthographicCamera(-halfHeight * aspect, halfHeight * aspect, halfHeight, -halfHeight, 1, 15000);
  const battleCameraOffset = new THREE.Vector3(775, 900, 1040);
  const battleCameraDirection = battleCameraOffset.clone().sub(new THREE.Vector3(0, 8, 0));
  camera.position.copy(battleCameraOffset);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 8, 0); controls.enableDamping = true; controls.enablePan = false;
  controls.minZoom = BATTLE_MIN_ZOOM; controls.maxZoom = 3.5; controls.maxPolarAngle = Math.PI * 0.47;
  controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  scene.add(new THREE.HemisphereLight('#cdd8db', '#23373c', 1.7));
  const sunlight = new THREE.DirectionalLight('#e5e3d2', 2.7);
  sunlight.position.set(-250, 380, 150); sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(2048, 2048);
  Object.assign(sunlight.shadow.camera, { left: -220, right: 220, top: 220, bottom: -220, near: 1, far: 900 });
  sunlight.shadow.bias = -0.0004; scene.add(sunlight, sunlight.target);
  const ocean = createOcean(); scene.add(ocean);
  return { renderer, scene, camera, controls, halfHeight, battleCameraOffset, battleCameraDirection,
    sunlight, ocean, oceanMaterial: ocean.material };
}
