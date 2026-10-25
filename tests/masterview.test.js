import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const { masterHtml, MASTERS, REASON_TEXT } = await import('../master/view.js');
const { DEFAULT_USERS } = await import('../src/users.js');
const { DEFAULT_OFFICES } = await import('../src/offices.js');
const { DEFAULT_MASTER } = await import('../src/warehouseMaster.js');
const { blankForm } = await import('../master/usersPanel.js');
const { blankOffice, formFromOffice } = await import('../master/officesPanel.js');

const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const blankWh = { id: '', name: '', zip: '', address: '', phone: '', officeId: '', locations: '', highValue: false };
const blankVd = { id: '', name: '', zip: '', address: '', phone: '' };
const ctx = (tab, over = {}) => ({
  tab, users: DEFAULT_USERS, offices: DEFAULT_OFFICES, wmaster: DEFAULT_MASTER, holding: { 'W-OSAKA': { count: 3, cost: 120000 } },
  ui: { users: { role: '', q: '', status: '', form: null }, offices: { mo: blankOffice() }, warehouses: { mw: blankWh, hv: null }, vendors: { mv: blankVd } }, ...over,
});

test('マスタの切り替え: ユーザー・営業所・倉庫・委託先の4つ。選んだものが強調される', () => {
  assert.deepEqual(MASTERS.map((m) => m.key), ['users', 'offices', 'warehouses', 'vendors']);
  const html = masterHtml(ctx('offices'));
  assert.equal((html.match(/data-master="/g) || []).length, 4);
  assert.match(html, /class="b on" data-master="offices"/);
  assert.ok(text(html).includes('マスタ管理'));
});

test('ユーザー: ユーザーの一覧と、新規登録ボタンが出る', () => {
  const t = text(masterHtml(ctx('users')));
  assert.ok(t.includes('鈴木 一郎') && t.includes('小川 直樹') && t.includes('新規登録'));
});

test('営業所: 一覧に、担当の都道府県と、併設の倉庫が出る。編集・有効/無効のボタンと、登録フォームがある', () => {
  const html = masterHtml(ctx('offices'));
  const t = text(html);
  assert.ok(/大阪営業所 大阪府・奈良県・和歌山県 大阪倉庫/.test(t), t);
  assert.ok(/東海営業所.*なし（営業のみ）/.test(t));
  assert.ok(html.includes('data-mo-edit="osaka"') && html.includes('data-mo-toggle="osaka"') && html.includes('data-mo-save') && html.includes('data-f="mo.name"'));
  assert.ok(t.includes('営業所の新規登録'));
  const edit = masterHtml(ctx('offices', { ui: { ...ctx('offices').ui, offices: { mo: formFromOffice(DEFAULT_OFFICES[0]) } } }));
  assert.ok(text(edit).includes('営業所の編集') && edit.includes('data-mo-cancel') && edit.includes('大阪府、奈良県、和歌山県'));
});

test('倉庫: 一覧（保管中・倉庫担当・営業所との関係）、登録フォーム、高額品の判定が出る。営業所の選択肢は営業所マスタから', () => {
  const html = masterHtml(ctx('warehouses'));
  const t = text(html);
  assert.ok(/大阪倉庫.*大阪営業所と一体.*小川 直樹、中島 里奈.*3点/.test(t), t);
  assert.ok(t.includes('福岡倉庫') && t.includes('倉庫のみ') && t.includes('高額品の保管先'));
  for (const a of ['data-mw-edit="W-OSAKA"', 'data-mw-toggle="W-OSAKA"', 'data-mw-save', 'data-f="mw.name"', 'data-hv-save']) assert.ok(html.includes(a), a);
  assert.equal((html.match(/data-hv-color=/g) || []).length, 3); // 紫・赤・その他（黄・緑・青）
  const select = html.match(/data-f="mw.officeId"[\s\S]*?<\/select>/)[0];
  assert.ok(select.includes('大阪営業所と一体') && select.includes('東海営業所と一体'));
  const off = DEFAULT_OFFICES.map((o) => (o.id === 'tokai' ? { ...o, active: false } : o));
  assert.ok(!masterHtml(ctx('warehouses', { offices: off })).match(/data-f="mw.officeId"[\s\S]*?<\/select>/)[0].includes('東海'));
});

test('委託先: 一覧と登録フォームが出る', () => {
  const html = masterHtml(ctx('vendors'));
  assert.ok(text(html).includes('大阪時計オークション') && text(html).includes('委託先（業者）'));
  for (const a of ['data-mv-edit="V-OSAKA-WATCH"', 'data-mv-toggle="V-OSAKA-WATCH"', 'data-mv-save', 'data-f="mv.name"']) assert.ok(html.includes(a), a);
});

test('エラーの文言: 営業所・倉庫・委託先のエラー理由にも、利用者向けの文言がある', async () => {
  const { saveOffice, setOfficeActive } = await import('../src/offices.js');
  const W = await import('../src/warehouseMaster.js');
  const m = DEFAULT_MASTER;
  const reasons = [
    saveOffice(DEFAULT_OFFICES, { name: '', prefs: '' }), saveOffice(DEFAULT_OFFICES, { name: '大阪', prefs: '' }), saveOffice(DEFAULT_OFFICES, { name: 'x', prefs: 'zz' }), saveOffice(DEFAULT_OFFICES, { id: 'q', name: 'x' }),
    setOfficeActive(DEFAULT_OFFICES.map((o) => ({ ...o, active: o.id === 'osaka' })), 'osaka', false),
    W.saveWarehouse(m, { name: '', locations: 'A' }), W.saveWarehouse(m, { name: 'x', locations: '' }), W.saveWarehouse(m, { name: 'x', locations: 'A', officeId: 'zz' }), W.saveWarehouse(m, { name: 'x', locations: 'A', zip: '1' }),
    W.saveWarehouse(m, { name: '大阪倉庫', locations: 'A' }), W.saveWarehouse(m, { name: 'x', locations: 'A', highValue: true }), W.saveVendor(m, { name: '' }), W.saveHighValueRule(m, { colors: [] }), W.saveHighValueRule(m, { colors: ['pink'] }),
    W.setWarehouseActive(m, 'W-FUKUOKA', false, { holding: 1 }), W.setWarehouseActive(m, 'W-OSAKA', false, {}), W.setWarehouseActive(m, 'nope', false, {}),
  ];
  for (const r of reasons) { assert.equal(r.ok, false); assert.ok(REASON_TEXT[r.reason], r.reason); }
});
