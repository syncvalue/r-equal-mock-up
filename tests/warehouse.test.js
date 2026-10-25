import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const W = await import('../src/warehouse.js');

const NOW = new Date(2026, 9, 25, 12, 0).getTime(); // 2026-10-25
const day = (n) => new Date(2026, 9, 25 - n, 10, 0).getTime();
const unit = (code, daysAgo, over = {}) => ({
  code, visitId: `V-${code}`, userId: 'u01', customerName: '山田 花子', at: day(daysAgo), date: W.dateOf(day(daysAgo)),
  itemId: code, name: `商品${code}`, category: 'バッグ', rank: 'A', n: 1, qty: 1, price: 10000, status: 'stored', storedAt: day(daysAgo), location: 'A棚（バッグ・小物）', by: 'u01', ...over,
});
const state = (units, records = {}, returns = []) => ({ units, records, returns });

test('保管期間: クーリングオフ（8日間）に郵送の余裕を足して、買取日（当日を含む）から10日間は販売しない', () => {
  assert.equal(W.coolingOffEnd('2026-10-16'), '2026-10-25'); // 10日目＝今日
  assert.equal(W.coolingOffEnd('2026-10-28'), '2026-11-06'); // 月またぎ
  assert.equal(W.inCoolingOff(unit('A', 9), NOW), true); // 10日目の今日まで期間内
  assert.equal(W.inCoolingOff(unit('B', 10), NOW), false); // 11日目から期間外
  assert.equal(W.inCoolingOff(unit('C', 0), NOW), true);
});

test('出品できるのは、入庫済みで、クーリングオフ期間が過ぎ、返品対応中でない商品だけ', () => {
  const rows = W.buildRows(state([unit('A', 10), unit('B', 3), unit('C', 11, { status: 'pending', storedAt: null, location: null }), unit('D', 11, { status: 'missing' })]), NOW);
  const by = Object.fromEntries(rows.map((r) => [r.unit.code, r]));
  assert.equal(by.A.stage, 'stock'); assert.equal(by.A.canList, true);
  assert.equal(by.B.stage, 'stock'); assert.equal(by.B.canList, false); assert.equal(by.B.cooling, true);
  assert.equal(by.C.stage, 'incoming'); assert.equal(by.C.canList, false);
  assert.equal(by.D.stage, 'missing'); assert.equal(by.D.canList, false);
});

test('チャネル: フリマと業者向けがあり、手数料は料率で計算する', () => {
  assert.ok(W.CHANNELS.some((c) => c.type === 'flea') && W.CHANNELS.some((c) => c.type === 'trade'));
  assert.equal(W.feeFor('mercari', 10000), 1000);
  assert.equal(W.feeFor('direct', 10000), 0);
  assert.equal(W.feeFor('unknown', 10000), 0);
});

test('出品価格の目安: 原価の1.3倍を千円単位に切り上げる', () => {
  assert.equal(W.suggestPrice({ price: 10000 }), 13000);
  assert.equal(W.suggestPrice({ price: 98000 }), 128000); // 127,400 → 128,000
});

test('出品: 出品価格とチャネルを記録する。期間内・二重出品は拒否（元の状態を変えない）', () => {
  const s = state([unit('A', 10), unit('B', 2)]);
  const ok = W.listItem(s, 'A', { channel: 'mercari', price: 15000, at: NOW });
  assert.equal(ok.ok, true);
  assert.deepEqual({ ...ok.state.records.A }, { stage: 'listed', channel: 'mercari', listPrice: 15000, listedAt: NOW });
  assert.deepEqual(s.records, {}); // 元は変更されない
  assert.equal(W.buildRows(ok.state, NOW).find((r) => r.unit.code === 'A').stage, 'listed');
  assert.equal(W.listItem(ok.state, 'A', { channel: 'yahoo', price: 1, at: NOW }).reason, 'notListable');
  assert.equal(W.listItem(s, 'B', { channel: 'mercari', price: 15000, at: NOW }).reason, 'notListable');
  assert.equal(W.listItem(s, 'A', { channel: 'nothing', price: 15000, at: NOW }).reason, 'badInput');
  assert.equal(W.listItem(s, 'A', { channel: 'mercari', price: 0, at: NOW }).reason, 'badInput');
});

test('出品中: 価格の変更と、取り下げ（在庫に戻る）', () => {
  const s = W.listItem(state([unit('A', 10)]), 'A', { channel: 'mercari', price: 15000, at: NOW }).state;
  const re = W.reprice(s, 'A', 13000);
  assert.equal(re.records.A.listPrice, 13000);
  assert.equal(s.records.A.listPrice, 15000);
  const off = W.delist(s, 'A');
  assert.equal(off.records.A, undefined);
  assert.equal(W.buildRows(off, NOW)[0].stage, 'stock');
});

test('売却: 手数料は料率で自動計算、送料・購入先を記録。出品中のものだけ売れる', () => {
  const s = W.listItem(state([unit('A', 10)]), 'A', { channel: 'mercari', price: 15000, at: NOW }).state;
  const sold = W.sell(s, 'A', { price: 14000, shipping: 800, buyer: 'フリマの購入者', at: NOW });
  assert.equal(sold.ok, true);
  assert.deepEqual({ ...sold.state.records.A }, { stage: 'sold', channel: 'mercari', listPrice: 15000, listedAt: NOW, soldAt: NOW, soldPrice: 14000, fee: 1400, shipping: 800, buyer: 'フリマの購入者' });
  assert.equal(W.sell(sold.state, 'A', { price: 1, at: NOW }).ok, false); // 二重売却
  assert.equal(W.sell(state([unit('B', 10)]), 'B', { price: 1000, at: NOW }).reason, 'notListed');
  assert.equal(W.sell(s, 'A', { price: -5, at: NOW }).reason, 'badInput');
  assert.equal(W.delist(sold.state, 'A').records.A.stage, 'sold'); // 売却済みは取り下げられない
});

const soldState = () => {
  let s = state([unit('A', 20, { price: 10000 }), unit('B', 20, { price: 20000, category: '腕時計' }), unit('C', 60, { price: 5000 }), unit('D', 20)]);
  s = W.listItem(s, 'A', { channel: 'mercari', price: 15000, at: day(3) }).state;
  s = W.sell(s, 'A', { price: 15000, shipping: 700, at: day(3) }).state; // 3日前（今月）
  s = W.listItem(s, 'B', { channel: 'auction', price: 30000, at: NOW }).state;
  s = W.sell(s, 'B', { price: 28000, shipping: 0, at: NOW }).state; // 今日
  s = W.listItem(s, 'C', { channel: 'yahoo', price: 7000, at: day(40) }).state;
  s = W.sell(s, 'C', { price: 6000, shipping: 500, at: day(40) }).state; // 先月
  return s;
};

test('売上: 利益＝売価−原価−手数料−送料。期間（今日・今月）で集計し、チャネル別・カテゴリ別に分ける', () => {
  const s = soldState();
  const today = W.salesStats(W.salesRows(s), W.dateOf(NOW));
  assert.equal(today.count, 1);
  assert.equal(today.revenue, 28000); assert.equal(today.cost, 20000); assert.equal(today.fee, 840); assert.equal(today.shipping, 0);
  assert.equal(today.profit, 28000 - 20000 - 840);
  const month = W.salesStats(W.salesRows(s), W.dateOf(NOW).slice(0, 7));
  assert.equal(month.count, 2);
  assert.equal(month.profit, (15000 - 10000 - 1500 - 700) + (28000 - 20000 - 840));
  assert.deepEqual(month.byChannel.map((c) => c.key).sort(), ['auction', 'mercari']);
  assert.deepEqual(month.byCategory.map((c) => c.key).sort(), ['バッグ', '腕時計']);
  assert.ok(Math.abs(month.margin - month.profit / month.revenue) < 1e-9);
  assert.equal(W.salesStats([], '2026-10').margin, 0); // 売上0でも割り算しない
});

test('在庫の集計: 状態ごとの点数と、在庫（売れていない入庫済み）の原価', () => {
  const s = soldState();
  const sum = W.stockSummary(W.buildRows(s, NOW));
  assert.equal(sum.sold, 3); assert.equal(sum.stock, 1); assert.equal(sum.listed, 0);
  assert.equal(sum.inventoryCost, 10000); // Dのみ
});

const soldRec = { stage: 'sold', channel: 'mercari', listPrice: 20000, listedAt: day(15), soldAt: day(10), soldPrice: 18000, fee: 1800, shipping: 600 };

test('クーリングオフ依頼: 受電で作る。期間超過・入庫前も作れて、倉庫が回答する。売却済みは対応不可。登録のない商品は作れない', () => {
  const s = state([unit('A', 3, { price: 12000 }), unit('B', 3, { price: 8000 }), unit('C', 11), unit('D', 1, { status: 'pending', storedAt: null }), unit('S', 20)], { S: soldRec });
  const r = W.requestReturn(s, { customerName: '山田 花子', phone: '090-1111-2222', codes: ['A', 'B', 'C', 'D', 'S', 'Z'], reason: 'family', at: NOW, by: '受付 太郎' });
  assert.equal(r.ok, true);
  assert.equal(r.ret.status, 'inquiring'); // 倉庫に問い合わせ中
  assert.deepEqual(r.ret.codes, ['A', 'B', 'C', 'D']);
  assert.equal(r.ret.refund, 12000 + 8000 + 10000 + 10000);
  assert.equal(r.ret.phone, '090-1111-2222');
  assert.deepEqual(r.ret.expiredCodes, ['C']); // 期間（10日）を過ぎた商品は、倉庫が個別に判断する
  assert.deepEqual(r.ret.inquiry, { askedAt: NOW, askedBy: '受付 太郎' });
  assert.equal(r.ret.requestedBy, '受付 太郎');
  const sold = r.rets.find((x) => x.status === 'unavailable');
  assert.deepEqual(sold.codes, ['S']);
  assert.deepEqual(sold.unavailable, { reason: 'sold', note: '売却済み', at: NOW, by: '受付 太郎' });
  assert.deepEqual(r.rejected, [{ code: 'Z', reason: 'unknown' }]);
  const rows = W.buildRows(r.state, NOW);
  assert.equal(rows.find((x) => x.unit.code === 'A').stage, 'returning');
  assert.equal(rows.find((x) => x.unit.code === 'A').canList, false);
  assert.equal(rows.find((x) => x.unit.code === 'S').stage, 'sold'); // 対応不可の記録は、商品の状態を変えない
  assert.equal(W.requestReturn(r.state, { customerName: '山田 花子', codes: ['A'], reason: 'family', at: NOW }).ok, false); // 対応中の二重受付
  assert.deepEqual(W.requestReturn(r.state, { customerName: '山田 花子', codes: ['A'], reason: 'family', at: NOW }).rejected, [{ code: 'A', reason: 'inProgress' }]);
  assert.equal(W.requestReturn(s, { customerName: '山田 花子', codes: ['Z'], reason: 'family', at: NOW }).ok, false); // 全部拒否
});

test('クーリングオフ依頼: 倉庫が回答する。返送できれば返送の準備へ。対応できなければ理由つきで終了し、商品は元の状態に戻る', () => {
  const s0 = state([unit('A', 12, { price: 12000 })]); // 期間超過の在庫
  const r = W.requestReturn(s0, { customerName: '山田 花子', codes: ['A'], reason: 'price', at: NOW });
  const id = r.ret.id;
  assert.equal(W.shipReturn(r.state, id, { tracking: '1', at: NOW }), r.state); // 回答の前には返送できない
  assert.equal(W.completeReturn(r.state, id, NOW).ok, false);
  assert.equal(W.answerInquiry(r.state, id, { ok: false, note: '  ', at: NOW }), r.state); // 対応できない場合は、理由が必要
  const ok = W.answerInquiry(r.state, id, { ok: true, note: '在庫にあります', at: NOW + 1, by: '藤田 結衣' });
  assert.equal(ok.returns[0].status, 'requested');
  assert.deepEqual({ ...ok.returns[0].inquiry }, { askedAt: NOW, ok: true, note: '在庫にあります', answeredAt: NOW + 1, answeredBy: '藤田 結衣' });
  assert.equal(W.answerInquiry(ok, id, { ok: false, note: 'やはり不可' }), ok); // 回答済みは変えない
  const ng = W.answerInquiry(r.state, id, { ok: false, note: '期間を過ぎており、出品の準備に入っている', at: NOW + 1, by: '藤田 結衣' });
  assert.equal(ng.returns[0].status, 'unavailable');
  assert.deepEqual({ ...ng.returns[0].unavailable }, { reason: 'warehouse', note: '期間を過ぎており、出品の準備に入っている', at: NOW + 1, by: '藤田 結衣' });
  const row = W.buildRows(ng, NOW)[0];
  assert.equal(row.stage, 'stock'); assert.equal(row.canList, true); // 返品にならなかった商品は、元の状態に戻る
  assert.equal(W.requestReturn(ng, { customerName: '山田 花子', codes: ['A'], reason: 'price', at: NOW }).ok, true); // 対応不可になったあとは、改めて依頼できる
});

test('クーリングオフ依頼: 出品中など在庫以外の商品は、問い合わせ中は状態を変えず、倉庫が返送できると答えたら返品対応中になる', () => {
  const listed = W.listItem(state([unit('A', 12)]), 'A', { channel: 'mercari', price: 15000, at: NOW }).state;
  const r = W.requestReturn(listed, { customerName: '山田 花子', codes: ['A'], reason: 'family', at: NOW });
  assert.equal(r.ok, true);
  assert.equal(W.buildRows(r.state, NOW)[0].stage, 'listed');
  assert.equal(W.buildRows(W.answerInquiry(r.state, r.ret.id, { ok: true, at: NOW }), NOW)[0].stage, 'returning');
});

test('返品: 返送済み（追跡番号）→ 完了（代金の返還を確認）。完了した商品は返品済みになり在庫から外れる', () => {
  const s0 = state([unit('A', 3, { price: 12000 })]);
  const r = W.requestReturn(s0, { customerName: '山田 花子', codes: ['A'], reason: 'price', at: NOW });
  const id = r.ret.id;
  const asked = W.answerInquiry(r.state, id, { ok: true, at: NOW });
  assert.equal(W.completeReturn(asked, id, NOW).ok, false); // 返送前には完了できない
  const shipped = W.shipReturn(asked, id, { tracking: ' 1234-5678 ', at: NOW });
  assert.equal(shipped.returns[0].status, 'shipped'); assert.equal(shipped.returns[0].tracking, '1234-5678');
  assert.equal(W.shipReturn(asked, id, { tracking: '', at: NOW }), asked); // 追跡番号が空なら変えない
  const done = W.completeReturn(shipped, id, NOW);
  assert.equal(done.ok, true);
  const row = W.buildRows(done.state, NOW)[0];
  assert.equal(row.stage, 'returned');
  assert.equal(W.stockSummary([row]).inventoryCost, 0);
  assert.equal(done.state.returns[0].status, 'done');
  assert.equal(W.requestReturn(done.state, { customerName: '山田 花子', codes: ['A'], reason: 'price', at: NOW }).rejected[0].reason, 'returned');
});

test('進捗: 依頼の状態ごとに、受電 → 倉庫の回答 → 返送 → 代金の返還 の段階と、いまの段階を返す', () => {
  const r = W.requestReturn(state([unit('A', 3)]), { customerName: '山田 花子', codes: ['A'], reason: 'price', at: NOW, by: '受付 太郎' });
  const label = (steps) => steps.map((x) => `${x.label}:${x.state}`).join(' ');
  assert.equal(label(W.returnSteps(r.ret)), '受電・依頼:done 倉庫の回答:current 返送:todo 代金の返還:todo');
  const asked = W.answerInquiry(r.state, r.ret.id, { ok: true, at: NOW });
  assert.equal(label(W.returnSteps(asked.returns[0])), '受電・依頼:done 倉庫の回答:done 返送:current 代金の返還:todo');
  const shipped = W.shipReturn(asked, r.ret.id, { tracking: '1', at: NOW });
  assert.equal(label(W.returnSteps(shipped.returns[0])), '受電・依頼:done 倉庫の回答:done 返送:done 代金の返還:current');
  const done = W.completeReturn(shipped, r.ret.id, NOW).state;
  assert.equal(label(W.returnSteps(done.returns[0])), '受電・依頼:done 倉庫の回答:done 返送:done 代金の返還:done');
  const ng = W.answerInquiry(r.state, r.ret.id, { ok: false, note: '不可', at: NOW });
  assert.equal(label(W.returnSteps(ng.returns[0])), '受電・依頼:done 倉庫の回答:ng 返送:todo 代金の返還:todo');
  assert.deepEqual(['inquiring', 'requested', 'shipped'].map((x) => W.isOpenReturn({ status: x })), [true, true, true]);
  assert.deepEqual(['done', 'unavailable'].map((x) => W.isOpenReturn({ status: x })), [false, false]);
});

test('依頼の探し方: お客様名・シールNo.・商品名で探し、契約ごとにまとめる。商品ごとに、受け付けられるかの目安を出す', () => {
  const same = { visitId: 'V-1' };
  const s = state([unit('A', 3, same), unit('B', 11, same), unit('E', 2, { visitId: 'V-X', customerName: '佐藤 一雄', name: 'ロレックス' }), unit('S', 20, { visitId: 'V-S' }), unit('L', 12, { visitId: 'V-L' }), unit('P', 1, { visitId: 'V-P', status: 'pending', storedAt: null })], { S: soldRec });
  const listed = W.listItem(s, 'L', { channel: 'mercari', price: 15000, at: NOW }).state;
  assert.deepEqual(W.cooloffContracts(listed, '', NOW), []); // 検索語がなければ出さない
  const yamada = W.cooloffContracts(listed, '山田', NOW);
  assert.equal(yamada.length, 4);
  const v1 = yamada.find((c) => c.visitId === 'V-1');
  assert.deepEqual(v1.rows.map((r) => [r.unit.code, r.check.kind]), [['A', 'ok'], ['B', 'expired']]);
  assert.equal(v1.total, 20000);
  assert.equal(v1.coolEnd, W.coolingOffEnd(v1.date));
  assert.equal(yamada.find((c) => c.visitId === 'V-S').rows[0].check.kind, 'sold');
  assert.equal(yamada.find((c) => c.visitId === 'V-L').rows[0].check.kind, 'ask'); // 出品中など、倉庫に確認するもの
  assert.equal(yamada.find((c) => c.visitId === 'V-P').rows[0].check.kind, 'ask');
  assert.deepEqual(W.cooloffContracts(s, ' ロレックス ', NOW).map((c) => c.customerName), ['佐藤 一雄']); // 商品名
  assert.deepEqual(W.cooloffContracts(s, 'e', NOW).map((c) => c.visitId), ['V-X']); // シールNo.（大文字小文字を区別しない）
  const asked = W.requestReturn(s, { customerName: '山田 花子', codes: ['A'], reason: 'family', at: NOW }).state;
  assert.equal(W.cooloffContracts(asked, '山田', NOW).find((c) => c.visitId === 'V-1').rows[0].check.kind, 'busy'); // すでに依頼中
});

test('保存: 出品の記録と返品の記録は、保存して読み戻せる。壊れたデータは空として扱う', () => {
  assert.deepEqual(W.loadRecords(), {});
  assert.deepEqual(W.loadReturns(), []);
  assert.equal(W.saveRecords({ A: { stage: 'listed' } }), true);
  assert.deepEqual(W.loadRecords(), { A: { stage: 'listed' } });
  mem.set('rq-mock-warehouse', '{broken');
  assert.deepEqual(W.loadRecords(), {});
  mem.set('rq-mock-returns', '{"not":"array"}');
  assert.deepEqual(W.loadReturns(), []);
});

test('委託: 外部の市場（業者オークション）に出すと「委託中」になり、倉庫の外にある。フリマは委託ではない', () => {
  assert.deepEqual(W.CHANNELS.filter((c) => c.consign).map((c) => c.key), ['auction']);
  const s = state([unit('A', 12), unit('B', 12)]);
  const r = W.listItem(s, 'A', { channel: 'auction', price: 30000, vendor: ' 大阪時計オークション ', at: NOW });
  assert.equal(r.ok, true);
  assert.deepEqual({ ...r.state.records.A }, { stage: 'consigned', channel: 'auction', listPrice: 30000, listedAt: NOW, vendor: '大阪時計オークション' });
  const row = W.buildRows(r.state, NOW).find((x) => x.unit.code === 'A');
  assert.equal(row.stage, 'consigned'); assert.equal(row.canList, false);
  assert.equal(W.buildRows(W.listItem(s, 'B', { channel: 'mercari', price: 1000, at: NOW }).state, NOW)[1].stage, 'listed');
  assert.equal(W.delist(r.state, 'A').records.A.stage, 'consigned'); // 取り下げではなく、戻す手続き（recall）を使う
  assert.equal(W.reprice(r.state, 'A', 28000).records.A.listPrice, 28000); // 希望価格は変えられる
});

test('委託: 売れたら入金（委託手数料を引く）。売れ残ったら倉庫に戻り、在庫になる', () => {
  const s = W.listItem(state([unit('A', 12), unit('B', 12)]), 'A', { channel: 'auction', price: 30000, vendor: 'X', at: NOW }).state;
  const sold = W.sell(s, 'A', { price: 28000, at: NOW });
  assert.equal(sold.ok, true);
  assert.equal(sold.state.records.A.stage, 'sold'); assert.equal(sold.state.records.A.fee, 840); assert.equal(sold.state.records.A.vendor, 'X');
  const back = W.recall(s, 'A');
  assert.equal(back.records.A, undefined);
  assert.equal(W.buildRows(back, NOW)[0].stage, 'stock');
  assert.equal(W.buildRows(back, NOW)[0].canList, true);
  const flea = W.listItem(state([unit('F', 12)]), 'F', { channel: 'mercari', price: 1000, at: NOW }).state;
  assert.equal(W.recall(flea, 'F'), flea); // 委託中でないものは変えない
  assert.equal(W.recall(sold.state, 'A'), sold.state);
});

test('在庫の集計: 委託中は倉庫の在庫の原価に入れず、別に数える', () => {
  const s = W.listItem(state([unit('A', 12, { price: 30000 }), unit('B', 12, { price: 5000 })]), 'A', { channel: 'auction', price: 40000, at: NOW }).state;
  const sum = W.stockSummary(W.buildRows(s, NOW));
  assert.equal(sum.consigned, 1); assert.equal(sum.consignedCost, 30000);
  assert.equal(sum.inventoryCost, 5000);
});

test('操作した担当者: 出品・売却・返品の各操作に、担当者名を記録できる（指定しなければ記録しない）', () => {
  const s0 = state([unit('A', 12), unit('B', 3)]);
  const listed = W.listItem(s0, 'A', { channel: 'mercari', price: 15000, at: NOW, by: '小川 直樹' }).state;
  assert.equal(listed.records.A.listedBy, '小川 直樹');
  const sold = W.sell(listed, 'A', { price: 14000, at: NOW, by: '中島 里奈' }).state;
  assert.equal(sold.records.A.listedBy, '小川 直樹'); assert.equal(sold.records.A.soldBy, '中島 里奈');
  assert.equal('listedBy' in W.listItem(s0, 'A', { channel: 'mercari', price: 15000, at: NOW }).state.records.A, false);
  const r = W.requestReturn(s0, { customerName: '山田 花子', codes: ['B'], reason: 'family', at: NOW, by: '山本 大地' });
  assert.equal(r.ret.requestedBy, '山本 大地');
  const asked = W.answerInquiry(r.state, r.ret.id, { ok: true, at: NOW, by: '中島 里奈' });
  assert.equal(asked.returns[0].inquiry.answeredBy, '中島 里奈');
  const shipped = W.shipReturn(asked, r.ret.id, { tracking: '1', at: NOW, by: '藤田 結衣' });
  assert.equal(shipped.returns[0].shippedBy, '藤田 結衣');
  assert.equal(W.completeReturn(shipped, r.ret.id, NOW, '小川 直樹').state.returns[0].doneBy, '小川 直樹');
});

test('シールNo.で探す: 前後の空白・小文字を無視して、1点を特定する。なければ null', () => {
  const rows = W.buildRows(state([unit('RQ-AB12', 12), unit('RQ-CD34', 12)]), NOW);
  assert.equal(W.findByCode(rows, ' rq-cd34 ').unit.code, 'RQ-CD34');
  assert.equal(W.findByCode(rows, 'RQ-ZZ99'), null);
  assert.equal(W.findByCode(rows, ''), null);
});

test('商品の履歴: 買取 → 入庫 → 出品 → 売却、返品の受付 → 返送 → 完了を、時系列に並べる', () => {
  const u = unit('A', 20, { storedAt: day(20) + 3600000, by: '営業', check: { by: '小川 直樹', at: day(20) + 3600000, method: 'manual' } });
  let s = W.listItem(state([u]), 'A', { channel: 'mercari', price: 15000, at: day(5), by: '中島 里奈' }).state;
  s = W.sell(s, 'A', { price: 14000, at: day(2) }).state;
  const h = W.historyOf(s, 'A');
  assert.deepEqual(h.map((e) => e.label), ['買取', '入庫', '出品', '売却']);
  assert.ok(h.every((e, i) => i === 0 || h[i - 1].at <= e.at));
  assert.ok(h[1].detail.includes('小川 直樹')); // 照合した人
  assert.ok(h[2].detail.includes('メルカリ') && h[2].detail.includes('中島 里奈'));

  const r = W.requestReturn(state([unit('B', 3, { price: 8000 })]), { customerName: '山田 花子', codes: ['B'], reason: 'family', at: day(1) });
  const asked = W.answerInquiry(r.state, r.ret.id, { ok: true, at: day(1) + 1000 });
  const shipped = W.shipReturn(asked, r.ret.id, { tracking: '123', at: day(0) });
  assert.deepEqual(W.historyOf(shipped, 'B').map((e) => e.label), ['買取', '入庫', '返品受付', '倉庫が回答', '返送']);
  assert.deepEqual(W.historyOf(s, 'ZZZ'), []);
});

const MA = (await import('../src/warehouseMaster.js')).DEFAULT_MASTER;
const [WO, WK] = MA.warehouses.map((w) => w.id);

test('倉庫での絞り込み: その倉庫に入庫した商品だけ見える。入庫前の商品はどの倉庫にも属さない。全倉庫なら全部', () => {
  const s = state([unit('A', 12, { warehouseId: WO }), unit('B', 12, { warehouseId: WK }), unit('C', 12), unit('D', 1, { status: 'pending', storedAt: null })], {}, [
    { id: 'R1', codes: ['A'], status: 'requested' }, { id: 'R2', codes: ['B'], status: 'requested' },
  ]);
  const osaka = W.scopeState(s, WO, MA);
  assert.deepEqual(osaka.units.map((u) => u.code), ['A', 'C']); // C は倉庫の記録がない古い商品＝先頭（大阪）の倉庫
  assert.deepEqual(osaka.returns.map((r) => r.id), ['R1']);
  const ask = [...s.returns, { id: 'R3', codes: ['D'], status: 'inquiring', warehouseId: WO }]; // 入庫前の商品の問い合わせも、回答する倉庫には見える
  assert.deepEqual(W.scopeState({ ...s, returns: ask }, WO, MA).returns.map((r) => r.id), ['R1', 'R3']);
  assert.deepEqual(W.scopeState({ ...s, returns: ask }, WK, MA).returns.map((r) => r.id), ['R2']);
  assert.deepEqual(W.scopeState(s, WK, MA).units.map((u) => u.code), ['B']);
  assert.equal(W.scopeState(s, 'all', MA).units.length, 4);
  assert.equal(W.scopeState(s, 'all', MA), s);
});

test('倉庫ごとの在庫: 倉庫の在庫の点数・原価を出す（売却済み・返品済みは含めない）', () => {
  const s = state([unit('A', 12, { warehouseId: WO, price: 100 }), unit('B', 12, { warehouseId: WO, price: 200 }), unit('C', 12, { warehouseId: WK, price: 400 })]);
  const sold = W.sell(W.listItem(s, 'B', { channel: 'mercari', price: 1000, at: NOW }).state, 'B', { price: 900, at: NOW }).state;
  const by = W.holdingByWarehouse(sold, MA, NOW);
  assert.deepEqual({ ...by[WO] }, { count: 1, cost: 100 });
  assert.deepEqual({ ...by[WK] }, { count: 1, cost: 400 });
});

test('会社全体の売上: 倉庫別の売上・利益・点数に分けて出す（売上の多い順）。倉庫の記録がない古い商品は、先頭の倉庫', () => {
  let s = state([unit('A', 20, { warehouseId: WO, price: 10000 }), unit('B', 20, { warehouseId: WK, price: 20000 }), unit('C', 20, { price: 1000 })]);
  for (const [code, price] of [['A', 15000], ['B', 40000], ['C', 3000]]) {
    s = W.sell(W.listItem(s, code, { channel: 'direct', price, at: NOW }).state, code, { price, at: NOW }).state;
  }
  const rows = W.salesRows(s);
  const by = W.salesByWarehouse(rows, MA);
  assert.deepEqual(by.map((g) => [g.key, g.label, g.count, g.revenue, g.profit]), [[WK, '関東倉庫', 1, 40000, 20000], [WO, '大阪倉庫', 2, 18000, 5000 + 2000]]);
  assert.deepEqual(W.salesByWarehouse([], MA), []);
  // 倉庫で絞った売上の合計は、全社の合計と一致する
  const sum = (scope) => W.salesStats(W.salesRows(W.scopeState(s, scope, MA)), '').revenue;
  assert.equal(sum(WO) + sum(WK), sum('all'));
});

test('買取日・お客様ごとのまとまり: 新しい買取日から、同じ日の同じ契約（訪問）の商品をまとめる。同じ日に別のお客様なら別のまとまり', () => {
  const rows = W.buildRows(state([
    unit('A', 5, { visitId: 'V1', customerName: '山田 花子' }), unit('B', 5, { visitId: 'V1', customerName: '山田 花子' }),
    unit('C', 5, { visitId: 'V2', customerName: '佐藤 一雄' }), unit('D', 2, { visitId: 'V3', customerName: '井上 和夫' }),
  ]), NOW);
  const lots = W.lotsOf(rows);
  assert.deepEqual(lots.map((l) => [l.date, l.visitId, l.rows.map((r) => r.unit.code)]), [
    [W.dateOf(day(2)), 'V3', ['D']], [W.dateOf(day(5)), 'V1', ['A', 'B']], [W.dateOf(day(5)), 'V2', ['C']],
  ]);
  assert.equal(lots[1].customerName, '山田 花子'); assert.equal(lots[1].total, 20000);
  assert.deepEqual(W.lotsOf([]), []);
});

test('同じ契約の商品: クーリングオフ対応のとき、同じ契約で一緒に買い取った他の商品を探せる', () => {
  const rows = W.buildRows(state([unit('A', 5, { visitId: 'V1' }), unit('B', 5, { visitId: 'V1' }), unit('C', 5, { visitId: 'V2' })]), NOW);
  assert.deepEqual(W.siblingsOf(rows, 'A').map((r) => r.unit.code), ['B']);
  assert.deepEqual(W.siblingsOf(rows, 'C'), []);
  assert.deepEqual(W.siblingsOf(rows, 'ZZZ'), []);
});
