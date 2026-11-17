import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setFavorite, setMemo, notesOf, favoriteCount } from '../src/customerNotes.js';
import { customerRows, filterRows, sortRows } from '../src/myCustomers.js';

const NOW = new Date(2026, 10, 17, 12, 0);

test('お気に入りと自分用メモ: 鑑定士ごとに分かれ、元のデータは変えない', () => {
  const a = setFavorite({}, 'u01', '090-1111-2222', true);
  const b = setMemo(a, 'u01', '090-1111-2222', ' 午前中がつながりやすい ');
  const c = setMemo(b, 'u02', '09011112222', '別の鑑定士のメモ'); // 電話番号のハイフンの有無は問わない
  assert.deepEqual(a, { u01: { '09011112222': { favorite: true, memo: '' } } });
  assert.equal(notesOf(c, 'u01')['09011112222'].memo, '午前中がつながりやすい');
  assert.equal(notesOf(c, 'u01')['09011112222'].favorite, true);
  assert.equal(notesOf(c, 'u02')['09011112222'].favorite, false);
  assert.equal(notesOf(c, 'u02')['09011112222'].memo, '別の鑑定士のメモ');
  assert.deepEqual(notesOf(c, 'u03'), {});
  assert.equal(favoriteCount(c, 'u01'), 1);
});

test('お気に入りを外し、メモも空なら、記録ごと消える', () => {
  const a = setMemo(setFavorite({}, 'u01', '090-1111-2222', true), 'u01', '090-1111-2222', 'メモ');
  const b = setFavorite(a, 'u01', '090-1111-2222', false);
  assert.equal(notesOf(b, 'u01')['09011112222'].memo, 'メモ');
  const c = setMemo(b, 'u01', '090-1111-2222', '  ');
  assert.deepEqual(notesOf(c, 'u01'), {});
});

test('顧客リスト: お気に入り・メモが付き、お気に入りだけに絞れる。メモも検索できる', () => {
  const rows0 = customerRows('u01', { now: NOW });
  const target = rows0[2];
  let notes = setFavorite({}, 'u01', target.phone, true);
  notes = setMemo(notes, 'u01', rows0[3].phone, '時計のコレクションあり');
  const rows = customerRows('u01', { now: NOW, notes: notesOf(notes, 'u01') });
  assert.equal(rows.filter((r) => r.favorite).length, 1);
  assert.equal(rows.find((r) => r.phone === target.phone).favorite, true);
  assert.equal(rows.find((r) => r.phone === rows0[3].phone).memo, '時計のコレクションあり');
  assert.deepEqual(filterRows(rows, { favOnly: true }).map((r) => r.phone), [target.phone]);
  assert.deepEqual(filterRows(rows, { q: 'コレクション' }).map((r) => r.phone), [rows0[3].phone]);
  assert.equal(sortRows(rows, 'days').length, rows.length);
});

test('画面: 一覧に★とメモ、詳細に自分用のメモ欄が出る', async () => {
  const mem = new Map();
  globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  globalThis.window = { matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener() {} };
  globalThis.document = { documentElement: { classList: { toggle() {}, contains: () => false }, style: {} }, querySelector: () => ({}), querySelectorAll: () => [], addEventListener() {}, activeElement: null, head: { appendChild() {} }, createElement: () => ({}) };
  const V = await import('../src/views.js');
  const phone = '090-2468-1357'; // 山田 花子
  mem.set('rq-mock-cust-notes', JSON.stringify(setMemo(setFavorite({}, 'u01', phone, true), 'u01', phone, '次は着物を見たい')));
  const s = { user: 'u01', geo: null, cust: { q: '', sort: 'days', minDays: 0, near: false, favOnly: false, form: { result: '', wish: '', memo: '' } }, modal: null };
  const html = V.customersView(s);
  for (const w of ['data-action="cust-fav"', '★', '次は着物を見たい', 'お気に入りだけ']) assert.ok(html.includes(w), w);
  assert.ok(!V.customersView({ ...s, cust: { ...s.cust, favOnly: true } }).includes('佐野 健')); // お気に入りでない
  const m = V.modalView({ ...s, modal: { type: 'custcall', phone, name: '山田 花子' } });
  for (const w of ['自分用のメモ', 'data-cust="note"', '次は着物を見たい', 'data-action="cust-fav"']) assert.ok(m.includes(w), w);
});
