// 商品の持ち帰り（事務所での入庫）の画面。QRコード付きシールを読み取りながら、買取商品を倉庫に入庫する。
import { esc, yen, fmtTime } from './format.js';
import { dateKey } from './workday.js';
import { LOCATIONS, byUser, inScope, pendingOf, dateKeys } from './stock.js';

const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
const SEC = 'h-full min-h-0 p-4';
const dateLabel = (key) => {
  const d = new Date(`${key}T00:00:00`);
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEK[d.getDay()]}）${key === dateKey() ? ' 今日' : ''}`;
};

export const DEFAULT_STOCK = { tab: 'pending', scope: 'all', location: LOCATIONS[0], last: null };

// メニューのバッジ用: 自分の入庫待ちの点数
export const pendingCount = (s) => pendingOf(byUser(s.units ?? [], s.user)).length;

const TAG = {
  pending: '<span class="rounded bg-amber-100 text-amber-800 text-xs font-bold px-2 py-0.5 whitespace-nowrap">入庫待ち</span>',
  missing: '<span class="rounded bg-rose-100 text-rose-700 text-xs font-bold px-2 py-0.5 whitespace-nowrap">所在不明</span>',
  stored: '<span class="rounded bg-emerald-100 text-emerald-800 text-xs font-bold px-2 py-0.5 whitespace-nowrap">入庫済み</span>',
};

const unitRow = (u, { showLocation }) => `
  <div class="flex items-center gap-3 rounded-xl border-2 px-3 py-2 min-h-[52px] ${u.status === 'stored' ? 'border-emerald-300 bg-emerald-50' : u.status === 'missing' ? 'border-rose-300' : 'border-slate-200'}">
    <div class="flex-1 min-w-0">
      <div class="font-bold text-sm truncate">${esc(u.name)}${u.qty > 1 ? `（${u.n}/${u.qty}）` : ''}</div>
      <div class="text-xs text-slate-500"><span class="font-mono">${esc(u.code)}</span> ／ ${esc(u.category)} ／ ランク${esc(u.rank)} ／ ${yen(u.price)}</div>
    </div>
    ${showLocation
      ? `<div class="text-right text-xs text-slate-600"><div class="font-bold">📍 ${esc(u.location)}</div><div>${fmtTime(u.storedAt)}</div></div>`
      : u.status === 'missing'
        ? '<span class="text-xs text-rose-600">シールを読み取れば入庫できます</span>'
        : `<button class="btn btn-secondary !py-1 !px-3 !min-h-[40px] !text-sm text-rose-600" data-action="stock-missing" data-code="${esc(u.code)}">所在不明</button>`}
    ${TAG[u.status]}
  </div>`;

// 日付 → 訪問ごとのまとまり
function groupedList(all, shown, showLocation) {
  const days = dateKeys(shown);
  if (!days.length) return '';
  return days.map((d) => {
    const visits = [...new Set(shown.filter((u) => u.date === d).map((u) => u.visitId))];
    return `
    <div class="space-y-1.5">
      <div class="font-bold text-slate-700 border-b pb-0.5">${dateLabel(d)}</div>
      ${visits.map((v) => {
        const mine = shown.filter((u) => u.visitId === v);
        const whole = all.filter((u) => u.visitId === v);
        const done = whole.filter((u) => u.status === 'stored').length;
        return `
        <div class="space-y-1">
          <div class="text-sm text-slate-600 flex justify-between"><span>🏠 ${esc(mine[0].customerName)} 様（${fmtTime(mine[0].at).slice(0, 5)} 訪問終了）</span><span>${done} / ${whole.length} 点 入庫</span></div>
          ${mine.map((u) => unitRow(u, { showLocation })).join('')}
        </div>`;
      }).join('')}
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
  const stored = scoped.filter((u) => u.status === 'stored').sort((a, b) => b.storedAt - a.storedAt);
  const tab = s.stock.tab;
  const tabBtn = (key, label, n) => `<button class="chip !min-h-[44px] ${tab === key ? 'active' : ''}" data-action="stock-tab" data-value="${key}">${label} ${n}点</button>`;
  const pct = scoped.length ? Math.round((stored.length / scoped.length) * 100) : 0;
  return `
  <div class="card !p-4 flex-1 min-w-0 flex flex-col gap-2 min-h-0">
    <div class="flex items-center justify-between gap-2">
      <h2 class="text-xl font-bold">📦 買取商品の持ち帰り</h2>
      <div class="flex gap-2">${tabBtn('pending', '入庫待ち', todo.length)}${tabBtn('stored', '入庫済み', stored.length)}</div>
    </div>
    ${mine.length ? scopeChips(s, mine) : ''}
    ${scoped.length ? `<div class="flex items-center gap-2"><div class="flex-1 h-3 rounded-full bg-slate-200 overflow-hidden"><div class="h-full bg-teal-600" style="width:${pct}%"></div></div><span class="text-sm font-bold">${stored.length} / ${scoped.length} 点（${pct}%）</span></div>` : ''}
    <div class="space-y-3 overflow-y-auto min-h-0 flex-1" data-scroll="stock">
      ${tab === 'pending'
        ? (todo.length
          ? groupedList(scoped, todo, false)
          : `<div class="text-center text-slate-500 py-12">${mine.length ? '🎉 対象の商品は、すべて入庫済みです' : '入庫待ちの買取商品はありません。<br>訪問を終了すると、買取商品がここに表示されます。'}</div>`)
        : (stored.length
          ? groupedList(scoped, stored, true)
          : '<div class="text-center text-slate-500 py-12">入庫済みの商品はまだありません</div>')}
    </div>
  </div>`;
}

function actionCard(s, mine) {
  const todo = pendingOf(inScope(mine, s.stock.scope));
  const last = s.stock.last;
  return `
  <div class="card !p-4 w-[24rem] shrink-0 flex flex-col gap-3 min-h-0 overflow-y-auto" data-scroll="stockR">
    <h3 class="font-bold text-lg">入庫する</h3>
    <div>
      <div class="font-bold text-sm mb-1">保管場所<span class="font-normal text-xs text-slate-500">（読み取った商品は、ここに入庫します）</span></div>
      <div class="flex flex-wrap gap-1.5">${LOCATIONS.map((l) => `<button class="chip !min-h-[40px] !py-0 !px-3 text-sm ${s.stock.location === l ? 'active' : ''}" data-action="stock-loc" data-value="${esc(l)}">${esc(l)}</button>`).join('')}</div>
    </div>
    <button class="btn btn-primary w-full text-xl !py-4" data-action="stock-scan" ${todo.length ? '' : 'disabled'}>📷 QRを読み取って入庫</button>
    <p class="text-xs text-slate-500 -mt-1">カメラでシールを次々に読み取ります。${s.stock.scope === 'all' ? 'すべての日付' : dateLabel(s.stock.scope)}の入庫待ち ${todo.length} 点が対象です。</p>
    <label class="block"><span class="font-bold text-sm">シールNo.を入力（スキャナ・手入力）</span>
      <div class="flex gap-2 mt-1"><input id="stock-code" class="field font-mono !py-2" placeholder="RQ-XXXXXXXX" autocomplete="off" data-stock-code />
        <button class="btn btn-secondary !py-2 !px-4 !min-h-[48px]" data-action="stock-submit">入庫</button></div></label>
    ${last ? `<div class="rounded-xl border-2 p-3 text-sm font-bold ${last.ok ? 'bg-emerald-50 border-emerald-400 text-emerald-800' : 'bg-rose-50 border-rose-400 text-rose-700'}">${last.ok ? '✓' : '⚠'} ${esc(last.text)}</div>` : ''}
    ${s.user && todo.some((u) => u.status === 'missing') ? `<div class="rounded-xl bg-rose-50 border border-rose-300 p-2 text-xs text-rose-700">所在不明の商品が ${todo.filter((u) => u.status === 'missing').length} 点あります。探しても見つからない場合は、本社へ連絡してください。</div>` : ''}
    <div class="mt-auto flex flex-col gap-1 items-end">
      <button class="text-xs underline text-slate-400" data-action="stock-demo-add">（デモ用）過去2日分の入庫待ちを追加</button>
    </div>
  </div>`;
}

export function stockView(s) {
  const mine = byUser(s.units ?? [], s.user);
  return `<section class="${SEC} flex gap-3">${listCard(s, mine)}${actionCard(s, mine)}</section>`;
}
