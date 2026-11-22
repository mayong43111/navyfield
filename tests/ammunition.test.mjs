import test from 'node:test';
import assert from 'node:assert/strict';
import { createAmmunition, takeAmmunition, includesWeapon, fireGun } from '../src/ammunition.ts';

test('locker selection is independent of shell type and front/rear ammunition', () => {
  const front = createAmmunition();
  const rear = createAmmunition();
  front.lockers.A.shellType = 'AP';
  front.lockers.B.shellType = 'HE';
  front.selected = 'B';
  assert.equal(takeAmmunition(front, 6), 'HE');
  assert.equal(front.lockers.B.remaining, 54);
  assert.equal(front.lockers.A.remaining, 60);
  assert.equal(rear.lockers.B.remaining, 60);
  front.selected = 'A';
  assert.equal(takeAmmunition(front, 3), 'AP');
  assert.equal(front.lockers.A.remaining, 57);
  assert.equal(front.lockers.B.shellType, 'HE');
});

test('empty or insufficient lockers cannot fire or fall back to another locker', () => {
  const front = createAmmunition();
  front.lockers.A.remaining = 2;
  assert.equal(takeAmmunition(front, 3), null);
  assert.equal(front.lockers.A.remaining, 2);
  assert.equal(front.lockers.B.remaining, 60);
  front.lockers.A.remaining = 3;
  assert.equal(takeAmmunition(front, 3), 'HE');
  assert.equal(takeAmmunition(front, 1), null);
  assert.throws(() => takeAmmunition(front, -1), RangeError);
  assert.throws(() => takeAmmunition(front, 1.5), RangeError);
});

test('each mounted gun reloads independently and cannot consume ammunition while loading', () => {
  const front = { ammunition: createAmmunition(), reload: 0 };
  const rear = { ammunition: createAmmunition(), reload: 0 };
  assert.deepEqual(fireGun(front, 3), { fired: true, shellType: 'HE' });
  assert.ok(front.reload > 0);
  assert.equal(rear.reload, 0);
  front.ammunition.selected = 'B';
  assert.deepEqual(fireGun(front, 3), { fired: false, reason: 'loading' });
  assert.equal(front.ammunition.lockers.B.remaining, 60);
  assert.deepEqual(fireGun(rear, 3), { fired: true, shellType: 'HE' });
  front.reload = 0;
  front.ammunition.lockers.B.remaining = 2;
  assert.deepEqual(fireGun(front, 3), { fired: false, reason: 'empty' });
  assert.equal(front.reload, 0);
  assert.equal(front.ammunition.lockers.A.remaining, 57);
});

test('front/both/rear weapon selection filters the actual firing turrets', () => {
  assert.deepEqual([false, false, true].filter(rear => includesWeapon('front', rear)), [false, false]);
  assert.deepEqual([false, false, true].filter(rear => includesWeapon('rear', rear)), [true]);
  assert.deepEqual([false, false, true].filter(rear => includesWeapon('both', rear)), [false, false, true]);
});

test('sourced gun reload time is used without changing ammo or another gun on invalid input', () => {
  const gun = { ammunition: createAmmunition(), reload: 0 };
  assert.throws(() => fireGun(gun, 3, NaN), RangeError);
  assert.equal(gun.ammunition.lockers.A.remaining, 60);
  assert.equal(gun.reload, 0);
  assert.deepEqual(fireGun(gun, 3, 19.4), { fired: true, shellType: 'HE' });
  assert.equal(gun.reload, 19.4);
  assert.deepEqual(fireGun(gun, 3, 16.76), { fired: false, reason: 'loading' });
  assert.equal(gun.reload, 19.4);
  assert.equal(gun.ammunition.lockers.A.remaining, 57);
});
