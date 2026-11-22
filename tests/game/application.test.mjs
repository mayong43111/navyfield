import test from 'node:test';
import assert from 'node:assert/strict';
import { createOwnedShip } from '../../src/game/port-state.ts';
import { PortController } from '../../src/game/port-controller.ts';
import { ApplicationController } from '../../src/app/controller.ts';
import { LocalBattleSession } from '../../src/adapters/local/battle-session.ts';
import { createAmmunition } from '../../src/simulation/ammunition.ts';

function port() {
  return new PortController([createOwnedShip('one', 'One', 'hull', ['gun']), createOwnedShip('two', 'Two', 'hull', ['gun'])], {
    refit: typeId => {
      if (typeId === 'missing') throw new Error('Unavailable hull');
      return { name: typeId, weapons: ['replacement'] };
    },
    validateGun: (_typeId, _index, gunId) => { if (gunId === 'missing') throw new Error('Unavailable gun'); }
  });
}
function configuration(state) {
  const ship = (side, x) => ({
    id: side, definitionId: state.active.typeId, side, hp: 20000, protection: 5000,
    dimensions: { beam: 38, length: 263, height: 16 },
    spawn: { x, z: 0, heading: Math.PI / 2, speed: 0, throttle: 0 },
    weapons: [{
      id: `${side}-gun`, rear: false, mount: { x: 0, y: 12, z: 50 }, pivot: { x: 0, y: 0, z: 0 },
      muzzles: [-3, 0, 3].map(x => ({ x, y: 0, z: 20 })),
      reloadSeconds: 3, installed: side === 'player', ballistics: { speed: 200, maxAngle: Math.PI / 4 },
      power: { he: 1848, apBonus: 3 }, ammunition: createAmmunition()
    }]
  });
  return { seed: 4217, rulesVersion: 'single-ship-v1', ships: [ship('player', 0), ship('enemy', 500)],
    aim: { x: 500, y: 0.5, z: 0 }, layout: { range: 2500, gap: 25000, width: 28000, height: 5000, regions: [] } };
}
const deployment = { team: 'alpha', slot: 0 };

test('port commands publish immutable per-berth inventory and failed refits preserve the observation', () => {
  const controller = port(), initial = controller.observe();
  assert.throws(() => { initial.active.guns[0].ammunition.selected = 'B'; }, TypeError);
  controller.send({ type: 'locker', weapon: 0, locker: 'B' });
  assert.equal(initial.active.guns[0].ammunition.selected, 'A');
  assert.equal(controller.observe().active.guns[0].ammunition.selected, 'B');
  controller.send({ type: 'select-berth', index: 1 });
  assert.equal(controller.observe().active.guns[0].ammunition.selected, 'A');
  const before = controller.observe();
  assert.throws(() => controller.send({ type: 'equip-hull', typeId: 'missing' }), /Unavailable/);
  assert.throws(() => controller.send({ type: 'equip-gun', gunId: 'missing' }), /Unavailable/);
  assert.throws(() => controller.send({ type: 'bulge', level: 11 }), RangeError);
  assert.strictEqual(controller.observe(), before);
  controller.send({ type: 'select-berth', index: 0 });
  assert.equal(controller.observe().active.guns[0].ammunition.selected, 'B');
});
test('application routes live magazine/fire commands to the session, not port state, then transfers inventory on exit', () => {
  const controller = new ApplicationController(port(), configuration, config => new LocalBattleSession(config));
  const updates = []; controller.subscribe(update => updates.push(update));
  controller.navigate('battle', deployment);
  controller.portCommand({ type: 'locker', weapon: 0, locker: 'B' });
  controller.advance(1 / 30, false);
  assert.equal(controller.observe().port.active.guns[0].ammunition.selected, 'A');
  assert.equal(controller.observe().battle.ships[0].weapons[0].ammunition.selected, 'B');
  assert.throws(() => controller.portCommand({ type: 'equip-hull', typeId: 'other' }), /船坞/);
  controller.advance(1, true);
  assert.equal(controller.observe().battle.tick, 1);
  controller.fire(); controller.advance(1 / 30, false);
  assert.equal(controller.observe().battle.ships[0].weapons[0].ammunition.lockers.B.remaining, 57);
  assert.equal(controller.observe().port.active.guns[0].ammunition.lockers.B.remaining, 60);
  controller.navigate('yard');
  assert.equal(controller.observe().battle, null);
  assert.equal(controller.observe().port.active.guns[0].ammunition.lockers.B.remaining, 57);
  assert.equal(controller.observe().port.active.guns[0].reload, 0);
  assert.ok(updates.some(update => update.events.some(event => event.type === 'launched')));
  assert.ok(updates.every(update => Object.isFrozen(update) && Object.isFrozen(update.state) && Object.isFrozen(update.events)));
  controller.reset();
  assert.equal(controller.observe().port.active.guns[0].ammunition.lockers.B.remaining, 60);
  controller.end();
});
test('missing deployment and failed replacement launch leave the active session and screen intact', () => {
  let reject = false;
  const controller = new ApplicationController(port(), state => {
    if (reject) throw new Error('Incomplete content');
    return configuration(state);
  }, config => new LocalBattleSession(config));
  assert.throws(() => controller.navigate('battle'), /阵位/);
  assert.equal(controller.observe().screen, 'warzone');
  controller.navigate('battle', deployment); controller.advance(1 / 30, false);
  const before = controller.observe().battle;
  reject = true;
  assert.throws(() => controller.navigate('battle', deployment), /Incomplete/);
  assert.strictEqual(controller.observe().battle, before);
  assert.equal(controller.observe().screen, 'battle');
  controller.advance(1 / 30, false);
  assert.equal(controller.observe().battle.tick, 2);
  controller.end();
});
