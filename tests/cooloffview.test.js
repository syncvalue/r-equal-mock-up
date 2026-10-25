import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const { buildSample } = await import('../src/warehouseSample.js');
const W = await import('../src/warehouse.js');
const { DEFAULT_MASTER: MASTER } = await import('../src/warehouseMaster.js');
const { returnTab } = await import('../warehouse/returnTab.js');
const { cooloffPage, resultsHtml, formHtml, progressHtml } = await import('../callcenter/cooloffView.js');

const NOW = new Date(2026, 9, 25, 15, 0).getTime();
const sample = buildSample(NOW);
const own = (id) => W.scopeState(sample, id, MASTER);
const html = (id) => returnTab(own(id), { }, NOW, { full: sample, master: MASTER });

test('倉庫のクーリングオフ画面: 問い合わせの回答待ちに回答ボタンがあり、返送・完了の対応と、対応不可の記録も出る。受付の入力欄はない', () => {
  const all = ['W-OSAKA', 'W-KANTO', 'W-FUKUOKA', 'W-HONSHA'].map(html).join('');
  assert.ok(all.includes('問い合わせへの回答待ち') && all.includes('data-inq-ok') && all.includes('data-inq-ng') && all.includes('data-inq-note'));
  assert.ok(all.includes('data-ship=') && all.includes('data-return-done='));
  assert.ok(all.includes('対応不可') && all.includes('売却済みのため'));
  assert.ok(all.includes('受電') && all.includes('佐藤')); // 受電したオペレーター
  assert.ok(!all.includes('data-return-add') && !all.includes('返品を受け付ける'));
  // 回答できるのは、その倉庫の依頼だけ（松本 千春の問い合わせは、納入先の倉庫に届く）
  const hasAsk = ['W-OSAKA', 'W-KANTO', 'W-FUKUOKA', 'W-HONSHA'].filter((id) => html(id).includes('data-inq-ok'));
  assert.equal(hasAsk.length, 1);
});

test('コールセンターのクーリングオフ: 商品を探した結果に、状態の目印と選択欄が出る。売却済み・依頼中は選べない', () => {
  const contracts = W.cooloffContracts(sample, '松本', NOW);
  const r = resultsHtml(contracts, '松本', { visitId: '', codes: [] });
  assert.ok(r.includes('松本 千春') && r.includes('data-co-code') && r.includes('すでに依頼中'));
  assert.ok(r.includes('disabled')); // 依頼中の商品は選べない
  const free = W.cooloffContracts(sample, '加藤', NOW);
  assert.ok(resultsHtml(free, '加藤', { visitId: '', codes: [] }).includes('在庫・期間内'));
  assert.ok(resultsHtml([], 'zzz', { visitId: '', codes: [] }).includes('該当する商品がありません'));
  assert.ok(resultsHtml([], '', { visitId: '', codes: [] }).includes('探して'));
});

test('コールセンターのクーリングオフ: 選んだ商品の案内（倉庫に問い合わせ／対応不可）と、作成ボタン', () => {
  const contracts = W.cooloffContracts(sample, '加藤', NOW);
  const c = contracts[0];
  const form = { phone: '090-0000-0000', reason: 'family', memo: '' };
  const none = formHtml(contracts, { visitId: '', codes: [] }, form);
  assert.ok(none.includes('data-co-create') && /data-co-create\s+disabled/.test(none));
  const sel = formHtml(contracts, { visitId: c.visitId, codes: [c.rows[0].unit.code] }, form);
  assert.ok(sel.includes('90-0000-0000') && !/data-co-create\s+disabled/.test(sel) && sel.includes('倉庫に問い合わせて'));
  const soldContract = W.cooloffContracts(sample, sample.units[0].customerName, NOW).find((x) => x.rows.some((r) => r.check.kind === 'sold'));
  const soldRow = soldContract.rows.find((r) => r.check.kind === 'sold');
  assert.ok(formHtml([soldContract], { visitId: soldContract.visitId, codes: [soldRow.unit.code] }, form).includes('対応不可として記録'));
});

test('コールセンターのクーリングオフ: 進捗一覧に、対応中の段階（受電 → 倉庫の回答 → 返送 → 代金の返還）と、完了・対応不可が出る', () => {
  const p = progressHtml(sample.returns, sample.units);
  for (const k of ['対応中', '完了・対応不可', '倉庫の回答', '代金の返還', '倉庫に問い合わせ中', '返送済み・代金の返還待ち', '完了', '対応不可', '売却済みのため']) assert.ok(p.includes(k), k);
  assert.ok(!p.includes('data-ship') && !p.includes('data-inq-ok')); // オペレーターは、進捗を見るだけ
  const page = cooloffPage({ q: '山田', resultsInner: 'R', formInner: 'F', progressInner: 'P' });
  for (const k of ['data-co-q', 'id="co-results"', 'id="co-form"', 'id="co-progress"', 'value="山田"']) assert.ok(page.includes(k), k);
});

test('お客様の入力は無害化する（検索語・メモ・名前に含まれる記号）', () => {
  const evil = '<img src=x onerror=alert(1)>';
  assert.ok(!cooloffPage({ q: evil, resultsInner: '', formInner: '', progressInner: '' }).includes(evil));
  const form = formHtml([], { visitId: '', codes: [] }, { phone: evil, reason: 'family', memo: evil });
  assert.ok(!form.includes(evil));
  const p = progressHtml([{ id: 'R', customerName: evil, codes: [], reason: 'family', memo: evil, status: 'inquiring', requestedAt: NOW, phone: evil, refund: 0, inquiry: { askedAt: NOW } }], []);
  assert.ok(!p.includes(evil));
});
