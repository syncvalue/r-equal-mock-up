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
  assert.ok(balanceTab(c).includes('鑑定士からの補充の依頼') && balanceTab(c).includes('data-chat-open="adv|SAR-1"') && !balanceTab(c).includes('data-adv-chat-send') && !balanceTab(c).includes('data-f="chat.text"') && balanceTab(c).includes('誰の番') && !balanceTab(c).includes('data-adv-ok') && !balanceTab(c).includes('振り込む金額') && balanceTab(c).includes('入金・支払の登録') && balanceTab(c).includes('鑑定士の補充金') && balanceTab(c).includes('お客様への支払'));
  const claims = claimsTab(c);
  for (const w of ['前日繰越金', '終業時に数えた金額', '経費（ガソリン代など）', 'お客様への支払', '領収書', 'チェック済みにする', '差戻しの理由', '終業・日報が未提出', 'data-item-toggle', '写真と金額が一致していることを確認', '1件ずつの確認', 'インボイス', 'data-purchase-toggle', 'data-zoom', 'cursor-zoom-in', '経理部の対応待ちが', 'data-ball-jump', '▶ 経理部の番', '⏳ 鑑定士待ち', 'data-cal-pick', 'すべてチェック済み', '要対応の未チェック']) assert.ok(claims.includes(w) || claimsTab({ ...c, st: { ...st, claimUser: 'u06', returning: null } }).includes(w), w);
  assert.ok(claimsTab({ ...c, st: { ...st, claimUser: 'u07', returning: null } }).includes('数えた現金の写真がない'));
  assert.ok(claims.includes('data-chat-open="claim|u02|') && !claims.includes('data-f="chat.text"')); // やり取りは、画面には埋め込まず、モーダルで開く
  const { chatModalView } = await import('../accounting/claimsTab.js');
  assert.equal(chatModalView(c), '');
  const mClaim = chatModalView({ ...c, st: { ...st, chatModal: { kind: 'claim', userId: 'u02', date: yesterday }, chat: { text: '確認します' } } });
  for (const w of ['data-chat-close', 'さんとのやり取り', '経費精算', 'data-f="chat.text"', 'data-chat-modal-send', 'value="確認します"', 'ガソリン代の領収書が見当たりません']) assert.ok(mClaim.includes(w), w);
  const mAdv = chatModalView({ ...c, st: { ...st, chatModal: { kind: 'adv', id: 'SAR-1' }, chat: { text: '' } } });
  assert.ok(mAdv.includes('補充の依頼') && mAdv.includes('10万円ではどうですか？') && mAdv.includes('銀行システム') && mAdv.includes('data-chat-modal-send'));
  const mClosed = chatModalView({ ...c, st: { ...st, chatModal: { kind: 'adv', id: 'SAR-4' }, chat: { text: '' } } });
  assert.ok(mClosed.includes('完了') && !mClosed.includes('data-chat-modal-send') && !mClosed.includes('data-f="chat.text"')); // 完了した依頼は、送れない
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


test('マーケティング部の画面は、描画できる（チラシの登録・一覧）。反響管理の画面も、見本の受付で描画できる', async () => {
  root.innerHTML = '';
  await import('../marketing/marketing.js');
  assert.ok(root.innerHTML.includes('マーケティング部') && root.innerHTML.includes('data-login-id') && !root.innerHTML.includes('チラシの登録')); // ログインしていなければ、ログイン画面
  const { responseTab } = await import('../marketing/responseTab.js');
  const { loadFlyers } = await import('../src/flyers.js');
  const { sampleReservations } = await import('../callcenter/samples.js');
  const flyers = loadFlyers('2026-11-19');
  const html = responseTab({ flyers, receptions: sampleReservations(), selId: 'N1019', mediaFilter: '' });
  assert.ok(html.includes('チラシごとの反響') && html.includes('data-response-row="N1019"') && html.includes('日ごとの受付') && html.includes('1件あたり'));
  assert.ok(responseTab({ flyers, receptions: [], selId: null, mediaFilter: 'dm' }).includes('data-media="dm"'));
});

test('マーケティング部の配布カレンダーは、描画できる。複数日のチラシは、毎日に出る', async () => {
  const { calendarTab } = await import('../marketing/calendarTab.js');
  const { defaultFlyers } = await import('../src/flyers.js');
  const html = calendarTab({ flyers: defaultFlyers('2026-11-19'), month: '2026-11', today: '2026-11-19', selDay: '2026-11-19' });
  assert.ok(html.includes('2026年11月の配布') && html.includes('data-cal-grid') && html.includes('data-cal-day="2026-11-19"') && html.includes('N1020') && html.includes('この日に配布') === false);
  assert.ok(html.includes('2026-11-19 に配布するチラシ') && html.includes('P1016')); // 11/18〜11/20 のポスティング
});

test('マーケティング部のダッシュボードは、描画できる。本日配布・本日中に入稿・直近3か月の反響の上位・今月が出る', async () => {
  const { dashboardTab } = await import('../marketing/dashboardTab.js');
  const { defaultFlyers } = await import('../src/flyers.js');
  const { sampleReservations } = await import('../callcenter/samples.js');
  const flyers = defaultFlyers('2026-11-19');
  const html = dashboardTab({ flyers, receptions: sampleReservations(new Date(2026, 10, 19)), results: {}, today: '2026-11-19', topLimit: 3 });
  for (const k of ['data-tile="today"', 'data-tile="due"', 'data-tile="calls"', 'data-tile="profit"', 'data-today-list', 'data-due', 'data-top', '直近3か月の反響 上位3件']) assert.ok(html.includes(k), k);
  assert.ok(!html.includes('data-stages')); // 進捗の件数のカードは出さない
  assert.ok(html.includes('N1021') && html.includes('P1017')); // 本日が期限のチラシと、期限が過ぎたチラシ
  assert.ok(html.includes('data-flyer-advance="N1021"') && html.includes('期限切れ'));
});

test('配布カレンダーは、エリアごとに色分けし、エリアで絞り込める', async () => {
  const { calendarTab } = await import('../marketing/calendarTab.js');
  const { defaultFlyers } = await import('../src/flyers.js');
  const { areaColor } = await import('../src/areaColor.js');
  const flyers = defaultFlyers('2026-11-19');
  const all = calendarTab({ flyers, month: '2026-11', today: '2026-11-19', selDay: '2026-11-19', area: '' });
  assert.ok(all.includes('data-cal-areas') && all.includes('data-cal-area="大阪府"') && all.includes('data-cal-area="京都府"') && all.includes('data-cal-area="兵庫県"'));
  assert.ok(all.includes(areaColor('大阪府').solid) && all.includes(areaColor('京都府').solid)); // 帯の色
  const osaka = calendarTab({ flyers, month: '2026-11', today: '2026-11-19', selDay: '2026-11-19', area: '大阪府' });
  assert.ok(osaka.includes('N1020') && !osaka.includes('P1016')); // 大阪府のチラシだけ（P1016 は京都府）
  assert.ok(osaka.includes('2026-11-19 に配布するチラシ') && osaka.includes('1件'));
});
