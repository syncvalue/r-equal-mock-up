// 今日の予定（Googleカレンダー風の3日表示）と、訪問先までのルート確認（Googleマップ）。
import { esc, yen, fmtTime } from './format.js';
import { helpIcon } from './help.js';
import { loadLive, loadEvals } from './store.js';
import { outcomeOf } from './workday.js';
import { EVENTS, OFFICE, eventById, eventsOfDay, dayDate, toMin } from './schedule.js';
import { legsOf, mapEmbedUrl, mapOpenUrl } from './route.js';
import { historyOf, customerProfile, declinedList } from './customerHistory.js';
import { salesCustomerCard, salesDeclinedCard, customerMarks } from './customerProfileView.js';
import { repeatBadge, pastEvalView } from './customerHistoryView.js';
import { hearingRows, hearingMeta } from './hearingView.js';
import { evalOfVisit, evalStatus, pendingEvalCount } from './visitEval.js';

const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
const HOUR_FROM = 8;
const HOUR_TO = 20;
const HOUR_H = 44;
const city = (addr) => (addr.match(/^.{2,3}[都道府県](.+?[市区町村])/)?.[1] ?? addr.slice(0, 6));
const isVisiting = (s) => Boolean(s.visitStartedAt && !s.visitEndedAt);

// 訪問が終わった予定の、訪問の記録（最新のもの）。本社と共有している訪問状況から探す
// 前日までの予定は、あらかじめ持っている実績（e.past）から作る
const pastVisitOf = (e) => {
  const base = dayDate(e.day).getTime();
  return { visitId: `past-${e.id}`, startedAt: base + toMin(e.start) * 60000, endedAt: base + toMin(e.end) * 60000, items: e.past.items, outcome: e.past.outcome ?? null, briefing: e.past.propose ? { propose: e.past.propose } : null, eval: e.past.eval ?? null, updatedAt: base };
};
const doneVisitOf = (s, e) => e.past ? pastVisitOf(e) :
  Object.values(loadLive()).filter((v) => v.eventId === e.id && (v.userId ?? 'u01') === s.user && v.endedAt).sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;

// 予定表での見た目（今日の予定のみ、状況で色分け）。todo=まだ訪問していない／visiting=訪問中／done=完了
const BLOCK = {
  todo: { box: 'bg-white border-teal-600', text: 'text-slate-800', badge: '<span class="rounded px-1 text-[10px] font-bold border border-teal-600 text-teal-700 bg-teal-50">未訪問</span>' },
  visiting: { box: 'bg-emerald-100 border-emerald-600 ring-2 ring-emerald-400', text: 'text-emerald-900', badge: '<span class="rounded px-1 text-[10px] font-bold bg-emerald-600 text-white animate-pulse">● 訪問中</span>' },
  done: { box: 'bg-slate-200 border-slate-400 opacity-80', text: 'text-slate-500', badge: '<span class="rounded px-1 text-[10px] font-bold bg-slate-600 text-white">✓ 完了</span>' },
};
// 訪問が完了した予定（昨日・今日）と、その訪問の記録の組。お客様の評価の登録状況を見るのに使う
const doneVisitsOf = (s) => [-1, 0].flatMap((n) => eventsOfDay(n, s.user).map((e) => ({ e, v: doneVisitOf(s, e) }))).filter((x) => x.v);
const evalPendingOf = (s, e, evals) => { const v = doneVisitOf(s, e); return Boolean(v) && evalStatus(v, evals) === 'pending'; };

// 評価のモーダルを開くための情報（予定の訪問が完了していて、評価の対象のときだけ）
export function evalTargetOf(s, eventId) {
  const e = eventById(eventId);
  const v = e && doneVisitOf(s, e);
  if (!v || v.outcome) return null;
  return { visitId: v.visitId, startedAt: v.startedAt, customer: { name: e.customer.name, phone: e.customer.phone }, existing: evalOfVisit(v, loadEvals()) };
}

const visitStateOf = (s, e) => (doneVisitOf(s, e) ? 'done' : s.visitEventId === e.id && isVisiting(s) ? 'visiting' : 'todo');

function eventBlock(s, e, dayN, evals) {
  const top = ((toMin(e.start) - HOUR_FROM * 60) / 60) * HOUR_H;
  const h = Math.max(28, ((toMin(e.end) - toMin(e.start)) / 60) * HOUR_H - 2);
  const sel = s.sched.sel === e.id;
  const base = dayN <= 0 ? BLOCK[visitStateOf(s, e)] : null; // 昨日の実績は完了、今日は状況で色分け、明日は予定のまま
  const pending = Boolean(base) && evalPendingOf(s, e, evals); // 訪問が完了しても、お客様の評価が未登録なら目立たせる
  const st = pending ? { box: 'bg-rose-50 border-rose-600 ring-2 ring-rose-400', text: 'text-rose-900', badge: '<span class="rounded px-1 text-[10px] font-bold bg-rose-600 text-white animate-pulse">★ 評価未登録</span>' } : base;
  return `
  <button class="absolute left-1 right-1 rounded-md border-l-[6px] px-1.5 py-1 text-left overflow-hidden leading-tight ${st ? `${st.box} ${st.text}` : 'bg-indigo-50 border-indigo-500'} ${sel ? 'outline outline-2 outline-offset-1 outline-teal-500 shadow-lg' : 'shadow'}"
    style="top:${top}px;height:${h}px" data-action="sched-select" data-id="${e.id}">
    <span class="flex items-center gap-1 text-[11px] text-slate-500">${e.start}–${e.end}${st ? st.badge : ''}</span>
    <span class="block font-bold text-sm truncate">${esc(e.customer.name)} 様${historyOf(e.customer).isRepeat ? ' <span class="text-[10px] font-bold rounded bg-indigo-600 text-white px-1">🔁</span>' : ''}${customerMarks(customerProfile([e.customer.phone, e.customer.phone2]))}</span>
    ${h > 48 ? `<span class="block text-xs text-slate-600 truncate">📍 ${esc(city(e.customer.address))}</span><span class="block text-xs text-slate-500 truncate">${esc(e.items)}</span>` : ''}
  </button>`;
}

// 訪問が終わった予定をタップしたときの、訪問結果
function resultPanel(s, e, v, evals) {
  const d = dayDate(e.day);
  const sold = v.items.filter((i) => i.sell);
  const skipped = v.items.filter((i) => !i.sell);
  const ev = evalOfVisit(v, evals);
  const filled = evalStatus(v, evals) === 'done';
  const mins = Math.max(1, Math.round((v.endedAt - v.startedAt) / 60000));
  const row = (k, val) => `<div class="flex gap-2"><dt class="w-20 text-slate-500 shrink-0">${k}</dt><dd class="flex-1">${val}</dd></div>`;
  return `
  <div class="card !p-4 space-y-3">
    <div><div class="text-xs text-slate-500">${d.getMonth() + 1}/${d.getDate()}（${WEEK[d.getDay()]}）${e.start}–${e.end}</div>
      <h3 class="text-xl font-bold flex items-center gap-2 flex-wrap">${esc(e.customer.name)} 様
        <span class="text-xs font-bold rounded-full px-2 py-0.5 ${v.outcome ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}">✓ ${v.outcome ? esc(outcomeOf(v.outcome.type).label) : '訪問完了'}</span></h3></div>
    <dl class="text-sm space-y-1.5">
      ${row('訪問時間', `${fmtTime(v.startedAt).slice(0, 5)}〜${fmtTime(v.endedAt).slice(0, 5)}（${mins}分）`)}
      ${v.outcome
        ? `${row('結果', `<b>${esc(outcomeOf(v.outcome.type).label)}</b>${helpIcon('買取なし。業績には影響しません。')}${v.outcome.date || v.outcome.time ? `　希望日時 ${esc(v.outcome.date)} ${esc(v.outcome.time)}` : ''}`)}
           ${v.outcome.memo ? row('メモ', `<span class="rounded bg-slate-50 px-2 py-1 block whitespace-pre-wrap">${esc(v.outcome.memo)}</span>`) : ''}
           `
        : `${row('買取', sold.length ? `<div class="text-right"><b class="text-xl text-teal-700">${yen(sold.reduce((n, i) => n + i.price, 0))}</b>　${sold.reduce((n, i) => n + i.qty, 0)}点</div>` : '<span class="text-slate-500">買取なし</span>')}
           ${sold.length ? `<div class="rounded-lg border divide-y text-sm">${sold.map((i) => `<div class="flex justify-between gap-2 px-2 py-1"><span class="min-w-0 truncate">${esc(i.name)}<span class="text-xs text-slate-400"> ランク${esc(i.rank)}・${i.qty}点</span></span><b class="shrink-0">${yen(i.price)}</b></div>`).join('')}</div>` : ''}
           ${skipped.length ? `<div class="text-xs text-slate-400">見送り：${skipped.map((i) => esc(i.name)).join('、')}</div>` : ''}
           ${v.briefing?.propose ? row('他商品の提案', v.briefing.propose === 'yes' ? '提案してよい（お客様の回答）' : '提案は不要（お客様の回答）') : ''}
           ${row('お客様評価', filled ? `<span class="text-amber-500 text-lg">${'★'.repeat(ev.overall)}</span><span class="text-slate-300 text-lg">${'★'.repeat(5 - ev.overall)}</span>${ev.memo ? `<span class="block text-xs text-slate-500 whitespace-pre-wrap">${esc(ev.memo)}</span>` : ''}<button class="text-xs underline text-teal-700 mt-1" data-action="eval-open" data-id="${e.id}">評価を修正する</button>` : '<b class="text-rose-600">未登録</b>')}`}
    </dl>
    ${!v.outcome && !filled ? `<button class="btn w-full !min-h-[52px] !py-2 bg-rose-600 text-white font-bold animate-pulse" data-action="eval-open" data-id="${e.id}">⭐ お客様の評価を登録する</button><p class="text-xs text-rose-700 -mt-1">訪問が終わったら、お客様の評価を登録してください（お客様には見せません）。</p>` : ''}
  </div>`;
}

function detailPanel(s, evals) {
  const e = eventById(s.sched.sel);
  if (!e) return '<div class="card !p-4 text-slate-400 text-center">予定をタップすると詳細が出ます。</div>';
  const doneVisit = doneVisitOf(s, e);
  if (doneVisit) return resultPanel(s, e, doneVisit, evals);
  const d = dayDate(e.day);
  const visiting = isVisiting(s);
  const h = historyOf(e.customer);
  return `
  <div class="card !p-4 space-y-3">
    <div><div class="text-xs text-slate-500">${d.getMonth() + 1}/${d.getDate()}（${WEEK[d.getDay()]}）${e.start}–${e.end}</div>
      <h3 class="text-xl font-bold flex items-center gap-2 flex-wrap">${esc(e.customer.name)} 様 ${repeatBadge(h)}</h3></div>
    ${salesCustomerCard(customerProfile([e.customer.phone, e.customer.phone2]))}
    ${salesDeclinedCard(declinedList([e.customer.phone, e.customer.phone2]))}
    ${h.isRepeat ? `<details class="rounded-xl border border-indigo-200 bg-indigo-50/50 px-3 py-2"><summary class="cursor-pointer text-sm font-bold">⭐ 過去の評価を見る${h.latestEval ? `<span class="ml-1 text-amber-500">${'★'.repeat(h.latestEval.overall)}</span>` : ''}${(h.latestEval?.flags ?? []).includes('クレーム注意') ? '<span class="ml-1 text-xs rounded bg-rose-600 text-white px-1.5">クレーム注意</span>' : ''}</summary><div class="mt-2">${pastEvalView(h)}</div></details>` : ''}
    <dl class="text-sm space-y-1.5">
      <div class="flex gap-2"><dt class="w-16 text-slate-500 shrink-0">住所</dt><dd class="font-bold">${esc(e.customer.address)}</dd></div>
      <div class="flex gap-2"><dt class="w-16 text-slate-500 shrink-0">電話</dt><dd><a class="text-teal-700 underline font-bold" href="tel:${esc(e.customer.phone)}">${esc(e.customer.phone)}</a>${e.customer.phone2 ? ` ／ <a class="text-teal-700 underline font-bold" href="tel:${esc(e.customer.phone2)}">${esc(e.customer.phone2)}</a>` : ''}</dd></div>
      <div class="flex gap-2"><dt class="w-16 text-slate-500 shrink-0">商材</dt><dd>${esc(e.items)}</dd></div>
    </dl>
    <div class="rounded-xl border p-2.5"><div class="font-bold text-sm">📞 受電時のヒアリング</div><div class="text-[11px] text-slate-400">${hearingMeta(e)}</div>
      <dl class="text-sm divide-y">${hearingRows(e, { stack: true })}</dl></div>
    ${visiting ? '<p class="text-xs text-amber-700 font-bold">別の訪問中です。終了後に開始できます。</p>' : ''}
    <button class="btn btn-primary w-full !py-3" data-action="start-from-event" data-id="${e.id}" ${visiting ? 'disabled' : ''}>▶ この訪問を開始（現地買取へ）</button>
    <div class="grid grid-cols-2 gap-2">
      <button class="btn btn-secondary !py-2 !px-2 !min-h-[48px] whitespace-nowrap text-sm" data-action="route-for" data-day="${e.day}" data-id="${e.id}">🚗 ルート確認</button>
      <a class="btn btn-secondary !py-2 !px-2 !min-h-[48px] whitespace-nowrap text-sm text-center flex items-center justify-center" target="_blank" rel="noopener" href="${esc(mapOpenUrl(OFFICE, [e]))}">🗺 マップで開く</a>
    </div>
  </div>`;
}

// 評価が未登録の訪問があるとき、予定表の上に出す帯。名前をタップすると、評価のモーダルが開く
function pendingEvalBanner(s, evals) {
  const list = doneVisitsOf(s).filter(({ v }) => evalStatus(v, evals) === 'pending');
  if (!list.length) return '';
  return `<div class="flex items-center gap-2 flex-wrap bg-rose-50 border-b-2 border-rose-400 px-3 py-2">
    <span class="font-bold text-sm text-rose-700">⭐ お客様の評価が未登録です（${pendingEvalCount(list.map((x) => x.v), evals)}件）</span>
    ${list.map(({ e }) => `<button class="rounded-full bg-rose-600 text-white text-xs font-bold px-3 min-h-[36px] animate-pulse" data-action="eval-open" data-id="${e.id}">${esc(e.customer.name)} 様 ${e.start}</button>`).join('')}</div>`;
}

function calendarBody(s) {
  const now = new Date();
  const evals = loadEvals();
  const days = [-1, 0, 1].map((n) => ({ n, date: dayDate(n, now), events: eventsOfDay(n, s.user) })); // 前日（実績）・今日・明日
  const hours = Array.from({ length: HOUR_TO - HOUR_FROM }, (_, i) => HOUR_FROM + i);
  const nowTop = ((now.getHours() * 60 + now.getMinutes() - HOUR_FROM * 60) / 60) * HOUR_H;
  return `
  <div class="flex gap-3 flex-1 min-h-0 portrait:flex-col">
    <div class="card !p-0 flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
      <div class="flex items-center justify-between px-4 py-2 border-b">
        <h2 class="text-xl font-bold">今日の予定</h2>
        <span class="flex items-center gap-2 text-xs text-slate-500">
          <span class="inline-flex items-center gap-1"><span class="w-3 h-3 rounded-sm bg-white border-2 border-teal-600"></span>未訪問</span>
          <span class="inline-flex items-center gap-1"><span class="w-3 h-3 rounded-sm bg-emerald-100 border-2 border-emerald-600"></span>訪問中</span>
          <span class="inline-flex items-center gap-1"><span class="w-3 h-3 rounded-sm bg-slate-200 border-2 border-slate-400"></span>完了</span></span>
        <span class="text-sm text-slate-500">${days[0].date.getMonth() + 1}/${days[0].date.getDate()}〜${days[2].date.getMonth() + 1}/${days[2].date.getDate()}</span></div>
      ${pendingEvalBanner(s, evals)}
      <div class="grid grid-cols-[3.2rem_repeat(3,1fr)] border-b">
        <div></div>
        ${days.map((d) => `<div class="text-center py-1.5 border-l ${d.n === 0 ? 'bg-teal-50/60' : ''}">
          <div class="text-xs ${d.n === 0 ? 'text-teal-700 font-bold' : 'text-slate-500'}">${WEEK[d.date.getDay()]}${{ '-1': '（昨日・実績）', 0: '（今日）', 1: '（明日）' }[d.n]}</div>
          <div class="inline-flex w-9 h-9 items-center justify-center rounded-full text-lg font-bold ${d.n === 0 ? 'bg-teal-600 text-white' : ''}">${d.date.getDate()}</div>
          <div class="text-[11px] text-slate-500">${d.events.length}件</div></div>`).join('')}
      </div>
      <div class="flex-1 min-h-0 overflow-y-auto" data-scroll="cal">
        <div class="grid grid-cols-[3.2rem_repeat(3,1fr)] relative" style="height:${hours.length * HOUR_H}px">
          <div class="relative">${hours.map((h, i) => `<div class="absolute right-1 text-[11px] text-slate-400 -translate-y-1/2" style="top:${i * HOUR_H}px">${i === 0 ? '' : `${h}:00`}</div>`).join('')}</div>
          ${days.map((d) => `<div class="relative border-l" style="background-image:repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR_H - 1}px, rgba(148,163,184,.35) ${HOUR_H - 1}px, rgba(148,163,184,.35) ${HOUR_H}px)">
            ${d.events.map((e) => eventBlock(s, e, d.n, evals)).join('')}
            ${d.n === 0 && nowTop > 0 && nowTop < hours.length * HOUR_H ? `<div class="absolute left-0 right-0 z-10 pointer-events-none" style="top:${nowTop}px"><div class="h-0.5 bg-rose-500"></div><div class="w-2.5 h-2.5 rounded-full bg-rose-500 -mt-1.5 -ml-1"></div></div>` : ''}
          </div>`).join('')}
        </div>
      </div>
    </div>
    <div class="w-80 shrink-0 portrait:w-full portrait:flex-none portrait:max-h-[42%] overflow-y-auto min-h-0" data-scroll="schedDetail">${detailPanel(s, evals)}</div>
  </div>`;
}

// ---- ルート確認 -------------------------------------------------------------
const hhmm = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

// 到着見込みと、予定時刻に対する余裕／遅れ
function arrivalNote(depMin, travelMin, startHHMM) {
  const arrive = depMin + travelMin;
  const diff = toMin(startHHMM) - arrive;
  return `到着見込 ${hhmm(arrive)}　${diff >= 0 ? `<b class="text-emerald-700">予定に間に合います（余裕 ${diff}分）</b>` : `<b class="text-rose-600">予定に ${-diff}分 遅れる見込み</b>`}`;
}

function routeBody(s) {
  const day = s.route.day;
  const stops = eventsOfDay(day, s.user); // 訪問の順番は予定の時刻順で固定
  const cur = s.geo?.ok ? { lat: s.geo.lat, lng: s.geo.lng } : { lat: OFFICE.lat, lng: OFFICE.lng, address: OFFICE.address };
  const curLabel = s.geo?.ok ? '現在地' : s.geo?.pending ? '現在地を取得中…' : '営業所（現在地を取得できないため）';
  const d = dayDate(day);
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const isToday = day === 0;

  const idx = stops.findIndex((e) => e.id === s.route.sel);
  const selStop = idx >= 0 ? stops[idx] : null;
  const prev = idx > 0 ? stops[idx - 1] : null;
  // 2件目以降は、直近の予定の場所から／現在地から を切り替えられる
  const fromPrev = Boolean(prev) && s.route.origin !== 'now';
  const origin = selStop ? (fromPrev ? prev : cur) : cur;
  const mapStops = selStop ? [selStop] : stops;
  const legsAll = legsOf(cur, stops);
  const totalKm = legsAll.reduce((n, l) => n + l.km, 0);
  const totalMin = legsAll.reduce((n, l) => n + l.min, 0);

  const stopRow = (e, i) => `
    <div class="flex items-start gap-2 rounded-lg border-2 p-2 cursor-pointer ${s.route.sel === e.id ? 'border-teal-500 bg-teal-50' : 'border-slate-200'}" data-action="route-sel" data-value="${e.id}">
      <span class="w-7 h-7 rounded-full bg-teal-600 text-white flex items-center justify-center text-sm font-bold shrink-0">${i + 1}</span>
      <div class="text-sm flex-1 min-w-0"><div class="font-bold">${e.start}　${esc(e.customer.name)} 様</div><div class="text-xs text-slate-500 truncate">${esc(e.customer.address)}</div></div>
      <button class="rounded-lg border-2 border-teal-600 text-teal-700 font-bold text-xs px-2 min-h-[40px] shrink-0" data-action="start-from-event" data-id="${e.id}" ${isVisiting(s) ? 'disabled' : ''}>訪問開始</button></div>`;

  // 選択した訪問先へのルート（2件目以降は出発地を切り替えられる）
  let detail = '';
  if (selStop) {
    const fromCur = legsOf(cur, [selStop])[0];
    if (!prev) {
      detail = `<div class="rounded-lg bg-teal-50 p-2 text-sm"><b>現在地 → ${esc(selStop.customer.name)} 様</b>（最初の予定）<div class="text-xs text-slate-600">約${fromCur.km.toFixed(1)}km・${fromCur.min}分${isToday ? `<br>${arrivalNote(nowMin, fromCur.min, selStop.start)}` : ''}</div></div>`;
    } else {
      const fromPrevLeg = legsOf(prev, [selStop])[0];
      const opt = (key, on, title, sub, leg, note) => `
        <button class="w-full text-left rounded-xl border-2 p-2 ${on ? 'border-teal-600 bg-teal-50' : 'border-slate-200'}" data-action="route-origin" data-value="${key}">
          <span class="flex items-center gap-2"><span class="w-5 h-5 rounded-full border-2 flex items-center justify-center ${on ? 'border-teal-600' : 'border-slate-300'}">${on ? '<span class="w-2.5 h-2.5 rounded-full bg-teal-600"></span>' : ''}</span>
            <span class="font-bold text-sm flex-1">${title}</span><span class="text-sm font-bold">約${leg.km.toFixed(1)}km・${leg.min}分</span></span>
          <span class="block text-xs text-slate-500 ml-7">${sub}</span>
          ${note ? `<span class="block text-xs ml-7 mt-0.5">${note}</span>` : ''}</button>`;
      detail = `
        <div class="font-bold text-sm">${esc(selStop.customer.name)} 様 への出発地</div>
        ${opt('prev', fromPrev, '前の予定の場所から', `${prev.end}終了予定：${esc(prev.customer.name)} 様（${esc(city(prev.customer.address))}）`, fromPrevLeg, isToday ? arrivalNote(toMin(prev.end), fromPrevLeg.min, selStop.start) : '')}
        ${opt('now', !fromPrev, '現在地から', esc(curLabel), fromCur, isToday ? arrivalNote(nowMin, fromCur.min, selStop.start) : '')}`;
    }
  }

  return `
  <div class="flex gap-3 flex-1 min-h-0 portrait:flex-col">
    <div class="card !p-3 w-[22rem] shrink-0 portrait:w-full portrait:flex-none portrait:max-h-[48%] flex flex-col gap-2 min-h-0">
      <div class="flex gap-1 items-center">${[0, 1].map((n) => { const dd = dayDate(n); return `<button class="flex-1 py-2 rounded-lg font-bold text-sm ${day === n ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600'}" data-action="route-day" data-value="${n}">${n === 0 ? '今日' : '明日'}<span class="block text-[11px] font-normal">${dd.getMonth() + 1}/${dd.getDate()}（${WEEK[dd.getDay()]}）</span></button>`; }).join('')}${stops.length ? helpIcon('距離・時間は直線距離からの概算です。') : ''}</div>
      <div class="overflow-y-auto min-h-0 flex-1 space-y-1.5" data-scroll="route">
        <div class="flex items-center gap-2 rounded-lg bg-slate-50 p-2 text-sm"><span class="w-6 h-6 rounded-full bg-sky-600 text-white flex items-center justify-center text-xs shrink-0">●</span>
          <div class="min-w-0"><b>現在地</b><div class="text-xs text-slate-500 truncate">${s.geo?.ok ? `${s.geo.lat.toFixed(4)}, ${s.geo.lng.toFixed(4)}` : esc(curLabel)}</div></div></div>
        ${stops.length > 1 ? `<div class="rounded-lg border-2 p-2 text-sm cursor-pointer ${!selStop ? 'border-teal-500 bg-teal-50' : 'border-slate-200'}" data-action="route-sel" data-value="all"><b>全行程を表示</b>
          <span class="text-xs text-slate-500 block">現在地 → ${stops.map((e) => esc(e.customer.name)).join(' → ')}　合計 約${totalKm.toFixed(1)}km・約${totalMin}分</span></div>` : ''}
        ${stops.map(stopRow).join('') || '<p class="text-slate-400 text-center py-6">この日の訪問予定はありません。</p>'}
        ${detail ? `<div class="space-y-1.5 pt-1 border-t-2 border-dashed mt-2">${detail}</div>` : ''}
      </div>
      ${stops.length ? `<a class="btn btn-primary !py-2 !min-h-[48px] text-center flex items-center justify-center" target="_blank" rel="noopener" href="${esc(mapOpenUrl(origin, mapStops))}">🗺 Googleマップで開く（ナビ）</a>` : ''}
    </div>
    <div class="card !p-0 flex-1 min-w-0 min-h-0 overflow-hidden relative">
      ${stops.length
        ? `<iframe title="訪問ルート（${d.getMonth() + 1}/${d.getDate()}）" class="absolute inset-0 w-full h-full border-0" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="${esc(mapEmbedUrl(origin, mapStops))}"></iframe>
           <div class="absolute bottom-2 left-2 right-2 text-center pointer-events-none"><span class="inline-block rounded-full bg-black/60 text-white text-xs px-3 py-1">${selStop ? `${origin === cur ? '現在地' : esc(origin.customer.name)} → ${esc(selStop.customer.name)}` : `現在地 → ${stops.map((e) => esc(e.customer.name)).join(' → ')}`}${helpIcon('地図が表示されない場合は「Googleマップで開く」を使ってください。', 'pointer-events-auto !border-white !text-white')}</span></div>`
        : '<div class="h-full flex items-center justify-center text-slate-400">訪問予定がありません</div>'}
    </div>
  </div>`;
}

// 今日の予定。「予定表」と「ルート（地図）」を切り替える
export function scheduleView(s) {
  const tab = (key, label) => `<button class="flex-1 py-2 rounded-lg font-bold ${s.sched.tab === key ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600'}" data-action="sched-tab" data-value="${key}">${label}</button>`;
  return `
  <section class="h-full min-h-0 p-4 flex flex-col gap-2">
    <div class="flex gap-2 w-80 shrink-0">${tab('calendar', '📅 予定表')}${tab('route', '🚗 ルート確認')}</div>
    ${s.sched.tab === 'route' ? routeBody(s) : calendarBody(s)}
  </section>`;
}
