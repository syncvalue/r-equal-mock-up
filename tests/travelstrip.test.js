import { test } from 'node:test';
import assert from 'node:assert/strict';
import { travelStripHtml } from '../callcenter/view.js';

const prev = { label: '近藤 浩二 様', place: '大阪府堺市堺区南瓦町1-1', at: 720, km: 12.3, min: 30, gap: 60 };
const form = { address: '奈良県奈良市あやめ池北1-2-7', start: 780 };

test('枠を選ぶと、前の訪問の住所から今回の住所までの距離・所要時間・余裕を出す', () => {
  const html = travelStripHtml({ user: { name: '佐々木 美咲' }, travel: { prev, next: null } }, form);
  assert.match(html, /近藤 浩二 様/);
  assert.match(html, /大阪府堺市堺区南瓦町1-1/);
  assert.match(html, /奈良県奈良市あやめ池北1-2-7/);
  assert.match(html, /12\.3km/);
  assert.match(html, /約30分/);
  assert.match(html, /余裕30分/);
});

test('移動時間が空き時間より長ければ、間に合わない旨を警告する', () => {
  const html = travelStripHtml({ user: { name: '佐々木 美咲' }, travel: { prev: { ...prev, min: 75 }, next: null } }, form);
  assert.match(html, /間に合いません/);
  assert.match(html, /15分/);
});

test('前の訪問がなければ、その旨だけ（営業所からの距離は出さない）', () => {
  assert.match(travelStripHtml({ user: { name: '佐々木 美咲' }, travel: { prev: null, next: null } }, form), /前の訪問なし/);
});

test('住所が未入力、または営業を選んでいないときは、案内だけ・何も出さない', () => {
  assert.match(travelStripHtml({ user: { name: '佐々木 美咲' }, travel: null }, { address: '', start: 780 }), /住所を入力/);
  assert.equal(travelStripHtml(null, form), '');
});
