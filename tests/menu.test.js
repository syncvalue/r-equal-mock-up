import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);

test('画面一覧（トップ）: リンクボタンは6個（経理部は画面がないので、リンクなしで「準備中」）。すべて、実在する画面を指す', () => {
  const cards = [...html.matchAll(/<(a|div) class="card[^"]*"[^>]*>/g)];
  assert.equal(cards.length, 6); // オペレーター・配車係・営業タブレット・本社査定部・経理部・GMOサイン
  assert.equal(hrefs.length, 5);
  const config = fs.readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8');
  for (const h of hrefs) {
    const path = h.split('?')[0];
    const file = `${path.replace(/^\/|\/$/g, '')}/index.html`;
    assert.ok(fs.existsSync(new URL(`../${file}`, import.meta.url)), `${h} → ${file} がない`);
    assert.ok(config.includes(`'${file}'`), `${file} が vite.config.js のビルド対象にない`);
  }
  assert.ok(/class="card disabled"[^>]*aria-disabled="true"/.test(html) && html.includes('経理部'));
});

test('画面一覧（トップ）: 利用者ごとの入口と、公開環境の設定', () => {
  assert.deepEqual(hrefs, ['/callcenter/?tab=new', '/callcenter/?tab=dispatch', '/tablet/', '/honsha/', '/gmosign/']);
  for (const k of ['コールセンター（オペレーター）', 'コールセンター（配車係）', '営業タブレット', '本社 査定部', '経理部', 'GMOサイン']) assert.ok(html.includes(k), k);
  const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  for (const s of ['/tablet', '/callcenter', '/honsha', '/gmosign']) assert.ok(vercel.rewrites.some((r) => r.source === s), s); // 末尾の / がなくても開ける
  assert.ok(vercel.redirects.some((r) => r.source === '/menu' && r.destination === '/')); // 以前の /menu は、トップへ
});
