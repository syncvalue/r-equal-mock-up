import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const { customerModalHtml } = await import('../callcenter/dispatcherView.js');
const KEY = 'rq-mock-contracts'; // 営業のタブレットで保存した契約

const NOW = new Date(2026, 9, 24, 9, 0);
const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const rec = (phone) => ({ id: 'r1', userId: 'u09', date: '2026-10-26', start: '13:00', end: '14:30', areaId: 'osaka', status: 'tentative', customer: { name: 'A', phone, address: '大阪' }, hearing: { wants: '腕時計' }, gender: 'f' });

test('お客様の詳細: 買取の履歴は、1回ごとに折りたたみ、品目を全件（品名・数量・金額）出す', () => {
  const html = customerModalHtml({ rid: 'r1', reservations: [rec('090-5050-6060')], now: NOW });
  const t = text(html);
  assert.equal((html.match(/<details class="rounded border bg-white"/g) || []).length, 3); // 3回分（ほかの<details>は、お客様の評価の登録欄）
  assert.match(html, /<details class="rounded border bg-white" open>/); // 直近の1回は、開いておく
  assert.ok(['エルメス バーキン30', 'ロレックス サブマリーナ', 'シャネル ボーイシャネル', 'ダイヤ リング 1.2ct', '銀製 茶托', '伊万里焼 大皿'].every((k) => t.includes(k)), t); // 全品目
  assert.ok(t.includes('×10') && t.includes('¥60,000')); // 数量と、金額（単価×数量）
  assert.ok(t.includes('ほか5品目') && t.includes('6点')); // 折りたたんだ状態の要約
  assert.ok(t.includes('3回 ／ 29点 ／ 総額 ¥2,650,000'));
});

test('お客様の詳細: 履歴が多いときは、直近5回を出し、それ以前は「さらに…」にまとめる', () => {
  const contracts = Array.from({ length: 5 }, (_, i) => ({ customer: { phone: '080-2345-6789' }, sentAt: Date.UTC(2026, 9, 1 + i), total: 10000 * (i + 1), items: [{ name: `品目${i + 1}-A`, qty: 1, price: 4000 * (i + 1) }, { name: `品目${i + 1}-B`, qty: 2, price: 3000 * (i + 1) }] }));
  store.set(KEY, JSON.stringify(contracts));
  const html = customerModalHtml({ rid: 'r1', reservations: [rec('080-2345-6789')], now: NOW });
  const t = text(html);
  assert.match(t, /さらに以前の 2回分を表示/); // 計7回（営業のタブレットで保存した5回＋元の2回）のうち、5回を先に出す
  assert.ok(t.includes('品目5-A') && t.includes('品目1-B')); // まとめた中にも、全品目がある
  assert.match(html, /max-h-44 overflow-y-auto/); // 品目が多くても、枠の中でスクロール
});

test('お客様の詳細: 実績のないお客様は、新規と出す', () => {
  const t = text(customerModalHtml({ rid: 'r1', reservations: [rec('090-0000-0000')], now: NOW }));
  assert.ok(t.includes('買取の実績はありません（新規のお客様）'));
});

test('お客様の詳細: 評価・メモは、アポごとに出る（アポが複数なら、評価・メモも複数）', () => {
  const html = customerModalHtml({ rid: 'r1', reservations: [rec('090-5050-6060')], now: NOW });
  const t = text(html);
  assert.equal((html.match(/営業の評価<\/b>/g) || []).length, 3); // 3回の訪問に、それぞれ、評価・メモ
  assert.ok(['バーキンの査定額に不満が強く', '査定額への不満を繰り返し言われた', '骨董を中心に売却'].every((k) => t.includes(k))); // 回ごとに、別のメモ
  assert.ok(t.includes('営業の評価 営業 田中 健') && t.includes('営業の評価 営業 佐藤 大輔')); // 回ごとに、担当した営業も違う
  assert.ok(t.includes('田中 健：バーキンの査定額')); // 折りたたんだ状態でも、メモの冒頭が見える
  const none = text(customerModalHtml({ rid: 'r1', reservations: [rec('090-2468-1357')], now: NOW }));
  assert.ok(none.includes('初回。金の相場を気にされていた'));
});

test('お客様の詳細: 評価のない回は、その旨を出す', () => {
  store.set('rq-mock-contracts', JSON.stringify([{ customer: { phone: '090-7777-0000' }, sentAt: Date.UTC(2026, 8, 1), total: 5000, items: [{ name: 'テスト品', qty: 1, price: 5000 }] }]));
  const t = text(customerModalHtml({ rid: 'r1', reservations: [rec('090-7777-0000')], now: NOW }));
  assert.ok(t.includes('この回の営業の評価・メモは、まだありません') && t.includes('テスト品'));
  store.delete('rq-mock-contracts');
});
