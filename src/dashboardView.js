// 業績ダッシュボードの画面。リーダーはグループ全員、一般の営業は自分の業績のみ閲覧できる。
import { yen, esc, fmtDateTime } from './format.js';
import { messagesFor } from './messages.js';
import { loadReadIds } from './store.js';
import {
  GROUPS, USERS, RESULTS, userById, isLeader, roleLabel, groupMembers, visibleUsers, rangeOf, prevRange, dailySeries, stats, monthProgress, visitRecords, ymd,
} from './dashboard.js';

const PERIODS = [['today', '今日'], ['week', '今週'], ['month', '今月']];
const pct = (n) => `${Math.round(n * 100)}%`;

const delta = (cur, prev, onDark = false) => {
  if (!prev) return '';
  const d = (cur - prev) / prev;
  return `<span class="text-xs font-bold ${onDark ? 'text-white' : d >= 0 ? 'text-emerald-700' : 'text-rose-600'}">${d >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(d * 100))}%</span>`;
};

// 主役は買取金額。ほかの指標は小さめに
const kpi = (label, value, sub, hero = false) => `
  <div class="card !p-3 min-w-0 ${hero ? 'md:col-span-2 !bg-teal-600 text-white' : ''}"><div class="text-xs ${hero ? 'text-teal-100' : 'text-slate-500'}">${label}</div>
    <div class="${hero ? 'text-4xl' : 'text-xl'} font-bold leading-tight truncate">${value}</div><div class="min-h-[18px]">${sub ?? ''}</div></div>`;

function barChart(series, todayKey) {
  const max = Math.max(1, ...series.map((d) => d.amount));
  const W = 640;
  const H = 170;
  const pad = 24;
  const bw = (W - pad * 2) / series.length;
  const step = series.length > 16 ? 2 : 1;
  const bars = series
    .map((d, i) => {
      const h = Math.round((d.amount / max) * (H - 44));
      const x = pad + i * bw + bw * 0.15;
      const isToday = ymd(d.date) === todayKey;
      return `<rect x="${x.toFixed(1)}" y="${H - 22 - h}" width="${(bw * 0.7).toFixed(1)}" height="${h}" rx="3" class="cursor-pointer ${isToday ? 'fill-amber-500' : 'fill-teal-600'}" data-action="dash-visits" data-date="${ymd(d.date)}"><title>${d.date.getMonth() + 1}/${d.date.getDate()}　${yen(d.amount)}（契約${d.contracts}件）</title></rect>
        ${i % step === 0 ? `<text x="${(x + bw * 0.35).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="11" class="fill-slate-500">${d.date.getDate()}</text>` : ''}`;
    })
    .join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="w-full" role="img" aria-label="日別の買取金額">
    <line x1="${pad}" x2="${W - pad}" y1="${H - 22}" y2="${H - 22}" class="stroke-slate-300" stroke-width="1"/>
    <text x="${pad}" y="12" font-size="11" class="fill-slate-500">最大 ${yen(max)}</text>${bars}</svg>`;
}

function progressBar(p) {
  return `<div class="relative h-4 rounded-full bg-slate-200 overflow-hidden">
    <div class="absolute inset-y-0 left-0 rounded-full ${p.rate >= p.pace ? 'bg-emerald-500' : 'bg-amber-500'}" style="width:${Math.min(100, p.rate * 100).toFixed(1)}%"></div>
    <div class="absolute inset-y-0 w-0.5 bg-slate-900" style="left:${(p.pace * 100).toFixed(1)}%" title="今日までの経過に応じた目安"></div></div>`;
}

function memberTable(s, members, range, now) {
  const rows = members
    .map((u) => ({ u, st: stats([u], range, now), pr: monthProgress([u], now) }))
    .sort((a, b) => b.st.amount - a.st.amount);
  return `
  <div class="card !p-0 overflow-hidden">
    <table class="w-full text-sm"><thead class="bg-slate-100 text-slate-600"><tr>
      <th class="p-2 text-left">順位</th><th class="text-left">メンバー</th><th class="text-right">訪問</th><th class="text-right">契約</th><th class="text-right">成約率</th><th class="text-right">買取金額</th><th class="w-48 text-left pl-3">今月の目標達成</th></tr></thead>
      <tbody>${rows.map(({ u, st, pr }, i) => `
        <tr class="border-t cursor-pointer hover:bg-indigo-50" data-action="dash-member" data-id="${u.id}">
          <td class="p-2 font-bold">${i + 1}</td>
          <td><b>${esc(u.name)}</b>${isLeader(u) ? ' <span class="text-xs rounded bg-indigo-100 text-indigo-800 px-1.5 py-0.5 font-bold">リーダー</span>' : ''}</td>
          <td class="text-right">${st.visits}</td><td class="text-right">${st.contracts}</td><td class="text-right">${pct(st.rate)}</td>
          <td class="text-right font-bold">${yen(st.amount)}</td>
          <td class="pl-3"><div class="flex items-center gap-2">${`<div class="flex-1">${progressBar(pr)}</div>`}<span class="w-10 text-right font-bold ${pr.rate >= pr.pace ? 'text-emerald-700' : 'text-amber-700'}">${pct(pr.rate)}</span></div></td></tr>`).join('')}
      </tbody></table></div>
  <p class="text-xs text-slate-500">行をタップすると、そのメンバーの詳細を見られます。目標達成の縦線は、今日までの経過に応じた目安です。</p>`;
}

// 本社からのメッセージ。一覧は2件分の高さに固定し、3件目以降は一覧内でスクロールする。詳細はモーダルで開く
function messagesCard(user) {
  const msgs = messagesFor(user);
  const read = new Set(loadReadIds(user.id));
  const unread = msgs.filter((m) => !read.has(m.id)).length;
  return `
  <div class="card !p-3 space-y-1.5">
    <div class="flex items-center justify-between">
      <h3 class="font-bold">📢 本社からのメッセージ ${unread ? `<span class="ml-1 text-xs rounded-full bg-rose-600 text-white px-2 py-0.5">未読 ${unread}</span>` : '<span class="ml-1 text-xs text-slate-400">すべて既読</span>'}
</h3>
      ${unread ? '<button class="text-xs underline text-slate-500" data-action="msg-read-all">すべて既読にする</button>' : ''}</div>
    <div class="space-y-1.5 max-h-[102px] overflow-y-auto" data-scroll="msgs">
      ${msgs.length ? msgs.map((m) => {
        const isRead = read.has(m.id);
        return `<button class="w-full h-12 flex items-center gap-2 text-left rounded-xl border-2 px-3 ${m.important ? 'border-rose-300' : 'border-slate-200'} ${isRead ? '' : 'bg-amber-50'}" data-action="msg-open" data-id="${m.id}">
          ${isRead ? '<span class="w-2.5 shrink-0"></span>' : '<span class="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0"></span>'}
          ${m.important ? '<span class="text-xs font-bold rounded bg-rose-600 text-white px-1.5 py-0.5 shrink-0">重要</span>' : '<span class="text-xs font-bold rounded bg-slate-200 text-slate-600 px-1.5 py-0.5 shrink-0">お知らせ</span>'}
          <span class="font-bold flex-1 truncate ${isRead ? 'font-normal' : ''}">${esc(m.title)}</span>
          <span class="text-xs text-slate-400 shrink-0">${fmtDateTime(m.sentAt).replace(/:\d+$/, '')}</span></button>`;
      }).join('') : '<p class="text-slate-400 text-center py-3">メッセージはありません</p>'}
    </div>
  </div>`;
}

export function dashboardView(s) {
  const now = new Date();
  const user = userById(s.user);
  const leader = s.dash.viewAs ? s.dash.viewAs === 'leader' : isLeader(user); // デモ用に、メンバー表示／リーダー表示を切り替えられる
  const scope = leader ? s.dash.scope : 'me';
  const memberId = leader && scope === 'member' ? s.dash.member : null;
  const users = visibleUsers(user, scope, memberId, leader);
  const range = rangeOf(s.dash.period, now);
  const cur = stats(users, range, now);
  const prev = stats(users, prevRange(range), now);
  const chartRange = s.dash.period === 'today' ? { start: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6), end: rangeOf('today', now).end } : range;
  const series = dailySeries(users, chartRange, now);
  const prog = monthProgress(users, now);
  const subject =
    scope === 'group' ? GROUPS.find((g) => g.id === user.group).name : scope === 'member' ? `${userById(memberId).name}（メンバー詳細）` : `${user.name}（自分）`;

  const tab = (key, label) => `<button class="flex-1 py-2 rounded-lg font-bold ${scope === key || (key === 'group' && scope === 'member') ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600'}" data-action="dash-scope" data-value="${key}">${label}</button>`;

  return `
  <section class="h-full min-h-0 overflow-y-auto p-4 space-y-3" data-scroll="dash">
    ${messagesCard(userById(s.user))}
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div><h2 class="text-2xl font-bold">📊 業績ダッシュボード</h2>
        <p class="text-sm text-slate-500">${esc(subject)} ／ ${range.start.getMonth() + 1}/${range.start.getDate()}${range.start.getTime() === range.end.getTime() ? '' : `〜${range.end.getMonth() + 1}/${range.end.getDate()}`}</p></div>
      <div class="flex gap-1 w-64">${PERIODS.map(([k, l]) => `<button class="flex-1 py-2 rounded-lg font-bold ${s.dash.period === k ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600'}" data-action="dash-period" data-value="${k}">${l}</button>`).join('')}</div>
    </div>

    <div class="flex flex-wrap items-center gap-3">
      ${leader
        ? `<div class="flex gap-1 w-80">${tab('me', '自分')}${tab('group', 'グループ全体')}</div>`
        : '<span class="text-sm rounded-lg bg-slate-100 text-slate-600 px-3 py-1.5">🔒 あなたの業績のみ表示されます</span>'}
      ${scope === 'member' ? '<button class="text-teal-700 font-bold underline" data-action="dash-scope" data-value="group">← グループ全体に戻る</button>' : ''}
      <details class="ml-auto text-xs text-slate-500" ${s.dash.demoOpen ? 'open' : ''}><summary class="cursor-pointer text-right underline" data-action="dash-demo">デモ用の切り替え</summary><div class="mt-1 flex flex-wrap items-center justify-end gap-2">
      <div class="flex items-center gap-1">表示するロール
        ${[['member', 'メンバー'], ['leader', 'グループリーダー']].map(([k, l]) => `<button class="rounded-lg px-3 py-1.5 font-bold ${(leader ? 'leader' : 'member') === k ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}" data-action="dash-viewas" data-value="${k}">${l}</button>`).join('')}</div>
      <label class="text-xs text-slate-500 flex items-center gap-2">ログイン中のユーザー
        <select class="field !py-1 !px-2 !text-sm !w-auto" data-dashuser>
          ${GROUPS.map((g) => `<optgroup label="${esc(g.name)}">${USERS.filter((u) => u.group === g.id).map((u) => `<option value="${u.id}" ${u.id === user.id ? 'selected' : ''}>${esc(u.name)}（${roleLabel(u)}）</option>`).join('')}</optgroup>`).join('')}
        </select></label></div></details>
    </div>

    <div class="grid grid-cols-2 md:grid-cols-6 gap-2">
      ${kpi('買取金額', yen(cur.amount), delta(cur.amount, prev.amount, true), true)}
      ${kpi('契約数', `${cur.contracts}<span class="text-sm font-normal">件</span>`, delta(cur.contracts, prev.contracts))}
      <button class="text-left" data-action="dash-visits" data-date="">${kpi('訪問数', `${cur.visits}<span class="text-sm font-normal">件</span>`, `${delta(cur.visits, prev.visits)} <span class="text-xs text-teal-700 underline">訪問ごとの結果</span>`)}</button>
      ${kpi('成約率', pct(cur.rate), `<span class="text-xs text-slate-500">前期間 ${pct(prev.rate)}</span>`)}
      ${kpi('平均買取額／契約', yen(cur.avg), delta(cur.avg, prev.avg))}
    </div>
    <p class="text-[11px] text-slate-400 -mt-1">▲▼は直前の同じ長さの期間との比較。訪問数・成約率に、不在・日程変更は含みません。</p>

    <div class="grid md:grid-cols-[3fr_2fr] gap-3 items-start">
      <div class="card !p-3"><div class="font-bold text-sm mb-1">日別の買取金額${s.dash.period === 'today' ? '（直近7日）' : ''}</div>${barChart(series, ymd(now))}
        <div class="text-[11px] text-slate-400">バーをタップすると、その日の訪問ごとの結果を見られます。</div></div>
      <div class="card !p-3 space-y-2">
        <div class="font-bold text-sm">今月の目標達成</div>
        <div class="flex items-end justify-between"><span class="text-3xl font-bold ${prog.rate >= prog.pace ? 'text-emerald-700' : 'text-amber-700'}">${pct(prog.rate)}</span>
          <span class="text-xs text-slate-500 text-right">${yen(prog.amount)} / 目標 ${yen(prog.target)}</span></div>
        ${progressBar(prog)}
        <div class="text-xs ${prog.rate >= prog.pace ? 'text-emerald-700' : 'text-amber-700'} font-bold">${prog.rate >= prog.pace ? '目安を上回っています' : '目安を下回っています'}<span class="font-normal text-slate-400">（縦線＝今日までの経過 ${pct(prog.pace)}）</span></div>
      </div>
    </div>

    ${scope === 'group' ? `<h3 class="font-bold">メンバー別の業績</h3>${memberTable(s, groupMembers(user), range, now)}` : ''}
  </section>`;
}

// 訪問ごとの結果（モーダル）。メンバー表示では自分の分、リーダーのグループ表示ではグループ全員の分
export function dashVisitsModal(s) {
  const now = new Date();
  const user = userById(s.user);
  const leader = s.dash.viewAs ? s.dash.viewAs === 'leader' : isLeader(user);
  const scope = leader ? s.dash.scope : 'me';
  const users = visibleUsers(user, scope, leader && scope === 'member' ? s.dash.member : null, leader);
  const day = s.modal.date;
  const range = day ? { start: new Date(`${day}T00:00:00`), end: new Date(`${day}T00:00:00`) } : rangeOf(s.dash.period, now);
  const recs = visitRecords(users, range, now);
  const count = (k) => recs.filter((r) => r.result === k).length;
  const excluded = recs.filter((r) => RESULTS[r.result].excluded).length;
  const showWho = users.length > 1;
  const label = day ? `${range.start.getMonth() + 1}/${range.start.getDate()}` : `${range.start.getMonth() + 1}/${range.start.getDate()}${range.start.getTime() === range.end.getTime() ? '' : `〜${range.end.getMonth() + 1}/${range.end.getDate()}`}`;
  return {
    title: `🏠 訪問ごとの結果　${label}`,
    body: `
    <div class="flex flex-wrap gap-2 text-sm">
      <span class="rounded-lg bg-slate-100 px-3 py-1">訪問実績 <b>${recs.length}件</b></span>
      <span class="rounded-lg bg-emerald-100 text-emerald-800 px-3 py-1">成約 <b>${count('won')}</b></span>
      <span class="rounded-lg bg-slate-200 text-slate-700 px-3 py-1">不成約 <b>${count('lost')}</b></span>
      <span class="rounded-lg bg-amber-100 text-amber-800 px-3 py-1">業績対象外 <b>${excluded}</b>（不在・日程変更）</span></div>
    <p class="text-xs text-slate-500">不在・日程変更の依頼は、訪問実績には数えますが、営業の責任ではないため、訪問数・成約率には含みません。</p>
    ${recs.length ? `<div class="rounded-xl border overflow-hidden"><table class="w-full text-sm">
      <thead class="bg-slate-100 text-slate-600"><tr><th class="p-2 text-left">日時</th>${showWho ? '<th class="text-left">営業</th>' : ''}<th class="text-left">お客様</th><th class="text-left">商材</th><th class="text-left">結果</th><th class="text-right pr-3">買取金額</th></tr></thead>
      <tbody>${recs.map((r) => `<tr class="border-t align-top">
        <td class="p-2 whitespace-nowrap">${r.date.getMonth() + 1}/${r.date.getDate()} ${r.time}</td>${showWho ? `<td class="whitespace-nowrap">${esc(userById(r.userId).name)}</td>` : ''}
        <td class="whitespace-nowrap">${esc(r.customer)} 様</td><td>${esc(r.items)}</td>
        <td><span class="rounded px-2 py-0.5 text-xs font-bold whitespace-nowrap ${RESULTS[r.result].cls}">${RESULTS[r.result].label}</span>${r.note ? `<div class="text-xs text-slate-500">${esc(r.note)}</div>` : ''}</td>
        <td class="text-right pr-3 font-bold whitespace-nowrap">${r.amount ? yen(r.amount) : '-'}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="text-slate-400 text-center py-8">この期間の訪問はありません</p>'}`,
  };
}
