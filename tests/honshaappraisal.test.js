import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = { matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener() {} };
const { appraisalTab } = await import('../honsha/appraisalTab.js');
const { demoAppraisalUnits, confirmAppraisal } = await import('../src/unitAppraisal.js');

const master = { highValue: { colors: ['purple', 'red'] } };
const blank = { raw: '', code: null, name: '', rank: 'A', expectedPrice: 0, message: null };
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
  const html = appraisalTab({ units, master, filter: 'pending', ap: { ...blank, raw: u.code, code: u.code, name: u.name, rank: u.rank, expectedPrice: u.expectedPrice } });
  assert.ok(html.includes('鑑定士が登録した内容') && html.includes(u.name) && html.includes('data-ap="name"') && html.includes('data-ap="rank"') && !html.includes('data-ap="price"') && html.includes('支払い済み・変更できません'));
  assert.ok(html.includes('data-ap-confirm') && html.includes('登録内容のままです'));
  const edited = appraisalTab({ units, master, filter: 'pending', ap: { ...blank, code: u.code, name: u.name, rank: 'C', expectedPrice: u.expectedPrice } });
  assert.ok(edited.includes('登録内容から訂正があります'));
});

test('査定の画面: 確定すると、確定済みの一覧に移り、確定した人・訂正の内容が出る。確定ボタンは出ない', () => {
  const u = units[0];
  const { units: done } = confirmAppraisal(units, master, u.code, { by: '青木', at: Date.now(), edits: { name: u.name, rank: 'B' } });
  const ap = { ...blank, code: u.code, name: u.name, rank: 'B', expectedPrice: u.expectedPrice };
  assert.ok(appraisalTab({ units: done, master, filter: 'pending', ap }).includes(`査定待ち ${units.length - 1}`));
  const html = appraisalTab({ units: done, master, filter: 'confirmed', ap });
  assert.equal((html.match(/data-ap-open="/g) || []).length, 1);
  assert.ok(html.includes('査定を確定しました') && html.includes('青木') && html.includes('ランク: A → B'));
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

test('査定の画面: 想定販売価格は、読み取り内容に出て、直せる（買取金額は直せない）。直した内容は確定後の記録に出る', () => {
  const u = units[0];
  const open = { ...blank, code: u.code, name: u.name, rank: u.rank, expectedPrice: u.expectedPrice };
  const html = appraisalTab({ units, master, filter: 'pending', ap: open });
  assert.ok(html.includes('想定販売価格（1点）') && html.includes('data-ap="expectedPrice"') && !html.includes('data-ap="price"'));
  assert.ok(appraisalTab({ units, master, filter: 'pending', ap: { ...open, expectedPrice: u.expectedPrice + 1000 } }).includes('登録内容から訂正があります'));
  const { units: done } = confirmAppraisal(units, master, u.code, { by: '青木', at: Date.now(), edits: { name: u.name, rank: u.rank, expectedPrice: 300000 } });
  const after = appraisalTab({ units: done, master, filter: 'confirmed', ap: open });
  assert.ok(after.includes('想定販売価格: ¥380,000 → ¥300,000'));
});
