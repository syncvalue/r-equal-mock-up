import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = { getItem: () => null, setItem() {} };
const { purchaseSummary } = await import('../src/customerHistory.js');

test('買取の実績: 直近の買取額・依頼回数・総買取額', () => {
  const s = purchaseSummary(['080-8901-2345']); // 3回（31万円・15万円・22万円）
  assert.equal(s.count, 3);
  assert.equal(s.latest.total, 310000);
  assert.equal(s.total, 310000 + 150000 + 220000);
});

test('実績がない番号は0回。電話番号が複数でも、重複して数えない', () => {
  assert.deepEqual(purchaseSummary(['090-0000-0000']), { count: 0, total: 0, latest: null });
  assert.deepEqual(purchaseSummary(['', null]), { count: 0, total: 0, latest: null });
  assert.equal(purchaseSummary(['080-8901-2345', '080-8901-2345']).count, 3);
  assert.equal(purchaseSummary(['080-8901-2345', '080-5678-9012']).count, 4); // 別の番号の実績は合算する
});

test('音声入力デモの山田 花子は、過去に3回の買取実績がある', async () => {
  const { historyCustomers } = await import('../src/customerHistory.js');
  const s = purchaseSummary(['090-2468-1357']);
  assert.deepEqual([s.count, s.total, s.latest.total], [3, 185000 + 420000 + 95000, 185000]);
  const c = historyCustomers().find((x) => x.phone === '090-2468-1357');
  assert.equal(c.name, '山田 花子');
});

test('顧客のランク・厄介度・クーリングオフ歴', async () => {
  const { customerProfile, CUSTOMER_RANKS } = await import('../src/customerHistory.js');
  const s = customerProfile(['090-5050-6060']); // 前川 玲子: 資産が多いが、厄介（要注意）で、クーリングオフが2回
  assert.deepEqual([s.rank, s.trouble.level, s.cooloff.length, s.known], ['S', 'alert', 2, true]);
  assert.ok(s.trouble.tags.includes('クレームが多い') && s.trouble.memo);
  assert.ok(s.cooloff[0].at > s.cooloff[1].at); // 新しい順
  assert.ok(s.purchase.total >= 1000000);
  const a = customerProfile(['080-8901-2345']);
  assert.deepEqual([a.rank, a.trouble.level, a.cooloff.length], ['A', 'caution', 1]);
  assert.ok(CUSTOMER_RANKS.includes(customerProfile(['090-2468-1357']).rank));
});

test('顧客のランク: 登録がなければ、総買取額から自動で決める。実績がなければ新規（null）', async () => {
  const { customerProfile } = await import('../src/customerHistory.js');
  const none = customerProfile(['090-0000-0000']);
  assert.deepEqual([none.rank, none.known, none.trouble.level, none.cooloff], [null, false, 'none', []]);
  const auto = customerProfile(['080-2345-6789']); // 登録のランクがあれば、それを使う
  assert.deepEqual([auto.rank, auto.rankAuto], ['B', false]);
});

test('厄介度は、人が登録したものだけ。営業の評価のフラグから、自動では上げない', async () => {
  const { customerProfile } = await import('../src/customerHistory.js');
  // 登録のない番号は、評価のフラグがあっても、厄介度は「なし」
  assert.deepEqual([customerProfile(['090-0000-0000']).trouble.level, customerProfile(['090-0000-0000']).trouble.tags], ['none', []]);
  assert.equal(customerProfile(['080-2345-6789']).trouble.level, 'none'); // 登録が「なし」のお客様は、そのまま
});

test('買取の履歴は、品目ごとの内訳まで持つ。内訳の合計は、各回の合計に一致する', async () => {
  const { customerDossier, visitLines, lineTotal } = await import('../src/customerHistory.js');
  for (const phone of ['090-5050-6060', '080-8901-2345', '090-2468-1357']) {
    const d = customerDossier([phone]);
    assert.ok(d.visits.length >= 3);
    d.visits.forEach((v) => assert.equal(visitLines(v).reduce((n, l) => n + lineTotal(l), 0), v.total, `${phone} ${v.items}`));
  }
  const big = customerDossier(['090-5050-6060']).visits.find((v) => visitLines(v).length >= 6);
  assert.ok(big); // 1回で、複数点（多い回は6点以上）
  assert.deepEqual(visitLines({ items: '腕時計', total: 640000 }), [{ name: '腕時計', qty: 1, price: 640000 }]); // 内訳がない記録は、1行にする
  assert.equal(lineTotal({ price: 6000, qty: 10 }), 60000);
});
