import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const index = read('docs/INDEX.md');
const spec = read('docs/SPEC.md');

test('文書のインデックス: SPEC.md の章・節（0〜11章）が、すべて、索引にある', () => {
  const nums = [...spec.matchAll(/^#{2,3} (\d+(?:\.\d+)*)\.? /gm)].map((m) => m[1]);
  assert.ok(nums.length > 40);
  const missing = nums.filter((n) => !new RegExp(`^\\| ${n.replace(/\./g, '\\.')}(（冒頭）)? \\|`, 'm').test(index));
  assert.deepEqual(missing, []);
});

test('文書のインデックス: docs の文書が、すべて、「文書の一覧」にある。SPEC.md の章の順番は、番号順', () => {
  for (const f of readdirSync(new URL('../docs/', import.meta.url)).filter((n) => n.endsWith('.md'))) assert.ok(index.includes(f), f);
  const nums = [...spec.matchAll(/^#{2,3} (\d+(?:\.\d+)*)\.? /gm)].map((m) => m[1].split('.').map(Number));
  const sorted = [...nums].sort((a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++) { if ((a[i] ?? -1) !== (b[i] ?? -1)) return (a[i] ?? -1) - (b[i] ?? -1); } return 0; });
  assert.deepEqual(nums, sorted); // 節の順番が入れ替わっていない
});

test('文書のインデックス: 今後の要件の項目（R-1〜）が、索引にある', () => {
  const ids = [...read('docs/FUTURE_REQUIREMENTS.md').matchAll(/^## (R-\d+) /gm)].map((m) => m[1]);
  assert.ok(ids.length >= 3);
  for (const id of ids) assert.ok(index.includes(`| ${id} |`), id);
});
