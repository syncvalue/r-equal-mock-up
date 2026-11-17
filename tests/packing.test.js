import { test } from 'node:test';
import assert from 'node:assert/strict';
import { packTargets, scanIntoBox, packProgress, packMessage } from '../src/packing.js';

const slots = [
  { key: 'i1-1', item: { id: 'i1', name: 'ルイ・ヴィトン ネヴァーフル' }, n: 1 },
  { key: 'i2-1', item: { id: 'i2', name: 'ロレックス デイトジャスト', qty: 2 }, n: 1 },
  { key: 'i2-2', item: { id: 'i2', name: 'ロレックス デイトジャスト', qty: 2 }, n: 2 },
  { key: 'i3-1', item: { id: 'i3', name: 'シール未貼付の商品' }, n: 1 },
];
const labels = { 'i1-1': 'RQ-P-0001', 'i2-1': 'RQ-R-0002', 'i2-2': 'RQ-R-0003' };

test('箱に入れる対象: シールを貼った、買い取った商品（1点ずつ）', () => {
  const t = packTargets(slots, labels);
  assert.deepEqual(t.map((x) => x.code), ['RQ-P-0001', 'RQ-R-0002', 'RQ-R-0003']);
  assert.equal(t[1].name, 'ロレックス デイトジャスト');
});

test('QRを読み取って、箱に入れる: 買い取った商品は入る。同じものは二重に入らない。買い取っていない商品は、入れない', () => {
  const t = packTargets(slots, labels);
  const a = scanIntoBox(t, [], 'RQ-P-0001');
  assert.equal(a.type, 'ok');
  assert.deepEqual(a.packed, ['RQ-P-0001']);
  assert.equal(scanIntoBox(t, a.packed, ' rq-p-0001 ').type, 'dup'); // 表記ゆれは同じ
  const f = scanIntoBox(t, a.packed, 'RQ-Y-9999'); // 買い取っていない商品（別のお客様の商品・見送り品など）
  assert.equal(f.type, 'foreign');
  assert.deepEqual(f.packed, a.packed); // 箱の中身は変わらない
  assert.equal(scanIntoBox(t, [], '').type, 'foreign');
});

test('箱詰めの進み具合: 入っていない商品が分かる。すべて入ったら完了。買い取った商品がなければ、最初から完了', () => {
  const t = packTargets(slots, labels);
  const p = packProgress(t, ['RQ-P-0001']);
  assert.deepEqual([p.total, p.done, p.left, p.complete], [3, 1, 2, false]);
  assert.deepEqual(p.missing.map((x) => x.code), ['RQ-R-0002', 'RQ-R-0003']);
  assert.equal(packProgress(t, ['RQ-P-0001', 'RQ-R-0002', 'RQ-R-0003']).complete, true);
  assert.equal(packProgress(t, ['RQ-P-0001', 'RQ-Z-0000']).done, 1); // 対象でないコードは数えない
  assert.equal(packProgress([], []).complete, true);
});

test('メッセージ: お客様宅に残した・余計に持ち帰る、のどちらも気づける文言', () => {
  const t = packTargets(slots, labels);
  assert.match(packMessage(scanIntoBox(t, [], 'RQ-X-1')), /買い取っていません/);
  assert.match(packMessage(scanIntoBox(t, ['RQ-P-0001'], 'RQ-P-0001')), /すでに箱に入っています/);
  assert.match(packMessage(scanIntoBox(t, [], 'RQ-P-0001')), /ルイ・ヴィトン ネヴァーフル/);
});

test('画面: 訪問終了の前に、箱詰めが出る。箱に入っていない商品があれば、訪問を終了できない', async () => {
  const mem = new Map();
  globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  globalThis.window = { matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener() {} };
  globalThis.document = { documentElement: { classList: { toggle() {}, contains: () => false }, style: {} }, querySelector: () => ({}), querySelectorAll: () => [], addEventListener() {}, activeElement: null, head: { appendChild() {} }, createElement: () => ({}) };
  const V = await import('../src/views.js');
  const items = [{ id: 'i1', name: 'ヴィトン バッグ', qty: 1, price: 100000, sell: true, rank: 'A' }, { id: 'i2', name: 'ロレックス', qty: 2, price: 500000, sell: true, rank: 'A' }, { id: 'i3', name: '見送りの時計', qty: 1, price: 30000, sell: false, rank: 'C' }];
  const labels = { 'i1-1': 'RQ-P-0001', 'i2-1': 'RQ-R-0002', 'i2-2': 'RQ-R-0003' };
  const leaveChecks = Object.fromEntries(V.LEAVE_CHECKS.map((c) => [c.key, true]));
  const base = { items, labels, sealColors: {}, contract: { id: 'GS-1' }, leaveChecks, box: { packed: ['RQ-P-0001'], alert: null }, visitEndedAt: null, rec: null, visitId: 'V-1', briefing: { checks: {} } };
  assert.equal(V.leaveRemaining(base), 1); // チェックはすべて済んでいても、箱に2点残っている
  let html = V.endView(base);
  for (const w of ['持ち帰りの箱詰め', '1 / 3点', 'あと2点', 'data-action="pack-scan"', 'ロレックス（1/2）']) assert.ok(html.includes(w), w);
  assert.ok(!html.includes('見送りの時計')); // 見送りの商品は、箱に入れない
  assert.ok(/data-action="finish-ask"[^>]*disabled/.test(html));
  const full = { ...base, box: { packed: ['RQ-P-0001', 'RQ-R-0002', 'RQ-R-0003'], alert: null } };
  assert.equal(V.leaveRemaining(full), 0);
  html = V.endView(full);
  assert.ok(html.includes('すべて箱に入りました') && !html.includes('data-action="pack-scan"') && !/data-action="finish-ask"[^>]*disabled/.test(html));
  const warn = V.endView({ ...base, box: { packed: [], alert: { code: 'RQ-Y-1', message: 'この商品は、今回買い取っていません。箱に入れず、お客様にお返ししてください' } } });
  assert.ok(warn.includes('買い取っていません') && warn.includes('RQ-Y-1'));
  const scan = V.scanView({ ...base, scan: { mode: 'pack', status: 'error', code: 'RQ-Y-1', message: 'この商品は、今回買い取っていません' } });
  assert.ok(scan.includes('箱詰め 1／3点') && scan.includes('買い取っていません'));
});
