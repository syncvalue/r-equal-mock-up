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
  assert.ok(root.innerHTML.includes('経理部') && root.innerHTML.includes('経費精算') && root.innerHTML.includes('前日繰越金') && root.innerHTML.includes('現金の照合') && root.innerHTML.includes('チェック済みにする'));
});

test('経理部の画面（経費精算／残高・入出金管理／週間収支）は、サンプルデータで描画できる。固定費の画面も、まだ描画できる', async () => {
  const { balanceTab } = await import('../accounting/balanceTab.js');
  const { claimsTab } = await import('../accounting/claimsTab.js');
  const { fixedTab } = await import('../accounting/fixedTab.js');
  const { weeklyTab } = await import('../accounting/weeklyTab.js');
  const { weekStart } = await import('../src/weekly.js');
  const { loadLedger } = await import('../src/ledger.js');
  const { USERS } = await import('../src/dashboard.js');
  const { dateKey } = await import('../src/workday.js');
  const { shiftDate } = await import('../src/dailyCheck.js');
  const day = dateKey();
  const yesterday = shiftDate(day, -1);
  const st = { office: '', ledger: loadLedger(), selDay: null, selUser: null, led: { kind: 'in', category: 'sales', date: day, amount: 0, cost: 0, userId: '', memo: '' }, pay: { customerName: '', amount: 0, reason: '', userId: '', memo: '' }, fix: { id: '', type: 'rent', name: '', amount: 0, payDay: 25 }, returning: { id: 'u02', reason: '' }, claimFilter: 'all', advOpen: 'SAR-1', chat: { text: '' }, claimUser: 'u02', checkDate: yesterday, calOpen: true, openPurchase: [], calMonth: yesterday.slice(0, 7), month: day.slice(0, 7), week: weekStart(day) };
  const c = { st, scoped: () => USERS, scopedIds: () => USERS.map((u) => u.id), officeOf: () => '大阪', withOffice: (u) => `${u.name}（大阪）`, today: () => day };
  assert.ok(balanceTab(c).includes('鑑定士からの補充の依頼') && balanceTab(c).includes('data-adv-open') && balanceTab(c).includes('data-adv-chat-send') && balanceTab(c).includes('誰の番') && !balanceTab(c).includes('data-adv-ok') && !balanceTab(c).includes('振り込む金額') && balanceTab(c).includes('入金・支払の登録') && balanceTab(c).includes('鑑定士の補充金') && balanceTab(c).includes('お客様への支払'));
  const claims = claimsTab(c);
  for (const w of ['前日繰越金', '終業時に数えた金額', '経費（ガソリン代など）', 'お客様への支払', '領収書', 'チェック済みにする', '差戻しの理由', '終業・日報が未提出', 'data-item-toggle', '写真と金額が一致していることを確認', '1件ずつの確認', 'インボイス', 'data-purchase-toggle', 'data-zoom', 'cursor-zoom-in', '経理部の対応待ちが', 'data-ball-jump', '▶ 経理部の番', '⏳ 鑑定士待ち', 'data-cal-pick', 'すべてチェック済み', '要対応の未チェック']) assert.ok(claims.includes(w) || claimsTab({ ...c, st: { ...st, claimUser: 'u06', returning: null } }).includes(w), w);
  assert.ok(claimsTab({ ...c, st: { ...st, claimUser: 'u07', returning: null } }).includes('数えた現金の写真がない'));
  const { zoomView } = await import('../accounting/ui.js');
  const zv = zoomView({ src: 'data:x', alt: '領収書' });
  assert.ok(zv.includes('data-zoom-close') && zv.includes('領収書の拡大表示') && zv.includes('src="data:x"'));
  const { loadDays } = await import('../src/workday.js');
  const buyId = Object.values(loadDays()).find((d) => d.userId === 'u02' && d.date === yesterday).expenses.find((e) => e.type === 'purchase').id;
  assert.ok(!claims.includes('買取の内訳</div>') && claims.includes('＋'));
  const opened = claimsTab({ ...c, st: { ...st, openPurchase: [buyId] } });
  assert.ok(opened.includes('買取の内訳</div>') && opened.includes('－') && opened.includes('合計'));
  assert.ok(fixedTab(c).includes('本社 家賃') && !fixedTab(c).includes('小口金'));
  const w = weeklyTab(c);
  assert.ok(w.includes('粗利') && w.includes('直近8週の推移') && !w.includes('NaN') && !w.includes('undefined'));
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

