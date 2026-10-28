// 店舗の「来店」画面。今日の来店（予約・飛び込み）を、待ち・対応中・予約・完了に並べ、飛び込みの受付をする。
import { esc, yen, fmtTime } from '../src/format.js';
import { helpIcon } from '../src/help.js';
import { storeLabel } from '../src/stores.js';
import { STATUS_LABEL } from '../src/storeVisits.js';
import { custRankBadge, troubleBadge, cooloffBadge } from '../src/customerProfileView.js';

export const blankWalkIn = () => ({ name: '', kana: '', phone: '', wants: '' });

const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
export const dayLabel = (key) => { const d = new Date(`${key}T00:00:00`); return `${d.getMonth() + 1}/${d.getDate()}（${WEEK[d.getDay()]}）`; };

export function headerHtml({ store, staff, date, summary, themeHtml }) {
  const chip = (label, value) => `<span class="rounded bg-white/15 px-2 py-0.5 text-xs">${label} <b class="text-sm">${value}</b></span>`;
  return `<header class="bg-indigo-800 text-white px-6 h-[52px] flex justify-between items-center">
    <div class="flex items-center gap-3"><span class="font-bold text-xl">🏬 ${esc(storeLabel(store))}</span><span class="text-xs bg-white/20 rounded px-2 py-0.5">ダミー画面</span><span class="text-sm">${esc(dayLabel(date))}</span>
      ${chip('来店', `${summary.visits}組`)}${chip('買取', `${summary.purchased}件`)}${chip('成約率', summary.done ? `${Math.round(summary.rate * 100)}%` : '-')}${chip('買取額', yen(summary.total))}${helpIcon('来店は、来店済み（待ち・対応中・完了）の組数です。成約率は、完了した来店のうち、買取に至った割合です。取消・来ずは数えません。')}</div>
    <div class="flex items-center gap-3 text-sm"><span>${esc(staff.name)}</span>${themeHtml}<button class="underline text-white/80 text-xs" data-logout>ログアウト</button></div>
  </header>`;
}

const marks = (p) => (p?.known ? `<span class="inline-flex flex-wrap gap-1 ml-1">${custRankBadge(p)}${troubleBadge(p)}${cooloffBadge(p)}</span>` : '');
const btn = (cls, attr, label) => `<button class="b ${cls} !min-h-0 !py-1 !px-3 text-sm" ${attr}>${label}</button>`;

function card(v, { profileOf, tone }) {
  const p = profileOf(v.customer.phone);
  const ops = {
    reserved: `${btn('b-pri', `data-arrive="${esc(v.id)}"`, '来店済みにする')} ${btn('b-sec', `data-start="${esc(v.id)}"`, '対応を始める')} ${btn('b-sec', `data-noshow="${esc(v.id)}"`, '来ず')} ${btn('b-sec text-rose-700', `data-cancel-visit="${esc(v.id)}"`, '取消')}`,
    waiting: `${btn('b-pri', `data-start="${esc(v.id)}"`, '対応を始める')} ${btn('b-sec text-rose-700', `data-cancel-visit="${esc(v.id)}"`, '取消')}`,
    serving: btn('b-pri', `data-open="${esc(v.id)}"`, '買取を続ける'),
    done: '', cancelled: '',
  }[v.status] ?? '';
  const when = v.status === 'reserved' ? `<b>${esc(v.time)}</b> 予約` : v.arrivedAt ? `${fmtTime(v.arrivedAt).slice(0, 5)} 来店${v.source === 'walkin' ? '（飛び込み）' : ''}` : '';
  const result = v.status === 'done' ? (v.result?.type === 'purchased' ? `<span class="rounded bg-emerald-100 text-emerald-800 text-xs font-bold px-2 py-0.5">買取 ${yen(v.result.total)}（${v.result.count}点）</span>` : '<span class="rounded bg-slate-200 text-slate-700 text-xs font-bold px-2 py-0.5">見送り</span>') : '';
  const cancelNote = v.status === 'cancelled' ? `<span class="text-xs text-slate-500">理由: ${esc(v.cancelReason)}（${esc(v.cancelledBy)}）</span>` : '';
  return `<div class="rounded-lg border bg-white p-3 space-y-1 ${tone}">
    <div class="flex flex-wrap items-center gap-2"><b>${esc(v.customer.name)} 様</b>${marks(p)}<span class="text-xs text-slate-500">${when}</span>${v.status === 'serving' ? `<span class="text-xs text-indigo-700 font-bold">対応: ${esc(v.staffName)}</span>` : ''}${result}${v.status === 'noshow' ? '<span class="text-xs text-slate-500">来ず</span>' : ''}</div>
    <div class="text-xs text-slate-600">${v.customer.phone ? `📞 ${esc(v.customer.phone)}` : '電話番号: 未入力'}${v.wants ? ` ／ 売りたいもの: <span class="whitespace-pre-line">${esc(v.wants)}</span>` : ''}${v.source === 'reserved' && v.createdBy ? ` ／ 受付: ${esc(v.createdBy)}` : ''}</div>
    ${cancelNote}${ops ? `<div class="flex flex-wrap gap-2 pt-1">${ops}</div>` : ''}</div>`;
}

const section = (title, list, ctx, tone, empty) => `<section class="space-y-2"><h3 class="font-bold text-sm">${title} <span class="text-slate-500">${list.length}</span></h3>${list.length ? list.map((v) => card(v, { ...ctx, tone })).join('') : `<div class="text-xs text-slate-400">${empty}</div>`}</section>`;

function walkInForm(f) {
  return `<section class="rounded-xl border bg-white p-3 space-y-2">
    <h2 class="font-bold">飛び込みの受付${helpIcon('予約なしで来店されたお客様を、受け付けます。お名前だけで受け付けられます（電話番号は、聞けたら入力。過去のお客様を探す手がかりになります）。受け付けると「待ち」に並びます。')}</h2>
    <div class="grid sm:grid-cols-4 gap-2">
      <label class="text-xs font-bold">お名前<input class="inp mt-1 font-normal" data-w="name" value="${esc(f.name)}" placeholder="例: 鈴木 一郎" /></label>
      <label class="text-xs font-bold">フリガナ<input class="inp mt-1 font-normal" data-w="kana" value="${esc(f.kana)}" placeholder="スズキ イチロウ" /></label>
      <label class="text-xs font-bold">電話番号<input class="inp mt-1 font-normal" data-w="phone" value="${esc(f.phone)}" placeholder="090-0000-0000" inputmode="tel" /></label>
      <label class="text-xs font-bold">売りたいもの<input class="inp mt-1 font-normal" data-w="wants" value="${esc(f.wants)}" placeholder="例: 腕時計 2本" /></label>
    </div>
    <button class="b b-pri" data-walkin>受け付ける</button>
  </section>`;
}

// ctx: { board, walk, profileOf: 電話番号 → お客様の評価 }
export function boardHtml(ctx) {
  const { board } = ctx;
  return `<div class="p-4 space-y-4 max-w-6xl mx-auto">
    ${walkInForm(ctx.walk)}
    <div class="grid lg:grid-cols-3 gap-4">
      ${section('⏳ 待ち', board.waiting, ctx, 'border-amber-300', '待っているお客様は、いません')}
      ${section('🗣 対応中', board.serving, ctx, 'border-indigo-400', '対応中のお客様は、いません')}
      ${section('📅 これから来店の予約', board.reserved, ctx, 'border-sky-300', '今日の予約は、ありません')}
    </div>
    <div class="grid lg:grid-cols-2 gap-4">
      ${section('✅ 完了', board.done, ctx, 'border-emerald-300', 'まだありません')}
      ${section(`🚫 ${STATUS_LABEL.cancelled}・${STATUS_LABEL.noshow}`, board.cancelled, ctx, 'border-slate-300 opacity-80', 'ありません')}
    </div>
  </div>`;
}
