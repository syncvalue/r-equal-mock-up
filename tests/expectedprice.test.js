import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unitsFromVisit } from '../src/stock.js';
import { editProblem, confirmAppraisal, demoAppraisalUnits, appraisalStatus } from '../src/unitAppraisal.js';

const master = { highValue: { colors: ['purple', 'red'] } };
const item = (extra = {}) => ({ id: 'i1', name: 'K18 ネックレス', category: 'ジュエリー・貴金属', rank: 'A', qty: 2, price: 52000, expectedPrice: 90000, ...extra });
const make = (it) => unitsFromVisit({ visitId: 'V1', userId: 'u01', customerName: '山田', slots: [1, 2].map((n) => ({ key: `i1-${n}`, item: it, n })), labels: { 'i1-1': 'RQ-P1', 'i1-2': 'RQ-P2' }, colors: { 'i1-1': 'purple', 'i1-2': 'purple' } });

test('想定販売価格: 商品（1点ずつ）に、数量で割った1点あたりの額を持たせる。入力がなければ持たない', () => {
  const us = make(item());
  assert.deepEqual(us.map((u) => u.expectedPrice), [45000, 45000]);
  assert.equal(us[0].price, 26000); // 買取金額も、1点あたり
  assert.equal('expectedPrice' in make(item({ expectedPrice: 0 }))[0], false);
  assert.equal('expectedPrice' in make(item({ expectedPrice: undefined }))[0], false);
});

test('査定: 想定販売価格は直せる。変更の記録（前→後）を残す。買取金額は変えない', () => {
  const us = make(item());
  const r = confirmAppraisal(us, master, 'RQ-P1', { by: '青木', at: 1, edits: { name: us[0].name, rank: 'A', expectedPrice: 60000, price: 1 } });
  assert.equal(r.result.type, 'ok');
  const u = r.units.find((x) => x.code === 'RQ-P1');
  assert.equal(u.expectedPrice, 60000);
  assert.equal(u.price, 26000);
  assert.deepEqual(u.appraisal.changes, [{ field: 'expectedPrice', from: 45000, to: 60000 }]);
  assert.equal(appraisalStatus(u, master), 'confirmed');
});

test('査定: 想定販売価格は必須（1以上の整数）。未入力・0・負・小数は確定できない', () => {
  assert.equal(editProblem({ name: 'x', rank: 'A', expectedPrice: 1000 }), '');
  for (const bad of [0, -1, 10.5, undefined, null]) assert.equal(editProblem({ name: 'x', rank: 'A', expectedPrice: bad }), 'expectedPrice', String(bad));
  const us = make(item({ expectedPrice: 0 }));
  assert.equal('expectedPrice' in us[0], false); // 鑑定士は入れない。査定部が入れるまで、持たない
  const none = confirmAppraisal(us, master, 'RQ-P1', { by: '青木', at: 1, edits: { name: us[0].name, rank: 'A', expectedPrice: 0 } });
  assert.deepEqual(none.result, { type: 'bad', problem: 'expectedPrice' });
  assert.equal(appraisalStatus(none.units[0], master), 'pending');
  const unset = confirmAppraisal(us, master, 'RQ-P1', { by: '青木', at: 1, edits: { name: us[0].name, rank: 'A' } });
  assert.deepEqual(unset.result, { type: 'bad', problem: 'expectedPrice' });
  const ok = confirmAppraisal(us, master, 'RQ-P1', { by: '青木', at: 1, edits: { name: us[0].name, rank: 'A', expectedPrice: 52000 } });
  assert.equal(ok.result.type, 'ok');
  assert.deepEqual(ok.units[0].appraisal.changes, [{ field: 'expectedPrice', from: 0, to: 52000 }]); // 入れたことも、記録に残る
  const neg = confirmAppraisal(us, master, 'RQ-P1', { by: '青木', at: 1, edits: { name: us[0].name, rank: 'A', expectedPrice: -5 } });
  assert.deepEqual(neg.result, { type: 'bad', problem: 'expectedPrice' });
});

test('デモの高額品には、想定販売価格が入っていない（鑑定士は入れない。査定部が、確定のときに入れる）', () => {
  const d = demoAppraisalUnits([], 'u01', new Date(2026, 10, 19, 12, 0));
  assert.ok(d.length > 0 && d.every((u) => !('expectedPrice' in u)));
});
