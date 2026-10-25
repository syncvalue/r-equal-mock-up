import { test } from 'node:test';
import assert from 'node:assert/strict';
import { helpIcon, placePopover } from '../src/help.js';

test('helpIcon: 説明文をエスケープして data-help に入れる', () => {
  const h = helpIcon('A < B & "C"');
  assert.match(h, /^<button type="button" class="help-btn"/);
  assert.match(h, /data-help="A &lt; B &amp; &quot;C&quot;"/);
  assert.match(h, />\?<\/button>$/);
  assert.match(h, /aria-label="説明を表示"/);
});

test('helpIcon: 追加クラスを付けられる', () => {
  assert.match(helpIcon('x', 'ml-1'), /class="help-btn ml-1"/);
});

test('placePopover: 基本はボタンの下、左端をそろえる', () => {
  const p = placePopover({ left: 100, right: 120, top: 50, bottom: 70 }, { w: 200, h: 60 }, { w: 800, h: 600 });
  assert.deepEqual(p, { left: 100, top: 76 });
});

test('placePopover: 右にはみ出すときは画面内に寄せる', () => {
  const p = placePopover({ left: 700, right: 720, top: 50, bottom: 70 }, { w: 200, h: 60 }, { w: 800, h: 600 });
  assert.equal(p.left, 800 - 200 - 8);
});

test('placePopover: 下にはみ出すときはボタンの上に出す', () => {
  const p = placePopover({ left: 100, right: 120, top: 560, bottom: 580 }, { w: 200, h: 60 }, { w: 800, h: 600 });
  assert.equal(p.top, 560 - 60 - 6);
});

test('placePopover: 左端は最小余白を守る', () => {
  const p = placePopover({ left: 0, right: 20, top: 10, bottom: 30 }, { w: 200, h: 60 }, { w: 800, h: 600 });
  assert.equal(p.left, 8);
});
