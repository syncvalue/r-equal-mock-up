import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const { buildSample } = await import('../src/warehouseSample.js');
const W = await import('../src/warehouse.js');
const { DEFAULT_MASTER: MASTER } = await import('../src/warehouseMaster.js');
const { returnTab } = await import('../warehouse/returnTab.js');
const { cooloffPage, resultsHtml, formHtml, progressHtml, filtersHtml, zoomHtml } = await import('../callcenter/cooloffView.js');

const NOW = new Date(2026, 9, 25, 15, 0).getTime();
const sample = buildSample(NOW);
const own = (id) => W.scopeState(sample, id, MASTER);
const WHS = ['W-OSAKA', 'W-KANTO', 'W-FUKUOKA', 'W-HONSHA'];
const html = (id, rt = {}) => returnTab(own(id), { rt: { q: '', filter: 'all', open: '', draft: {}, ...rt } }, NOW, { full: sample, master: MASTER });
const detail = (r) => html(r.warehouseId ?? 'W-OSAKA', { open: r.id });

test('倉庫のクーリングオフ画面: 一覧（検索・状態の絞り込み・未対応の目印）。詳細は、依頼を開いたときだけ出る。受付の入力欄はない', () => {
  const all = WHS.map((id) => html(id)).join('');
  for (const k of ['data-ret-q', 'data-ret-filter="todo"', 'data-ret-filter="open"', 'data-ret-filter="closed"', 'data-ret-filter="all"', 'data-ret-open=', '未対応', '対応不可', '完了']) assert.ok(all.includes(k), k);
  assert.ok(!all.includes('data-ret-send') && !all.includes('data-inq-ok')); // 詳細を開くまでは、操作は出ない
  assert.ok(all.includes('佐藤')); // 受電したオペレーター
  assert.ok(!all.includes('data-return-add') && !all.includes('返品を受け付ける'));
  assert.ok(/<img [^>]*src="data:image/.test(all)); // 商品の写真
  const mine = sample.returns.filter((r) => r.status === 'inquiring');
  assert.ok(html(mine[0].warehouseId).includes('回答待ち')); // 未対応の理由
});

test('倉庫のクーリングオフ画面: 一覧は、キーワードと状態で絞れて、条件に合うものがなければ案内が出る', () => {
  const r = sample.returns.find((x) => x.status === 'inquiring');
  const wh = r.warehouseId;
  assert.ok(html(wh, { q: r.customerName.replace(' ', '') }).includes(r.customerName));
  const none = html(wh, { q: '該当しないキーワード' });
  assert.ok(none.includes('該当する依頼はありません') && !none.includes(`data-ret-open="${r.id}"`));
  assert.ok(!html(wh, { filter: 'closed' }).includes(`data-ret-open="${r.id}"`)); // 未完了は、完了の一覧に出ない
  assert.ok(html(wh, { filter: 'todo' }).includes(`data-ret-open="${r.id}"`));
});

test('倉庫のクーリングオフ画面: 詳細（モーダル）に、やり取りが時系列のチャットで並び、メッセージ送信と、回答・返送・完了の操作がある', () => {
  const asked = sample.returns.find((x) => x.status === 'inquiring');
  const d = detail(asked);
  for (const k of ['role="dialog"', 'data-ret-close', 'id="ret-chat"', 'data-ret-msg="' + asked.id, 'data-ret-send="' + asked.id, 'data-inq-ok="' + asked.id, 'data-inq-ng="' + asked.id, '依頼です']) assert.ok(d.includes(k), k);
  const shipped = sample.returns.find((x) => x.status === 'shipped');
  const ds = detail(shipped);
  assert.ok(ds.includes('data-return-done="' + shipped.id) && ds.includes(shipped.tracking) && ds.includes('返送しました'));
  const requested = sample.returns.find((x) => x.status === 'requested');
  assert.ok(detail(requested).includes('data-ship="' + requested.id));
  const sold = sample.returns.find((x) => x.status === 'unavailable' && x.unavailable.reason === 'sold');
  const dso = html('W-OSAKA', { open: sold.id }) + html('W-FUKUOKA', { open: sold.id }) + html('W-KANTO', { open: sold.id }) + html('W-HONSHA', { open: sold.id });
  assert.ok(dso.includes('売却済み') && dso.includes('data-ret-send=')); // 対応不可でも、やり取りは続けられる
  assert.equal(html('W-OSAKA', { open: 'NONE' }).includes('role="dialog"'), false);
  // 吹き出しは、コールセンター・倉庫・システムで見分けられる
  const withMsg = W.addReturnMessage({ ...sample }, asked.id, { side: 'warehouse', text: '確認します', by: '藤田', at: NOW });
  const chat = returnTab(W.scopeState(withMsg, asked.warehouseId, MASTER), { rt: { q: '', filter: 'all', open: asked.id, draft: { [asked.id]: '下書き' } } }, NOW, { full: withMsg, master: MASTER });
  assert.ok(!d.includes('data-inq-note') && (d.match(/<input class="inp[^>]*data-ret-msg/g) ?? []).length === 1); // 入力欄は1つ（回答のメモも、ここに書く）
  assert.ok(chat.includes('data-side="callcenter"') && chat.includes('data-side="warehouse"') && chat.includes('確認します') && chat.includes('下書き'));
});

test('コールセンターのクーリングオフ: 商品を探した結果に、状態の目印と選択欄が出る。売却済み・依頼中は選べない', () => {
  const contracts = W.cooloffContracts(sample, '松本', NOW);
  const r = resultsHtml(contracts, { ...EMPTY, q: '松本' }, { visitId: '', codes: [] });
  assert.ok(r.includes('松本 千春') && r.includes('data-co-code') && r.includes('すでに依頼中'));
  assert.ok(r.includes('disabled')); // 依頼中の商品は選べない
  const free = W.cooloffContracts(sample, '加藤', NOW);
  assert.ok(resultsHtml(free, { ...EMPTY, q: '加藤' }, { visitId: '', codes: [] }).includes('在庫・期間内'));
  assert.ok(resultsHtml([], { ...EMPTY, q: 'zzz' }, { visitId: '', codes: [] }).includes('該当する商品がありません'));
  assert.ok(resultsHtml([], EMPTY, { visitId: '', codes: [] }).includes('探します'));
});

test('コールセンターのクーリングオフ: 選んだ商品の案内（倉庫に問い合わせ／対応不可）と、作成ボタン', () => {
  const contracts = W.cooloffContracts(sample, '加藤', NOW);
  const c = contracts[0];
  const form = { phone: '090-0000-0000', reason: 'family', memo: '' };
  const none = formHtml(contracts, { visitId: '', codes: [] }, form);
  assert.ok(none.includes('data-co-create') && /data-co-create\s+disabled/.test(none));
  const sel = formHtml(contracts, { visitId: c.visitId, codes: [c.rows[0].unit.code] }, form);
  assert.ok(sel.includes('90-0000-0000') && !/data-co-create\s+disabled/.test(sel) && sel.includes('倉庫に問い合わせて'));
  const soldContract = W.cooloffContracts(sample, sample.units[0].customerName, NOW).find((x) => x.rows.some((r) => r.check.kind === 'sold'));
  const soldRow = soldContract.rows.find((r) => r.check.kind === 'sold');
  assert.ok(formHtml([soldContract], { visitId: soldContract.visitId, codes: [soldRow.unit.code] }, form).includes('対応不可として記録'));
});

test('コールセンターのクーリングオフ: 進捗一覧に、対応中の段階（受電 → 倉庫の回答 → 返送 → 代金の返還）と、完了・対応不可が出る', () => {
  const p = progressHtml(sample.returns, sample.units);
  for (const k of ['対応中', '完了・対応不可', '倉庫の回答', '代金の返還', '倉庫に問い合わせ中', '返送済み・代金の返還待ち', '完了', '対応不可', '売却済みのため']) assert.ok(p.includes(k), k);
  assert.ok(!p.includes('data-ship') && !p.includes('data-inq-ok') && !p.includes('data-return-done')); // オペレーターは、回答・返送・完了の操作はできない
  const page = cooloffPage({ q: '山田', filtersInner: 'FL', resultsInner: 'R', formInner: 'F', progressInner: 'P' });
  for (const k of ['data-co-q', 'id="co-filters"', 'id="co-zoom"', 'id="co-results"', 'id="co-form"', 'id="co-progress"', 'value="山田"']) assert.ok(page.includes(k), k);
});

test('お客様の入力は無害化する（検索語・メモ・名前に含まれる記号）', () => {
  const evil = '<img src=x onerror=alert(1)>';
  assert.ok(!cooloffPage({ q: evil, filtersInner: '', resultsInner: '', formInner: '', progressInner: '' }).includes(evil));
  const form = formHtml([], { visitId: '', codes: [] }, { phone: evil, reason: 'family', memo: evil });
  assert.ok(!form.includes(evil));
  const p = progressHtml([{ id: 'R', customerName: evil, codes: [], reason: 'family', memo: evil, status: 'inquiring', requestedAt: NOW, phone: evil, refund: 0, inquiry: { askedAt: NOW } }], []);
  assert.ok(!p.includes(evil));
});

const EMPTY = { q: '', dates: [], category: '' };

test('コールセンターのクーリングオフ: 検索結果に商品の写真（拡大できる）・買取日（曜日つき）・お客様名・金額が並ぶ。写真がなくてもダミーが出る', () => {
  const contracts = W.cooloffContracts(sample, '加藤', NOW);
  const r = resultsHtml(contracts, { ...EMPTY, q: '加藤' }, { visitId: '', codes: [] });
  assert.ok(/<img [^>]*src="data:image\/svg\+xml/.test(r)); // 写真
  assert.ok(r.includes('data-co-zoom=') && r.includes('シャネル 長財布') && r.includes('加藤 彩 様') && /\d+\/\d+\(.\)/.test(r));
  assert.ok(r.includes('¥56,000'));
});

test('コールセンターのクーリングオフ: 手がかりで探す入力（買取日の一覧・カテゴリ）。条件がなければ案内、見つからなければ「買い取っていない可能性」を知らせる', () => {
  const days = W.purchaseDays(sample, NOW, 14);
  const f = filtersHtml({ days, categories: ['腕時計', 'ブランドバッグ'], criteria: { q: '', dates: [days[1].date], category: '腕時計' } });
  assert.ok(f.includes('data-co-day') && f.includes('data-co-cat') && f.includes('data-co-clear') && f.includes(days[1].label));
  assert.ok(new RegExp(`data-co-day="${days[1].date}"[^>]*aria-pressed="true"`).test(f)); // 選択中
  assert.ok(/data-co-cat="腕時計"[^>]*aria-pressed="true"/.test(f));
  assert.ok(resultsHtml([], EMPTY, { visitId: '', codes: [] }).includes('手がかり'));
  const none = resultsHtml([], { ...EMPTY, q: '山田' }, { visitId: '', codes: [] });
  assert.ok(none.includes('買い取っていない可能性') && none.includes('名前を外して'));
});

test('コールセンターのクーリングオフ: 写真を拡大して、お客様に商品を確認してもらう。進捗の一覧にも小さな写真が出る', () => {
  const c = W.cooloffContracts(sample, '加藤', NOW)[0];
  const z = zoomHtml(c, c.rows[0]);
  assert.ok(z.includes('data-co-zoomclose') && /<img [^>]*src="data:image/.test(z) && z.includes(c.rows[0].unit.name) && z.includes(c.rows[0].unit.code));
  assert.equal(zoomHtml(null, null), '');
  assert.ok(/<img [^>]*src="data:image/.test(progressHtml(sample.returns, sample.units)));
  assert.ok(/<img [^>]*src="data:image/.test(html('W-FUKUOKA') + html('W-KANTO') + html('W-OSAKA') + html('W-HONSHA'))); // 倉庫の画面にも（棚から探しやすい）
});

test('コールセンターのクーリングオフ: 契約の見出しに、買取時の電話番号を出す。依頼の電話番号は、空なら買取時の番号を使う案内', () => {
  const hit = W.cooloffContracts(sample, { q: '090-2468-1357' }, NOW);
  assert.ok(hit.length >= 1 && hit.every((c) => c.customerName === '山田 花子'));
  assert.ok(resultsHtml(hit, { ...EMPTY, q: '090-2468-1357' }, { visitId: '', codes: [] }).includes('090-2468-1357'));
  const c = hit[0];
  const f = formHtml(hit, { visitId: c.visitId, codes: [c.rows[0].unit.code] }, { phone: '', reason: 'family', memo: '' });
  assert.ok(f.includes('placeholder="090-2468-1357"') && f.includes('買取時の電話番号'));
  assert.ok(zoomHtml(c, c.rows[0]).includes('090-2468-1357'));
});

const { FILTERS, stockTab } = await import('../warehouse/stockTab.js');
const { receiveTab } = await import('../warehouse/receiveTab.js');

test('倉庫の写真の登録: 商品管理・入庫の一覧の写真から登録でき、未登録は見分けられる。写真未登録で絞り込める', () => {
  assert.ok(FILTERS.some(([k]) => k === 'nophoto'));
  const rows = W.buildRows(sample, NOW);
  const data = { ...sample, rows, master: MASTER, allRows: rows, full: sample, me: { warehouseId: 'W-OSAKA' } };
  const ui = { filter: 'nophoto', q: '', scan: { raw: '' }, view: 'list', rl: { code: '' }, page: 1, pageSize: 100 };
  const list = stockTab(data, ui);
  assert.ok(list.includes('data-photo-file=') && list.includes('未登録') && /<img [^>]*src="data:image/.test(list));
  const withPhoto = sample.units.map((u, i) => (i === 0 ? { ...u, photo: 'data:image/jpeg;base64,AAA' } : u));
  const rows2 = W.buildRows({ ...sample, units: withPhoto }, NOW);
  const one = stockTab({ ...data, units: withPhoto, rows: rows2, allRows: rows2, full: { ...sample, units: withPhoto } }, { ...ui, filter: 'all', q: sample.units[0].code });
  assert.ok(one.includes('📷変更') && one.includes('data:image/jpeg;base64,AAA'));
  const noPhoto = stockTab(data, { ...ui, filter: 'all', scan: { raw: sample.units[0].code } });
  assert.ok(noPhoto.includes('data-photo-sample') && noPhoto.includes('未登録です') && !noPhoto.includes('data-photo-clear'));
  const detail = stockTab({ ...data, units: withPhoto, rows: rows2, allRows: rows2, full: { ...sample, units: withPhoto } }, { ...ui, filter: 'all', scan: { raw: sample.units[0].code } });
  assert.ok(detail.includes('data-photo-clear') && detail.includes('data-photo-sample') && detail.includes('登録済み'));
  const rc = receiveTab(sample, { rc: { location: '', last: null, checks: [] }, rl: { code: '' } }, MASTER.warehouses[0], MASTER);
  assert.ok(rc.includes('data-photo-file='));
});

test('コールセンターのクーリングオフ: 依頼のやり取りを見て、メッセージを送れる（開閉）。倉庫の返信・返送などの出来事も並ぶ', () => {
  const asked = sample.returns.find((x) => x.status === 'inquiring');
  const closed = progressHtml(sample.returns, sample.units, { open: [], draft: {} });
  assert.ok(closed.includes(`data-co-chat="${asked.id}"`) && !closed.includes(`data-co-send="${asked.id}"`));
  const open = progressHtml(sample.returns, sample.units, { open: [asked.id], draft: { [asked.id]: '急ぎです' } });
  for (const k of [`data-co-send="${asked.id}"`, `data-co-msg="${asked.id}"`, 'data-side="callcenter"', '急ぎです']) assert.ok(open.includes(k), k);
  const shipped = sample.returns.find((x) => x.status === 'shipped');
  assert.ok(progressHtml(sample.returns, sample.units, { open: [shipped.id], draft: {} }).includes('返送しました'));
  const evil = '<img src=x onerror=alert(1)>';
  const withEvil = W.addReturnMessage(sample, asked.id, { side: 'warehouse', text: evil, by: evil, at: NOW });
  assert.ok(!progressHtml(withEvil.returns, withEvil.units, { open: [asked.id], draft: {} }).includes(evil));
});
