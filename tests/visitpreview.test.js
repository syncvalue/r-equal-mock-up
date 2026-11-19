import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.window = { matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener() {} };
const { previewModalHtml } = await import('../honsha/visitPreview.js');
const { EVENTS, eventById } = await import('../src/schedule.js');

const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('予定の事前確認: お客様・日時・担当の鑑定士・住所・電話・商材・受電時のヒアリングが出る', () => {
  const e = EVENTS.find((x) => x.id === 'ev-1-2'); // 吉田 修（ロレックスを数本）
  const html = previewModalHtml(e);
  const t = text(html);
  assert.ok(t.includes('吉田 修 様') && t.includes(`${e.start}–${e.end}`) && t.includes('鈴木 一郎'));
  assert.ok(t.includes(e.customer.address) && t.includes(e.customer.phone) && t.includes(e.items));
  assert.ok(t.includes('受電時のヒアリング') && t.includes('前回、価格交渉が強かった'));
  assert.ok(t.includes('お客様の評価') && t.includes('過去の買取履歴') && t.includes('売らなかったもの'));
  assert.ok(html.includes('HQ-M03') && html.includes('data-preview-close'));
});

test('予定の事前確認: 見るだけ（入力欄・保存・登録のボタンがない）', () => {
  const html = previewModalHtml(EVENTS[0]);
  assert.ok(!/<(input|textarea|select)\b/.test(html));
  assert.ok(!html.includes('data-custeval') && !html.includes('data-ce='));
  assert.ok(!html.includes('訪問を開始'));
});

test('予定の事前確認: お客様の名前などは、エスケープされる。予定がなければ何も出さない', () => {
  const e = { ...EVENTS[0], customer: { ...EVENTS[0].customer, name: '<b>x</b>' } };
  assert.ok(!previewModalHtml(e).includes('<b>x</b>'));
  assert.equal(previewModalHtml(null), '');
  assert.ok(eventById('ev-0-1'));
});
