import { test } from 'node:test';
import assert from 'node:assert/strict';

// 画面のスクリプトを読み込み、最初の描画でエラーにならないことを確かめる（画面の部品を消したときの消し忘れを防ぐ）
const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const root = { innerHTML: '' };
globalThis.window = { matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener() {} };
globalThis.document = { documentElement: { classList: { toggle() {}, contains: () => false }, style: {} }, querySelector: () => root, querySelectorAll: () => [], addEventListener() {}, activeElement: null, head: { appendChild() {} }, createElement: () => ({}) };
globalThis.setInterval = () => {};

test('査定部の画面は、描画できる。入金・日報のボタンはない', async () => {
  await import('../honsha/honsha.js');
  assert.ok(root.innerHTML.includes('査定部'));
  assert.ok(root.innerHTML.includes('お知らせ送信'));
  assert.ok(!root.innerHTML.includes('入金') && !root.innerHTML.includes('日報'));
});

test('経理部の画面は、描画できる（サンプルデータ入り）', async () => {
  root.innerHTML = '';
  await import('../accounting/accounting.js');
  assert.ok(root.innerHTML.includes('経理部') && root.innerHTML.includes('残高・入出金管理') && root.innerHTML.includes('日次残高') && root.innerHTML.includes('鈴木 一郎'));
});

test('経理部の4つの画面（残高・入出金管理／経費精算／固定費・小口金管理／週間収支）は、サンプルデータで描画できる', async () => {
  const { balanceTab } = await import('../accounting/balanceTab.js');
  const { claimsTab } = await import('../accounting/claimsTab.js');
  const { fixedTab } = await import('../accounting/fixedTab.js');
  const { weeklyTab } = await import('../accounting/weeklyTab.js');
  const { weekStart } = await import('../src/weekly.js');
  const { loadLedger } = await import('../src/ledger.js');
  const { USERS } = await import('../src/dashboard.js');
  const day = new Date().toISOString().slice(0, 10);
  const st = { office: '', ledger: loadLedger(), selDay: null, selUser: null, led: { kind: 'in', category: 'sales', date: day, amount: 0, cost: 0, userId: '', memo: '' }, pay: { customerName: '', amount: 0, reason: '', userId: '', memo: '' }, fix: { id: '', type: 'rent', name: '', amount: 0, payDay: 25 }, pu: { appraiserId: 'a1', date: day, amount: 0, memo: '' }, returning: { id: 'x', reason: '' }, claimFilter: 'all', month: day.slice(0, 7), week: weekStart(day) };
  const c = { st, scoped: () => USERS, scopedIds: () => USERS.map((u) => u.id), officeOf: () => '大阪', withOffice: (u) => `${u.name}（大阪）` };
  assert.ok(balanceTab(c).includes('入金・支払の登録') && balanceTab(c).includes('鑑定士の立替金') && balanceTab(c).includes('お客様への支払'));
  assert.ok(claimsTab(c).includes('領収書') && claimsTab(c).includes('精算する') && claimsTab(c).includes('差戻し'));
  assert.ok(fixedTab(c).includes('本社 家賃') && fixedTab(c).includes('鑑定士の小口金') && fixedTab(c).includes('補充が必要'));
  const w = weeklyTab(c);
  assert.ok(w.includes('粗利') && w.includes('直近8週の推移') && !w.includes('NaN') && !w.includes('undefined'));
  assert.ok(fixedTab(c).includes('鑑定士からの申請（承認待ち）') && fixedTab(c).includes('経理代行') && fixedTab(c).includes('先に補充'));
  for (const html of [balanceTab(c), claimsTab(c), fixedTab(c)]) assert.ok(!html.includes('NaN') && !html.includes('undefined'));
});

test('マスタ管理の画面は、描画できる。社員・営業所・倉庫・委託先の各マスタを切り替えて表示できる', async () => {
  root.innerHTML = '';
  await import('../master/master.js');
  assert.ok(root.innerHTML.includes('マスタ管理') && root.innerHTML.includes('鈴木 一郎') && root.innerHTML.includes('小川 直樹') && root.innerHTML.includes('data-new'));
});

globalThis.sessionStorage = { getItem: (k) => (k === 'rq-mock-wh-session' ? 'wh01' : null), setItem() {}, removeItem() {} }; // 倉庫担当としてログイン済み

test('倉庫・物流の画面は、描画できる（サンプルデータ入り）。商品管理のほか、出品・売上・返品の各タブも表示できる', async () => {
  root.innerHTML = '';
  await import('../warehouse/warehouse.js');
  assert.ok(root.innerHTML.includes('倉庫・物流') && root.innerHTML.includes('商品管理') && root.innerHTML.includes('ルイ・ヴィトン ネヴァーフル MM'));
  const { TABS, menuView } = await import('../warehouse/menu.js'); // 各画面へは、左側の開閉式メニューから移動する
  const menu = menuView({ tab: 'stock', badges: {}, staff: { name: '小川 直樹' }, warehouseName: '大阪倉庫' });
  for (const label of ['商品管理', '入庫', '倉庫間移動', '販売（出品）', '売上管理', 'クーリングオフ返品']) assert.ok(TABS.some((t) => t.label === label) && menu.includes(label), label);
  assert.ok(!root.innerHTML.includes('メインメニュー')); // 初めは、メニューは閉じている
});

test('店舗の画面は、描画できる。ログイン前はログイン画面、店舗スタッフとしてログイン済みなら、来店の一覧（サンプル入り）', async () => {
  globalThis.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  root.innerHTML = '';
  await import('../store/store.js?login');
  assert.ok(root.innerHTML.includes('ログインID') && root.innerHTML.includes('st01'));
  globalThis.sessionStorage = { getItem: (k) => (k === 'rq-mock-store-session' ? 'st01' : null), setItem() {}, removeItem() {} };
  root.innerHTML = '';
  await import('../store/store.js?board');
  assert.ok(root.innerHTML.includes('なんば店') && root.innerHTML.includes('飛び込みの受付') && root.innerHTML.includes('山田 花子') && root.innerHTML.includes('田中 美咲'));
  assert.ok(JSON.parse(mem.get('rq-mock-store-visits')).length >= 8); // サンプルの来店が入る
});

test('鑑定士タブレットの小口金: 残り・申請・自分の申請の状況が出る。申請すると承認待ちになり、取り下げられる', async () => {
  const P = await import('../src/pettyRequest.js');
  const { pettyView } = await import('../src/pettyView.js');
  const before = P.pettyPendingCount('u03');
  const s = { user: 'u03', petty: P.blankPettyForm() };
  assert.equal(P.sendPettyRequest('u03', { ...P.blankPettyForm(), amount: 0, memo: 'x' }), false);
  assert.equal(P.pettyReady({ ...P.blankPettyForm(), amount: 100, memo: ' ' }), false);
  assert.equal(P.sendPettyRequest('u03', { ...P.blankPettyForm(), amount: 2500, memo: '資料のコピー代' }), true);
  assert.equal(P.pettyPendingCount('u03'), before + 1);
  const html = pettyView(s);
  assert.ok(html.includes('使用を申請する') && html.includes('資料のコピー代') && html.includes('承認待ち') && html.includes('残り') && !html.includes('NaN'));
  const { loadPettyUses } = await import('../src/fixedCosts.js');
  P.withdrawPetty('u04', loadPettyUses().find((u) => u.memo === '資料のコピー代').id); // 他の鑑定士は取り下げられない
  assert.equal(P.pettyPendingCount('u03'), before + 1);
  P.withdrawPetty('u03', loadPettyUses().find((u) => u.memo === '資料のコピー代').id);
  assert.equal(P.pettyPendingCount('u03'), before);
});
