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

const flow = () => {
  const r = W.requestReturn(state([unit('A', 12, { price: 12000, name: 'ロレックス' }), unit('B', 12, { price: 8000, name: 'オメガ' })]), { customerName: '山田 花子', phone: '090-1111-2222', codes: ['A', 'B'], reason: 'price', memo: '返送先は自宅', at: NOW, by: '佐藤' });
  return { id: r.ret.id, s0: r.state };
};

test('やり取り（チャット）: 受電 → 倉庫の回答 → 返送 → 完了の出来事と、自由なメッセージを、時系列に並べる。誰の発言かも分かる', () => {
  const { id, s0 } = flow();
  let s = W.addReturnMessage(s0, id, { side: 'warehouse', text: ' 在庫を確認します ', by: '藤田 結衣', at: NOW + 1000 });
  s = W.answerInquiry(s, id, { ok: true, note: '棚にあります', at: NOW + 2000, by: '藤田 結衣' });
  s = W.addReturnMessage(s, id, { side: 'callcenter', text: 'お客様は火曜の午前を希望です', by: '佐藤', at: NOW + 3000 });
  s = W.shipReturn(s, id, { tracking: '1234-5678', at: NOW + 4000, by: '藤田 結衣' });
  s = W.completeReturn(s, id, NOW + 5000, '小川 直樹').state;
  const t = W.returnTimeline(s.returns[0]);
  assert.deepEqual(t.map((m) => m.side), ['callcenter', 'warehouse', 'warehouse', 'callcenter', 'warehouse', 'warehouse']);
  assert.deepEqual(t.map((m) => m.by), ['佐藤', '藤田 結衣', '藤田 結衣', '佐藤', '藤田 結衣', '小川 直樹']);
  assert.ok(t[0].text.includes('2点') && t[0].text.includes('090-1111-2222') && t[0].text.includes('返送先は自宅') && t[0].text.includes('金額に納得できない'));
  assert.equal(t[1].text, '在庫を確認します'); // 前後の空白は取る
  assert.ok(t[2].text.includes('返送できます') && t[2].text.includes('棚にあります'));
  assert.ok(t[4].text.includes('1234-5678'));
  assert.ok(t[5].text.includes('返還を確認') && t[5].text.includes('20,000'));
  assert.ok(t.every((m, i) => i === 0 || t[i - 1].at <= m.at));
});

test('やり取り（チャット）: 対応不可の記録（売却済み・倉庫が対応できない）も、理由つきで並ぶ', () => {
  const { id, s0 } = flow();
  const ng = W.answerInquiry(s0, id, { ok: false, note: '出品の準備に入っている', at: NOW + 1, by: '藤田 結衣' });
  const t = W.returnTimeline(ng.returns[0]);
  assert.deepEqual(t.map((m) => m.side), ['callcenter', 'warehouse']);
  assert.ok(t[1].text.includes('対応できません') && t[1].text.includes('出品の準備に入っている'));
  const sold = W.requestReturn(state([unit('S', 20)], { S: soldRec }), { customerName: '山田 花子', codes: ['S'], reason: 'family', at: NOW, by: '佐藤' });
  const ts = W.returnTimeline(sold.ret);
  assert.deepEqual(ts.map((m) => m.side), ['callcenter', 'system']);
  assert.ok(ts[1].text.includes('売却済み'));
});

test('メッセージの送信: 本文が空・相手が不明・依頼がないときは変えない。完了後も送れる。元の状態は変えない', () => {
  const { id, s0 } = flow();
  assert.equal(W.addReturnMessage(s0, id, { side: 'warehouse', text: '   ', by: 'x' }), s0);
  assert.equal(W.addReturnMessage(s0, id, { side: 'customer', text: 'こんにちは', by: 'x' }), s0);
  assert.equal(W.addReturnMessage(s0, 'NONE', { side: 'warehouse', text: 'こんにちは', by: 'x' }), s0);
  const a = W.addReturnMessage(s0, id, { side: 'callcenter', text: 'お客様から再度お電話がありました', by: '渡辺', at: NOW + 1 });
  assert.deepEqual(a.returns[0].messages, [{ side: 'callcenter', text: 'お客様から再度お電話がありました', by: '渡辺', at: NOW + 1 }]);
  assert.equal(s0.returns[0].messages, undefined);
  assert.equal(W.addReturnMessage(a, id, { side: 'warehouse', text: '了解です', at: NOW + 2 }).returns[0].messages.length, 2);
});

test('未対応の目印: 回答待ち・返送待ち・コールセンターからの未返信メッセージ。返送済み・完了・対応不可は、メッセージがなければ対応は要らない', () => {
  const { id, s0 } = flow();
  assert.deepEqual(W.returnAlerts(s0.returns[0]), ['回答待ち']);
  let s = W.answerInquiry(s0, id, { ok: true, at: NOW + 1 });
  assert.deepEqual(W.returnAlerts(s.returns[0]), ['返送待ち']);
  s = W.shipReturn(s, id, { tracking: '1', at: NOW + 2 });
  assert.deepEqual(W.returnAlerts(s.returns[0]), []); // お客様の返金待ち（倉庫がすることはない）
  const m = W.addReturnMessage(s, id, { side: 'callcenter', text: '返金の連絡がありました', by: '佐藤', at: NOW + 3 });
  assert.deepEqual(W.returnAlerts(m.returns[0]), ['未返信のメッセージ']);
  const replied = W.addReturnMessage(m, id, { side: 'warehouse', text: '確認します', by: '藤田', at: NOW + 4 });
  assert.deepEqual(W.returnAlerts(replied.returns[0]), []);
  const wh = W.addReturnMessage(replied, id, { side: 'warehouse', text: '先に倉庫が書いた', by: '藤田', at: NOW + 5 });
  assert.deepEqual(W.returnAlerts(wh.returns[0]), []);
  const ng = W.answerInquiry(s0, id, { ok: false, note: '不可', at: NOW + 1 });
  assert.deepEqual(W.returnAlerts(ng.returns[0]), []);
  const both = W.addReturnMessage(s0, id, { side: 'callcenter', text: '急ぎです', by: '佐藤', at: NOW + 1 });
  assert.deepEqual(W.returnAlerts(both.returns[0]), ['回答待ち', '未返信のメッセージ']);
  assert.deepEqual(W.returnAlerts(W.answerInquiry(both, id, { ok: true, at: NOW + 2 }).returns[0]), ['返送待ち']); // 回答すれば、メッセージにも応えたことになる
});

test('依頼の一覧: キーワード（お客様名・電話番号・商品名・シールNo.・理由・メモ・依頼番号）と状態で絞る。未対応を先に、新しい順', () => {
  const units = [unit('A', 12, { name: 'ロレックス', customerName: '山田 花子' }), unit('B', 12, { name: 'オメガ', customerName: '佐藤 一雄' }), unit('C', 12, { name: 'セイコー', customerName: '田中 太郎' })];
  let s = state(units);
  s = W.requestReturn(s, { customerName: '山田 花子', phone: '090-1111-2222', codes: ['A'], reason: 'family', memo: '返送先は自宅', at: NOW, by: '佐藤' }).state;
  s = W.requestReturn(s, { customerName: '佐藤 一雄', phone: '080-3333-4444', codes: ['B'], reason: 'price', at: NOW + 1000, by: '佐藤' }).state;
  s = W.requestReturn(s, { customerName: '田中 太郎', codes: ['C'], reason: 'regret', at: NOW + 2000, by: '渡辺' }).state;
  const [rC, rB, rA] = s.returns;
  s = W.answerInquiry(s, rC.id, { ok: true, at: NOW + 3000 });
  s = W.shipReturn(s, rC.id, { tracking: '1', at: NOW + 4000 }); // C は返送済み（未対応ではない）
  const ids = (c) => W.searchReturns(s.returns, s.units, c).map((r) => r.customerName);
  assert.deepEqual(ids({}), ['佐藤 一雄', '山田 花子', '田中 太郎']); // 未対応（新しい順）→ そのほか
  assert.deepEqual(ids({ q: '山田花子' }), ['山田 花子']);
  assert.deepEqual(ids({ q: '3333' }), ['佐藤 一雄']); // 電話番号の一部
  assert.deepEqual(ids({ q: 'セイコー' }), ['田中 太郎']);
  assert.deepEqual(ids({ q: 'b' }).includes('佐藤 一雄'), true); // シールNo.
  assert.deepEqual(ids({ q: '自宅' }), ['山田 花子']); // メモ
  assert.deepEqual(ids({ q: '金額' }), ['佐藤 一雄']); // 理由
  assert.deepEqual(ids({ q: rA.id.toLowerCase() }), ['山田 花子']); // 依頼番号
  assert.deepEqual(ids({ filter: 'todo' }), ['佐藤 一雄', '山田 花子']);
  assert.deepEqual(ids({ filter: 'open' }), ['佐藤 一雄', '山田 花子', '田中 太郎']);
  assert.deepEqual(ids({ filter: 'closed' }), []);
  assert.deepEqual(W.returnCounts(s.returns), { all: 3, todo: 2, open: 3, closed: 0 });
  assert.deepEqual(ids({ q: '山田', filter: 'todo' }), ['山田 花子']);
  assert.deepEqual(ids({ q: '山田', filter: 'closed' }), []);
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

test('依頼の探し方（電話で聞いた手がかり）: 買取日・カテゴリで絞る。名前は空白の有無を問わず、キーワードはカテゴリにも当たる。条件が何もなければ出さない', () => {
  const s = state([
    unit('A', 3, { visitId: 'V-1', name: 'ロレックス デイトジャスト', category: '腕時計', customerName: '山田 花子' }),
    unit('B', 3, { visitId: 'V-1', name: 'オメガ シーマスター', category: '腕時計', customerName: '山田 花子' }),
    unit('C', 3, { visitId: 'V-1', name: 'ヴィトン ネヴァーフル', category: 'ブランドバッグ', customerName: '山田 花子' }),
    unit('D', 10, { visitId: 'V-2', name: 'カルティエ タンク', category: '腕時計', customerName: '山田 太郎' }),
    unit('E', 3, { visitId: 'V-3', name: 'セイコー', category: '腕時計', customerName: '佐藤 一雄' }),
  ]);
  const ids = (c) => W.cooloffContracts(s, c, NOW).map((x) => x.visitId).sort();
  assert.deepEqual(ids({}), []); // 条件なし
  assert.deepEqual(ids({ q: '  ', dates: [], category: '' }), []);
  assert.deepEqual(ids({ q: '山田花子' }), ['V-1']); // 空白なしでも当たる
  assert.deepEqual(ids({ q: '山田' }), ['V-1', 'V-2']); // 同じ名字が複数
  assert.deepEqual(ids({ q: '時計' }), ['V-1', 'V-2', 'V-3']); // カテゴリ（腕時計）にも当たる
  assert.deepEqual(ids({ dates: [W.dateOf(day(3))] }), ['V-1', 'V-3']); // 買取日だけでも探せる
  assert.deepEqual(ids({ q: '山田', dates: [W.dateOf(day(3))] }), ['V-1']);
  assert.deepEqual(ids({ category: '腕時計', dates: [W.dateOf(day(3)), W.dateOf(day(10))] }), ['V-1', 'V-2', 'V-3']);
  const v1 = W.cooloffContracts(s, { q: '山田', category: '腕時計' }, NOW).find((x) => x.visitId === 'V-1');
  assert.deepEqual(v1.rows.map((r) => r.unit.code), ['A', 'B']); // カテゴリで絞ると、その商品だけ（同じ契約のバッグは出さない）
  assert.equal(v1.total, 20000);
  assert.equal(W.cooloffContracts(s, '山田', NOW).length, 2); // 文字列の指定も使える
});

test('依頼の探し方: お客様の電話番号（1・2）で探せる。ハイフンの有無・一部でもよい。短い数字は電話番号とみなさない', () => {
  const s = state([
    unit('A', 3, { visitId: 'V-1', customerName: '山田 花子', phones: ['090-2468-1357', '06-6123-4567'] }),
    unit('B', 3, { visitId: 'V-1', customerName: '山田 花子', phones: ['090-2468-1357', '06-6123-4567'] }),
    unit('C', 4, { visitId: 'V-2', customerName: '山田 太郎', phones: ['080-1111-2222'] }),
    unit('D', 5, { visitId: 'V-3', customerName: '佐藤 一雄' }),
  ]);
  const ids = (c) => W.cooloffContracts(s, c, NOW).map((x) => x.visitId).sort();
  assert.deepEqual(ids({ q: '090-2468-1357' }), ['V-1']);
  assert.deepEqual(ids({ q: '09024681357' }), ['V-1']);
  assert.deepEqual(ids({ q: '06-6123-4567' }), ['V-1']); // 電話番号2
  assert.deepEqual(ids({ q: '1357' }), ['V-1']); // 下4桁だけ
  assert.deepEqual(ids({ q: '080 1111' }), ['V-2']);
  assert.deepEqual(ids({ q: '090' }), []); // 3桁以下は、電話番号として探さない（シールNo.・名前の検索にもならない）
  assert.deepEqual(ids({ q: '999-9999' }), []);
  const c = W.cooloffContracts(s, { q: '2468' }, NOW)[0];
  assert.deepEqual(c.phones, ['090-2468-1357', '06-6123-4567']); // 契約の電話番号
  assert.deepEqual(W.cooloffContracts(s, { q: '佐藤' }, NOW)[0].phones, []); // 番号の記録がない商品
  assert.deepEqual(ids({ q: '1357', dates: [W.dateOf(day(4))] }), []); // ほかの条件と合わせて絞れる
});

test('買取日の一覧: 直近の日ごとに、曜日つきのラベルと、その日の契約（訪問）の数を出す', () => {
  const s = state([unit('A', 0, { visitId: 'V-1' }), unit('B', 0, { visitId: 'V-1' }), unit('C', 0, { visitId: 'V-2' }), unit('D', 2, { visitId: 'V-3' })]);
  const days = W.purchaseDays(s, NOW, 5);
  assert.equal(days.length, 5);
  assert.deepEqual(days.map((d) => d.date), [0, 1, 2, 3, 4].map((n) => W.dateOf(day(n))));
  assert.deepEqual(days.map((d) => d.count), [2, 0, 1, 0, 0]);
  assert.equal(days[0].label, '10/25(日)'); // 2026-10-25 は日曜日
  assert.equal(days[2].label, '10/23(金)');
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

test('操作した倉庫担当: 出品・売却・返品の各操作に、倉庫担当名を記録できる（指定しなければ記録しない）', () => {
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
