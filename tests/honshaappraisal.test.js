import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = { matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener() {} };
const { appraisalTab } = await import('../honsha/appraisalTab.js');
const { demoAppraisalUnits, confirmAppraisal } = await import('../src/unitAppraisal.js');

const master = { highValue: { colors: ['purple', 'red'] } };
const blank = { raw: '', code: null, name: '', rank: 'A', price: 0, message: null };
const units = demoAppraisalUnits([], 'u01', new Date(2026, 10, 19, 12, 0));

test('査定の画面: 査定待ちの一覧と、シールの読み取り欄が出る。商品を開く前は、案内だけ', () => {
  const html = appraisalTab({ units, master, filter: 'pending', ap: blank });
  assert.equal((html.match(/data-ap-open="/g) || []).length, units.length);
  assert.ok(html.includes('data-ap="raw"') && html.includes('data-ap-scan') && html.includes('data-ap-cam'));
  assert.ok(html.includes(`査定待ち ${units.length}`) && html.includes('確定済み 0'));
  assert.ok(!html.includes('data-ap-confirm'));
  assert.ok(html.includes('シールを読み取るか'));
});

test('査定の画面: 開いた商品は、鑑定士の登録内容と、確認・訂正の欄、確定ボタンが出る', () => {
  const u = units[0];
  const html = appraisalTab({ units, master, filter: 'pending', ap: { ...blank, raw: u.code, code: u.code, name: u.name, rank: u.rank, price: u.price } });
  assert.ok(html.includes('鑑定士が登録した内容') && html.includes(u.name) && html.includes('data-ap="name"') && html.includes('data-ap="rank"') && html.includes('data-ap="price"'));
  assert.ok(html.includes('data-ap-confirm') && html.includes('登録内容のままです'));
  const edited = appraisalTab({ units, master, filter: 'pending', ap: { ...blank, code: u.code, name: u.name, rank: 'C', price: u.price } });
  assert.ok(edited.includes('登録内容から訂正があります'));
});

test('査定の画面: 確定すると、確定済みの一覧に移り、確定した人・訂正の内容が出る。確定ボタンは出ない', () => {
  const u = units[0];
  const { units: done } = confirmAppraisal(units, master, u.code, { by: '青木', at: Date.now(), edits: { name: u.name, rank: 'B', price: 250000 } });
  const ap = { ...blank, code: u.code, name: u.name, rank: 'B', price: 250000 };
  assert.ok(appraisalTab({ units: done, master, filter: 'pending', ap }).includes(`査定待ち ${units.length - 1}`));
  const html = appraisalTab({ units: done, master, filter: 'confirmed', ap });
  assert.equal((html.match(/data-ap-open="/g) || []).length, 1);
  assert.ok(html.includes('査定を確定しました') && html.includes('青木') && html.includes('ランク: A → B') && html.includes('¥280,000 → ¥250,000'));
  assert.ok(!html.includes('data-ap-confirm'));
});

test('査定の画面: 査定待ちがないとき、デモ用の追加ボタンが出る。名前や商品名は、エスケープされる', () => {
  assert.ok(appraisalTab({ units: [], master, filter: 'pending', ap: blank }).includes('data-ap-demo'));
  const evil = [{ ...units[0], name: '<img src=x>' }];
  assert.ok(!appraisalTab({ units: evil, master, filter: 'pending', ap: blank }).includes('<img src=x>'));
});

test('査定の画面: 一覧は、検索で絞り込める（件数の表示は絞り込み前のまま）', () => {
  const html = appraisalTab({ units, master, filter: 'pending', q: 'ロレックス', ap: blank });
  assert.equal((html.match(/data-ap-open="/g) || []).length, 1);
  assert.ok(html.includes('data-ap-q') && html.includes('value="ロレックス"') && html.includes(`査定待ち ${units.length}`));
  assert.ok(appraisalTab({ units, master, filter: 'pending', q: 'ZZZZ', ap: blank }).includes('見つかりません'));
});
