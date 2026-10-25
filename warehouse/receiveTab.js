// 📥 入庫: 倉庫の担当者が、営業から渡された買取商品を入庫する。QRシール（シールNo.）を読み取るか、契約書（明細）と照らし合わせて契約ごとにまとめて入庫する。
// 営業のタブレットでも入庫できる。倉庫では、誰が買い取った商品でも入庫できる。
import { LOCATIONS } from '../src/stock.js';
import { userById } from '../src/dashboard.js';
import { yen, esc } from '../src/format.js';
import { badge, md } from './ui.js';

const TAG = { pending: badge('bg-amber-100 text-amber-800', '入庫待ち'), missing: badge('bg-rose-100 text-rose-700', '所在不明'), stored: badge('bg-emerald-100 text-emerald-800', '入庫済み') };
const salesName = (id) => userById(id)?.name ?? id;

function scanPanel(rc, todo) {
  return `
  <section class="rounded-xl border bg-white p-4 space-y-3">
    <h2 class="font-bold text-lg">📥 入庫する</h2>
    <p class="text-xs text-slate-500">営業から、買い取った商品が契約書（明細）とともに届いたら、ここで入庫します。営業が自分でタブレットから入庫することもできます。</p>
    <div><div class="text-sm font-bold mb-1">保管場所<span class="font-normal text-xs text-slate-500">（入庫する商品は、ここに保管します）</span></div>
      <div class="flex flex-wrap gap-1.5">${LOCATIONS.map((l) => `<button class="b b-sec !min-h-[40px] !py-1 !px-3 text-sm ${rc.location === l ? 'on' : ''}" data-rc-loc="${esc(l)}">${esc(l)}</button>`).join('')}</div></div>
    <label class="text-sm font-bold block">シールNo.（スキャナ・手入力。Enterで入庫）
      <div class="flex gap-2 mt-1"><input class="inp font-mono font-normal" data-rc-code placeholder="RQ-XXXXXXXX" autocomplete="off" /><button class="b b-pri" data-rc-submit>入庫</button></div></label>
    ${rc.last ? `<div class="rounded-xl border-2 p-3 text-sm font-bold ${rc.last.ok ? 'bg-emerald-50 border-emerald-400 text-emerald-800' : 'bg-rose-50 border-rose-400 text-rose-700'}">${rc.last.ok ? '✓' : '⚠'} ${esc(rc.last.text)}</div>` : ''}
    <div class="text-sm rounded bg-slate-50 p-2">入庫待ち <b class="text-lg">${todo.filter((u) => u.status === 'pending').length}</b> 点　所在不明 <b class="text-lg ${todo.some((u) => u.status === 'missing') ? 'text-rose-600' : ''}">${todo.filter((u) => u.status === 'missing').length}</b> 点</div>
  </section>`;
}

function contractCard(units, rc) {
  const first = units[0];
  const todo = units.filter((u) => u.status !== 'stored');
  return `<div class="rounded-lg border p-3 space-y-2">
    <div class="flex flex-wrap items-center gap-2">
      <b class="text-base">${esc(first.customerName)} 様</b><span class="text-xs text-slate-500">${md(first.date)} 買取／担当営業 ${esc(salesName(first.userId))}／${units.length}点 ${yen(units.reduce((n, u) => n + u.price, 0))}</span>
      <span class="ml-auto text-sm">${units.length - todo.length} / ${units.length} 点 入庫</span>
      <button class="b b-pri !min-h-0 !py-1.5 !px-3 text-sm" data-rc-visit="${esc(first.visitId)}">残り${todo.length}点をまとめて入庫（${esc(rc.location.replace(/（.*/, ''))}）</button>
    </div>
    <table class="w-full text-sm"><tbody>${units.map((u) => `<tr class="border-t ${u.status === 'stored' ? 'text-slate-400' : ''}">
      <td class="font-mono text-xs">${esc(u.code)}</td><td class="font-bold">${esc(u.name)}</td><td>${esc(u.category)}／ランク${esc(u.rank)}</td><td class="text-right">${yen(u.price)}</td>
      <td>${TAG[u.status]}</td><td class="text-xs">${u.status === 'stored' ? `📍 ${esc(u.location)}` : `<button class="b b-sec !min-h-0 !py-1 !px-3 text-sm" data-rc-unit="${esc(u.code)}">入庫</button>`}</td></tr>`).join('')}</tbody></table>
  </div>`;
}

export function receiveTab({ units }, { rc }) {
  const todo = units.filter((u) => u.status !== 'stored');
  const visits = [...new Set(todo.map((u) => u.visitId))];
  const contracts = visits.map((v) => units.filter((u) => u.visitId === v)).sort((a, b) => b[0].at - a[0].at);
  return `<div class="grid xl:grid-cols-[26rem_1fr] gap-4 items-start">${scanPanel(rc, todo)}
    <section class="rounded-xl border bg-white p-4 space-y-3">
      <h2 class="font-bold text-lg">入庫待ちの契約（${contracts.length}件）</h2>
      <p class="text-xs text-slate-500">契約書（明細）と、届いた商品を照らし合わせて、1点ずつ、または契約ごとにまとめて入庫します。明細にあるのに届いていない商品は、入庫せずに残します（営業に確認してください）。</p>
      ${contracts.length ? contracts.map((c) => contractCard(c, rc)).join('') : '<p class="text-sm text-slate-500 py-8 text-center">入庫待ちの商品はありません。</p>'}
    </section></div>`;
}
