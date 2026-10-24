// 配車係の画面（ダミー）。オペレーターが仮確定した訪問の、担当営業を確認・変更して、確定する。主に翌々日の予定を、毎日確定していく。
// 確定した訪問だけが、営業のタブレットの予定に出る。
import { esc } from '../src/format.js';
import { USERS } from '../src/dashboard.js';
import { areaById, dispatchOptions, fairerAlternative } from '../src/dispatch.js';
import { isTentative, isCancelled } from '../src/reservations.js';
import { dateLabel, genderLabel, rankBadge, statusBadge } from './view.js';

const trunc = (s, n) => (String(s).length > n ? `${String(s).slice(0, n)}…` : String(s));

// 担当の配分の基準。女性のお客様は女性の担当件数、男性のお客様は担当の計の件数（オペレーターの画面と同じ）
const metric = (o, gender) => (gender === 'f' ? o.stats.female : o.stats.total);
const statLabel = (st, gender) => (gender === 'f' ? `女性${st.female}・計${st.total}` : `計${st.total}・女性${st.female}`);

function assignee(r, reservations, now) {
  const name = USERS.find((u) => u.id === r.userId)?.name ?? '';
  if (!isTentative(r)) return `<b>${esc(name)}</b>`; // 確定済み・取消済みは、変更できない
  const opts = dispatchOptions(r, reservations, now);
  const pickable = opts.filter((o) => o.free || o.current);
  const fewest = Math.min(...pickable.map((o) => metric(o, r.gender)));
  const cur = opts.find((o) => o.current);
  const fairer = r.gender === 'f' && cur ? fairerAlternative(r.gender, cur, opts) : null; // 女性のお客様で、より担当の少ない空き営業がいれば知らせる
  const label = (o) => `${pickable.includes(o) && metric(o, r.gender) === fewest ? '⭐ ' : ''}${o.user.name}（${o.rank ?? '-'}）今月 ${statLabel(o.stats, r.gender)}${o.free || o.current ? '' : o.absent ? '　× 欠勤' : '　× 予定が重なる'}`;
  return `<select class="inp !w-auto" data-reassign="${r.id}" title="担当の営業を変更できます（⭐＝今月の担当が最も少ない人。欠勤・予定が重なる営業は選べません）">${opts.map((o) => `<option value="${o.user.id}" ${o.current ? 'selected' : ''} ${o.free || o.current ? '' : 'disabled'}>${esc(label(o))}</option>`).join('')}</select>
    ${cur ? `<div class="mt-0.5 text-xs text-slate-600">${rankBadge(cur.rank)} 今月 ${statLabel(cur.stats, r.gender)}件</div>` : ''}
    ${fairer ? `<div class="mt-0.5 text-xs text-rose-700">⚖ <b>${esc(fairer.user.name)}</b>の方が女性担当が少ない（${fairer.stats.female}件／選択中 ${cur.stats.female}件）</div>` : ''}`;
}

export function dispatcherHtml({ date, reservations, now, chips }) {
  const rows = reservations.filter((r) => r.date === date).sort((a, b) => a.start.localeCompare(b.start) || a.receptionNo.localeCompare(b.receptionNo));
  const tent = rows.filter(isTentative).length;
  const actions = (r) => (isCancelled(r) ? `<span class="text-xs text-slate-500" title="${esc(`${r.cancelledAt ?? ''} ${r.cancelledBy ?? ''}`)}">${esc(r.cancelReason ?? '')}</span>`
    : `${isTentative(r) ? `<button class="b b-pri !min-h-0 !py-1" data-fix="${r.id}">確定</button>` : `<button class="text-xs underline text-slate-500" data-unfix="${r.id}">仮に戻す</button>`}
      <div class="mt-1 flex gap-2 text-xs"><button class="underline text-sky-700" data-chg="${r.id}">日時変更</button><button class="underline text-rose-700" data-cancelres="${r.id}">取消</button></div>`);
  const body = rows.map((r) => `<tr class="border-t align-top ${isCancelled(r) ? 'bg-slate-100 text-slate-400 line-through' : isTentative(r) ? '' : 'bg-emerald-50/50'}">
      <td class="whitespace-nowrap font-bold">${esc(r.start)}〜${esc(r.end)}</td>
      <td><b>${esc(r.customer.name)}</b> 様（${genderLabel(r.gender)}）<div class="text-xs text-slate-500">${esc(r.receptionNo)} ／ ${esc(r.customer.phone)}</div></td>
      <td class="max-w-[16rem]" title="${esc(r.customer.address)}">${esc(trunc(r.customer.address, 26))}<div class="text-xs text-slate-500">${esc(areaById(r.areaId)?.name ?? '例外対応')}</div></td>
      <td class="max-w-[14rem] text-xs" title="${esc(r.hearing.wants)}">${esc(trunc(r.hearing.wants, 40))}</td>
      <td>${assignee(r, reservations, now)}</td>
      <td>${statusBadge(r)}</td>
      <td class="whitespace-nowrap">${actions(r)}</td></tr>`).join('');
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
