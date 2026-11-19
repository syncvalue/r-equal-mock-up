import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const F = await import('../src/flyers.js');

const TODAY = '2026-11-19';
const input = { name: '11/19号 背広・婦人服', media: 'newspaper', adType: '背広', area: '大阪府（吹田市・豊中市）', from: '2026-11-19', to: '2026-11-19', quantity: 30000, cost: 150000, note: '' };
const make = (o = {}, list = []) => F.saveFlyer(list, { ...input, ...o }, { today: TODAY });

test('配布方法: 新聞折込・ポスティング・DM・はがきの3つ。IDの頭文字は N・P・D（受付のチラシIDと同じ）', () => {
  assert.deepEqual(F.MEDIA.map((m) => [m.label, m.prefix]), [['新聞折込', 'N'], ['ポスティング', 'P'], ['DM・はがき', 'D']]);
});

test('登録: ID（頭文字＋4桁）はシステムが採番する。配布方法ごとに、いまの最大の次の番号', () => {
  const first = make();
  assert.equal(first.ok, true);
  assert.equal(first.flyers[0].id, 'N1001');
  assert.equal(first.flyers[0].active, true);
  const second = make({ name: '11/26号' }, first.flyers);
  assert.equal(second.flyers.at(-1).id, 'N1002');
  const posting = make({ media: 'posting', name: 'ポスティング' }, second.flyers);
  assert.equal(posting.flyers.at(-1).id, 'P1001');
  const seeded = F.defaultFlyers(TODAY);
  assert.equal(F.nextFlyerId(seeded, 'newspaper'), 'N1023'); // 見本に N1012・N1019・N1020・N1021・N1022 がある
});

test('登録: 理由つきで失敗する（名前・配布方法・エリア・期間・部数・費用）', () => {
  assert.equal(make({ name: ' ' }).reason, 'noName');
  assert.equal(make({ media: 'tv' }).reason, 'badMedia');
  assert.equal(make({ area: '' }).reason, 'noArea');
  assert.equal(make({ from: '' }).reason, 'badDate');
  assert.equal(make({ from: '2026-11-20', to: '2026-11-19' }).reason, 'dateOrder');
  assert.equal(make({ quantity: 0 }).reason, 'badQuantity');
  assert.equal(make({ quantity: 1.5 }).reason, 'badQuantity');
  assert.equal(make({ cost: -1 }).reason, 'badCost');
  assert.equal(make({}, make().flyers).reason, 'dupName');
});

test('登録: 部数・費用は、全角や「,」「円」が混ざっていても読める。費用は空なら0円', () => {
  const r = make({ quantity: '３０,０００', cost: '150,000円' });
  assert.equal(r.ok, true);
  assert.deepEqual([r.flyers[0].quantity, r.flyers[0].cost], [30000, 150000]);
  assert.equal(make({ cost: '' }).flyers[0].cost, 0);
});

test('更新: IDは変わらない。配布方法は、IDの頭文字と結びつくので変えられない', () => {
  const base = make().flyers;
  const up = F.saveFlyer(base, { ...input, id: 'N1001', quantity: 40000 }, { today: TODAY });
  assert.equal(up.ok, true);
  assert.deepEqual([up.flyers.length, up.flyers[0].id, up.flyers[0].quantity], [1, 'N1001', 40000]);
  assert.equal(F.saveFlyer(base, { ...input, id: 'N1001', media: 'dm' }, { today: TODAY }).reason, 'mediaLocked');
  assert.equal(F.saveFlyer(base, { ...input, id: 'N9999' }, { today: TODAY }).reason, 'notFound');
});

test('有効・無効: 削除はなく、有効・無効だけ。元の配列は変えない', () => {
  const base = make().flyers;
  const off = F.setFlyerActive(base, 'N1001', false);
  assert.equal(off.ok, true);
  assert.equal(off.flyers[0].active, false);
  assert.equal(base[0].active, true);
  assert.equal(F.setFlyerActive(base, 'X', false).reason, 'notFound');
});

test('今日配布のチラシ: 有効で、配布の期間に今日が入るものだけ。ID順', () => {
  const list = [
    { ...input, id: 'P1001', media: 'posting', from: '2026-11-17', to: '2026-11-21', active: true },
    { ...input, id: 'N1001', from: '2026-11-19', to: '2026-11-19', active: true },
    { ...input, id: 'N1002', from: '2026-11-20', to: '2026-11-20', active: true },
    { ...input, id: 'N1003', from: '2026-11-18', to: '2026-11-18', active: true },
    { ...input, id: 'D1001', media: 'dm', from: '2026-11-19', to: '2026-11-19', active: false },
  ];
  assert.deepEqual(F.flyersOnDay(list, TODAY).map((f) => f.id), ['N1001', 'P1001']);
  assert.deepEqual(F.flyersOnDay(list, '2026-11-20').map((f) => f.id), ['N1002', 'P1001']);
  assert.deepEqual(F.flyersOnDay([], TODAY), []);
});

test('見本: 受付で使っているチラシID（N1012・N1019・P1015・D1001）が入っている。今日配布のチラシが、1つ以上ある', () => {
  const list = F.defaultFlyers(TODAY);
  for (const id of ['N1012', 'N1019', 'P1015', 'D1001']) assert.ok(list.some((f) => f.id === id), id);
  assert.ok(F.flyersOnDay(list, TODAY).length >= 1);
  assert.ok(list.every((f) => F.MEDIA.some((m) => m.key === f.media) && f.name && f.area && f.quantity > 0));
});

const rec = (flyerId, status = 'tentative', ts = Date.parse('2026-11-19T10:00:00')) => ({ id: `R${Math.random()}`, flyerId, status, receivedTs: ts });
const flyers = [
  { ...input, id: 'N1001', quantity: 10000, cost: 50000, active: true },
  { ...input, id: 'P1001', media: 'posting', name: 'ポスティング', quantity: 2000, cost: 8000, active: true },
  { ...input, id: 'D1001', media: 'dm', name: 'DM', quantity: 500, cost: 30000, active: true },
];

test('反響の集計: 受付の件数（取消も含む）・確定・取消。反響率＝受付÷部数、1件あたりの費用＝費用÷受付', () => {
  const receptions = [rec('N1001'), rec('N1001', 'confirmed'), rec('N1001', 'cancelled'), rec('N1001'), rec('P1001', 'confirmed'), rec(null), rec('X9999')];
  const s = F.flyerStats(flyers, receptions);
  const n = s.find((x) => x.flyer.id === 'N1001');
  assert.deepEqual([n.calls, n.confirmed, n.cancelled], [4, 1, 1]);
  assert.equal(n.rate, 4 / 10000);
  assert.equal(n.costPerCall, 12500);
  const p = s.find((x) => x.flyer.id === 'P1001');
  assert.deepEqual([p.calls, p.rate, p.costPerCall], [1, 1 / 2000, 8000]);
  const d = s.find((x) => x.flyer.id === 'D1001');
  assert.deepEqual([d.calls, d.costPerCall], [0, null]); // 反響がなければ、1件あたりの費用は出さない
});

test('反響の集計: 配布方法ごとの合計', () => {
  const receptions = [rec('N1001'), rec('N1001'), rec('P1001')];
  const m = F.statsByMedia(F.flyerStats(flyers, receptions));
  assert.deepEqual(m.map((x) => x.media.key), ['newspaper', 'posting', 'dm']);
  assert.deepEqual([m[0].count, m[0].quantity, m[0].cost, m[0].calls, m[0].costPerCall], [1, 10000, 50000, 2, 25000]);
  assert.equal(m[2].costPerCall, null);
});

test('反響の集計: 効果の順（1件あたりの費用が安い順。反響のないものは最後）', () => {
  const receptions = [rec('N1001'), rec('N1001'), rec('P1001'), rec('P1001'), rec('P1001'), rec('P1001')];
  assert.deepEqual(F.rankByEfficiency(F.flyerStats(flyers, receptions)).map((x) => x.flyer.id), ['P1001', 'N1001', 'D1001']);
});

test('反響の集計: 日ごとの件数（配布の後、何日目に電話が来たか）', () => {
  const day = (d) => Date.parse(`2026-11-${d}T12:00:00`);
  const receptions = [rec('N1001', 'tentative', day('19')), rec('N1001', 'tentative', day('19')), rec('N1001', 'tentative', day('21')), rec('P1001', 'tentative', day('19'))];
  assert.deepEqual(F.dailyCalls(receptions, 'N1001'), [{ day: '2026-11-19', count: 2 }, { day: '2026-11-21', count: 1 }]);
  assert.deepEqual(F.dailyCalls(receptions, 'D1001'), []);
});

test('保存と読み込み: 保存がなければ見本。壊れた保存は見本に戻す', () => {
  mem.clear();
  assert.equal(F.loadFlyers(TODAY).length, F.defaultFlyers(TODAY).length);
  const list = make().flyers;
  assert.equal(F.saveFlyers(list), true);
  assert.deepEqual(F.loadFlyers(TODAY).map((f) => f.id), ['N1001']);
  mem.set(F.FLYERS_KEY, '{broken');
  assert.equal(F.loadFlyers(TODAY).length, F.defaultFlyers(TODAY).length);
});

test('受付との連動: マーケティング部が登録したチラシのIDで、受付の「来電のきっかけ」を特定できる。きっかけの文には、登録したチラシの名前が入る', async () => {
  mem.clear();
  F.saveFlyers(make({ name: '11/26号 着物・骨董' }, F.defaultFlyers(TODAY)).flyers);
  const { flyerOf, triggerText, flyerChoices } = await import('../callcenter/master.js');
  const hit = flyerOf(' ｎ-1023 ');
  assert.deepEqual([hit.id, hit.name, hit.chirashi], ['N1023', '11/26号 着物・骨董', 0]);
  assert.equal(triggerText(hit.chirashi, 'N1023'), '11/26号 着物・骨董（ID: N1023）');
  assert.equal(flyerOf('N1019').name, '新聞折込チラシ（10/19号）'); // これまでのチラシ（固定の4つ）は、変わらない
  assert.equal(flyerOf('N9999'), null);
  assert.ok(flyerChoices().some((c) => c.id === 'N1023'));
});

// ---- 買取金額・粗利で測る ----
const visit = (eventId, items, endedAt = 1) => ({ eventId, endedAt, items });
test('買取の実績: 受付の訪問（予定のID＝受付のID）が終わっていれば、売った商品の買取額と、想定販売価格との差（粗利）が出る', () => {
  const v = [visit('R1', [{ sell: true, price: 100000, expectedPrice: 130000 }, { sell: true, price: 50000, expectedPrice: 0 }, { sell: false, price: 999, expectedPrice: 9999 }])];
  assert.deepEqual(F.receptionResult({ id: 'R1' }, v), { won: true, amount: 150000, gross: 30000 });
  assert.equal(F.receptionResult({ id: 'R2' }, v), null); // 訪問の記録がない
  assert.equal(F.receptionResult({ id: 'R1' }, [visit('R1', [], null)]), null); // 訪問が終わっていない
  assert.deepEqual(F.receptionResult({ id: 'R1' }, [visit('R1', [{ sell: false, price: 100, expectedPrice: 0 }])]), { won: false, amount: 0, gross: 0 }); // 売らなかった
});

test('買取の実績（デモ）: 確定した受付だけに、いつも同じ見本の実績を付ける。仮確定・取消には付けない', () => {
  const a = F.demoResult({ id: 'SMP-01', status: 'confirmed' });
  assert.deepEqual(F.demoResult({ id: 'SMP-01', status: 'confirmed' }), a);
  assert.equal(F.demoResult({ id: 'SMP-01', status: 'tentative' }), null);
  assert.equal(F.demoResult({ id: 'SMP-01', status: 'cancelled' }), null);
  const all = ['A', 'B', 'C', 'D', 'E', 'F'].map((id) => F.demoResult({ id, status: 'confirmed' }));
  assert.ok(all.some((x) => x.won) && all.every((x) => (x.won ? x.amount > 0 && x.gross > 0 : x.amount === 0 && x.gross === 0)));
});

test('反響の集計（買取）: 成約・買取額・粗利と、粗利から費用を引いた損益。費用対効果は、粗利÷費用', () => {
  const receptions = [rec('N1001'), rec('N1001'), rec('N1001'), rec('P1001')];
  const results = { [receptions[0].id]: { won: true, amount: 100000, gross: 30000 }, [receptions[1].id]: { won: true, amount: 60000, gross: 20000 }, [receptions[2].id]: { won: false, amount: 0, gross: 0 }, [receptions[3].id]: { won: true, amount: 40000, gross: 10000 } };
  const s = F.flyerStats(flyers, receptions, results);
  const n = s.find((x) => x.flyer.id === 'N1001');
  assert.deepEqual([n.won, n.amount, n.gross, n.profit, n.roi], [2, 160000, 50000, 0, 1]);
  const p = s.find((x) => x.flyer.id === 'P1001');
  assert.deepEqual([p.won, p.gross, p.profit, p.roi], [1, 10000, 2000, 1.25]);
  const d = s.find((x) => x.flyer.id === 'D1001');
  assert.deepEqual([d.won, d.gross, d.profit], [0, 0, -30000]);
  const noCost = F.flyerStats([{ ...flyers[0], cost: 0 }], [], {});
  assert.equal(noCost[0].roi, null); // 費用が0円なら、費用対効果は出さない
  assert.deepEqual(F.rankByProfit(s).map((x) => x.flyer.id), ['P1001', 'N1001', 'D1001']);
  assert.deepEqual(F.statsByMedia(s)[0].profit, 0);
});

// ---- デザインデータ ----
const png = { name: 'omote.png', type: 'image/png', size: 1200, dataUrl: 'data:image/png;base64,AAAA' };
test('デザインデータ: 画像（png・jpeg・webp・gif）かPDFを1つ付けられる。大きすぎる・種類が違うものは付けられない', () => {
  assert.deepEqual(make({ file: png }).flyers[0].file, png);
  assert.equal(make({ file: { ...png, type: 'application/pdf', name: 'a.pdf' } }).ok, true);
  assert.equal(make({ file: { ...png, type: 'application/zip' } }).reason, 'badFile');
  assert.equal(make({ file: { ...png, size: F.MAX_FILE_BYTES + 1 } }).reason, 'bigFile');
  assert.equal(make({ file: { ...png, dataUrl: '' } }).reason, 'badFile');
  assert.equal(make().flyers[0].file, null); // 付けなければ、なし
});
test('デザインデータ: 更新のとき、ファイルを指定しなければ、いまのものを残す。nullで外す', () => {
  const base = make({ file: png }).flyers;
  assert.deepEqual(F.saveFlyer(base, { ...input, id: 'N1001', quantity: 1 }).flyers[0].file, png);
  assert.equal(F.saveFlyer(base, { ...input, id: 'N1001', file: null }).flyers[0].file, null);
});

// ---- オペレーターへの見せ方 ----
test('明日の配布予定: 有効で、明日が配布の期間に入るチラシ', () => {
  const list = [{ ...input, id: 'N1002', from: '2026-11-20', to: '2026-11-20', active: true }, { ...input, id: 'N1003', from: '2026-11-19', to: '2026-11-19', active: true }, { ...input, id: 'P1001', media: 'posting', from: '2026-11-18', to: '2026-11-20', active: true }];
  assert.deepEqual(F.flyersTomorrow(list, TODAY).map((f) => f.id), ['N1002', 'P1001']);
  assert.equal(F.shiftDay('2026-11-30', 1), '2026-12-01');
});
test('傾向（曜日）: 受付の、曜日ごとの件数（日〜土）', () => {
  const at = (s) => Date.parse(s);
  const r = [rec('N1001', 'tentative', at('2026-11-16T10:00:00')), rec('N1001', 'tentative', at('2026-11-16T15:00:00')), rec('N1001', 'tentative', at('2026-11-19T10:00:00'))]; // 月・月・木
  const w = F.weekdayTrend(r);
  assert.deepEqual(w.map((x) => x.label), ['日', '月', '火', '水', '木', '金', '土']);
  assert.deepEqual(w.map((x) => x.count), [0, 2, 0, 0, 1, 0, 0]);
});
test('傾向（エリア）: チラシの配布エリアの都道府県ごとの、部数・受付・反響率。反響率の高い順', () => {
  assert.deepEqual(['大阪府（吹田市）', '京都府京都市', '兵庫県西宮市', '神奈川県横浜市', '全国', ''].map(F.prefOf), ['大阪府', '京都府', '兵庫県', '神奈川県', '', '']);
  const fl = [{ ...flyers[0], area: '大阪府（吹田市）', quantity: 10000 }, { ...flyers[1], area: '兵庫県西宮市', quantity: 1000 }, { ...flyers[2], area: '大阪府（堺市）', quantity: 10000 }];
  const t = F.areaTrend(fl, [rec('N1001'), rec('P1001'), rec('P1001'), rec('D1001')]);
  assert.deepEqual(t.map((x) => [x.pref, x.quantity, x.calls]), [['兵庫県', 1000, 2], ['大阪府', 20000, 2]]);
  assert.ok(t[0].rate > t[1].rate);
});

test('チラシ→アポ→買取した商品: チラシのIDの受付ごとに、訪問で売れた商品の名前をたどれる。商品にはチラシを持たせない', () => {
  const r = [{ id: 'R1', flyerId: 'N1001', receptionNo: 'CC-1', date: '2026-11-20', status: 'confirmed', customer: { name: '山田 花子' } }, { id: 'R2', flyerId: 'N1001', receptionNo: 'CC-2', date: '2026-11-21', status: 'tentative', customer: { name: '佐藤' } }, { id: 'R3', flyerId: 'P1001', receptionNo: 'CC-3', customer: { name: 'x' } }];
  const v = [visit('R1', [{ name: 'ヴィトン バッグ', sell: true, price: 80000, expectedPrice: 100000 }, { name: '指輪', sell: false, price: 0 }])];
  const d = F.receptionDetails('N1001', r, v);
  assert.deepEqual(d.map((x) => [x.receptionNo, x.customer, x.items, x.amount]), [['CC-1', '山田 花子', ['ヴィトン バッグ'], 80000], ['CC-2', '佐藤', [], 0]]);
  assert.deepEqual(F.receptionDetails('D1001', r, v), []);
});

// ---- 進捗（あらかじめ登録して、1件ずつ配布まで進める）----
test('進捗: 未着手 → 制作中 → 入稿済み → 配布済みの4段階。新しく登録すると、未着手', () => {
  assert.deepEqual(F.STAGES.map((x) => [x.key, x.label]), [['plan', '未着手'], ['design', '制作中'], ['submitted', '入稿済み'], ['distributed', '配布済み']]);
  assert.equal(make().flyers[0].stage, 'plan');
  assert.equal(make({ stage: 'design' }).flyers[0].stage, 'design'); // すでに進んでいるものを登録してもよい
  assert.equal(make({ stage: 'nope' }).flyers[0].stage, 'plan');
});

test('進捗: 更新のとき、指定しなければ、いまの進捗を残す', () => {
  const base = make({ stage: 'design' }).flyers;
  assert.equal(F.saveFlyer(base, { ...input, id: 'N1001' }).flyers[0].stage, 'design');
  assert.equal(F.saveFlyer(base, { ...input, id: 'N1001', stage: 'submitted' }).flyers[0].stage, 'submitted');
});

test('進捗: 1つ進める・1つ戻す。両端では動かない。元の配列は変えない', () => {
  const base = make().flyers;
  const a = F.advanceFlyer(base, 'N1001', 1);
  assert.deepEqual([a.ok, a.flyers[0].stage, base[0].stage], [true, 'design', 'plan']);
  assert.equal(F.advanceFlyer(a.flyers, 'N1001', -1).flyers[0].stage, 'plan');
  assert.equal(F.advanceFlyer(base, 'N1001', -1).reason, 'noMove');
  const end = [{ ...base[0], stage: 'distributed' }];
  assert.equal(F.advanceFlyer(end, 'N1001', 1).reason, 'noMove');
  assert.equal(F.advanceFlyer(base, 'X', 1).reason, 'notFound');
});

test('進捗: 古い保存（進捗なし）は、配布のおわりが過ぎていれば配布済み、そうでなければ入稿済みとして読む', () => {
  assert.equal(F.stageOf({ ...input, to: '2026-11-18' }, TODAY), 'distributed');
  assert.equal(F.stageOf({ ...input, to: '2026-11-19' }, TODAY), 'submitted');
  assert.equal(F.stageOf({ ...input, stage: 'design', to: '2026-11-01' }, TODAY), 'design'); // 進捗があれば、そのまま
});

test('入稿期限: 任意。日付の形で、配布のはじめの日より後にはできない', () => {
  assert.equal(make({ deadline: '2026-11-17' }).flyers[0].deadline, '2026-11-17');
  assert.equal(make({ deadline: '' }).flyers[0].deadline, '');
  assert.equal(make({ deadline: '11/17' }).reason, 'badDeadline');
  assert.equal(make({ deadline: '2026-11-20' }).reason, 'deadlineOrder'); // 配布は 11/19
});

test('見本: 配布前の予定（未着手・制作中）と、入稿期限が今日・過ぎているものがある', () => {
  const l = F.defaultFlyers(TODAY);
  assert.ok(l.some((f) => f.stage === 'plan') && l.some((f) => f.stage === 'design'));
  assert.ok(l.some((f) => f.deadline === TODAY && ['plan', 'design'].includes(f.stage)));
  assert.ok(l.some((f) => f.deadline && f.deadline < TODAY && ['plan', 'design'].includes(f.stage)));
  assert.ok(l.every((f) => !f.deadline || f.deadline <= f.from));
});
