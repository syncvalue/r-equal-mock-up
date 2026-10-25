import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const { storeTabHtml, blankStoreForm, pastCustomerHtml, createStoreTab } = await import('../callcenter/storeTab.js');
const V = await import('../src/storeVisits.js');
const { DEFAULT_STORES } = await import('../src/stores.js');

const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const NOW = Date.now();
const tomorrow = new Date(new Date(NOW).getFullYear(), new Date(NOW).getMonth(), new Date(NOW).getDate() + 1);
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

test('来店予約の画面: 店舗・日・時刻・お名前・電話番号・売りたいものの入力欄。エリア・担当営業・仮確定の項目はない', () => {
  const html = storeTabHtml({ form: blankStoreForm('S-NAMBA', ymd(tomorrow)), stores: DEFAULT_STORES, upcoming: [] });
  for (const k of ['storeId', 'date', 'time', 'phone', 'name', 'kana', 'wants']) assert.ok(html.includes(`data-st="${k}"`), k);
  assert.ok(html.includes('data-st-save') && text(html).includes('なんば店') && text(html).includes('新宿店'));
  assert.ok(!/エリア|担当営業|仮確定/.test(text(html).replace(/仮確定・確定の区別はありません|仮確定・確定|配車はありません/g, '')));
  assert.ok(text(html).includes('来店予約は、ありません'));
});

test('予約の一覧: 日ごとに、時刻・店舗・お客様・電話番号・売りたいもの・受けたオペレーターが出る。取消には理由の選択肢が付く', () => {
  const opts = { storeIds: ['S-NAMBA', 'S-SHINJUKU'], now: NOW };
  let list = V.reserveVisit([], { storeId: 'S-NAMBA', date: ymd(tomorrow), time: '14:00', name: '山田 花子', phone: '090-1', wants: '腕時計', by: '佐藤' }, opts).list;
  list = V.reserveVisit(list, { storeId: 'S-SHINJUKU', date: ymd(tomorrow), time: '10:30', name: '鈴木', phone: '090-2', by: '渡辺' }, opts).list;
  const html = storeTabHtml({ form: blankStoreForm('S-NAMBA', ymd(tomorrow)), stores: DEFAULT_STORES, upcoming: V.upcomingReservations(list, ymd(new Date(NOW))) });
  const t = text(html);
  assert.ok(/10:30 新宿店 鈴木 様/.test(t) && /14:00 なんば店 山田 花子 様/.test(t) && t.includes('受付: 佐藤') && t.includes('腕時計'), t);
  assert.ok(t.indexOf('10:30') < t.indexOf('14:00')); // 時刻順
  assert.equal((html.match(/data-st-cancel=/g) || []).length, 2);
  assert.ok(t.includes('お客様のご都合（やめる）') && t.includes('入力ミス・重複受付'));
});

test('過去のお客様: 電話番号が10桁以上で、買取の実績があれば、回数・総額・ランクが出る。なければ初めてのお客様', () => {
  assert.equal(pastCustomerHtml('090'), '');
  assert.match(text(pastCustomerHtml('090-2468-1357')), /過去のお客様 買取 3回・総額 ¥700,000/);
  assert.match(text(pastCustomerHtml('090-9999-9999')), /初めてのお客様/);
});

test('操作: 予約を受け付けると保存され、店舗の画面の予約に出る。必須の欠けは受け付けない。取消は理由つきで記録される', () => {
  const messages = [];
  const alerts = [];
  globalThis.alert = (m) => alerts.push(m);
  let rerenders = 0;
  const tab = createStoreTab({ operator: () => '佐藤', rerender: () => { rerenders += 1; }, flash: (m) => messages.push(m) });
  const set = (k, v) => tab.input({ target: { dataset: { st: k }, value: v } });
  assert.equal(set('foo', 'x'), true); // data-st の入力は扱う
  assert.equal(tab.input({ target: { dataset: {} } }), false); // 他の入力は扱わない
  tab.click({ stSave: '' });
  assert.deepEqual(alerts, ['お名前を入力してください']);
  set('name', '山田 花子'); set('phone', '090-1234-5678'); set('date', ymd(tomorrow)); set('time', '15:30'); set('wants', '腕時計');
  assert.equal(tab.click({ stSave: '' }), true);
  const saved = V.loadStoreVisits();
  assert.deepEqual([saved.length, saved[0].status, saved[0].time, saved[0].createdBy, saved[0].storeId], [1, 'reserved', '15:30', '佐藤', DEFAULT_STORES[0].id]);
  assert.match(messages[0], /山田 花子 様の来店予約を受け付けました（なんば店 15:30）/);
  assert.equal(rerenders, 1);
  assert.equal(tab.click({ stCancel: saved[0].id }, { parentElement: { querySelector: () => ({ value: 'お客様のご都合（やめる）' }) } }), true);
  const after = V.loadStoreVisits()[0];
  assert.deepEqual([after.status, after.cancelReason, after.cancelledBy], ['cancelled', 'お客様のご都合（やめる）', '佐藤']);
  assert.equal(tab.click({ other: '' }), false);
});
