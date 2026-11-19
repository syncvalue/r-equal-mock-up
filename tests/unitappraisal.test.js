import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appraisalStatus, appraisalQueue, lookupForAppraisal, editProblem, confirmAppraisal } from '../src/unitAppraisal.js';

const master = { highValue: { colors: ['purple', 'red'] } };
const unit = (code, sealColor, extra = {}) => ({ code, sealColor, name: 'K18 ネックレス', category: 'ジュエリー・貴金属', rank: 'A', price: 26000, qty: 2, at: 1000, status: 'pending', ...extra });
const list = [unit('RQ-P1', 'purple'), unit('RQ-R1', 'red', { at: 500 }), unit('RQ-Y1', 'yellow'), unit('RQ-R2', 'red', { appraisal: { status: 'confirmed', by: '青木', at: 2000, changes: [] } })];

test('査定の状態: 紫・赤は査定待ち（確定すると確定済み）。ほかの色は査定の対象外', () => {
  assert.equal(appraisalStatus(list[0], master), 'pending');
  assert.equal(appraisalStatus(list[2], master), 'none');
  assert.equal(appraisalStatus(list[3], master), 'confirmed');
  assert.equal(appraisalStatus(unit('X', null), master), 'none');
});

test('査定の一覧: 状態で絞り、古い順（買取の古いものから）に並べる', () => {
  assert.deepEqual(appraisalQueue(list, master, 'pending').map((u) => u.code), ['RQ-R1', 'RQ-P1']);
  assert.deepEqual(appraisalQueue(list, master, 'confirmed').map((u) => u.code), ['RQ-R2']);
  assert.deepEqual(appraisalQueue(list, master, 'all').map((u) => u.code), ['RQ-R1', 'RQ-P1', 'RQ-R2']);
});

test('読み取り: シールNo.から、査定する商品を引く。空・未登録・貼り替え済み・対象外を区別する', () => {
  assert.equal(lookupForAppraisal(list, master, ' rq-p1 ').type, 'ok');
  assert.equal(lookupForAppraisal(list, master, ' rq-p1 ').unit.code, 'RQ-P1');
  assert.equal(lookupForAppraisal(list, master, '').type, 'empty');
  assert.equal(lookupForAppraisal(list, master, 'RQ-ZZ').type, 'unknown');
  assert.equal(lookupForAppraisal(list, master, 'RQ-Y1').type, 'notTarget');
  const relabeled = [...list, unit('RQ-R9', 'red', { relabels: [{ from: 'RQ-OLD', to: 'RQ-R9' }] })];
  const r = lookupForAppraisal(relabeled, master, 'RQ-OLD');
  assert.equal(r.type, 'replaced');
  assert.equal(r.newCode, 'RQ-R9');
});

test('訂正の入力チェック: 商品名あり・ランクは一覧のもの（金額は直せない）', () => {
  assert.equal(editProblem({ name: 'K18 ネックレス', rank: 'A', price: 26000 }), '');
  assert.equal(editProblem({ name: ' ', rank: 'A', price: 26000 }), 'name');
  assert.equal(editProblem({ name: 'x', rank: 'Z', price: 26000 }), 'rank');
});

test('確定: 訂正がなければそのまま確定。確定した人・日時を残し、元の配列は変えない', () => {
  const r = confirmAppraisal(list, master, 'RQ-P1', { by: '青木', at: 3000, edits: { name: 'K18 ネックレス', rank: 'A', price: 26000 } });
  assert.equal(r.result.type, 'ok');
  const u = r.units.find((x) => x.code === 'RQ-P1');
  assert.deepEqual(u.appraisal, { status: 'confirmed', by: '青木', at: 3000, changes: [] });
  assert.equal(u.price, 26000);
  assert.equal(list[0].appraisal, undefined);
  assert.equal(appraisalStatus(u, master), 'confirmed');
});

test('確定: 訂正（商品名・ランク）は、商品に反映し、変更の記録（前→後）を残す。買取金額は、支払い済みなので、渡されても変えない', () => {
  const r = confirmAppraisal(list, master, 'RQ-R1', { by: '青木', at: 3000, edits: { name: 'K14 ネックレス', rank: 'B', price: 18000 } });
  const u = r.units.find((x) => x.code === 'RQ-R1');
  assert.equal(u.name, 'K14 ネックレス');
  assert.equal(u.rank, 'B');
  assert.equal(u.price, 26000);
  assert.deepEqual(u.appraisal.changes, [
    { field: 'name', from: 'K18 ネックレス', to: 'K14 ネックレス' },
    { field: 'rank', from: 'A', to: 'B' },
  ]);
});

test('確定できないとき: 確定済み・対象外・未登録・入力の誤りは、配列を変えずに理由を返す', () => {
  const same = { by: '青木', at: 3000, edits: { name: 'x', rank: 'A', price: 1 } };
  assert.equal(confirmAppraisal(list, master, 'RQ-R2', same).result.type, 'dup');
  assert.equal(confirmAppraisal(list, master, 'RQ-Y1', same).result.type, 'notTarget');
  assert.equal(confirmAppraisal(list, master, 'RQ-ZZ', same).result.type, 'unknown');
  const bad = confirmAppraisal(list, master, 'RQ-P1', { ...same, edits: { name: '', rank: 'A', price: 1 } });
  assert.deepEqual(bad.result, { type: 'bad', problem: 'name' });
  assert.equal(bad.units, list);
});

test('デモ用: 査定待ちの高額品（紫・赤）を足す。二度足しても増えず、元の商品は残る', async () => {
  const { demoAppraisalUnits } = await import('../src/unitAppraisal.js');
  const existing = [unit('RQ-Y9', 'yellow')];
  const once = demoAppraisalUnits(existing, 'u01', new Date(2026, 10, 19, 12, 0));
  assert.ok(once.length > existing.length);
  assert.ok(once.some((u) => u.code === 'RQ-Y9'));
  const added = once.filter((u) => u.code !== 'RQ-Y9');
  assert.ok(added.every((u) => ['purple', 'red'].includes(u.sealColor) && u.code.startsWith(`RQ-${u.sealColor === 'purple' ? 'P' : 'R'}`) && u.userId === 'u01'));
  assert.ok(added.every((u) => appraisalStatus(u, master) === 'pending'));
  assert.equal(demoAppraisalUnits(once, 'u01', new Date(2026, 10, 19, 12, 0)).length, once.length);
});

test('一覧の検索: 商品名・シールNo.・お客様の名前で絞り込む（空白は無視、大文字小文字は区別しない）', () => {
  const l = [unit('RQ-P1', 'purple', { customerName: '中村 恵子' }), unit('RQ-R1', 'red', { name: 'ロレックス', customerName: '小林 正志', at: 500 })];
  assert.deepEqual(appraisalQueue(l, master, 'pending', 'ロレ').map((u) => u.code), ['RQ-R1']);
  assert.deepEqual(appraisalQueue(l, master, 'pending', 'rq-p').map((u) => u.code), ['RQ-P1']);
  assert.deepEqual(appraisalQueue(l, master, 'pending', '中村恵子').map((u) => u.code), ['RQ-P1']);
  assert.equal(appraisalQueue(l, master, 'pending', '  ').length, 2);
  assert.equal(appraisalQueue(l, master, 'pending', 'なし').length, 0);
});

test('デモ用の高額品は、8点前後。鑑定士・お客様がばらける', async () => {
  const { demoAppraisalUnits } = await import('../src/unitAppraisal.js');
  const d = demoAppraisalUnits([], 'u01', new Date(2026, 10, 19, 12, 0));
  assert.ok(d.length >= 8);
  assert.ok(new Set(d.map((u) => u.customerName)).size >= 4);
});
