import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const index = read('docs/INDEX.md');

// 仕様書は、機能別に分割してある（docs/shared/*.md と docs/features/*/spec.md）
const specFiles = [
  ...readdirSync(join(ROOT, 'docs/shared')).filter((n) => n.endsWith('.md')).map((n) => `docs/shared/${n}`),
  ...readdirSync(join(ROOT, 'docs/features')).map((d) => `docs/features/${d}/spec.md`),
];
const headingsOf = (f) => [...read(f).matchAll(/^#{2,3} (\d+(?:\.\d+)*)\.? /gm)].map((m) => m[1]);
const nums = specFiles.flatMap(headingsOf);

test('仕様書の分割: すべての機能フォルダに spec.md がある。1ファイルは、読みやすい大きさ（400行以内）', () => {
  assert.ok(specFiles.length >= 30);
  for (const f of specFiles) {
    assert.ok(existsSync(join(ROOT, f)), f);
    assert.ok(read(f).split('\n').length <= 400, `${f} が長すぎる（機能を分ける）`);
  }
});

test('仕様書の分割: 章・節の番号は、全体で重複しない。0〜11章がそろっている', () => {
  assert.equal(new Set(nums).size, nums.length, '番号が重複している');
  for (const ch of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11']) assert.ok(nums.includes(ch), `${ch}章がない`);
});

test('文書のインデックス: 仕様書の章・節（0〜11章）が、すべて、索引にある。番号のファイルが、合っている', () => {
  for (const f of specFiles) {
    for (const n of headingsOf(f)) {
      const row = index.split('\n').find((l) => new RegExp(`^\\| ${n.replace(/\./g, '\\.')}(（冒頭）)? \\|`).test(l));
      assert.ok(row, `${n} が索引にない`);
      assert.ok(row.includes(`(${f.replace('docs/', '')})`), `${n} の索引のファイルが違う: ${f}`);
    }
  }
});

test('文書のインデックス: docs の文書・機能フォルダが、すべて、索引にある', () => {
  for (const f of readdirSync(join(ROOT, 'docs')).filter((n) => n.endsWith('.md'))) assert.ok(index.includes(f), f);
  for (const d of readdirSync(join(ROOT, 'docs/features'))) assert.ok(index.includes(`features/${d}/spec.md`), d);
});

test('文書のインデックス: 今後の要件の項目（R-1〜）が、索引にある', () => {
  const ids = [...read('docs/FUTURE_REQUIREMENTS.md').matchAll(/^## (R-\d+) /gm)].map((m) => m[1]);
  assert.ok(ids.length >= 3);
  for (const id of ids) assert.ok(index.includes(`| ${id} |`), id);
});

test('文書のリンク: docs と README のリンク先（ファイル）が、すべて、存在する', () => {
  const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.md') ? [p] : []; });
  const files = [...walk(join(ROOT, 'docs')), join(ROOT, 'README.md')];
  const broken = [];
  for (const f of files) {
    for (const m of readFileSync(f, 'utf8').matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = m[1].split('#')[0];
      if (!target || /^[a-z]+:/.test(target)) continue;
      if (!existsSync(resolve(dirname(f), target))) broken.push(`${f.replace(ROOT, '')} → ${m[1]}`);
    }
  }
  assert.deepEqual(broken, []);
});
