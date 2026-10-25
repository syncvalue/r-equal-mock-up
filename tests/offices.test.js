import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const O = await import('../src/offices.js');
const { AREAS } = await import('../src/dispatch.js');

test('初期の営業所: 既存の担当エリアと同じ（ID・名前・担当の都道府県）。名前は「営業所」を付けない短い名前', () => {
  assert.deepEqual(O.DEFAULT_OFFICES.map((o) => o.id), AREAS.map((a) => a.id));
  const osaka = O.DEFAULT_OFFICES.find((o) => o.id === 'osaka');
  assert.deepEqual([osaka.name, osaka.prefs, osaka.active], ['大阪', ['大阪府', '奈良県', '和歌山県'], true]);
  assert.equal(O.officeLabel(osaka), '大阪営業所');
});

test('保存と読み込み: 保存した営業所を読み戻せる。保存がない・壊れている・空なら初期値', () => {
  assert.deepEqual(O.loadOffices(), O.DEFAULT_OFFICES);
  const r = O.saveOffice(O.DEFAULT_OFFICES, { name: '福岡', prefs: '福岡県、佐賀県' });
  assert.equal(O.saveOffices(r.offices), true);
  assert.equal(O.loadOffices().length, O.DEFAULT_OFFICES.length + 1);
  mem.set(O.OFFICES_KEY, '{broken');
  assert.deepEqual(O.loadOffices(), O.DEFAULT_OFFICES);
  mem.set(O.OFFICES_KEY, '[]');
  assert.deepEqual(O.loadOffices(), O.DEFAULT_OFFICES);
  mem.clear();
});

test('登録: 名前が必要で重複不可。担当の都道府県は、カンマ・読点・空白・改行で区切って渡せる（重複は除く）。実在しない名前は不可', () => {
  const base = O.DEFAULT_OFFICES;
  const ok = O.saveOffice(base, { name: ' 福岡 ', prefs: '福岡県, 佐賀県\n福岡県　長崎県' });
  assert.equal(ok.ok, true);
  const o = ok.offices.at(-1);
  assert.deepEqual([o.name, o.prefs, o.active], ['福岡', ['福岡県', '佐賀県', '長崎県'], true]);
  assert.ok(o.id && !base.some((x) => x.id === o.id));
  assert.equal(base.length + 1, ok.offices.length); // 元の配列は変えない
  assert.equal(O.saveOffice(base, { name: '', prefs: '' }).reason, 'noName');
  assert.equal(O.saveOffice(base, { name: '大阪', prefs: '' }).reason, 'dupName');
  assert.equal(O.saveOffice(base, { name: '札幌', prefs: '北海島' }).reason, 'badPref');
  assert.equal(O.saveOffice(base, { name: '札幌', prefs: '' }).ok, true); // 担当の都道府県は、なくてもよい
  assert.equal(O.saveOffice(base, { id: 'nope', name: 'x', prefs: '' }).reason, 'notFound');
});

test('更新: 名前・担当の都道府県を変えられる。自分自身の名前は重複ではない。有効/無効は保つ', () => {
  const off = O.setOfficeActive(O.DEFAULT_OFFICES, 'kanto', false).offices;
  const r = O.saveOffice(off, { id: 'kanto', name: '関東', prefs: '東京都' });
  assert.equal(r.ok, true);
  const k = r.offices.find((o) => o.id === 'kanto');
  assert.deepEqual([k.prefs, k.active], [['東京都'], false]);
});

test('有効・無効: 切り替えられる。見つからなければエラー。有効な営業所を、最低1つは残す', () => {
  let list = O.DEFAULT_OFFICES;
  assert.equal(O.setOfficeActive(list, 'nope', false).reason, 'notFound');
  assert.equal(O.setOfficeActive(list, 'osaka', false).ok, true);
  for (const o of list.slice(0, -1)) list = O.setOfficeActive(list, o.id, false).offices;
  assert.equal(O.setOfficeActive(list, list.at(-1).id, false).reason, 'lastActive');
  assert.equal(O.setOfficeActive(list, list[0].id, true).ok, true);
  assert.deepEqual(O.activeOffices(list).map((o) => o.id), [list.at(-1).id]);
});

test('名前の引き当て: 営業所の名前（なければ空）', () => {
  assert.equal(O.officeName('osaka', O.DEFAULT_OFFICES), '大阪');
  assert.equal(O.officeName('zzz', O.DEFAULT_OFFICES), '');
  assert.equal(O.officeName('', O.DEFAULT_OFFICES), '');
});
