import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceNavigation, advanceRoute, createRoute, MAX_SPEED, turretCanAim, lowArcElevation, ballisticRange, SHELL_SPEED, GRAVITY } from '../src/navigation.ts';

test('propulsion caps, moves forward, brakes and reverses', () => {
  const state = { x: 0, z: 0, heading: 0, speed: 0, throttle: 0 };
  for (let i = 0; i < 3600; i++) advanceNavigation(state, 1, 0, 1 / 60);
  assert.equal(state.throttle, 1);
  assert.ok(state.speed <= MAX_SPEED && state.speed > MAX_SPEED * 0.99);
  assert.ok(state.z > 500);
  assert.equal(state.x, 0);
  for (let i = 0; i < 3600; i++) advanceNavigation(state, -1, 0, 1 / 60);
  assert.equal(state.throttle, -0.3);
  assert.ok(state.speed < 0);
  assert.ok(state.speed >= -MAX_SPEED * 0.3);
});

test('rudder needs motion and turns the ship in the expected direction', () => {
  const state = { x: 0, z: 0, heading: 0, speed: 0, throttle: 0 };
  advanceNavigation(state, 0, 1, 1);
  assert.equal(state.heading, 0);
  state.speed = MAX_SPEED;
  state.throttle = 1;
  advanceNavigation(state, 0, 1, 1);
  assert.ok(state.heading > 0 && state.x > 0);
});

test('right-click navigation reaches forward, reverse-bearing and tight-turn destinations and stops', () => {
  for (const target of [{ x: 2000, z: 500 }, { x: 0, z: -1000 }, { x: MAX_SPEED / 0.085, z: 0 }, { x: -100, z: 0 }]) {
    const state = { x: 0, z: 0, heading: 0, speed: 0, throttle: 0 };
    const route = createRoute(state, target);
    let reached = false;
    for (let i = 0; i < 12000 && !reached; i++) reached = advanceRoute(state, route, 0.05);
    assert.ok(reached, `Failed to reach ${JSON.stringify(target)} from ${JSON.stringify(state)}`);
    assert.ok(Math.hypot(state.x - target.x, state.z - target.z) <= 20);
    assert.equal(state.speed, 0);
    assert.equal(state.throttle, 0);
  }
});

test('turret arcs reject firing through the central ship direction', () => {
  assert.equal(turretCanAim(0, false), true);
  assert.equal(turretCanAim(Math.PI, false), false);
  assert.equal(turretCanAim(Math.PI, true), true);
  assert.equal(turretCanAim(0, true), false);
  assert.equal(turretCanAim(Math.PI / 2, false), true);
  assert.equal(turretCanAim(Math.PI / 2, true), true);
});

test('visual ballistic solver reaches water at target distance and rejects out-of-range targets', () => {
  const distance = 350;
  const height = 12;
  const angle = lowArcElevation(distance, height);
  assert.notEqual(angle, null);
  const time = distance / (SHELL_SPEED * Math.cos(angle));
  const impactHeight = height + SHELL_SPEED * Math.sin(angle) * time - 0.5 * GRAVITY * time ** 2;
  assert.ok(Math.abs(impactHeight) < 1e-8);
  assert.equal(lowArcElevation(4000, height), null);
});

test('game distance, per-second speed and gun range use the same world units', () => {
  const state = { x: 0, z: 0, heading: 0, speed: MAX_SPEED, throttle: 1 };
  for (let i = 0; i < 60; i++) advanceNavigation(state, 0, 0, 1 / 60);
  assert.ok(Math.abs(state.z - state.speed) < 1e-8);
  const range = ballisticRange(12, Math.PI / 4);
  assert.ok(range > 2500 && range < 2520);
  const angle = lowArcElevation(range * (1 - 1e-9), 12);
  assert.notEqual(angle, null);
  assert.equal(lowArcElevation(range + 1, 12), null);
});
