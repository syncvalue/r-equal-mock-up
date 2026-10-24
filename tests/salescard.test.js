import { test } from 'node:test';
import assert from 'node:assert/strict';
import { salesCustomerCard, customerMarks } from '../src/customerProfileView.js';

const profile = (o = {}) => ({ rank: 'A', rankAuto: false, known: true, purchase: { count: 3, total: 680000 }, trouble: { level: 'caution', tags: ['家族の同意が必要'], memo: '事前にご在宅を確認する' }, cooloff: [{ at: Date.UTC(2026, 0, 30), items: 'ブランドバッグ', memo: 'ご家族の反対で' }], ...o });
const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('営業のタブレット: 訪問前に、お客様のランク・厄介度・クーリングオフ歴を理解するカード', () => {
  const t = text(salesCustomerCard(profile()));
  assert.ok(['お客様の評価（お客様情報・訪問前にご確認ください）', '顧客A', '注意', '家族の同意が必要', '事前にご在宅を確認する', 'クーリングオフ 1回', 'ブランドバッグ', '買取 3回', '¥680,000'].every((k) => t.includes(k)), t);
});

test('営業のタブレット: 要注意・クーリングオフ2回以上は赤い枠。新規のお客様は、新規と出す', () => {
  assert.match(salesCustomerCard(profile({ trouble: { level: 'alert', tags: ['クレームが多い'], memo: '' } })), /border-rose-300/);
  assert.match(salesCustomerCard(profile({ cooloff: [{ at: 1, items: 'a' }, { at: 2, items: 'b' }] })), /border-rose-300/);
  assert.match(salesCustomerCard(profile()), /border-fuchsia-300/);
  assert.match(text(salesCustomerCard({ known: false, rank: null, trouble: { level: 'none', tags: [] }, cooloff: [], purchase: { count: 0, total: 0 } })), /新規のお客様/);
  assert.equal(salesCustomerCard(null), '');
});

test('予定表の帯に出す小さな印: ランク・注意・クーリングオフ回数。新規は出さない', () => {
  const t = text(customerMarks(profile({ cooloff: [{ at: 1, items: 'a' }, { at: 2, items: 'b' }] })));
  assert.deepEqual(['顧A', '注意', 'CO2'].map((k) => t.includes(k)), [true, true, true]);
  assert.equal(customerMarks({ known: false }), '');
});
