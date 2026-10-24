import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);

test('画面一覧（トップ）: ボタンは8個。画面のない倉庫・物流・データ分析は、リンクなしで「準備中」。リンクはすべて、実在する画面を指す', () => {
  const cards = [...html.matchAll(/<(a|div) class="card[^"]*"[^>]*>/g)];
  assert.equal(cards.length, 8); // オペレーター・配車係・営業タブレット・本社査定部・経理部・倉庫・物流・データ分析・GMOサイン
  assert.equal(hrefs.length, 6);
  const config = fs.readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8');
  for (const h of hrefs) {
    const path = h.split('?')[0];
    const file = `${path.replace(/^\/|\/$/g, '')}/index.html`;
    assert.ok(fs.existsSync(new URL(`../${file}`, import.meta.url)), `${h} → ${file} がない`);
    assert.ok(config.includes(`'${file}'`), `${file} が vite.config.js のビルド対象にない`);
  }
  assert.equal((html.match(/class="card disabled"[^>]*aria-disabled="true"/g) || []).length, 2); // 倉庫・物流・データ分析（まだ画面がない）
});

test('画面一覧（トップ）: 利用者ごとの入口と、公開環境の設定', () => {
  assert.deepEqual(hrefs, ['/callcenter/?tab=new', '/callcenter/?tab=dispatch', '/tablet/', '/honsha/', '/accounting/', '/gmosign/']);
  for (const k of ['コールセンター（オペレーター）', 'コールセンター（配車係）', '営業タブレット', '本社 査定部', '経理部', '倉庫・物流', 'データ分析', 'GMOサイン']) assert.ok(html.includes(k), k);
  const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  for (const s of ['/tablet', '/callcenter', '/honsha', '/accounting', '/gmosign']) assert.ok(vercel.rewrites.some((r) => r.source === s), s); // 末尾の / がなくても開ける
  assert.ok(vercel.redirects.some((r) => r.source === '/menu' && r.destination === '/')); // 以前の /menu は、トップへ
});

test('画面一覧（トップ）: GMOサインは、本システムの対象外として、別の見出しに分ける', () => {
  const own = html.slice(html.indexOf('本システムの画面'), html.indexOf('外部サービス'));
  const external = html.slice(html.indexOf('外部サービス'));
  assert.ok(!own.includes('GMOサイン') && !own.includes('/gmosign/')); // 本システムの画面には、入れない
  assert.ok(external.includes('GMOサイン') && external.includes('/gmosign/') && external.includes('本システムの対象外'));
  assert.equal((own.match(/class="card/g) || []).length, 7); // 本システムの画面は、7個
});

test('画面一覧（トップ）: すべてのリンクは、別のタブで開く（一覧は、開いたままにする）', () => {
  const links = [...html.matchAll(/<a class="card[^"]*" href="[^"]+"[^>]*>/g)].map((m) => m[0]);
  assert.equal(links.length, 6);
  assert.ok(links.every((l) => l.includes('target="_blank"') && l.includes('rel="noopener"')), links.join('\n'));
});
