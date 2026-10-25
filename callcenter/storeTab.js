// コールセンター「来店予約」タブ。店舗への来店予約を受ける（訪問買取の「仮確定・確定・配車」はない。店舗と日時だけを決め、店舗の画面に出る）。
// 表示は純関数（storeTabHtml）、状態と操作は createStoreTab で持つ。
import { esc, yen } from '../src/format.js';
import { helpIcon } from '../src/help.js';
import { activeStores, storeLabel, storeNameOf, loadStores } from '../src/stores.js';
import { loadStoreVisits, saveStoreVisits, reserveVisit, cancelVisit, upcomingReservations } from '../src/storeVisits.js';
import { customerProfile, purchaseSummary } from '../src/customerHistory.js';
import { custRankBadge, troubleBadge, cooloffBadge } from '../src/customerProfileView.js';
import { ymdOf } from '../src/reservations.js';
import { CANCEL_REASONS } from './master.js';

const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
const dayLabel = (key) => { const d = new Date(`${key}T00:00:00`); return `${d.getMonth() + 1}/${d.getDate()}（${WEEK[d.getDay()]}）`; };
const REASON_TEXT = { noStore: '店舗を選んでください', noName: 'お名前を入力してください', noPhone: '電話番号を入力してください', badDate: '来店の日は、今日以降の日付を選んでください', badTime: '来店の時刻を選んでください', noReason: '理由を選んでください', notFound: '対象の予約が見つかりません', badStatus: 'この予約は、すでに来店・取消されています' };

export const blankStoreForm = (storeId = '', date = '') => ({ storeId, date, time: '14:00', name: '', kana: '', phone: '', wants: '' });

// 営業時間内の30分刻み（10:00〜18:30）
const TIMES = Array.from({ length: 18 }, (_, i) => `${String(10 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);

// 電話番号に当たる過去のお客様（なければ空）。ランク・厄介度・買取の実績を添える
export function pastCustomerHtml(phone) {
  if (String(phone ?? '').replace(/\D/g, '').length < 10) return '';
  const s = purchaseSummary([phone]);
  if (!s.count) return '<div class="text-xs text-slate-500">この電話番号の、過去の買取は見つかりません（初めてのお客様）</div>';
  const p = customerProfile([phone]);
  return `<div class="text-xs rounded bg-indigo-50 border border-indigo-200 p-2 flex flex-wrap items-center gap-2"><b class="text-indigo-800">過去のお客様</b>買取 ${s.count}回・総額 ${yen(s.total)}${custRankBadge(p)}${troubleBadge(p)}${cooloffBadge(p)}</div>`;
}

function formHtml(f, stores) {
  return `<section class="rounded-xl border bg-white p-4 space-y-3">
    <h2 class="font-bold">来店予約の受付${helpIcon('お客様が、店舗に買取希望品を持ち込む予約です。訪問買取と違い、エリアの判定・担当営業の割り当て・配車はありません。店舗と日時を決めると、店舗の画面の「来店」に出ます（仮確定・確定の区別はありません）。')}</h2>
    <div class="grid sm:grid-cols-4 gap-3">
      <label class="text-sm font-bold">店舗<select class="inp mt-1 font-normal" data-st="storeId">${stores.map((s) => `<option value="${esc(s.id)}" ${s.id === f.storeId ? 'selected' : ''}>${esc(storeLabel(s))}</option>`).join('')}</select></label>
      <label class="text-sm font-bold">来店の日<input type="date" class="inp mt-1 font-normal" data-st="date" value="${esc(f.date)}" min="${esc(ymdOf(new Date()))}" /></label>
      <label class="text-sm font-bold">時刻<select class="inp mt-1 font-normal" data-st="time">${TIMES.map((t) => `<option ${t === f.time ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="text-sm font-bold">電話番号<span class="text-rose-600">＊</span><input class="inp mt-1 font-normal" data-st="phone" value="${esc(f.phone)}" placeholder="090-0000-0000" inputmode="tel" /></label>
      <label class="text-sm font-bold">お名前<span class="text-rose-600">＊</span><input class="inp mt-1 font-normal" data-st="name" value="${esc(f.name)}" placeholder="例: 山田 花子" /></label>
      <label class="text-sm font-bold">フリガナ<input class="inp mt-1 font-normal" data-st="kana" value="${esc(f.kana)}" placeholder="ヤマダ ハナコ" /></label>
      <label class="text-sm font-bold sm:col-span-2">売りたいもの<input class="inp mt-1 font-normal" data-st="wants" value="${esc(f.wants)}" placeholder="例: 腕時計 2本、ブランドバッグ" /></label>
    </div>
    <div id="st-hint">${pastCustomerHtml(f.phone)}</div>
    <button class="b b-pri" data-st-save>予約を受け付ける</button>
  </section>`;
}

function listHtml(upcoming, stores) {
  if (!upcoming.length) return '<p class="text-sm text-slate-500 py-4 text-center">来店予約は、ありません</p>';
  const days = [...new Set(upcoming.map((v) => v.date))];
  return days.map((day) => `<div class="space-y-1"><div class="font-bold text-sm border-b pb-0.5">${dayLabel(day)}</div>
    ${upcoming.filter((v) => v.date === day).map((v) => `<div class="rounded-lg border bg-white p-2 flex flex-wrap items-center gap-3">
      <b class="w-12">${esc(v.time)}</b><span class="rounded bg-indigo-100 text-indigo-800 text-xs font-bold px-2 py-0.5">${esc(storeNameOf(v.storeId, stores))}</span>
      <span class="font-bold">${esc(v.customer.name)} 様</span><span class="text-xs text-slate-500">📞 ${esc(v.customer.phone)}${v.wants ? ` ／ ${esc(v.wants)}` : ''} ／ 受付: ${esc(v.createdBy)}</span>
      <span class="ml-auto flex items-center gap-1"><select class="inp !w-40 !py-1 text-xs" data-st-reason="${esc(v.id)}">${CANCEL_REASONS.map((r) => `<option>${esc(r)}</option>`).join('')}</select><button class="b b-sec !min-h-0 !py-1 !px-3 text-xs text-rose-700" data-st-cancel="${esc(v.id)}">取消</button></span></div>`).join('')}</div>`).join('');
}

// ctx: { form, stores（全店舗）, upcoming }
export function storeTabHtml({ form, stores, upcoming }) {
  const active = activeStores(stores);
  return `<div class="p-4 space-y-4 max-w-5xl mx-auto">${formHtml(form, active)}
    <section class="space-y-2"><h2 class="font-bold">これからの来店予約 <span class="text-slate-500 text-sm">${upcoming.length}件</span></h2><div data-st-list>${listHtml(upcoming, stores)}</div></section></div>`;
}

export function createStoreTab({ operator, rerender, flash }) {
  const today = () => ymdOf(new Date());
  let form = blankStoreForm(activeStores(loadStores())[0]?.id ?? '', today());
  const opts = () => ({ storeIds: activeStores(loadStores()).map((s) => s.id), now: Date.now() });
  const commit = (r) => { if (!r.ok) { alert(REASON_TEXT[r.reason] ?? '操作できませんでした'); return false; } return saveStoreVisits(r.list) || (alert('保存できませんでした（容量超過）'), false); };
  return {
    html: () => storeTabHtml({ form, stores: loadStores(), upcoming: upcomingReservations(loadStoreVisits(), today()) }),
    // クリック（data-st-...）。el は押したボタン。扱ったら true
    click(d, el) {
      if ('stSave' in d) {
        const r = reserveVisit(loadStoreVisits(), { ...form, by: operator() }, opts());
        if (commit(r)) { flash(`${r.visit.customer.name} 様の来店予約を受け付けました（${storeNameOf(r.visit.storeId, loadStores())} ${r.visit.time}）`); form = blankStoreForm(form.storeId, form.date); rerender(); }
        return true;
      }
      if (d.stCancel) {
        const reason = el?.parentElement?.querySelector('select')?.value; // 同じ行の、理由の選択肢
        if (commit(cancelVisit(loadStoreVisits(), d.stCancel, reason, operator(), opts()))) rerender();
        return true;
      }
      return false;
    },
    // 入力。扱ったら true（入力中は作り直さない。過去のお客様の表示だけ更新する）
    input(e) {
      const k = e.target.dataset?.st;
      if (!k) return false;
      form = { ...form, [k]: e.target.value };
      if (k === 'phone') { const hint = globalThis.document?.querySelector('#st-hint'); if (hint) hint.innerHTML = pastCustomerHtml(form.phone); }
      return true;
    },
  };
}
