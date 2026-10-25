import { test } from 'node:test';
import assert from 'node:assert/strict';

const { paginate, pageNumbers, PAGE_SIZES } = await import('../src/paging.js');
const list = (n) => Array.from({ length: n }, (_, i) => i + 1);

test('ページ分割: 指定したページの分と、全体の件数・ページ数・表示範囲を返す', () => {
  const p = paginate(list(45), 2, 20);
  assert.deepEqual(p.items, list(45).slice(20, 40));
  assert.deepEqual({ page: p.page, pages: p.pages, total: p.total, from: p.from, to: p.to }, { page: 2, pages: 3, total: 45, from: 21, to: 40 });
  const last = paginate(list(45), 3, 20);
  assert.deepEqual({ n: last.items.length, from: last.from, to: last.to }, { n: 5, from: 41, to: 45 });
});

test('ページ分割: 範囲外のページは、最初・最後のページに丸める。0件は1ページ（空）。元の配列は変えない', () => {
  assert.equal(paginate(list(45), 99, 20).page, 3);
  assert.equal(paginate(list(45), 0, 20).page, 1);
  assert.equal(paginate(list(45), -3, 20).page, 1);
  assert.equal(paginate(list(45), 'x', 20).page, 1);
  const empty = paginate([], 1, 20);
  assert.deepEqual({ items: empty.items, page: empty.page, pages: empty.pages, total: empty.total, from: empty.from, to: empty.to }, { items: [], page: 1, pages: 1, total: 0, from: 0, to: 0 });
  const src = list(5);
  paginate(src, 1, 2);
  assert.deepEqual(src, [1, 2, 3, 4, 5]);
  assert.equal(paginate(list(5), 1, 0).pages, 1); // 件数が不正なら、1ページにまとめる
});

test('ページ番号の表示: ページ数が多いときは、先頭・最後・いまの前後だけを出して、間は省略する', () => {
  assert.deepEqual(pageNumbers(1, 1), [1]);
  assert.deepEqual(pageNumbers(2, 5), [1, 2, 3, 4, 5]);
  assert.deepEqual(pageNumbers(1, 10), [1, 2, '…', 10]);
  assert.deepEqual(pageNumbers(5, 10), [1, '…', 4, 5, 6, '…', 10]);
  assert.deepEqual(pageNumbers(10, 10), [1, '…', 9, 10]);
  assert.deepEqual(pageNumbers(3, 10), [1, 2, 3, 4, '…', 10]);
});

test('1ページの件数の選択肢', () => {
  assert.deepEqual(PAGE_SIZES, [20, 50, 100]);
});
