import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendarHtml } from '../callcenter/calendarView.js';
import { dayColumns } from '../src/visitCalendar.js';

const NOW = new Date(2026, 9, 29, 9, 0);
const rec = (o = {}) => ({
  id: 'R1', receptionNo: 'CC-1', date: '2026-10-30', start: '10:30', end: '12:00', status: 'confirmed', userId: 'u01', areaId: 'osaka',
  customer: { name: '山田 花子', phone: '090-1111-2222', address: '大阪府大阪市阿倍野区1-2-3' }, hearing: { contact: '17:00〜19:00', wants: '時計' }, ...o,
});
const base = { areaId: 'osaka', mode: 'week', weekStart: '2026-10-29', date: '2026-10-30', today: '2026-10-29', calSel: null, draft: { result: 'reached', memo: '' }, now: NOW };
const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('週の表: エリアの切り替え・縦に時間・横に7日。セルは濃さで色分けし、日付を押すとその日になる', () => {
  const h = calendarHtml({ ...base, reservations: [] });
  for (const a of ['osaka', 'hyogo', 'kanto', 'tokai']) assert.ok(h.includes(`data-calarea="${a}"`), a);
  for (const d of ['2026-10-29', '2026-10-30', '2026-11-04']) assert.ok(h.includes(`data-calday="${d}"`), d);
  assert.equal((h.match(/height:35px;background:rgba\(13,148,136,/g) || []).length, 7 * 20); // 7日 × 20枠の背景（濃さ）
  assert.ok(h.includes('data-calshift="-7"') && h.includes('data-calshift="7"') && h.includes('data-caltoday'));
  assert.match(h, /rgba\(13,148,136,/);
  assert.ok(text(h).includes('濃い（埋まっている）') && text(h).includes('09:00'));
});

test('週の表: 明日の訪問で前日確認が未の件数を、日付の下に出す（そのエリアだけ）', () => {
  const list = [rec(), rec({ id: 'R2' }), rec({ id: 'R3', areaId: 'kanto' }), rec({ id: 'R4', confirmCalls: [{ result: 'reached', memo: '', by: 'x', at: 1 }] })];
  assert.ok(text(calendarHtml({ ...base, reservations: list })).includes('前日確認 未2'));
});

test('日別: 営業ごとの列。営業の名前と、その日の訪問の帯。週に戻れる', () => {
  const cols = dayColumns({ areaId: 'osaka', date: '2026-10-30', reservations: [], now: NOW });
  const u = cols.find((c) => !c.absent && c.att.kind === 'present').user;
  const h = calendarHtml({ ...base, mode: 'day', reservations: [rec({ userId: u.id })] });
  for (const c of cols) assert.ok(h.includes(c.user.name), c.user.name);
  assert.ok(h.includes('data-calweek') && h.includes('data-calshift="-1"'));
  assert.ok(h.includes(`data-callopen="R1"`));
});

test('日別の右の一覧: 時刻・お客様・住所・前日確認の連絡時間と状態。取消と、別エリアは出さない', () => {
  const list = [rec(), rec({ id: 'X', status: 'cancelled' }), rec({ id: 'K', areaId: 'kanto', userId: 'u99', customer: { name: '別エリア 様', address: '東京' } })];
  const t = text(calendarHtml({ ...base, mode: 'day', reservations: list }));
  for (const s of ['10:30', '山田 花子', '大阪府大阪市阿倍野区1-2-3', '17:00〜19:00', '未連絡', '今日、前日確認の連絡をする日']) assert.ok(t.includes(s), s);
  assert.ok(!t.includes('別エリア'));
  assert.ok(text(calendarHtml({ ...base, mode: 'day', date: '2026-10-31', reservations: [] })).includes('この日の受付した訪問はありません'));
});

test('訪問を選ぶと、連絡の記録の入力と、これまでの連絡の履歴が出る', () => {
  const calls = [{ result: 'noanswer', memo: '留守電に入れた', by: '佐藤', at: new Date(2026, 9, 29, 9, 0).getTime() }];
  const h = calendarHtml({ ...base, mode: 'day', calSel: 'R1', draft: { result: 'noanswer', memo: '' }, reservations: [rec({ confirmCalls: calls })] });
  for (const k of ['data-callresult="reached"', 'data-callresult="noanswer"', 'data-callmemo', 'data-callsave="R1"', 'data-chg="R1"']) assert.ok(h.includes(k), k);
  const t = text(h);
  assert.ok(t.includes('不通 1回') && t.includes('留守電に入れた') && t.includes('佐藤'));
});

test('メモの文字は、HTMLとして解釈しない', () => {
  const h = calendarHtml({ ...base, mode: 'day', calSel: 'R1', reservations: [rec({ confirmCalls: [{ result: 'reached', memo: '<b>x</b>', by: '佐藤', at: 1 }] })] });
  assert.ok(!h.includes('<b>x</b>') && h.includes('&lt;b&gt;x&lt;/b&gt;'));
});

test('日別: 受付の帯と、営業の元からの予定の帯は、同じ色（確定の濃い青）で出す。色で区別しない', () => {
  const cols = dayColumns({ areaId: 'osaka', date: '2026-10-30', reservations: [], now: NOW });
  const withPlan = cols.find((c) => c.blocks.length);
  assert.ok(withPlan);
  const h = calendarHtml({ ...base, mode: 'day', reservations: [] });
  assert.ok(h.includes('bg-indigo-700') && !h.includes('bg-slate-500'));
});

test('日別: 前日確認が連絡済みの帯は緑、不通は橙、未連絡は訪問の色のまま。印の文字と、凡例も出す', () => {
  const cols = dayColumns({ areaId: 'osaka', date: '2026-10-30', reservations: [], now: NOW });
  const u = cols.find((c) => !c.absent && c.att.kind === 'present').user;
  const call = (result) => [{ result, memo: '', by: '佐藤', at: 1 }];
  const html = (confirmCalls) => calendarHtml({ ...base, mode: 'day', reservations: [rec({ userId: u.id, confirmCalls })] });
  const btn = (h) => h.match(/<button class="absolute[^>]*data-callopen="R1"[^>]*>[\s\S]*?<\/button>/)[0];
  assert.ok(btn(html(call('reached'))).includes('bg-emerald-600') && btn(html(call('reached'))).includes('✔連絡済み'));
  assert.ok(btn(html(call('noanswer'))).includes('bg-amber-500') && btn(html(call('noanswer'))).includes('△不通'));
  assert.ok(btn(html(undefined)).includes('bg-indigo-700') && btn(html(undefined)).includes('・未連絡'));
  assert.ok(text(html(undefined)).includes('前日確認： 連絡済み'));
  assert.ok(calendarHtml({ ...base, mode: 'day', reservations: [rec({ confirmCalls: call('reached') })] }).includes('border-emerald-400')); // 一覧の行も緑
});


test('週の表: 訪問は、開始から終了までの1つのブロック（お名前と、住所の先頭10文字）。時間に比例した位置と高さ', () => {
  const cols = dayColumns({ areaId: 'osaka', date: '2026-10-30', reservations: [], now: NOW });
  const u = cols.find((c) => !c.absent && c.att.kind === 'present' && !c.blocks.some((b) => b.start < 750 && b.end > 690)).user;
  const h = calendarHtml({ ...base, reservations: [rec({ userId: u.id, start: '11:30', end: '12:30', customer: { name: '山田 花子', address: '大阪府大阪市阿倍野区阿倍野筋1-2-3' } })] });
  const block = h.match(/<button class="absolute z-10[^>]*>(?:(?!<\/button>)[\s\S])*?山田 花子[\s\S]*?<\/button>/)[0];
  assert.ok(block.includes('<b class="block truncate">山田 花子</b>') && block.includes('大阪府大阪市阿倍野区</span>'));
  assert.ok(!text(block).includes('阿倍野区阿')); // 先頭10文字まで（吹き出しには全文）
  assert.ok(block.includes('top:180px;height:71px')); // 11:30は、9:00から5枠め（36px×5）。1時間＝2枠（72px−1）
  assert.ok(block.includes('data-calday="2026-10-30"'));
  assert.ok(text(h).includes('同じ時間にかぶる訪問は、横に並びます'));
});

test('週の表: 同じ時間にかぶる訪問は、日の列の中で横に並べる（幅を分け合う）', () => {
  const cols = dayColumns({ areaId: 'osaka', date: '2026-10-30', reservations: [], now: NOW });
  const free = cols.filter((c) => !c.absent && c.att.kind === 'present' && !c.blocks.some((b) => b.start < 750 && b.end > 690)).slice(0, 2);
  assert.equal(free.length, 2);
  const list = [rec({ id: 'A', userId: free[0].user.id, start: '11:30', end: '12:30', customer: { name: '甲野 太郎', address: '大阪府A' } }), rec({ id: 'B', userId: free[1].user.id, start: '11:30', end: '12:30', customer: { name: '乙川 次郎', address: '大阪府B' } })];
  const h = calendarHtml({ ...base, reservations: list, staffSel: free.map((c) => c.user.id) }); // 2人だけに絞って、ほかの人の予定とかぶらないようにする
  const style = (name) => h.match(new RegExp(`style="([^"]*)" data-calday="2026-10-30" title="[^"]*"><b class="block truncate">${name}`))[1];
  assert.ok(style('甲野 太郎').includes('left:calc(0% + 1px);width:calc(50% - 2px)'));
  assert.ok(style('乙川 次郎').includes('left:calc(50% + 1px);width:calc(50% - 2px)'));
});

test('営業で絞り込む: ボタン・営業の選択肢・絞り込み中の表示。選んだ営業の訪問だけが残る（週・日別とも）', () => {
  const cols = dayColumns({ areaId: 'osaka', date: '2026-10-30', reservations: [], now: NOW });
  const [a, b] = cols.filter((c) => !c.absent && c.att.kind === 'present').map((c) => c.user);
  const list = [rec({ id: 'A', userId: a.id, customer: { name: '甲野 太郎', address: '大阪府A' } }), rec({ id: 'B', userId: b.id, customer: { name: '乙川 次郎', address: '大阪府B' } })];
  assert.ok(calendarHtml({ ...base, reservations: list }).includes('data-calstaffpanel'));
  const open = calendarHtml({ ...base, reservations: list, staffOpen: true });
  assert.ok(open.includes(`data-calstaff="${a.id}"`) && open.includes(`data-calstaff="${b.id}"`));
  const week = calendarHtml({ ...base, reservations: list, staffSel: [a.id] });
  assert.ok(week.includes('甲野 太郎') && !week.includes('乙川 次郎'));
  assert.ok(text(week).includes('絞り込み中（1名）') && week.includes('data-calstaffclear'));
  const day = calendarHtml({ ...base, mode: 'day', reservations: list, staffSel: [a.id] });
  assert.ok(day.includes('甲野 太郎') && !day.includes('乙川 次郎') && !day.includes(`>${b.name}<`));
});
