import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const { todayFlyersHtml } = await import('../callcenter/todayFlyers.js');
const { defaultFlyers } = await import('../src/flyers.js');

const TODAY = '2026-11-19';
const flyers = defaultFlyers(TODAY);

test('オペレーターの受電画面: 今日配布のチラシ（ID・配布方法・名前・エリア）を出す。今日配っていないチラシは出さない', () => {
  const html = todayFlyersHtml({ flyers, today: TODAY, open: true });
  assert.ok(html.includes('今日配布のチラシ'));
  assert.ok(html.includes('N1020') && html.includes('P1016')); // 今日配布（新聞折込・ポスティング）
  assert.ok(html.includes('大阪府（吹田市・豊中市・箕面市）') && html.includes('京都府（京都市北区・上京区）'));
  assert.ok(!html.includes('N1012') && !html.includes('D1001')); // 過去のチラシ
});

test('オペレーターの受電画面: 閉じているときは、見出しの件数だけ。開閉の操作は ▼／▲', () => {
  const closed = todayFlyersHtml({ flyers, today: TODAY, open: false });
  assert.ok(closed.includes('今日配布のチラシ') && closed.includes('▼ 開く') && !closed.includes('N1020'));
  assert.ok(todayFlyersHtml({ flyers, today: TODAY, open: true }).includes('▲ 閉じる'));
});

test('オペレーターの受電画面: 今日配布のチラシがなければ、その旨だけ出す。無効のチラシは出さない', () => {
  assert.ok(todayFlyersHtml({ flyers: [], today: TODAY, open: true }).includes('今日配布のチラシは、ありません'));
  const off = flyers.map((f) => ({ ...f, active: false }));
  assert.ok(!todayFlyersHtml({ flyers: off, today: TODAY, open: true }).includes('N1020'));
});

test('オペレーターの受電画面: チラシの名前に含まれる記号は、そのまま文字として出す（HTMLとして扱わない）', () => {
  const evil = [{ ...flyers[4], name: '<b>x</b>' }];
  const html = todayFlyersHtml({ flyers: evil, today: TODAY, open: true });
  assert.ok(html.includes('&lt;b&gt;x&lt;/b&gt;') && !html.includes('<b>x</b>'));
});

test('オペレーターの受電画面: 明日の配布予定と、過去の反響の傾向（曜日・エリア）も出す。開いているときだけ', () => {
  const tomorrow = [{ ...flyers[4], id: 'N1030', name: '明日の折込', area: '兵庫県（西宮市）' }];
  const trend = { weekday: [{ label: '日', count: 0 }, { label: '月', count: 5 }, { label: '火', count: 1 }], area: [{ pref: '兵庫県', quantity: 1000, calls: 4, rate: 0.004 }] };
  const html = todayFlyersHtml({ flyers, today: TODAY, open: true, tomorrow, trend });
  assert.ok(html.includes('明日の配布予定') && html.includes('N1030') && html.includes('明日の折込'));
  assert.ok(html.includes('過去の反響の傾向') && html.includes('data-weekday="月"') && html.includes('兵庫県') && html.includes('0.40%'));
  const closed = todayFlyersHtml({ flyers, today: TODAY, open: false, tomorrow, trend });
  assert.ok(!closed.includes('明日の配布予定') && !closed.includes('過去の反響の傾向'));
  assert.ok(todayFlyersHtml({ flyers, today: TODAY, open: true, tomorrow: [], trend }).includes('明日配布のチラシは、ありません'));
});
