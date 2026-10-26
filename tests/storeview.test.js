import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const { boardHtml, headerHtml, blankWalkIn } = await import('../store/boardView.js');
const { purchaseHtml } = await import('../store/purchaseView.js');
const { loginView } = await import('../store/loginView.js');
const V = await import('../src/storeVisits.js');
const D = await import('../src/storeDraft.js');
const P = await import('../src/storePurchase.js');
const { sampleVisits } = await import('../src/storeSample.js');
const { DEFAULT_STORES } = await import('../src/stores.js');
const { DEFAULT_EMPLOYEES, storeStaffOf } = await import('../src/employees.js');
const { customerProfile, historyOf, declinedList } = await import('../src/customerHistory.js');

const NOW = new Date(2026, 9, 25, 11, 0).getTime();
const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const list = sampleVisits(NOW, ['S-NAMBA', 'S-SHINJUKU']);
const profileOf = (p) => (p ? customerProfile([p]) : null);

test('ログイン画面: 店舗スタッフのデモ用アカウントと所属店舗が出る', () => {
  const t = text(loginView('', storeStaffOf(DEFAULT_EMPLOYEES), DEFAULT_STORES));
  assert.ok(t.includes('店舗') && /st01 田中 美咲 なんば店/.test(t) && /st03 松井 彩花 新宿店/.test(t), t);
  assert.ok(loginView('IDまたはパスワードが違います').includes('role="alert"'));
});

test('ヘッダー: 店舗名・日付・来店数・買取件数・成約率・買取額・スタッフ名・ログアウト', () => {
  const summary = V.summaryOf(list, 'S-NAMBA', '2026-10-25');
  const t = text(headerHtml({ store: DEFAULT_STORES[0], staff: { name: '田中 美咲' }, date: '2026-10-25', summary, themeHtml: '' }));
  assert.ok(/なんば店/.test(t) && /10\/25（日）/.test(t) && /来店 2組/.test(t) && /買取 1件/.test(t) && /成約率 100%/.test(t) && /¥86,000/.test(t) && /田中 美咲/.test(t) && /ログアウト/.test(t), t);
});

test('来店の一覧: 待ち・対応中・予約・完了・取消に分かれ、状態に合う操作だけが出る。過去のお客様には、ランクの印が付く', () => {
  const board = V.boardOf(list, 'S-NAMBA', '2026-10-25');
  const html = boardHtml({ board, walk: blankWalkIn(), profileOf });
  const t = text(html);
  assert.ok(/待ち 1/.test(t) && /対応中 0/.test(t) && /これから来店の予約 1/.test(t) && /完了 1/.test(t), t);
  assert.ok(t.includes('山田 花子 様') && t.includes('14:00') && t.includes('鈴木 一郎 様') && t.includes('飛び込み') && /買取 ¥86,000（2点）/.test(t));
  const res = board.reserved[0].id;
  const wait = board.waiting[0].id;
  assert.ok(html.includes(`data-arrive="${res}"`) && html.includes(`data-noshow="${res}"`) && html.includes(`data-start="${res}"`));
  assert.ok(html.includes(`data-start="${wait}"`) && !html.includes(`data-arrive="${wait}"`)); // 待ちは、来店済みにする操作がない
  assert.ok(html.includes('data-walkin') && html.includes('data-w="name"'));
  assert.ok(/顧客[SABC]/.test(t), t); // 山田 花子は、過去の買取から顧客ランクが付く
});

test('対応中の来店には「買取を続ける」と担当の名前が出る。取消には理由が出る', () => {
  let l = V.startServing(list, list.find((v) => v.customer.name === '鈴木 一郎').id, { id: 'st01', name: '田中 美咲' }, { now: NOW });
  l = V.cancelVisit(l.list, list.find((v) => v.customer.name === '山田 花子').id, 'お客様のご都合', '佐藤', { now: NOW }).list;
  const html = boardHtml({ board: V.boardOf(l, 'S-NAMBA', '2026-10-25'), walk: blankWalkIn(), profileOf });
  assert.ok(html.includes('data-open=') && text(html).includes('対応: 田中 美咲') && text(html).includes('理由: お客様のご都合（佐藤）'));
});

const visit = V.boardOf(list, 'S-NAMBA', '2026-10-25').reserved[0]; // 山田 花子（過去の履歴あり）
const ctxOf = (d, over = {}) => ({ draft: d, history: historyOf({ phone: d.customer.phone }), profile: customerProfile([d.customer.phone]), declined: declinedList([d.customer.phone]), search: '', results: [{ id: 'p1', name: 'テスト商品', category: '腕時計' }], labelError: null, ...over });

test('買取 手順1 お客様確認: 過去のお客様はリピーターの印と評価が出て、台帳の項目を入力する。確認済みにするまで次へ進めない', () => {
  const d = D.blankDraft(visit);
  const html = purchaseHtml(ctxOf(d));
  const t = text(html);
  assert.ok(/リピーター 4回目/.test(t) && /お客様の情報/.test(t) && t.includes('前に査定したが、売らなかったもの'), t);
  for (const k of ['name', 'phone', 'address', 'birth']) assert.ok(html.includes(`data-c="${k}"`), k);
  assert.ok(html.includes('data-cok') && /<button class="b b-pri w-40" data-next disabled/.test(html));
  assert.ok(t.includes('1. お客様確認') && t.includes('5. 確認・支払い'));
  const ready = { ...d, customerOk: true, customer: { ...d.customer, address: '大阪市', birth: '1964-02-11' } };
  assert.ok(!/data-next disabled/.test(purchaseHtml(ctxOf(ready))));
});

test('買取 手順2 説明事項: 店頭用の5項目（クーリング・オフは対象外の説明）と、提案の回答', () => {
  const html = purchaseHtml(ctxOf({ ...D.blankDraft(visit), step: 1 }));
  assert.equal((html.match(/data-ex="/g) || []).length, 5);
  assert.match(text(html), /（クーリング・オフ）\s*の対象外/);
  assert.ok(html.includes('data-propose="yes"') && html.includes('data-propose="no"'));
});

test('買取 手順3 買取明細: 商品の検索結果・金額（単価）の入力・ランク・数量・売る/見送る。合計が出る', () => {
  let d = D.addProduct({ ...D.blankDraft(visit), step: 2 }, { id: 'p1', name: 'テスト商品', category: '腕時計' });
  d = D.updateItem(d, 'p1', { price: 30000 });
  d = D.setQty(d, 'p1', 2);
  const html = purchaseHtml(ctxOf(d));
  assert.ok(html.includes('data-add-p="p1"') && html.includes('data-i-price="p1"') && html.includes('data-i-rank="p1"') && html.includes('data-qty="p1"') && html.includes('data-sell="p1"') && html.includes('data-remove="p1"'));
  assert.ok(/合計 ¥60,000/.test(text(html)), text(html));
});

test('買取 手順4 シール: 売る商品を1点ずつ並べ、シールNo.・読み取り・色の選択肢（5つ）が出る', () => {
  let d = D.updateItem(D.addProduct({ ...D.blankDraft(visit), step: 3 }, { id: 'p1', name: 'テスト商品', category: '腕時計' }), 'p1', { price: 30000 });
  d = D.setQty(d, 'p1', 2);
  const html = purchaseHtml(ctxOf(d, { labelError: { key: 'p1-2', code: 'RQ-X' } }));
  assert.ok(html.includes('data-seal="p1-1"') && html.includes('data-seal="p1-2"') && html.includes('data-scan="p1-1"'));
  assert.equal((html.match(/data-color="p1-1"/g) || []).length, 5);
  assert.ok(text(html).includes('このシール（RQ-X）は、すでに使われています'));
});

test('買取 手順5 確認・支払い: お客様に見せる買取内容と合計、契約の送信、終了前の確認6項目。完了は確認がそろってから', () => {
  let d = D.updateItem(D.addProduct({ ...D.blankDraft(visit), step: 4 }, { id: 'p1', name: 'テスト商品', category: '腕時計' }), 'p1', { price: 30000 });
  let html = purchaseHtml(ctxOf(d));
  assert.ok(text(html).includes('お支払い金額 ¥30,000') && html.includes('data-send-gmo') && (html.match(/data-lv="/g) || []).length === P.LEAVE_CHECKS.length);
  assert.ok(/data-finish disabled/.test(html)); // 契約を送っていないので、完了できない
  d = { ...d, contractId: 'GS-1', checks: Object.fromEntries(P.LEAVE_CHECKS.map((c) => [c.key, true])), customerOk: true, customer: { ...d.customer, address: 'x', birth: '2000-01-01' } };
  html = purchaseHtml(ctxOf(d));
  assert.ok(!/data-finish disabled/.test(html) && html.includes('data-open-gmo') && !html.includes('data-send-gmo'));
  assert.ok(/data-prev disabled/.test(html) && /data-decline disabled/.test(html)); // 契約を送ったあとは、戻る・見送りはできない
});
