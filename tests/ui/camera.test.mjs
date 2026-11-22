import test from 'node:test';
import assert from 'node:assert/strict';
import { OrthographicCamera, Plane, Raycaster, Vector2, Vector3 } from 'three';
import { BATTLE_MIN_ZOOM, BATTLE_ZOOM, edgePan, positionBattleCamera, seaViewSize } from '../../src/camera.ts';

const offset = new Vector3(775, 892, 1040);
const water = new Plane(new Vector3(0, 1, 0), 0);
function view(zoom, aspect = 16 / 9, target = new Vector3(0, 8, 0)) {
  const camera = new OrthographicCamera(-580 * aspect, 580 * aspect, 580, -580, 1, 15000);
  camera.zoom = zoom;
  camera.updateProjectionMatrix();
  positionBattleCamera(camera, target, offset);
  return camera;
}
function seaPoint(camera, x, y) {
  const ray = new Raycaster();
  ray.setFromCamera(new Vector2(x, y), camera);
  const hit = ray.ray.intersectPlane(water, new Vector3());
  assert.ok(hit, 'every screen corner must have a sea point in front of the camera');
  const projected = hit.clone().project(camera);
  assert.ok(projected.z >= -1 && projected.z <= 1, 'sea must also be inside the clipping planes');
  return hit;
}

test('maximum zoom-out keeps the entire sea view drawable, including far-away browsing', () => {
  for (const aspect of [16 / 9, 4 / 3, 32 / 9]) {
    for (const zoom of [BATTLE_ZOOM, 0.1, BATTLE_MIN_ZOOM]) {
      const camera = view(zoom, aspect, new Vector3(35000, 8, -6000));
      const points = [-1, 1].flatMap(x => [-1, 1].map(y => seaPoint(camera, x, y)));
      const size = seaViewSize(camera);
      const width = Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x));
      const height = Math.max(...points.map(p => p.z)) - Math.min(...points.map(p => p.z));
      assert.ok(Math.abs(size.width - width) < 0.0001);
      assert.ok(Math.abs(size.height - height) < 0.0001);
      if (zoom === BATTLE_MIN_ZOOM && aspect === 16 / 9) {
        assert.ok(width > 50000 && height > 50000, 'zoom-out must cover both distant spawn sides');
      }
    }
  }
});

test('edge scrolling follows screen directions at constant pixel speed across zoom levels', () => {
  const viewport = { width: 1600, height: 900 };
  for (const zoom of [BATTLE_ZOOM, BATTLE_MIN_ZOOM]) {
    for (const [point, direction] of [
      [{ x: 0, y: 450 }, [1, 0]], [{ x: 1600, y: 450 }, [-1, 0]],
      [{ x: 800, y: 0 }, [0, 1]], [{ x: 800, y: 900 }, [0, -1]]
    ]) {
      const camera = view(zoom);
      const center = seaPoint(camera, 0, 0);
      const delta = edgePan(camera, point, viewport, 0.1);
      assert.ok(delta.y === 0);
      camera.position.add(delta);
      camera.updateMatrixWorld();
      const screen = center.project(camera);
      assert.ok(Math.abs(screen.x * viewport.width / 2 - direction[0] * 55) < 0.0001);
      assert.ok(Math.abs(-screen.y * viewport.height / 2 - direction[1] * 55) < 0.0001);
    }
  }
});

test('edge scrolling ramps toward the border and avoids a diagonal speed boost', () => {
  const camera = view(BATTLE_ZOOM), viewport = { width: 1600, height: 900 };
  const full = edgePan(camera, { x: 0, y: 450 }, viewport, 0.1);
  const half = edgePan(camera, { x: 16, y: 450 }, viewport, 0.1);
  assert.ok(Math.abs(full.length() / half.length() - 2) < 0.00001);
  const center = seaPoint(camera, 0, 0);
  camera.position.add(edgePan(camera, { x: 1600, y: 0 }, viewport, 0.1));
  camera.updateMatrixWorld();
  const point = center.project(camera);
  assert.ok(Math.abs(Math.hypot(point.x * 800, point.y * 450) - 55) < 0.0001);
});

test('interior, outside and paused pointers do not move the view; invalid input is explicit', () => {
  const camera = view(BATTLE_ZOOM), viewport = { width: 1600, height: 900 };
  for (const point of [{ x: 800, y: 450 }, { x: -1, y: 450 }, { x: 800, y: 901 }]) {
    assert.equal(edgePan(camera, point, viewport, 0.1).length(), 0);
  }
  assert.equal(edgePan(camera, { x: 0, y: 0 }, viewport, 0).length(), 0);
  assert.throws(() => edgePan(camera, { x: NaN, y: 0 }, viewport, 0.1), RangeError);
  assert.throws(() => edgePan(camera, { x: 0, y: 0 }, { width: 0, height: 900 }, 0.1), RangeError);
});
