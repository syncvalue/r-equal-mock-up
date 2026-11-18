import { staffColor } from '../src/staffColor.js';
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

test('日別: 鑑定士ごとの列。鑑定士の名前と、その日の訪問の帯。週に戻れる', () => {
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

test('日別: 受付の帯と、鑑定士の元からの予定の帯は、同じ鑑定士なら同じ色で出す。受付かどうかで色を変えない', () => {
  const cols = dayColumns({ areaId: 'osaka', date: '2026-10-30', reservations: [], now: NOW });
  const withPlan = cols.find((c) => c.blocks.length);
  assert.ok(withPlan);
  const h = calendarHtml({ ...base, mode: 'day', reservations: [] });
  assert.ok(h.includes(`data-caluser="${withPlan.user.id}"`) && h.includes(staffColor(withPlan.user.id).solid) && !h.includes('bg-slate-500'));
});

test('日別: 前日確認が済んだ帯は鑑定士の色で塗りつぶし、まだ（未連絡・不通）は点線。帯の中の状態の文字は「不通」だけ（連絡済み・未連絡は実線・点線だけで表す）。凡例も出す', () => {
  const cols = dayColumns({ areaId: 'osaka', date: '2026-10-30', reservations: [], now: NOW });
  const u = cols.find((c) => !c.absent && c.att.kind === 'present').user;
  const call = (result) => [{ result, memo: '', by: '佐藤', at: 1 }];
  const html = (confirmCalls) => calendarHtml({ ...base, mode: 'day', reservations: [rec({ userId: u.id, confirmCalls })] });
  const btn = (h) => h.match(/<button class="absolute[^>]*data-callopen="R1"[^>]*>[\s\S]*?<\/button>/)[0];
  const seen = (h) => btn(h).replace(/title="[^"]*"/g, '').replace(/<[^>]+>/g, ' '); // 画面に見える文字（吹き出しは除く）
  assert.ok(btn(html(call('reached'))).includes('border:2px solid') && !/連絡済み|不通|未連絡|[・△✔]/.test(seen(html(call('reached')))));
  assert.ok(btn(html(call('noanswer'))).includes('border:2px dashed') && /不通/.test(seen(html(call('noanswer')))) && !/連絡済み|未連絡|[・△✔]/.test(seen(html(call('noanswer')))));
  assert.ok(btn(html(undefined)).includes('border:2px dashed') && !/連絡済み|不通|未連絡|[・△✔]/.test(seen(html(undefined))));
  assert.ok(btn(html(undefined)).includes('前日確認：未連絡')); // 吹き出しには状態を残す
  assert.ok(btn(html(undefined)).includes(staffColor(u.id).solid)); // 鑑定士の色
  assert.ok(text(html(undefined)).includes('まだ（点線。未連絡・不通）'));
  assert.ok(calendarHtml({ ...base, mode: 'day', reservations: [rec({ confirmCalls: call('reached') })] }).includes('border-teal-400')); // 一覧の行は緑
});

test('週の表: 訪問の帯も、鑑定士の色。前日確認がまだなら点線', () => {
  const cols = dayColumns({ areaId: 'osaka', date: '2026-10-30', reservations: [], now: NOW });
  const u = cols.find((c) => !c.absent && c.att.kind === 'present').user;
  const h = (confirmCalls) => calendarHtml({ ...base, reservations: [rec({ userId: u.id, confirmCalls })] }).match(/<button class="absolute z-10[^>]*data-calblock="R1"[^>]*>/)[0];
  assert.ok(h(undefined).includes('border:2px dashed') && h(undefined).includes(staffColor(u.id).solid));
  assert.ok(h([{ result: 'reached', memo: '', by: '佐藤', at: 1 }]).includes('border:2px solid'));
});


test('週の表: 訪問は、開始から終了までの1つのブロック（お名前と、住所の先頭10文字）。時間に比例した位置と高さ', () => {
  const cols = dayColumns({ areaId: 'osaka', date: '2026-10-30', reservations: [], now: NOW });
  const u = cols.find((c) => !c.absent && c.att.kind === 'present' && !c.blocks.some((b) => b.start < 750 && b.end > 690)).user;
  const h = calendarHtml({ ...base, reservations: [rec({ userId: u.id, start: '11:30', end: '12:30', customer: { name: '山田 花子', address: '大阪府大阪市阿倍野区阿倍野筋1-2-3' } })] });
  const block = h.match(/<button class="absolute z-10[^>]*>(?:(?!<\/button>)[\s\S])*?山田 花子[\s\S]*?<\/button>/)[0];
  assert.ok(block.includes('<b class="block truncate">山田 花子</b>') && block.includes('大阪府大阪市阿倍野区</span>'));
  assert.ok(!text(block).includes('阿倍野区阿')); // 先頭10文字まで（吹き出しには全文）
  assert.ok(block.includes('top:180px;height:71px')); // 11:30は、9:00から5枠め（36px×5）。1時間＝2枠（72px−1）
  assert.ok(block.includes('data-calblock="R1"') && !block.includes('data-calday')); // ブロックは、日別には切り替えず、詳細を開く
});

test('週の表: 同じ時間にかぶる訪問は、日の列の中で横に並べる（幅を分け合う）', () => {
  const cols = dayColumns({ areaId: 'osaka', date: '2026-10-30', reservations: [], now: NOW });
  const free = cols.filter((c) => !c.absent && c.att.kind === 'present' && !c.blocks.some((b) => b.start < 750 && b.end > 690)).slice(0, 2);
  assert.equal(free.length, 2);
  const list = [rec({ id: 'A', userId: free[0].user.id, start: '11:30', end: '12:30', customer: { name: '甲野 太郎', address: '大阪府A' } }), rec({ id: 'B', userId: free[1].user.id, start: '11:30', end: '12:30', customer: { name: '乙川 次郎', address: '大阪府B' } })];
  const h = calendarHtml({ ...base, reservations: list, staffSel: free.map((c) => c.user.id) }); // 2人だけに絞って、ほかの人の予定とかぶらないようにする
  const style = (name) => h.match(new RegExp(`style="([^"]*)" data-calblock="[^"]*" data-caluser="[^"]*" data-caldate="[^"]*" title="[^"]*"><b class="block truncate">${name}`))[1];
  assert.ok(style('甲野 太郎').includes('left:calc(0% + 1px);width:calc(50% - 2px)'));
  assert.ok(style('乙川 次郎').includes('left:calc(50% + 1px);width:calc(50% - 2px)'));
});

test('鑑定士で絞り込む: ボタン・鑑定士の選択肢・絞り込み中の表示。選んだ鑑定士の訪問だけが残る（週・日別とも）', () => {
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


test('週の表: 日表示に切り替えるのは、見出しの日付だけ。枠やブロックを押しても切り替わらない', () => {
  const h = calendarHtml({ ...base, reservations: [rec()] });
  const heads = h.match(/data-calday="[^"]*"/g) || [];
  assert.equal(heads.length, 7); // 見出しの日付7つだけ
  assert.ok(h.includes('data-calblock="R1"'));
});

test('週の表: 訪問を押すと、右側に詳細（日時・住所・電話・担当鑑定士・ヒアリング）と、前日確認の記録が出る', () => {
  const cols = dayColumns({ areaId: 'osaka', date: '2026-10-30', reservations: [], now: NOW });
  const u = cols.find((c) => !c.absent && c.att.kind === 'present').user;
  const r = rec({ userId: u.id, receptionNo: 'CC-777', customer: { name: '山田 花子', phone: '090-1111-2222', phone2: '06-1234-5678', address: '大阪府大阪市阿倍野区阿倍野筋1-2-3' }, hearing: { contact: '17:00〜19:00', wants: '時計・指輪', parking: 'なし', nameplate: 'あり', notes: '駐車場なし' }, confirmCalls: [{ result: 'noanswer', memo: '留守電に入れた', by: '佐藤', at: 1 }] });
  const none = calendarHtml({ ...base, reservations: [r] });
  assert.ok(!none.includes('data-callsave') && !none.includes('data-calblockclose'));
  const h = calendarHtml({ ...base, calSel: 'R1', reservations: [r] });
  const t = text(h);
  for (const s of ['山田 花子 様', '10/30（金） 10:30〜12:00', '大阪府大阪市阿倍野区阿倍野筋1-2-3', '090-1111-2222 ／ 06-1234-5678', u.name, 'CC-777', '時計・指輪', '17:00〜19:00', '駐車場なし', '不通 1回', '留守電に入れた']) assert.ok(t.includes(s), s);
  for (const k of ['data-calblockclose', 'data-callsave="R1"', 'data-callmemo', 'data-chg="R1"', 'data-calday="2026-10-30"']) assert.ok(h.includes(k), k);
  assert.ok(h.includes('ring-amber-300')); // 選んだブロックの印
  assert.ok(!h.includes('class="b b-sec !min-h-0 !py-1" data-calweek')); // 週の表のまま（日別に切り替えない）
});

test('週の表: 鑑定士の元からの予定を押すと、詳細は出るが、前日確認の記録はない', () => {
  const cols = dayColumns({ areaId: 'osaka', date: '2026-10-30', reservations: [], now: NOW });
  const c = cols.find((x) => x.blocks.length);
  const b = c.blocks[0];
  const key = b.rid ?? b.gid;
  assert.ok(key);
  const h = calendarHtml({ ...base, calSel: key, weekStart: '2026-10-30', reservations: [] });
  assert.ok(text(h).includes('この予定には、受付の記録がありません') && !h.includes('data-callsave'));
});

test('詳細: 「この日だけを、鑑定士ごとに見る」は出さない。「受付を変更・取消する」は、前日確認の記録より上にある', () => {
  const h = calendarHtml({ ...base, calSel: 'R1', reservations: [rec()] });
  assert.ok(!text(h).includes('この日だけを、鑑定士ごとに見る') && !h.includes('>この日だけを'));
  assert.ok(h.indexOf('data-chg="R1"') > 0 && h.indexOf('data-chg="R1"') < h.indexOf('data-callsave="R1"'));
  assert.equal((h.match(/data-chg="R1"/g) || []).length, 1);
});

test('鑑定士の元からの予定の帯（受付の記録がないもの）も、押せる。押した人と日付を持つ（取り込みのため）', () => {
  const wk = calendarHtml({ ...base, reservations: [] });
  assert.ok(/data-calblock="[^"]+" data-caluser="u\d+" data-caldate="2026-1\d-\d\d"/.test(wk));
  const day = calendarHtml({ ...base, mode: 'day', reservations: [] });
  assert.ok(/<button[^>]*data-calblock="[^"]+" data-caluser="u\d+" data-caldate="2026-10-30"/.test(day));
});

test('詳細は、週の表の右も、日別の右の一覧も、登録内容をすべて出す。日別は、選んだ訪問の詳細にアンカー（data-calrow）が付く', () => {
  const full = rec({ receptionNo: 'CC-9', receivedAt: '2026/10/28 10:00', operator: '佐藤', apType: '再',
    customer: { name: '山田 花子', kana: 'ヤマダ ハナコ', phone: '090-1111-2222', phone2: '06-0000-0000', zip: '545-0000', address: '大阪府大阪市阿倍野区1-2-3' },
    hearing: { profile: '女性・60代', trigger: 'チラシ（A123）', wants: '時計', large: '桐ダンス', attendee: 'ご本人', companion: 'なし', parking: 'あり', nameplate: 'あり', contact: '17:00〜19:00', notes: '犬がいる' } });
  const keys = ['ヤマダ ハナコ', '545-0000', '06-0000-0000', '女性・60代', '2026/10/28 10:00', '佐藤', '再訪', 'チラシ（A123）', '桐ダンス', 'ご本人', 'なし', 'あり', '17:00〜19:00', '犬がいる', 'CC-9'];
  for (const mode of ['week', 'day']) {
    const h = calendarHtml({ ...base, mode, calSel: 'R1', reservations: [full] });
    const t = text(h);
    for (const k of keys) assert.ok(t.includes(k), `${mode}: ${k}`);
  }
  assert.ok(calendarHtml({ ...base, mode: 'day', calSel: 'R1', reservations: [full] }).includes('data-calrow="R1"'));
  assert.ok(!calendarHtml({ ...base, mode: 'day', calSel: null, reservations: [full] }).includes('data-calrow'));
});

test('日別の一覧: 閉じている行は「▼ 開く」、開いた行は「▲ 閉じる」で、開閉だと分かる。週の右の詳細は✕', () => {
  const day = (calSel) => calendarHtml({ ...base, mode: 'day', calSel, reservations: [rec()] });
  assert.ok(text(day(null)).includes('▼ 開く'));
  assert.ok(text(day('R1')).includes('▲ 閉じる') && !text(day('R1')).includes('✕'));
  assert.ok(text(calendarHtml({ ...base, calSel: 'R1', reservations: [rec()] })).includes('✕'));
});

test('日別の一覧: 前日確認がまだだけに絞れる。連絡時間の早い順に並べ替えられる', () => {
  const done = [{ result: 'reached', memo: '', by: 'x', at: 1 }];
  const list = [rec({ id: 'A', customer: { name: '夕方 一郎', address: 'a' }, hearing: { contact: '17:00〜19:00' } }), rec({ id: 'B', customer: { name: '済み 二郎', address: 'b' }, hearing: { contact: '09:00〜10:00' }, confirmCalls: done }), rec({ id: 'C', customer: { name: '朝 三郎', address: 'c' }, hearing: { contact: '09:00〜11:00' } })];
  const day = (o) => { const t = text(calendarHtml({ ...base, mode: 'day', reservations: list, ...o })); return t.slice(t.indexOf('の受付 ')); }; // 右の一覧の部分だけ（左の表の帯にも名前が出る）
  const t = day({});
  assert.ok(t.includes('前日確認がまだだけ（2件）') && t.includes('済み 二郎'));
  assert.ok(!day({ pendOnly: true }).includes('済み 二郎') && day({ pendOnly: true }).includes('朝 三郎'));
  const order = (t2) => ['夕方 一郎', '朝 三郎'].map((n) => t2.indexOf(n));
  assert.ok(order(day({ sortBy: 'visit' }))[0] < order(day({ sortBy: 'visit' }))[1]); // 同じ訪問時刻なら、受付の並びのまま
  assert.ok(order(day({ sortBy: 'contact' }))[1] < order(day({ sortBy: 'contact' }))[0]);
  assert.ok(day({ pendOnly: true, reservations: [list[1]] }).includes('すべて連絡済み'));
});

test('並び順は、ボタン1つ。押すたびに「訪問時刻順」⇄「希望連絡時間帯順」で、文言と背景（on）が変わる', () => {
  const h = (sortBy) => calendarHtml({ ...base, mode: 'day', reservations: [rec()], sortBy });
  assert.equal((h('visit').match(/data-calsort/g) || []).length, 1);
  assert.ok(/class="chip "[^>]*data-calsort="contact"[^>]*>並び順：訪問時刻順/.test(h('visit')));
  assert.ok(/class="chip on"[^>]*data-calsort="visit"[^>]*>並び順：希望連絡時間帯順/.test(h('contact')));
});

test('希望連絡時間帯順のときは、行の先頭に「📞 連絡 ○○」を出し、訪問の時刻は「訪問 ○○」と分けて出す（混同しない）', () => {
  const list = [rec({ hearing: { contact: '17:00〜19:00' } })];
  const t = (sortBy) => { const x = text(calendarHtml({ ...base, mode: 'day', reservations: list, sortBy })); return x.slice(x.indexOf('の受付 ')); };
  assert.ok(t('contact').includes('📞 連絡 17:00〜19:00') && t('contact').includes('訪問 10:30〜12:00'));
  assert.ok(!t('visit').includes('📞 連絡') && t('visit').includes('前日確認の連絡時間 17:00〜19:00'));
});

test('枠に「不通」と出すのは、不通の訪問だけ（日別・週の表とも）。未連絡と不通は、線ではどちらも点線', () => {
  const no = [{ result: 'noanswer', memo: '', by: '佐藤', at: 1 }];
  const cols = dayColumns({ areaId: 'osaka', date: '2026-10-30', reservations: [], now: NOW });
  const u = cols.find((c) => !c.absent && c.att.kind === 'present').user;
  for (const mode of ['day', 'week']) {
    const blk = (confirmCalls) => { const h = calendarHtml({ ...base, mode, reservations: [rec({ userId: u.id, confirmCalls })] }); return h.match(/<button class="absolute[^>]*(?:data-callopen|data-calblock)="R1"[^>]*>[\s\S]*?<\/button>/)[0]; };
    assert.ok(blk(no).includes('>不通</span>') && blk(no).includes('dashed'), mode);
    assert.ok(!blk(undefined).includes('>不通</span>') && blk(undefined).includes('dashed'), mode);
    assert.ok(!blk([{ result: 'reached', memo: '', by: 'x', at: 1 }]).includes('>不通</span>'), mode);
  }
});

test('「不通のまま終了する」は、不通の記録があるときだけ出る。終えたあとは、終了の表示になる', () => {
  const no = [{ result: 'noanswer', memo: '', by: '佐藤', at: new Date(2026, 9, 29, 9, 0).getTime() }];
  const h = (r) => calendarHtml({ ...base, mode: 'day', calSel: 'R1', reservations: [rec(r)] });
  assert.ok(h({ confirmCalls: no }).includes('data-callclose="R1"'));
  assert.ok(!h({}).includes('data-callclose'));
  assert.ok(!h({ confirmCalls: [{ result: 'reached', memo: '', by: 'x', at: 1 }] }).includes('data-callclose'));
  const closed = h({ confirmCalls: no, confirmClosed: { by: '佐藤', at: new Date(2026, 9, 29, 10, 0).getTime() } });
  assert.ok(!closed.includes('data-callclose') && text(closed).includes('不通のまま終了（佐藤'));
});

test('不通のまま終了した訪問は、実線（終わった）で、「不通」の文字は残る。終了前の不通は点線', () => {
  const no = [{ result: 'noanswer', memo: '', by: '佐藤', at: 1 }];
  const cols = dayColumns({ areaId: 'osaka', date: '2026-10-30', reservations: [], now: NOW });
  const u = cols.find((c) => !c.absent && c.att.kind === 'present').user;
  for (const mode of ['day', 'week']) {
    const blk = (o) => calendarHtml({ ...base, mode, reservations: [rec({ userId: u.id, confirmCalls: no, ...o })] }).match(/<button class="absolute[^>]*(?:data-callopen|data-calblock)="R1"[^>]*>[\s\S]*?<\/button>/)[0];
    const closed = blk({ confirmClosed: { by: '佐藤', at: 2 } });
    assert.ok(closed.includes('border:2px solid') && !closed.includes('dashed') && closed.includes('>不通</span>'), mode);
    assert.ok(blk({}).includes('dashed'), mode);
  }
});

test('休みの表示: 出勤する時間の外（前・後ろ）を「休み」の斜線で塗る。午後出社などの名前は出さない。休み・終日出勤は塗らない', async () => {
  const { attShade } = await import('../callcenter/view.js');
  const bands = (att) => (attShade(att, 28).match(/休み/g) || []).length;
  assert.equal(bands({ kind: 'partial', from: 17 * 60, to: 19 * 60 }), 1); // 夕方から
  assert.equal(bands({ kind: 'partial', from: 9 * 60, to: 15 * 60 }), 1); // 15時まで
  assert.equal(bands({ kind: 'partial', from: 12 * 60, to: 16 * 60 }), 2); // 前と後ろ
  assert.equal(bands({ kind: 'present', from: 540, to: 1140 }) + bands({ kind: 'absent', from: 1140, to: 540 }), 0);
  const html = calendarHtml({ ...base, mode: 'day', reservations: [] });
  assert.ok(!/午後出社|午後半休|午前休/.test(html));
});

test('「休み」の札と斜線は、終日も一部の時間も、同じ大きさ・同じ模様', async () => {
  const { attShade } = await import('../callcenter/view.js');
  const part = attShade({ kind: 'partial', from: 17 * 60, to: 19 * 60 }, 28);
  const badge = part.match(/<span class="([^"]*)">休み/)[1];
  const stripe = part.match(/background-image:([^"]*)"/)[1];
  const all = ['callcenter/view.js', 'callcenter/dispatcherView.js', 'callcenter/calendarView.js'];
  const { readFileSync } = await import('node:fs');
  for (const f of all) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    for (const m of src.matchAll(/<span class="([^"]*)">休み/g)) assert.equal(m[1], badge, f);
    assert.ok(!src.includes('#e2e8f0 0,#e2e8f0 6px'), f); // 古い（別の）斜線は使わない
  }
  assert.ok(stripe.includes('rgba(148,163,184,.45)'));
});

test('休みの鑑定士の、名前の下は「0件」（「休み」は、列の札だけ。近くに2か所書かない）', () => {
  const cols = dayColumns({ areaId: 'osaka', date: '2026-10-30', reservations: [], now: NOW });
  const off = cols.find((c) => c.absent);
  if (!off) return; // その日、休みの人がいなければ対象なし
  const h = calendarHtml({ ...base, mode: 'day', reservations: [] });
  const head = h.slice(h.indexOf(`>${off.user.name}</b>`), h.indexOf(`>${off.user.name}</b>`) + 120);
  assert.ok(head.includes('0件') && !head.includes('休み'));
});
