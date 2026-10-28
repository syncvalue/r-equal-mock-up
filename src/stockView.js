// 商品の持ち帰り（事務所での入庫）の画面。QRコード付きシールを読み取りながら、買取商品を倉庫に入庫する。
import { esc, yen, fmtTime } from './format.js';
import { helpIcon } from './help.js';
import { dateKey } from './workday.js';
import { byUser, inScope, pendingOf, dateKeys, COOLING_OFF_SHELF } from './stock.js';
import { loadMaster, receiveTarget, isHighValue } from './warehouseMaster.js';
import { areaOfUser } from './dispatch.js';

const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
const SEC = 'h-full min-h-0 p-4';
const dateLabel = (key) => {
  const d = new Date(`${key}T00:00:00`);
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEK[d.getDay()]}）${key === dateKey() ? ' 今日' : ''}`;
};

export const DEFAULT_STOCK = { scope: 'all', last: null };

// 入庫の納入先（倉庫）は選ばない。自分の営業所に併設の倉庫に入り（なければ先頭の倉庫）、保管場所はクーリングオフ保管棚
// 高額品（貴金属など）も、いったん倉庫に入り、倉庫間移動で本社へ移す（一覧に目印を出す）
export const isHonshaItem = (u) => isHighValue(u, loadMaster());

export const stockTarget = (s) => ({ ...receiveTarget(loadMaster(), areaOfUser(s.user)), location: COOLING_OFF_SHELF });

// メニューのバッジ用: 自分の入庫待ちの点数
export const pendingCount = (s) => pendingOf(byUser(s.units ?? [], s.user)).length;

const TAG = {
  pending: '<span class="rounded bg-amber-100 text-amber-800 text-xs font-bold px-2 py-0.5 whitespace-nowrap">入庫待ち</span>',
  missing: '<span class="rounded bg-rose-100 text-rose-700 text-xs font-bold px-2 py-0.5 whitespace-nowrap">所在不明</span>',
  stored: '<span class="rounded bg-slate-200 text-slate-600 text-xs font-bold px-2 py-0.5 whitespace-nowrap">入庫済み</span>',
};

const unitRow = (u) => `
  <div class="flex items-center gap-3 rounded-xl border-2 px-3 py-2 min-h-[52px] ${u.status === 'stored' ? 'border-slate-200 bg-slate-100 text-slate-400' : u.status === 'missing' ? 'border-rose-300' : 'border-slate-200'}">
    <div class="flex-1 min-w-0">
      <div class="font-bold text-sm truncate">${esc(u.name)}${u.qty > 1 ? `（${u.n}/${u.qty}）` : ''}</div>
      <div class="text-xs ${u.status === 'stored' ? 'text-slate-400' : 'text-slate-500'}"><span class="font-mono">${esc(u.code)}</span> ／ ${esc(u.category)} ／ ランク${esc(u.rank)} ／ ${yen(u.price)}${isHonshaItem(u) ? ' ／ <b class="text-violet-700">高額品（あとで本社へ移動）</b>' : ''}</div>
    </div>
    ${u.status === 'stored'
      ? `<div class="text-right text-xs text-slate-500"><div class="font-bold">📍 ${esc(u.location)}</div><div>${fmtTime(u.storedAt)}</div></div>`
      : u.status === 'missing'
        ? '<span class="text-xs text-rose-600">シールを読み取れば入庫できます</span>'
        : `<button class="btn btn-secondary !py-1 !px-3 !min-h-[40px] !text-sm text-rose-600" data-action="stock-missing" data-code="${esc(u.code)}">所在不明</button>`}
    ${TAG[u.status]}
  </div>`;

// 日付 → 訪問ごとのまとまり。入庫済みは消さず、各訪問の下にグレーで並べる（未入庫が上）。入庫が残っている訪問を、日付の中で先に出す
const storedLast = (list) => [...list.filter((u) => u.status !== 'stored'), ...list.filter((u) => u.status === 'stored')];
function groupedList(list) {
  return dateKeys(list).map((d) => {
    const ofDay = list.filter((u) => u.date === d);
    const visits = [...new Set(ofDay.map((u) => u.visitId))].map((v) => storedLast(ofDay.filter((u) => u.visitId === v)));
    const open = (rows) => rows.some((u) => u.status !== 'stored');
    return `
    <div class="space-y-1.5">
      <div class="font-bold text-slate-700 border-b pb-0.5">${dateLabel(d)}</div>
      ${[...visits.filter(open), ...visits.filter((r) => !open(r))].map((rows) => `
        <div class="space-y-1 ${open(rows) ? '' : 'opacity-80'}">
          <div class="text-sm text-slate-600 flex justify-between"><span>🏠 ${esc(rows[0].customerName)} 様（${fmtTime(rows[0].at).slice(0, 5)} 訪問終了）</span><span>${rows.filter((u) => u.status === 'stored').length} / ${rows.length} 点 入庫</span></div>
          ${rows.map(unitRow).join('')}
        </div>`).join('')}
    </div>`;
  }).join('');
}

// 日付の絞り込み（まとめて入庫するとき、どの日の分を対象にするか）
function scopeChips(s, mine) {
  const chip = (value, label, n) => `<button class="chip !min-h-[40px] !py-0 !px-3 text-sm ${s.stock.scope === value ? 'active' : ''}" data-action="stock-scope" data-value="${value}">${label}${n ? ` <b class="${s.stock.scope === value ? '' : 'text-rose-600'}">${n}</b>` : ''}</button>`;
  return `<div class="flex flex-wrap gap-1.5 items-center"><span class="text-sm text-slate-500">対象日</span>
    ${chip('all', 'すべて', pendingOf(mine).length)}
    ${dateKeys(mine).map((d) => chip(d, dateLabel(d), pendingOf(mine.filter((u) => u.date === d)).length)).join('')}</div>`;
}

function listCard(s, mine) {
  const scoped = inScope(mine, s.stock.scope);
  const todo = pendingOf(scoped);
  const stored = scoped.length - todo.length;
  const pct = scoped.length ? Math.round((stored / scoped.length) * 100) : 0;
  return `
  <div class="card !p-4 flex-1 min-w-0 flex flex-col gap-2 min-h-0">
    <div class="flex items-center justify-between gap-2">
      <h2 class="text-xl font-bold">📦 買取商品の持ち帰り</h2>
      <div class="text-sm text-slate-600">未入庫 <b class="text-lg text-amber-700">${todo.length}</b> 点　入庫済み <b class="text-lg">${stored}</b> 点</div>
    </div>
    ${mine.length ? scopeChips(s, mine) : ''}
    ${scoped.length ? `<div class="flex items-center gap-2"><div class="flex-1 h-3 rounded-full bg-slate-200 overflow-hidden"><div class="h-full bg-teal-600" style="width:${pct}%"></div></div><span class="text-sm font-bold">${stored} / ${scoped.length} 点（${pct}%）</span></div>` : ''}
    <div class="space-y-3 overflow-y-auto min-h-0 flex-1" data-scroll="stock">
      ${scoped.length
        ? groupedList(scoped)
        : '<div class="text-center text-slate-500 py-12">入庫待ちの買取商品はありません。<br>訪問を終了すると、買取商品がここに表示されます。</div>'}
    </div>
  </div>`;
}

function actionCard(s, mine) {
  const master = loadMaster();
  const target = stockTarget(s);
  const todo = pendingOf(inScope(mine, s.stock.scope));
  const last = s.stock.last;
  return `
  <div class="card !p-4 w-[24rem] shrink-0 portrait:w-full portrait:flex-none portrait:max-h-[50%] flex flex-col gap-3 min-h-0 overflow-y-auto" data-scroll="stockR">
    <h3 class="font-bold text-lg">入庫する${helpIcon('シールの色が紫・赤の高額品も、ここでは、ほかの商品と同じように倉庫に入庫します。\nそのあと、倉庫の担当が、倉庫間移動で本社へ移します。')}</h3>
    <button class="btn btn-primary w-full text-xl !py-5" data-action="stock-scan" ${todo.length ? '' : 'disabled'}>📷 QRを読み取って入庫</button>
    <p class="text-xs text-slate-500 -mt-2">対象：${s.stock.scope === 'all' ? 'すべての日付' : dateLabel(s.stock.scope)}の入庫待ち ${todo.length} 点</p>
    ${last && !last.ok ? `<div class="rounded-xl border-2 p-3 text-sm font-bold bg-rose-50 border-rose-400 text-rose-700">⚠ ${esc(last.text)}</div>` : ''}
    <label class="block"><span class="font-bold text-sm">QRが読めないとき：シールNo.を入力（スキャナ・手入力）</span>
      <div class="flex gap-2 mt-1"><input id="stock-code" class="field font-mono !py-2" placeholder="RQ-XXXXXXXX" autocomplete="off" data-stock-code />
        <button class="btn btn-secondary !py-2 !px-4 !min-h-[48px]" data-action="stock-submit">入庫</button></div></label>
    <p class="text-xs text-slate-500">納入先: <b>${esc(target.warehouse.name)}</b>（${esc(COOLING_OFF_SHELF)}）${helpIcon('商品は、あなたの営業所と一体の倉庫に入ります（倉庫のない営業所は、先頭の倉庫）。商品ごとに棚は分けず、クーリングオフ保管棚にまとめて保管します。')}</p>
    ${s.user && todo.some((u) => u.status === 'missing') ? `<div class="rounded-xl bg-rose-50 border border-rose-300 p-2 text-xs text-rose-700">所在不明の商品が ${todo.filter((u) => u.status === 'missing').length} 点あります。見つからない場合は本社へ連絡してください。</div>` : ''}
    <div class="mt-auto flex flex-col gap-1 items-end">
      <button class="text-xs underline text-slate-400" data-action="stock-demo-add">（デモ用）過去2日分の入庫待ちを追加</button>
    </div>
  </div>`;
}

export function stockView(s) {
  const mine = byUser(s.units ?? [], s.user);
  return `<section class="${SEC} flex gap-3 portrait:flex-col">${actionCard(s, mine)}${listCard(s, mine)}</section>`;
}
