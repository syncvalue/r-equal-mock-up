// 配車係の画面（ダミー）。オペレーターが仮確定した訪問の、担当営業を確認・変更して、確定する。主に翌々日の予定を、毎日確定していく。
// 確定した訪問だけが、営業のタブレットの予定に出る。
import { esc } from '../src/format.js';
import { USERS } from '../src/dashboard.js';
import { areaById, dispatchOptions } from '../src/dispatch.js';
import { isTentative } from '../src/reservations.js';
import { dateLabel, genderLabel, rankBadge, statusBadge } from './view.js';

const trunc = (s, n) => (String(s).length > n ? `${String(s).slice(0, n)}…` : String(s));

function assignee(r, reservations, now) {
  if (!isTentative(r)) return `<b>${esc(USERS.find((u) => u.id === r.userId)?.name ?? '')}</b>`;
  const opts = dispatchOptions(r, reservations, now);
  return `<select class="inp !w-auto" data-reassign="${r.id}" title="担当の営業を変更できます（予定が重なる営業は選べません）">${opts.map((o) => `<option value="${o.user.id}" ${o.current ? 'selected' : ''} ${o.free || o.current ? '' : 'disabled'}>${esc(o.user.name)}（${o.rank ?? '-'}）${o.free ? '' : '　× 予定が重なる'}</option>`).join('')}</select>`;
}

export function dispatcherHtml({ date, reservations, now, chips }) {
  const rows = reservations.filter((r) => r.date === date).sort((a, b) => a.start.localeCompare(b.start) || a.receptionNo.localeCompare(b.receptionNo));
  const tent = rows.filter(isTentative).length;
  const body = rows.map((r) => `<tr class="border-t align-top ${isTentative(r) ? '' : 'bg-emerald-50/50'}">
      <td class="whitespace-nowrap font-bold">${esc(r.start)}〜${esc(r.end)}</td>
      <td><b>${esc(r.customer.name)}</b> 様（${genderLabel(r.gender)}）<div class="text-xs text-slate-500">${esc(r.receptionNo)} ／ ${esc(r.customer.phone)}</div></td>
      <td class="max-w-[16rem]" title="${esc(r.customer.address)}">${esc(trunc(r.customer.address, 26))}<div class="text-xs text-slate-500">${esc(areaById(r.areaId)?.name ?? '例外対応')}</div></td>
      <td class="max-w-[14rem] text-xs" title="${esc(r.hearing.wants)}">${esc(trunc(r.hearing.wants, 40))}</td>
      <td>${assignee(r, reservations, now)}</td>
      <td>${statusBadge(r)}</td>
      <td class="whitespace-nowrap">${isTentative(r) ? `<button class="b b-pri !min-h-0 !py-1" data-fix="${r.id}">確定</button>` : `<button class="text-xs underline text-slate-500" data-unfix="${r.id}">仮に戻す</button>`}</td></tr>`).join('');
  return `
  <div class="p-4 space-y-3 h-[calc(100vh-52px)] overflow-y-auto">
    <section class="bg-white rounded-lg shadow">
      <div class="p-3 flex items-center gap-2 flex-wrap"><b class="mr-2">配車確定（配車係）</b>
        ${chips.map((c) => `<button class="chip ${c.date === date ? 'on' : ''}" data-ddate="${c.date}">${esc(c.label)}　${dateLabel(c.date)}${c.tentative ? `<span class="ml-1 rounded-full bg-amber-300 px-1.5 text-[11px] text-amber-950">仮${c.tentative}</span>` : ''}</button>`).join('')}
        <input class="inp !w-auto" type="date" value="${date}" data-ddate-input />
        <button class="b b-pri ml-auto" data-fixall ${tent ? '' : 'disabled'}>この日の仮確定 ${tent}件を、すべて確定</button></div>
      <p class="px-3 pb-2 text-xs text-slate-500">オペレーターが仮確定した訪問の担当を確認し、確定します。確定した訪問だけが、営業のタブレットの予定に出ます（主に翌々日の予定を、毎日確定します）。</p>
      ${rows.length ? `<div class="overflow-x-auto"><table class="w-full text-sm text-left"><thead class="bg-slate-100 text-slate-600"><tr><th>訪問時間</th><th>お客様</th><th>訪問先</th><th>売りたいもの</th><th>担当営業</th><th>状態</th><th></th></tr></thead><tbody>${body}</tbody></table></div>`
        : `<p class="p-8 text-center text-slate-400">${dateLabel(date)}の受付はありません</p>`}
    </section>
  </div>`;
}
