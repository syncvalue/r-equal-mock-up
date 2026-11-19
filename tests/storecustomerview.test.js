import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const C = await import('../src/storeCustomerView.js');
const { customerScreenHtml } = await import('../store/customerScreenView.js');
const D = await import('../src/storeDraft.js');
const { storeScreenId, screenOf } = await import('../src/screenIds.js');

const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const visit = { id: 'V1', customer: { name: '鈴木 一郎', kana: 'スズキ イチロウ', phone: '090-1111-2222' } };
const base = () => D.blankDraft(visit);
const withItems = (d) => D.updateItem(D.updateItem(D.addProduct(D.addProduct(d, { id: 'P1', name: 'カルティエ ラブリング K18WG', category: 'ジュエリー・貴金属' }), { id: 'P2', name: '銀（シルバー） アクセサリー', category: 'ジュエリー・貴金属' }), 'P1', { price: 20000 }), 'P2', { price: 10000 });

test('お客様画面の内容: 作業がなければ「いらっしゃいませ」', () => {
  assert.deepEqual(C.customerViewOf(null), { kind: 'welcome' });
  assert.deepEqual(C.welcomeView(), { kind: 'welcome' });
  assert.deepEqual(C.thanksView(), { kind: 'thanks' });
});

test('お客様画面の内容: 手順ごとに、お客様に見せてよいものだけになる（顧客ランク・厄介度・見送り品・シール・スタッフ向けの文言は含まない）', () => {
  const d0 = { ...base(), customer: { ...base().customer, address: '大阪市中央区1-1', birth: '1980-01-02' } };
  const v0 = C.customerViewOf(d0);
  assert.equal(v0.kind, 'confirm');
  assert.equal(v0.name, '鈴木 一郎');
  assert.deepEqual(v0.fields.map((f) => f.label), ['お名前', 'フリガナ', '電話番号']); // 来店時に聞いた項目だけ。住所・生年月日は、あとの本人確認
  assert.ok(v0.fields.every((f) => f.value)); // 未入力の欄は出さない

  const v1 = C.customerViewOf({ ...base(), step: 1, explain: { flow: true } });
  assert.equal(v1.kind, 'explain');
  assert.equal(v1.items.length, 5);
  assert.ok(v1.items.every((i) => !i.text.includes('ご説明した'))); // スタッフの確認用の文言ではなく、お客様向けの文言
  assert.ok(v1.items.some((i) => i.text.includes('クーリング・オフ')));

  const d2 = { ...withItems(base()), step: 2 };
  const v2 = C.customerViewOf(d2);
  assert.equal(v2.kind, 'items');
  assert.equal(v2.total, 30000);
  assert.deepEqual(v2.items.map((i) => [i.name, i.qty, i.unit, i.subtotal, i.sell]), [['カルティエ ラブリング K18WG', 1, 20000, 20000, true], ['銀（シルバー） アクセサリー', 1, 10000, 10000, true]]);
  assert.equal(v2.items[0].rank, 'A（美品）');

  // 本人確認: 入力欄の値（住所など）は、見せる内容に入れない
  const v3 = C.customerViewOf({ ...d2, step: 3, customer: { ...d2.customer, address: '大阪市', birth: '1980-01-02' } });
  assert.deepEqual(v3, { kind: 'identity', name: '鈴木 一郎', visitId: 'V1' });

  assert.equal(C.customerViewOf({ ...d2, step: 4 }).kind, 'preparing');

  const v4 = C.customerViewOf({ ...d2, step: 5, contractId: 'C1' });
  assert.equal(v4.kind, 'payment');
  assert.equal(v4.total, 30000);
  assert.equal(v4.contractSent, true);
  assert.equal(C.customerViewOf({ ...d2, step: 5 }).contractSent, false);

  const json = JSON.stringify([v0, v1, v2, v3, v4]);
  for (const ng of ['rank":"S', 'troub', 'declined', 'labels', 'シールNo', 'category']) assert.ok(!json.includes(ng), ng);
});

test('お客様画面の内容: 見送る商品は「お売りにならない」と分かり、合計に入らない。金額が未入力の商品は「査定中」', () => {
  const d = { ...D.updateItem(withItems(base()), 'P2', { sell: false }), step: 2 };
  const v = C.customerViewOf(d);
  assert.equal(v.total, 20000);
  assert.equal(v.items[1].sell, false);
  const pending = C.customerViewOf({ ...D.addProduct(base(), { id: 'P9', name: 'X', category: 'c' }), step: 2 });
  assert.equal(pending.items[0].unit, 0);
  assert.equal(pending.total, 0);
  // お支払いの手順には、売る商品だけ
  assert.deepEqual(C.customerViewOf({ ...d, step: 5 }).items.map((i) => i.name), ['カルティエ ラブリング K18WG']);
});

test('反映の保存: 店舗ごとに、いま見せている内容を保存・読み込み・消去できる。壊れた値は無視する', () => {
  assert.equal(C.loadCustomerView('S-NAMBA'), null);
  assert.ok(C.saveCustomerView('S-NAMBA', C.thanksView(), 1000));
  assert.ok(C.saveCustomerView('S-SHINJUKU', C.welcomeView(), 2000));
  assert.deepEqual(C.loadCustomerView('S-NAMBA'), { view: { kind: 'thanks' }, at: 1000 });
  assert.equal(C.loadCustomerView('S-SHINJUKU').view.kind, 'welcome'); // 別の店舗に影響しない
  mem.set(C.CUSTOMER_VIEW_KEY, '{壊れた');
  assert.equal(C.loadCustomerView('S-NAMBA'), null);
  mem.delete(C.CUSTOMER_VIEW_KEY);
});

test('未反映の判定: いまの作業の内容と、お客様画面に出ている内容が同じなら反映済み。何も出していないときは「いらっしゃいませ」と同じ', () => {
  const d = { ...withItems(base()), step: 2 };
  const v = C.customerViewOf(d);
  assert.equal(C.isSynced(v, { view: v, at: 1 }), true);
  assert.equal(C.isSynced(C.customerViewOf(D.updateItem(d, 'P1', { price: 25000 })), { view: v, at: 1 }), false);
  assert.equal(C.isSynced(C.welcomeView(), null), true);
  assert.equal(C.isSynced(v, null), false);
  // 見えない内容（スタッフだけが見る欄）が変わっても、未反映にならない
  assert.equal(C.isSynced(C.customerViewOf({ ...d, customerOk: true, propose: 'yes' }), { view: v, at: 1 }), true);
});

test('お客様画面の表示: 各状態の文言。個人情報は、手順で見せたとき以外は出ない', () => {
  const store = { id: 'S-NAMBA', name: 'なんば' };
  const welcome = text(customerScreenHtml(C.welcomeView(), { store }));
  assert.ok(welcome.includes('いらっしゃいませ') && welcome.includes('なんば店'));
  assert.ok(text(customerScreenHtml(C.thanksView(), { store })).includes('ありがとうございました'));
  const d = { ...withItems(base()), step: 2 };
  const items = text(customerScreenHtml(C.customerViewOf(d), { store }));
  assert.ok(items.includes('鈴木 一郎 様') && items.includes('カルティエ ラブリング K18WG') && items.includes('¥20,000') && items.includes('¥30,000') && items.includes('合計'));
  const pay = text(customerScreenHtml(C.customerViewOf({ ...d, step: 5 }), { store }));
  assert.ok(pay.includes('お支払い金額') && pay.includes('¥30,000'));
  const exp = text(customerScreenHtml(C.customerViewOf({ ...base(), step: 1 }), { store }));
  assert.ok(exp.includes('ご説明') && exp.includes('古物営業法'));
  const conf = text(customerScreenHtml(C.customerViewOf({ ...base(), customer: { ...base().customer, address: '大阪市' } }), { store }));
  assert.ok(conf.includes('ご確認') && conf.includes('090-1111-2222') && !conf.includes('大阪市')); // 住所は、あとの本人確認で入力する
  assert.ok(text(customerScreenHtml(C.customerViewOf({ ...d, step: 4 }), { store })).includes('お待ち'));
  // 見るだけの画面には、操作の部品（ボタン・入力欄）はない。入力できるのは、受付と本人確認と、待機の画面の「来店の方はこちら」だけ
  for (const v of [C.thanksView(), C.customerViewOf(d), C.customerViewOf({ ...d, step: 5 }), C.customerViewOf({ ...base(), step: 1 }), C.receivedView('x')]) assert.ok(!/<(button|input|select|textarea)/.test(customerScreenHtml(v, { store })));
  const w = customerScreenHtml(C.welcomeView(), { store });
  assert.ok(w.includes('data-checkin-start') && !/<(input|select|textarea)/.test(w));
  assert.ok(customerScreenHtml({ kind: 'unknown' }, { store }).includes('いらっしゃいませ')); // 知らない内容は、待機の画面
});

test('画面ID: お客様画面の状態ごとに、別のIDが付く。店舗の画面IDと重ならない', () => {
  const kinds = ['welcome', 'confirm', 'explain', 'items', 'preparing', 'payment', 'thanks', 'checkin', 'identity', 'received'];
  const ids = kinds.map((kind) => C.customerScreenId({ kind }));
  assert.equal(new Set(ids).size, kinds.length);
  for (const id of ids) assert.ok(screenOf(id), id);
  assert.equal(C.customerScreenId({ kind: 'zzz' }), C.customerScreenId({ kind: 'welcome' }));
  assert.equal(storeScreenId({}), 'STR-01');
});

test('店舗スタッフの画面: 「お客様画面を開く」（ヘッダー）と「お客様画面へ反映」（買取の手順）。反映済みかどうかが分かる', async () => {
  const { headerHtml } = await import('../store/boardView.js');
  const { purchaseHtml } = await import('../store/purchaseView.js');
  const header = headerHtml({ store: { id: 'S-NAMBA', name: 'なんば' }, staff: { name: '田中 美咲' }, date: '2026-11-19', summary: { visits: 0, purchased: 0, done: 0, rate: 0, total: 0 }, themeHtml: '' });
  assert.ok(header.includes('data-open-customer') && header.includes('お客様画面を開く'));
  const ctx = (synced) => ({ draft: { ...withItems(base()), step: 2 }, history: { isRepeat: false }, profile: { known: false }, declined: [], search: '', results: [], labelError: null, synced });
  const off = purchaseHtml(ctx(false));
  assert.ok(off.includes('data-reflect') && off.includes('お客様画面へ反映') && off.includes('未反映の変更があります'));
  assert.ok(purchaseHtml(ctx(true)).includes('お客様画面に反映済み'));
});

test('来店の受付（お客様の入力）: お名前と電話番号だけ。入力すると「待ち」に並び、受付者は「お客様（タブレットで入力）」。電話番号がないと受け付けない', async () => {
  const V = await import('../src/storeVisits.js');
  const opts = { storeIds: ['S-NAMBA'], now: new Date(2026, 10, 19, 11, 0).getTime() };
  const r = V.checkIn([], { storeId: 'S-NAMBA', name: '鈴木 一郎', phone: '090-1111-2222' }, opts);
  assert.equal(r.ok, true);
  assert.deepEqual([r.visit.status, r.visit.source, r.visit.customer.name, r.visit.customer.phone, r.visit.createdBy], ['waiting', 'walkin', '鈴木 一郎', '090-1111-2222', V.CHECKIN_BY]);
  assert.equal(V.checkIn([], { storeId: 'S-NAMBA', name: '鈴木 一郎', phone: ' ' }, opts).reason, 'noPhone');
  assert.equal(V.checkIn([], { storeId: 'S-NAMBA', name: ' ', phone: '090' }, opts).reason, 'noName');
  assert.equal(V.checkIn([], { storeId: 'S-NAMBA', name: '', phone: '' }, opts).reason, 'noName'); // お名前の不足を先に知らせる
  assert.equal(V.checkIn([], { storeId: 'S-NOPE', name: 'x', phone: '1' }, opts).reason, 'noStore');
});

test('本人確認書類の読み取り（OCR・モック）: 郵便番号・住所・生年月日が入る。お名前・電話番号・職業は触らない。元は変えない', async () => {
  const S = await import('../src/idScan.js');
  const c = { name: '鈴木 一郎', kana: '', phone: '090', phone2: '', zip: '', address: '', birth: '', occupation: '会社員' };
  const r = S.scanIdDocument(c);
  assert.deepEqual([r.name, r.phone, r.occupation, r.zip, r.address, r.birth], ['鈴木 一郎', '090', '会社員', S.SAMPLE_ID_FIELDS.zip, S.SAMPLE_ID_FIELDS.address, S.SAMPLE_ID_FIELDS.birth]);
  assert.equal(c.address, ''); // 元は変えない
  assert.equal(S.scanIdDocument({ ...c, kana: 'スズキ' }, { ...S.SAMPLE_ID_FIELDS, kana: 'ヤマダ' }).kana, 'スズキ'); // フリガナは、入っていれば残す
  assert.equal(S.scanIdDocument(c, { ...S.SAMPLE_ID_FIELDS, kana: 'ヤマダ' }).kana, 'ヤマダ');
  assert.deepEqual(S.missingIdentity(c), ['住所', '生年月日']);
  assert.deepEqual(S.missingIdentity(r), []);
});

test('お客様画面: 来店の受付・本人確認の入力欄。本人確認は、読み取って入った内容を、入力欄に出す。必須の欄に印', async () => {
  const store = { id: 'S-NAMBA', name: 'なんば' };
  const ci = customerScreenHtml(C.checkinView(), { store, form: { name: '鈴木 一郎', phone: '' }, error: '電話番号を、ご入力ください' });
  assert.ok(ci.includes('data-ci="name"') && ci.includes('data-ci="phone"') && ci.includes('value="鈴木 一郎"') && ci.includes('data-checkin-submit') && ci.includes('data-checkin-cancel'));
  assert.ok(!ci.includes('data-ci="address"')); // 来店の受付で聞くのは、お名前と電話番号だけ
  assert.ok(text(ci).includes('電話番号を、ご入力ください') && ci.includes('role="alert"'));
  const S = await import('../src/idScan.js');
  const d = { ...base(), step: 3, customer: S.scanIdDocument(base().customer) };
  const id = customerScreenHtml(C.customerViewOf(d), { store, draft: d });
  for (const f of C.IDENTITY_FIELDS) assert.ok(id.includes(`data-id="${f.key}"`), f.key);
  assert.ok(id.includes(S.SAMPLE_ID_FIELDS.address) && id.includes('type="date"') && id.includes('data-identity-submit'));
  assert.ok(text(id).includes('読み取った内容') && text(id).includes('鈴木 一郎') && /住所\s*＊/.test(text(id)) && /生年月日\s*＊/.test(text(id)));
  assert.ok(!id.includes('data-ci=')); // 本人確認で、お名前・電話番号は入力しない（来店のときに入力済み）
  const rec = text(customerScreenHtml(C.receivedView('スタッフが、ご案内いたします。'), { store }));
  assert.ok(rec.includes('ありがとうございます') && rec.includes('ご案内いたします'));
  // 入力欄の値は、見せる内容に入らないので、お客様が入力しても「未反映」にならない
  const typed = { ...d, customer: { ...d.customer, address: '別の住所' } };
  assert.equal(C.isSynced(C.customerViewOf(typed), { view: C.customerViewOf(d), at: 1 }), true);
});
