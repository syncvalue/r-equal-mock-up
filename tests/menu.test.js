import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../menu/index.html', import.meta.url), 'utf8');
const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);

test('画面一覧: すべてのリンクが、実在する画面（ビルド対象）を指す', () => {
  assert.ok(hrefs.length >= 8);
  const config = fs.readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8');
  for (const h of hrefs) {
    const path = h.split('?')[0];
    const file = path === '/' ? 'index.html' : `${path.replace(/^\/|\/$/g, '')}/index.html`;
    assert.ok(fs.existsSync(new URL(`../${file}`, import.meta.url)), `${h} → ${file} がない`);
    assert.ok(config.includes(`'${file}'`), `${file} が vite.config.js のビルド対象にない`);
  }
});

test('画面一覧: 主な画面（オペレーター・配車係・営業・本社・契約）がそろい、コールセンターの直接リンクが使える', () => {
  for (const k of ['新規受付', '音声入力デモ', '配車確定', '営業アプリ', '査定部デスク', '契約の署名']) assert.ok(html.includes(k), k);
  assert.ok(hrefs.includes('/callcenter/?tab=dispatch') && hrefs.includes('/callcenter/?tab=new&demo=1'));
  assert.ok(JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')).rewrites.some((r) => r.source === '/menu')); // 公開環境でも /menu で開ける
});
