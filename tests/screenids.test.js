import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { SCREENS, APPS, screenName, screenOf, appOf, ccScreenId, masterScreenId, accountingScreenId, mktScreenId, tabletScreenId, TAB_MODAL_IDS, storeScreenId, whScreenId, hqScreenId, gmoScreenId, modalBadgeHtml, screenLabel } from '../src/screenIds.js';
import { screenIdsDoc } from '../src/screenIdsDoc.js';

const ids = SCREENS.map((s) => s.id);

test('画面ID: 重複がない。形式は「アプリ記号-番号」（モーダル・重ね画面は M、印刷用は P）。アプリは一覧にある', () => {
  assert.equal(new Set(ids).size, ids.length);
  for (const s of SCREENS) {
    assert.match(s.id, /^[A-Z]+-(M|P)?\d{2}(-\d)?$/, s.id);
    assert.ok(s.app in APPS, s.id);
    assert.ok(s.name.length > 0, s.id);
    if (/-M\d/.test(s.id)) assert.ok(['modal', 'overlay'].includes(s.kind), s.id);
    if (/-P\d/.test(s.id)) assert.equal(s.kind, 'print', s.id);
  }
  assert.equal(screenName('CC-03'), '配車確定（配車係）');
  assert.equal(appOf('TAB-10'), '鑑定士タブレット');
  assert.equal(screenOf('NOPE'), null);
});

// 画面の状態から決まるIDを、すべての組み合わせで調べる
const reached = new Set();
const seen = (id) => { reached.add(id); return id; };

test('コールセンター: 状態からIDが決まる', () => {
  for (const tab of ['new', 'calendar', 'dispatch', 'cooloff', 'store']) for (const cvMode of ['week', 'day']) for (const bodyStage of ['wait', 'open', 'new']) for (const editId of [null, 'R1']) for (const done of [null, {}]) for (const mapAddress of ['', 'x']) seen(ccScreenId({ tab, bodyStage, editId, done, mapAddress, cvMode }));
  assert.equal(ccScreenId({ tab: 'new', bodyStage: 'wait' }), 'CC-01');
  assert.equal(ccScreenId({ tab: 'new', bodyStage: 'new', editId: 'R1' }), 'CC-01-3'); // 変更中は、新規ではなく、変更の画面
  assert.equal(ccScreenId({ tab: 'new', done: {}, bodyStage: 'new' }), 'CC-01-5');
  assert.equal(ccScreenId({ tab: 'calendar', cvMode: 'day' }), 'CC-02-1');
  assert.equal(ccScreenId({ tab: 'dispatch', done: {} }), 'CC-03'); // ほかのタブでは、受電の状態は関係ない
});

test('マスタ・経理・査定部・GMOサイン・店舗・倉庫: 状態からIDが決まる', () => {
  for (const t of ['employees', 'departments', 'offices', 'trips', 'stores', 'warehouses', 'vendors']) seen(masterScreenId(t));
  for (const t of ['claims', 'balance', 'weekly', 'fixed']) seen(accountingScreenId(t));
  for (const tab of ['flyers', 'response']) for (const selId of [null, 'N1001']) seen(mktScreenId({ tab, selId }));
  assert.equal(mktScreenId({ tab: 'response', selId: 'N1001' }), 'MKT-02-1');
  assert.equal(mktScreenId({ tab: 'flyers', selId: 'N1001' }), 'MKT-01'); // チラシの登録の画面では、反響管理の選択は関係ない
  for (const sel of [null, { type: 'item' }, { type: 'req' }]) seen(hqScreenId(sel));
  for (const sel of [null, { code: 'RQ-P1' }]) seen(hqScreenId(sel, 'appraisal')); // 査定（読み取り前・読み取り後）
  assert.equal(hqScreenId(null, 'support'), 'HQ-01');
  assert.equal(hqScreenId({ code: 'RQ-P1' }, 'appraisal'), 'HQ-04-1');
  for (const r of ['login', 'list', 'detail']) seen(gmoScreenId(r));
  seen(storeScreenId({}));
  for (const step of [0, 1, 2, 3, 4]) seen(storeScreenId({ staff: {}, view: 'purchase', draft: { step } }));
  seen(storeScreenId({ staff: {}, view: 'board', draft: null }));
  for (const tab of ['stock', 'receive', 'transfer', 'list', 'sales', 'return']) for (const packOpen of [false, true]) for (const scan of [false, true]) for (const lot of [false, true]) seen(whScreenId({ staff: {}, tab, packOpen, scan, lot }));
  seen(whScreenId({}));
  assert.equal(whScreenId({ staff: {}, tab: 'stock', scan: true, lot: true }), 'WH-02-2');
  assert.equal(whScreenId({ staff: {}, tab: 'transfer', packOpen: true }), 'WH-04-1');
  assert.equal(storeScreenId({ staff: {}, view: 'purchase', draft: { step: 4 } }), 'STR-07');
});

test('鑑定士タブレット: ログイン前の5画面・メインの画面・訪問の手順・モーダルが、それぞれ別のIDになる', () => {
  for (const screen of ['login', 'sms', 'forgot', 'forgot-sms', 'newpw']) seen(tabletScreenId({ user: null, auth: { screen } }));
  for (const view of ['dashboard', 'customers', 'expense', 'return', 'zzz']) seen(tabletScreenId({ user: 'u01', view }));
  for (const phase of ['before', 'open', 'closed']) seen(tabletScreenId({ user: 'u01', view: 'workday', phase }));
  for (const tab of ['calendar', 'route']) seen(tabletScreenId({ user: 'u01', view: 'schedule', sched: { tab } }));
  for (const step of [0, 1, 2, 3, 4, 5, 6]) for (const showStaff of [false, true]) for (const outcome of [null, {}]) seen(tabletScreenId({ user: 'u01', view: 'visit', step, showStaff, outcome }));
  assert.equal(tabletScreenId({ user: 'u01', view: 'visit', step: 0, outcome: {} }), 'TAB-21');
  assert.equal(tabletScreenId({ user: 'u01', view: 'visit', step: 4, showStaff: true }), 'TAB-26');
  assert.equal(tabletScreenId({ user: 'u01', view: 'visit', step: 4, showStaff: false }), 'TAB-25');
  assert.equal(tabletScreenId({ user: null }), 'TAB-01');
  // モーダルの種類ごとに、別のID
  const modalIds = Object.values(TAB_MODAL_IDS);
  assert.equal(new Set(modalIds).size, modalIds.length);
  modalIds.forEach(seen);
  assert.equal(TAB_MODAL_IDS.hearing, 'TAB-M11');
});

// ソースを読んで、モーダル・ドロワー・印刷用などの「文字で書いたID」が使われているか、表にないIDを使っていないか
const walk = (dir) => readdirSync(dir).flatMap((n) => {
  if (['node_modules', 'dist', 'tests', '.git', 'docs', 'scripts'].includes(n)) return [];
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : /\.(js|html)$/.test(n) ? [p] : [];
});
const ROOT = new URL('..', import.meta.url).pathname;
const sources = walk(ROOT).filter((p) => !p.endsWith('/src/screenIds.js') && !p.endsWith('/src/screenIdsDoc.js')).map((p) => readFileSync(p, 'utf8'));
const used = (id) => sources.some((t) => t.includes(`'${id}'`) || t.includes(`"${id}"`));

test('表の画面IDは、すべて、どこかで使われている（画面の状態から決まる、または、モーダル・ドロワー・印刷用の画面に書いてある）', () => {
  const missing = SCREENS.filter((s) => !reached.has(s.id) && !used(s.id)).map((s) => s.id);
  assert.deepEqual(missing, []);
});

test('ソースに書いた画面IDは、すべて、表にある（表にないIDを書かない）', () => {
  const unknown = [];
  for (const t of sources) for (const m of t.matchAll(/['"]((?:LNC|CC|TAB|STR|WH|HQ|ACC|MST|GMO)-(?:M|P)?\d{2}(?:-\d)?)['"]/g)) if (!screenOf(m[1])) unknown.push(m[1]);
  assert.deepEqual(unknown, []);
});

test('モーダルの札: 画面IDと画面名が入る。印刷には出さない', () => {
  const h = modalBadgeHtml('CC-M02');
  assert.ok(h.includes('data-screen-id="CC-M02"') && h.includes(screenLabel('CC-M02')) && h.includes('お客様の詳細'));
  assert.ok(h.includes('print:hidden'));
});

test('docs/SCREEN_IDS.md は、表と合っている（表を直したら、node scripts/gen-screen-ids.mjs で作り直す）', () => {
  assert.equal(readFileSync(new URL('../docs/SCREEN_IDS.md', import.meta.url), 'utf8'), screenIdsDoc());
});
