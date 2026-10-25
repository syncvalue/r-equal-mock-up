import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const D = await import('../src/storeDraft.js');
const P = await import('../src/storePurchase.js');

const visit = { id: 'SV-1', customer: { name: '山田 花子', kana: 'ヤマダ ハナコ', phone: '090-1234-5678' }, wants: '腕時計' };
const prod = (id, name = id) => ({ id, name, category: '腕時計' });
const full = (d) => ({ ...d, customerOk: true, customer: { ...d.customer, address: '大阪府大阪市1-1', birth: '1964-02-11' } });

test('手順は、お客様確認・説明事項・買取明細・シール・確認・支払いの5つ', () => {
  assert.deepEqual(D.STEPS, ['お客様確認', '説明事項', '買取明細', 'シール', '確認・支払い']);
});

test('作業の開始: 来店のお客様の情報を引き継ぐ。古物台帳に要る住所・生年月日などは、これから入力', () => {
  const d = D.blankDraft(visit);
  assert.deepEqual([d.visitId, d.step, d.customer.name, d.customer.phone, d.customer.address, d.items.length], ['SV-1', 0, '山田 花子', '090-1234-5678', '', 0]);
  const other = D.blankDraft({ id: 'SV-2', customer: { name: 'x' } });
  assert.equal(other.customer.phone, ''); // 電話番号は、飛び込みでは未入力のこともある
});

test('お客様確認: 氏名・電話番号・住所・生年月日がそろい、確認済みにしてから次へ（本人確認書類と照らして入力）', () => {
  let d = D.blankDraft(visit);
  assert.equal(D.canProceed(d), false);
  d = full(d);
  assert.equal(D.canProceed(d), true);
  assert.equal(D.canProceed({ ...d, customerOk: false }), false);
  assert.equal(D.canProceed({ ...d, customer: { ...d.customer, phone: ' ' } }), false);
  assert.equal(D.canProceed({ ...d, customer: { ...d.customer, birth: '' } }), false);
});

test('説明事項: 5項目がすべて済み、他商品を提案してよいかの回答（はい・いいえ）がそろうと次へ', () => {
  const base = { ...full(D.blankDraft(visit)), step: 1 };
  const all = Object.fromEntries(P.EXPLAIN_ITEMS.map((x) => [x.key, true]));
  assert.equal(D.canProceed(base), false);
  assert.equal(D.canProceed({ ...base, explain: all }), false); // 提案の回答がまだ
  assert.equal(D.canProceed({ ...base, explain: all, propose: 'no' }), true);
  assert.equal(D.canProceed({ ...base, explain: { ...all, kyc: false }, propose: 'yes' }), false);
  assert.equal(D.explainRemaining({ ...base, explain: { flow: true } }), 4);
});

test('買取明細: 商品を足すと金額は未入力。同じ商品は数量が増える。金額・ランク・数量・売る/見送るを変えられ、全商品に金額が入ると次へ', () => {
  let d = { ...full(D.blankDraft(visit)), step: 2 };
  d = D.addProduct(d, prod('p1'));
  d = D.addProduct(d, prod('p1'));
  assert.deepEqual(d.items.map((i) => [i.id, i.qty, i.price, i.rank, i.sell]), [['p1', 2, 0, 'A', true]]);
  assert.equal(D.canProceed(d), false); // 金額が未入力
  d = D.updateItem(d, 'p1', { price: 50000, rank: 'B' });
  assert.equal(D.canProceed(d), true);
  assert.equal(d.items[0].rank, 'B');
  assert.equal(D.canProceed(D.updateItem(d, 'p1', { sell: false })), false); // 売る商品が1点もないと、シールに進めない
  assert.equal(D.canProceed({ ...d, items: [] }), false);
  const orig = d.items[0];
  D.updateItem(d, 'p1', { price: 1 });
  assert.equal(orig.price, 50000); // 元の作業は変えない
});

test('数量を減らす・商品を外すと、なくなった分のシールの紐づけも外れる。数量は1未満にならない', () => {
  let d = { ...full(D.blankDraft(visit)), step: 3 };
  d = D.addProduct(D.addProduct(D.addProduct(d, prod('p1')), prod('p1')), prod('p2'));
  d = D.updateItem(d, 'p1', { price: 100 });
  d = D.updateItem(d, 'p2', { price: 100 });
  d = { ...d, labels: { 'p1-1': 'A', 'p1-2': 'B', 'p2-1': 'C' }, colors: { 'p1-1': 'other', 'p1-2': 'red', 'p2-1': 'other' } };
  const less = D.setQty(d, 'p1', 1);
  assert.deepEqual([Object.keys(less.labels), Object.keys(less.colors)], [['p1-1', 'p2-1'], ['p1-1', 'p2-1']]);
  assert.equal(D.setQty(d, 'p1', 0).items[0].qty, 1);
  const removed = D.removeItem(d, 'p1');
  assert.deepEqual([removed.items.map((i) => i.id), Object.keys(removed.labels)], [['p2'], ['p2-1']]);
});

test('シール: 売る商品の1点ごとに、シールNo.と色が要る。同じシールを別の商品には使えない（入庫待ち済みのシールも）', () => {
  let d = { ...full(D.blankDraft(visit)), step: 3 };
  d = D.updateItem(D.addProduct(d, prod('p1')), 'p1', { price: 100, qty: 2 });
  d = D.setQty(d, 'p1', 2);
  assert.deepEqual(P.slotsOf(d.items).map((x) => x.key), ['p1-1', 'p1-2']);
  assert.equal(D.canProceed(d), false);
  let r = D.assignLabel(d, 'p1-1', ' rq-aaa1 ', { taken: [] });
  assert.equal(r.draft.labels['p1-1'], 'RQ-AAA1'); // 大文字にそろえる
  r = D.assignLabel(r.draft, 'p1-2', 'RQ-AAA1', { taken: [] });
  assert.equal(r.error, 'dup');
  assert.equal(r.draft.labels['p1-2'], undefined);
  r = D.assignLabel(r.draft, 'p1-2', 'RQ-OLD', { taken: ['RQ-OLD'] });
  assert.equal(r.error, 'dup');
  r = D.assignLabel(r.draft, 'p1-2', 'RQ-AAA2', { taken: [] });
  assert.equal(r.error, undefined);
  assert.equal(D.canProceed(r.draft), false); // 色がまだ
  const colored = D.setColor(D.setColor(r.draft, 'p1-1', 'purple'), 'p1-2', 'other');
  assert.equal(D.canProceed(colored), true);
  assert.equal(D.assignLabel(d, 'p1-1', '  ', { taken: [] }).draft, d); // 空は何もしない
  assert.equal(D.clearLabel(colored, 'p1-1').labels['p1-1'], undefined);
  assert.equal(D.clearLabel(colored, 'p1-1').colors['p1-1'], undefined);
});

test('新しいシールNo.: RQ-で始まる8桁。使用済みと重ならない', () => {
  const code = D.newSealCode(['RQ-X']);
  assert.match(code, /^RQ-[0-9A-Z]{1,8}$/);
});

test('確認・支払い: 契約をGMOサインへ送ってから、終了前の確認がすべて済むと完了できる', () => {
  const base = { ...full(D.blankDraft(visit)), step: 4 };
  const checks = Object.fromEntries(P.LEAVE_CHECKS.map((c) => [c.key, true]));
  assert.equal(D.canProceed({ ...base, checks }), false); // 契約を送っていない
  assert.equal(D.canProceed({ ...base, contractId: 'GS-1', checks: { ...checks, pay: false } }), false);
  assert.equal(D.canProceed({ ...base, contractId: 'GS-1', checks }), true);
  assert.equal(D.leaveRemaining({ ...base, checks: { kyc: true } }), P.LEAVE_CHECKS.length - 1);
});

test('作業の保存と復元: 来店ごとに保存し、途中で画面を閉じても続けられる。完了したら消す', () => {
  const d = D.blankDraft(visit);
  assert.equal(D.loadDraft('SV-1'), null);
  assert.equal(D.saveDraft({ ...d, step: 2 }), true);
  assert.equal(D.loadDraft('SV-1').step, 2);
  assert.equal(D.loadDraft('SV-2'), null);
  D.clearDraft('SV-1');
  assert.equal(D.loadDraft('SV-1'), null);
  mem.set('rq-mock-store-drafts', '{broken');
  assert.equal(D.loadDraft('SV-1'), null);
  mem.clear();
});

test('手順の進み方: 次へ・戻る。範囲の外には出ない', () => {
  const d = D.blankDraft(visit);
  assert.equal(D.goStep(d, -1).step, 0);
  assert.equal(D.goStep(d, 99).step, D.STEPS.length - 1);
  assert.equal(D.goStep(d, 2).step, 2);
});

test('契約を送ったあとは、確認・支払いより前の手順には戻れない（契約書と食い違わないように）', () => {
  const d = { ...D.blankDraft(visit), step: 4, contractId: 'GS-1' };
  assert.equal(D.goStep(d, 2).step, 4);
  assert.equal(D.goStep({ ...d, contractId: null }, 2).step, 2);
});
