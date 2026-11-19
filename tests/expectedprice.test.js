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

test('査定: 想定販売価格の入力チェック（0以上の整数。0は未入力）。入力のない商品は、未入力のまま確定できる', () => {
  assert.equal(editProblem({ name: 'x', rank: 'A', expectedPrice: 1000 }), '');
  assert.equal(editProblem({ name: 'x', rank: 'A', expectedPrice: 0 }), '');
  assert.equal(editProblem({ name: 'x', rank: 'A', expectedPrice: -1 }), 'expectedPrice');
  assert.equal(editProblem({ name: 'x', rank: 'A', expectedPrice: 10.5 }), 'expectedPrice');
  assert.equal(editProblem({ name: 'x', rank: 'A' }), '');
  const us = make(item({ expectedPrice: 0 }));
  const r = confirmAppraisal(us, master, 'RQ-P1', { by: '青木', at: 1, edits: { name: us[0].name, rank: 'A', expectedPrice: 0 } });
  assert.equal(r.result.type, 'ok');
  assert.deepEqual(r.units[0].appraisal.changes, []);
  const bad = confirmAppraisal(us, master, 'RQ-P1', { by: '青木', at: 1, edits: { name: us[0].name, rank: 'A', expectedPrice: -5 } });
  assert.deepEqual(bad.result, { type: 'bad', problem: 'expectedPrice' });
});

test('デモの高額品には、想定販売価格が入っている（買取金額より高い）', () => {
  const d = demoAppraisalUnits([], 'u01', new Date(2026, 10, 19, 12, 0));
  assert.ok(d.every((u) => u.expectedPrice > u.price));
});
