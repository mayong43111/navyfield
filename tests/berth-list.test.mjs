import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { renderBerths } from '../src/berth-list.ts';

test('searching a large roster selects the original berth, not its filtered row number', () => {
  const list = new JSDOM('<main></main>').window.document.querySelector('main');
  const names = Array.from({ length: 64 }, (_, i) => `舰艇${i + 1}`);
  names[53] = '武藏';
  let picked;
  const render = term => renderBerths(list, names, 53, term, index => { picked = index; });
  assert.equal(render(''), 64);
  assert.equal(render(' 武藏 '), 1);
  assert.equal(list.firstChild.getAttribute('aria-pressed'), 'true');
  list.firstChild.click();
  assert.equal(picked, 53);
  assert.equal(render('64号'), 1);
  list.firstChild.click();
  assert.equal(picked, 63);
  assert.equal(render('不存在'), 0);
  assert.equal(list.childElementCount, 0);
});
