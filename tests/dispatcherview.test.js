import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const { dispatcherHtml } = await import('../callcenter/dispatcherView.js');

const NOW = new Date(2026, 9, 21, 9, 0);

test('配車確定の鑑定士の列: 訪問間の移動の合計は、「走行距離：」と書く（時間は出さない）', () => {
  // 予定が2件以上ある鑑定士（元からの予定）の日を探す
  const html = ['2026-10-21', '2026-10-22', '2026-10-23', '2026-10-26'].map((date) => dispatcherHtml({ date, reservations: [], now: NOW, chips: [], area: 'osaka', selId: null })).find((h) => h.includes('走行距離：'));
  assert.ok(html, '移動のある日が見つからない');
  assert.match(html.replace(/<[^>]+>/g, ''), /走行距離：[\d.]+km/);
  assert.ok(!/>計[\d.]+km/.test(html));
});

const rec = (o = {}) => ({
  id: 'R1', receptionNo: 'CC-1', date: '2026-10-23', start: '14:00', end: '15:30', status: 'tentative', userId: 'u01', areaId: 'osaka', gender: 'f',
  customer: { name: '山田 花子', phone: '090-1111-2222', address: '大阪府大阪市阿倍野区1-2-3' }, hearing: { wants: '時計' }, ...o,
});
const page = (selId, reservations = [rec()]) => dispatcherHtml({ date: '2026-10-23', reservations, now: NOW, chips: [], area: 'osaka', selId });

test('配車確定: 帯を選ぶと、詳細は画面の右側（表の横）に出る。下には出さない。選んでいないときは出ない', () => {
  const none = page(null);
  assert.ok(!none.includes('data-chg="R1"'));
  const sel = page('R1');
  assert.ok(!sel.includes('data-bclose') && sel.includes('data-fix="R1"') && sel.includes('data-chg="R1"') && sel.includes('data-cancelres="R1"'));
  // 表と詳細は、同じ横並びの行に入っている（表のあとに、詳細。下の段の border-t ではない）
  assert.ok(sel.indexOf('data-bcol') < sel.indexOf('data-chg="R1"'));
  assert.ok(sel.includes('w-[min(26rem,40%)]') && !sel.includes('<div class="border-t"><div class="space-y-2'));
  assert.ok(!page('NOPE').includes('data-chg=')); // 見つからない予約は出さない
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
  assert.match(custRankMark({ rank: 'S', known: true }), />S</);
  assert.equal(custRankMark({ rank: null, known: false }), ''); // ランクがなければ、「未設定」とも書かず、何も出さない
  assert.equal(custRankMark(undefined), '');
  assert.match(custRankMark({ rank: 'SS', known: false }), />SS</);
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

test('顧客ランクは、新規かリピーターかとは別の軸: 帯に、ランクと「新規／再訪」を別々に出す。新規でもランクが付く', async () => {
  const { kindOfRes, kindMark } = await import('../callcenter/dispatcherView.js');
  assert.equal(kindOfRes({ apType: '新' }, { purchase: { count: 0 } }), 'new');
  assert.equal(kindOfRes({ apType: '再' }, { purchase: { count: 0 } }), 'repeat');
  assert.equal(kindOfRes({ apType: '新' }, { purchase: { count: 3 } }), 'repeat');
  assert.match(kindMark('new'), />新規</);
  assert.match(kindMark('repeat'), />再訪</);
  // 新規のお客様（apType=新、実績なし）に、受付で付けたランク（customerRank）がある
  const h = page(null, [rec({ apType: '新', customerRank: 'SS', gender: 'f' })]);
  assert.ok(h.includes('>SS<') && h.includes('>新規<'));
  const { RANK_COLORS } = await import('../src/rankColor.js');
  assert.ok(h.includes(`background:${RANK_COLORS.SS.fill}`)); // 帯の色は、そのランクの色
});

test('ダミーのランクは、顧客も鑑定士も、SS・S・A・Bに分かれている（新規のお客様にも付く）', async () => {
  const { USERS } = await import('../src/dashboard.js');
  const { rankOfUser, busyBlocks, dummyCustomerRank } = await import('../src/dispatch.js');
  assert.deepEqual([...new Set(USERS.map((u) => rankOfUser(u.id)))].sort(), ['A', 'B', 'S', 'SS']);
  const seen = new Set();
  for (const u of USERS) for (let d = 18; d < 25; d++) for (const b of busyBlocks(u.id, `2026-11-${d}`, [], new Date(2026, 10, 18, 9))) seen.add(b.custRank);
  assert.deepEqual([...seen].sort(), ['A', 'B', 'S', 'SS']);
  assert.equal(dummyCustomerRank('x'), dummyCustomerRank('x')); // 同じキーなら、いつも同じ
});

test('配車確定: 右の詳細エリアは、はじめから確保する。何も選んでいないときは、案内の文を出す（選んだときに、カレンダーが縮まない）', () => {
  const none = page(null);
  assert.ok(none.includes('w-[min(26rem,40%)]') && none.includes('data-detail-empty'));
  assert.ok(none.replace(/<[^>]+>/g, ' ').includes('カレンダーの枠をクリックすると、詳細が表示されます'));
  const sel = page('R1');
  assert.ok(sel.includes('w-[min(26rem,40%)]') && !sel.includes('data-detail-empty')); // 選ぶと、同じ場所に詳細が入る
  const width = (h) => h.match(/class="sticky top-0[^"]*w-\[min\(26rem,40%\)\][^"]*"/)[0];
  assert.equal(width(none), width(sel)); // エリアの大きさは、変わらない
});

test('配車確定: 走行距離は、押せるボタン（訪問ルートの地図を開く）。地図のモーダルには、訪問順の番号を出す', async () => {
  const { routeModalHtml } = await import('../callcenter/routeModal.js');
  const html = ['2026-10-21', '2026-10-22', '2026-10-23', '2026-10-26'].map((date) => ({ date, h: dispatcherHtml({ date, reservations: [], now: NOW, chips: [], area: 'osaka', selId: null }) })).find((x) => x.h.includes('data-routemap='));
  assert.ok(html, '走行距離のボタンがない');
  const userId = html.h.match(/data-routemap="([^"]+)"/)[1];
  const modal = routeModalHtml({ userId, date: html.date, reservations: [], now: NOW });
  assert.ok(modal.includes('id="route-map"') && modal.includes('CC-M07'));
  assert.match(modal.replace(/<[^>]+>/g, ' '), /訪問ルート/);
  assert.match(modal, /route-num-s[^>]*>1</); // ①から
  assert.ok(routeModalHtml({ userId: 'nobody', date: html.date, reservations: [], now: NOW } ) === '');
});

test('配車確定の帯: 鑑定士の元からの予定・見本の訪問にも、性別の記号を出す。帯の中は、名前・印・住所の3段', () => {
  const html = ['2026-10-21', '2026-10-22', '2026-10-23', '2026-10-26'].map((date) => dispatcherHtml({ date, reservations: [], now: NOW, chips: [], area: 'osaka', selId: null })).join('');
  assert.ok(html.includes('title="女性のお客様"') && html.includes('title="男性のお客様"'));
  const blocks = html.split('data-bsel=').slice(1);
  assert.ok(blocks.length > 0 && blocks.every((b) => /title="(女性|男性)のお客様"/.test(b.split('data-bsel=')[0])), '性別のない帯がある');
  assert.match(blocks[0], /text-\[11px\] font-bold[^>]*>確 /); // 1段目: 名前
});

test('配車確定: 訪問が1件だけの日も、走行距離（0km）を出す。地図を開けるように。0件の日は出さない', async () => {
  const { busyBlocks } = await import('../src/dispatch.js');
  const { USERS } = await import('../src/dashboard.js');
  const days = ['2026-10-21', '2026-10-22', '2026-10-23', '2026-10-26'];
  const one = days.flatMap((date) => USERS.map((u) => ({ date, id: u.id, n: busyBlocks(u.id, date, [], NOW).length }))).filter((x) => x.n === 1);
  const none = days.flatMap((date) => USERS.map((u) => ({ date, id: u.id, n: busyBlocks(u.id, date, [], NOW).length }))).filter((x) => x.n === 0);
  assert.ok(one.length > 0 && none.length > 0, '見本の日が見つからない');
  const html = (x) => dispatcherHtml({ date: x.date, reservations: [], now: NOW, chips: [], area: 'all', selId: null });
  assert.ok(html(one[0]).includes(`data-routemap="${one[0].id}"`) && /走行距離：0km/.test(html(one[0]).replace(/<[^>]+>/g, '')));
  assert.ok(!html(none[0]).includes(`data-routemap="${none[0].id}"`));
});

test('配車確定: 鑑定士指名の予約は、帯と詳細に「指名」の印と、鑑定士を変えられない旨を出す。指名でなければ出さない', () => {
  assert.ok(page(null, [rec({ nominated: true })]).includes('>指名<'));
  assert.ok(page('R1', [rec({ nominated: true })]).includes('鑑定士は変えられません（時間は変えられます）'));
  assert.ok(!page('R1', [rec()]).includes('>指名<'));
});

test('配車確定の帯: 時間は帯の中に出さない（左の時間軸で分かる）。1時間の帯でも、3段が入る高さ（30分あたり30px以上）', async () => {
  const { BOARD_ROW } = await import('../callcenter/dispatcherView.js');
  assert.ok(BOARD_ROW * 2 - 1 >= 56, '1時間の帯が低すぎて、3段が見切れる');
  const h = page(null, [rec()]);
  const body = h.split('data-bsel="R1"')[1].split('data-bsel=')[0].replace(/title="[^"]*"/, '');
  assert.ok(!/\d{2}:\d{2}[–-]\d{2}:\d{2}/.test(body), '帯の中に時間がある');
});

test('配車確定: 売りたいものに貴金属がある予約は、帯に「貴金属」の印、詳細に案内を出す。ないときは出さない。凡例にも載せる', () => {
  const metal = rec({ hearing: { wants: '貴金属・ジュエリー ／ 指輪 3点' } });
  assert.ok(page(null, [metal]).includes('>貴金属<'));
  const detail = page('R1', [metal]);
  assert.ok(detail.includes('data-metal-advice'));
  assert.ok(!page('R1', [rec()]).includes('data-metal-advice'));
  const n = (h) => (h.match(/>貴金属</g) || []).length;
  assert.equal(n(page(null, [metal])), n(page(null, [rec()])) + 1); // 帯の1つだけ増える（凡例と、元からの予定の印は、同じ）
  assert.ok(n(page(null, [rec()])) >= 1); // 凡例
});

test('配車確定の帯: 設定されていない情報（顧客ランク）は、「未設定」と書かず、出さない', () => {
  const html = page(null, [rec({ customerRank: null })]);
  assert.ok(!html.slice(html.indexOf('data-rid')).includes('未設定'));
});

test('配車確定の表: 列は最小9.5rem（1920×1080で8人が収まる幅）。収まらないときの「あと○名」の印を持つ', () => {
  const html = page(null);
  assert.match(html, /grid-template-columns:2\.25rem repeat\(\d+,minmax\(9\.5rem,1fr\)\)/);
  assert.ok(html.includes('data-boardscroll') && html.includes('data-boardhint') && html.includes('data-hintn'));
  const n = Number(html.match(/repeat\((\d+),minmax/)[1]);
  assert.match(html, new RegExp(`min-width:${2.25 + n * 9.5}rem`));
});

test('配車確定: 日付の入力の左右に、前の日・次の日に1日ずつ動かすボタンがある', () => {
  const html = page(null);
  assert.ok(html.includes('data-dshift="-1"') && html.includes('data-dshift="1"'));
  assert.ok(html.indexOf('data-dshift="-1"') < html.indexOf('data-ddate-input') && html.indexOf('data-ddate-input') < html.indexOf('data-dshift="1"'));
});

test('配車確定の詳細: 操作は1行。確定済みは「確定解除」（文字）、詳細の変更は鉛筆、取消はゴミ箱のアイコン。右上の×はない', () => {
  const h = page('R1', [rec({ status: 'confirmed' })]);
  assert.ok(h.includes('data-unfix="R1"') && h.includes('確定解除') && !h.includes('仮に戻す'));
  assert.match(h, /data-chg="R1"[^>]*aria-label="詳細を変更"[^>]*><svg/);
  assert.match(h, /data-cancelres="R1"[^>]*aria-label="取消"[^>]*><svg/);
  assert.ok(!h.includes('data-bclose') && !h.includes('✕'));
  assert.ok(!/flex flex-wrap items-center gap-2">[^]{0,200}data-unfix/.test(h)); // 折り返さない
});
