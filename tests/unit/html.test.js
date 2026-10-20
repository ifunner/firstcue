import { test } from 'node:test';
import assert from 'node:assert/strict';
import { html, raw, esc, href } from '../../js/html.js';

test('escapes text and attribute values', () => {
  const evil = `x"><img src=x onerror=alert(1)>`;
  const out = String(html`<li data-id="${evil}">${evil}</li>`);
  assert.ok(!out.includes('<img'), out);
  assert.ok(out.includes('data-id="x&quot;&gt;&lt;img'));
});

test('nested templates and arrays are not double-escaped', () => {
  const items = ['a&b', 'c'];
  const out = String(html`<ul>${items.map(i => html`<li>${i}</li>`)}</ul>`);
  assert.equal(out, '<ul><li>a&amp;b</li><li>c</li></ul>');
});

test('raw() opts out explicitly; null, undefined and false render nothing', () => {
  assert.equal(String(html`<input ${raw('checked')}>`), '<input checked>');
  assert.equal(String(html`${null}${undefined}${false}`), '');
});

test('escapes quotes, backticks and ampersands', () => {
  assert.equal(esc(`'"\`&<>`), '&#39;&quot;&#96;&amp;&lt;&gt;');
});

test('href() only lets http and https through', () => {
  assert.equal(href('https://open.spotify.com/track/1'), 'https://open.spotify.com/track/1');
  assert.equal(href('javascript:alert(1)'), '#');
  assert.equal(href('data:text/html,hi'), '#');
  assert.equal(href(' JAVASCRIPT:alert(1)'), '#');
});
