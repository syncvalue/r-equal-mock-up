import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const { dispatcherHtml } = await import('../callcenter/dispatcherView.js');

const NOW = new Date(2026, 9, 21, 9, 0);

test('配車確定の鑑定士の列: 訪問間の移動の合計は、「移動距離・時間：」と書く（何の距離・時間か分かるように）', () => {
  // 予定が2件以上ある鑑定士（元からの予定）の日を探す
  const html = ['2026-10-21', '2026-10-22', '2026-10-23', '2026-10-26'].map((date) => dispatcherHtml({ date, reservations: [], now: NOW, chips: [], area: 'osaka', selId: null })).find((h) => h.includes('移動距離・時間：'));
  assert.ok(html, '移動のある日が見つからない');
  assert.match(html.replace(/<[^>]+>/g, ''), /移動距離・時間：[\d.]+km・約\d+分/);
  assert.ok(!/>計[\d.]+km/.test(html));
});

const rec = (o = {}) => ({
  id: 'R1', receptionNo: 'CC-1', date: '2026-10-23', start: '14:00', end: '15:30', status: 'tentative', userId: 'u01', areaId: 'osaka', gender: 'f',
  customer: { name: '山田 花子', phone: '090-1111-2222', address: '大阪府大阪市阿倍野区1-2-3' }, hearing: { wants: '時計' }, ...o,
});
const page = (selId, reservations = [rec()]) => dispatcherHtml({ date: '2026-10-23', reservations, now: NOW, chips: [], area: 'osaka', selId });

test('配車確定: 帯を選ぶと、詳細は画面の右側（表の横）に出る。下には出さない。選んでいないときは出ない', () => {
  const none = page(null);
  assert.ok(!none.includes('data-bclose') && !none.includes('data-chg="R1"'));
  const sel = page('R1');
  assert.ok(sel.includes('data-bclose') && sel.includes('data-fix="R1"') && sel.includes('data-chg="R1"') && sel.includes('data-cancelres="R1"'));
  // 表と詳細は、同じ横並びの行に入っている（表のあとに、詳細。下の段の border-t ではない）
  assert.ok(sel.indexOf('data-bcol') < sel.indexOf('data-bclose'));
  assert.ok(sel.includes('w-[min(26rem,40%)]') && !sel.includes('<div class="border-t"><div class="space-y-2'));
  assert.ok(!page('NOPE').includes('data-bclose')); // 見つからない予約は出さない
});

test('配車確定の右の詳細は、受付で登録した内容をすべて出す（訪問カレンダーの詳細と同じ項目）', () => {
  const full = rec({ receptionNo: 'CC-9', receivedAt: '2026/10/22 10:00', operator: '佐藤', apType: '再',
    customer: { name: '山田 花子', kana: 'ヤマダ ハナコ', phone: '090-1111-2222', phone2: '06-0000-0000', zip: '545-0000', address: '大阪府大阪市阿倍野区1-2-3' },
    hearing: { profile: '女性・60代', trigger: 'チラシ（A123）', wants: '時計', large: '桐ダンス', attendee: 'ご本人', companion: 'なし', parking: 'あり', nameplate: 'あり', contact: '17:00〜19:00', notes: '犬がいる' } });
  const t = page('R1', [full]).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const side = t.slice(t.indexOf('山田 花子 様'));
  for (const k of ['ヤマダ ハナコ', '545-0000', '06-0000-0000', '女性・60代', '2026/10/22 10:00', '佐藤', '再訪', 'チラシ（A123）', '時計', '桐ダンス', 'ご本人', 'なし', 'あり', '17:00〜19:00', '犬がいる', 'CC-9']) assert.ok(side.includes(k), k);
  assert.equal((side.match(/担当鑑定士/g) || []).length, 0); // 担当は、下の「担当（仮）」の1か所だけ
});

test('配車確定の帯: お客様の性別の記号（♀・♂）と顧客ランクを出す。性別が分からない予定には出さない', async () => {
  const { genderMark, custRankMark } = await import('../callcenter/dispatcherView.js');
  assert.match(genderMark('f'), />♀</);
  assert.match(genderMark('m'), />♂</);
  assert.equal(genderMark(''), '');
  assert.equal(genderMark(undefined), '');
  assert.match(custRankMark({ rank: 'S', known: true }), />顧客S</);
  assert.match(custRankMark({ rank: null, known: false }), />新規</);
  assert.equal(custRankMark(null), '');
  const html = page(null, [rec({ gender: 'f' }), rec({ id: 'R2', userId: 'u02', gender: 'm', start: '10:00', end: '11:00', customer: { name: '佐藤 一郎', phone: '', address: 'x' } })]);
  assert.ok(html.includes('>♀<') && html.includes('>♂<'));
});

test('配車確定: 帯の色は顧客ランク、見出しの色は鑑定士ランク。状態は枠線。凡例も出す（鑑定士ごとの色分けはしない）', async () => {
  const { RANK_COLORS } = await import('../src/rankColor.js');
  const { rankOfUser } = await import('../src/dispatch.js');
  const h = page(null, [rec({ id: 'T', status: 'tentative' }), rec({ id: 'C', status: 'confirmed', userId: 'u02', start: '10:00', end: '11:00' }), rec({ id: 'V', status: 'tentative', everConfirmed: true, userId: 'u03', start: '16:00', end: '17:00' })]);
  assert.ok(h.includes('border:3px dashed') && h.includes('border:3px solid') && h.includes('border:4px double #0f172a'));
  assert.ok(h.includes(`background:${RANK_COLORS[rankOfUser('u01')].fill};color:${RANK_COLORS[rankOfUser('u01')].text}`)); // 鑑定士の見出し
  assert.ok(/色＝ランク/.test(h) && /枠線＝状態/.test(h) && h.includes('黒の二重線'));
});
