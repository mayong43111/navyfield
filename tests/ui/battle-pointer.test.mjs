import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { bindBattlePointer } from '../../src/input/battle-pointer.ts';

function fixture(t) {
  const dom = new JSDOM('<canvas id="sea"></canvas><canvas id="map"></canvas><button>控制</button>'), saved = new Map();
  for (const name of ['window', 'document', 'Element', 'Node', 'HTMLElement', 'HTMLCanvasElement']) {
    saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { value: dom.window[name], configurable: true });
  }
  const canvas = document.querySelector('#sea');
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1000, bottom: 700, width: 1000, height: 700 });
  let battle = true;
  const pointer = bindBattlePointer({ canvas, map: document.querySelector('#map'), isBattle: () => battle,
    blocked: [], scale: () => 1, world: () => null, order: () => {}, message: () => {} });
  t.after(() => { pointer.dispose(); dom.window.close(); for (const [name, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name];
  } });
  function event(type, values = {}, target = canvas) {
    const e = new dom.window.MouseEvent(type, { bubbles: true, ...values });
    Object.defineProperty(e, 'pointerType', { value: values.pointerType ?? 'mouse' });
    target.dispatchEvent(e);
  }
  return { pointer, event, window: dom.window, leaveBattle: () => { battle = false; } };
}

test('each expanded edge continues the last direction outside the page and stops on interior reentry', t => {
  const { pointer, event } = fixture(t);
  for (const point of [{ x: 50, y: 350 }, { x: 950, y: 350 }, { x: 500, y: 50 }, { x: 500, y: 650 }]) {
    event('pointermove', { clientX: point.x, clientY: point.y });
    event('pointerout'); assert.deepEqual(pointer.read(), point);
    event('pointermove', { clientX: 500, clientY: 350 });
    event('pointerout'); assert.equal(pointer.read(), null);
  }
});
test('focus loss, hidden page, controls, dragging, screen changes and explicit return clear edge scrolling', t => {
  const { pointer, event, window, leaveBattle } = fixture(t);
  const edge = () => event('pointermove', { clientX: 5, clientY: 350 });
  edge(); window.dispatchEvent(new window.Event('blur')); assert.equal(pointer.read(), null);
  edge(); event('pointermove', { clientX: 5, clientY: 350 }, document.querySelector('button')); assert.equal(pointer.read(), null);
  edge(); event('pointerdown'); assert.equal(pointer.read(), null);
  edge(); event('pointermove', { clientX: 5, clientY: 350, buttons: 1 }); assert.equal(pointer.read(), null);
  edge(); pointer.clear(); assert.equal(pointer.read(), null);
  edge(); Object.defineProperty(document, 'hidden', { value: true, configurable: true });
  document.dispatchEvent(new window.Event('visibilitychange')); assert.equal(pointer.read(), null);
  edge(); leaveBattle(); event('pointerout'); assert.equal(pointer.read(), null);
});
