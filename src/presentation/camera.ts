import { Vector3 } from 'three';
import type { OrthographicCamera } from 'three';

export const BATTLE_MIN_ZOOM = 0.05;
export const BATTLE_ZOOM = 0.66;

function groundAxes(camera: OrthographicCamera): { right: Vector3; up: Vector3; slope: number } {
  if (!Number.isFinite(camera.zoom) || camera.zoom <= 0) throw new RangeError('Invalid camera zoom');
  camera.updateMatrixWorld();
  const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize();
  const up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1).setY(0);
  const slope = up.length();
  if (slope < 0.000001) throw new RangeError('Camera cannot project the sea plane');
  return { right, up: up.divideScalar(slope), slope };
}

export function positionBattleCamera(camera: OrthographicCamera, target: Vector3, offset: Vector3): void {
  if (!Number.isFinite(camera.zoom) || camera.zoom <= 0) throw new RangeError('Invalid camera zoom');
  const scale = Math.max(1, BATTLE_ZOOM / camera.zoom);
  // A wider orthographic frustum also needs altitude: otherwise its bottom rays start below the sea.
  camera.position.copy(target).addScaledVector(offset, scale);
  const far = Math.max(15000, offset.length() * scale + 40000);
  if (camera.far !== far) {
    camera.far = far;
    camera.updateProjectionMatrix();
  }
  camera.lookAt(target);
  camera.updateMatrixWorld();
}

export function seaViewSize(camera: OrthographicCamera, zoom = camera.zoom): { width: number; height: number } {
  if (!Number.isFinite(zoom) || zoom <= 0) throw new RangeError('Invalid camera zoom');
  const { right, up, slope } = groundAxes(camera);
  const width = (camera.right - camera.left) / zoom;
  const height = (camera.top - camera.bottom) / zoom / slope;
  return {
    width: Math.abs(right.x) * width + Math.abs(up.x) * height,
    height: Math.abs(right.z) * width + Math.abs(up.z) * height
  };
}

export function edgeScrollZone(viewport: { width: number; height: number }): number {
  return Math.min(72, viewport.width / 2, viewport.height / 2);
}

export function edgePan(camera: OrthographicCamera, point: { x: number; y: number },
  viewport: { width: number; height: number }, dt: number): Vector3 {
  if (![point.x, point.y, viewport.width, viewport.height, dt].every(Number.isFinite)
    || viewport.width <= 0 || viewport.height <= 0 || dt < 0) throw new RangeError('Invalid edge-scroll input');
  if (point.x < 0 || point.y < 0 || point.x > viewport.width || point.y > viewport.height || dt === 0) {
    return new Vector3();
  }
  const zone = edgeScrollZone(viewport);
  function strength(position: number, length: number): number {
    if (position < zone) return (position - zone) / zone;
    if (position > length - zone) return (position - length + zone) / zone;
    return 0;
  }
  let x = strength(point.x, viewport.width), y = -strength(point.y, viewport.height);
  const length = Math.hypot(x, y);
  if (length === 0) return new Vector3();
  if (length > 1) { x /= length; y /= length; }
  const { right, up, slope } = groundAxes(camera);
  const pixels = 550 * dt;
  return right.multiplyScalar(x * pixels * (camera.right - camera.left) / camera.zoom / viewport.width)
    .addScaledVector(up, y * pixels * (camera.top - camera.bottom) / camera.zoom / viewport.height / slope);
}
