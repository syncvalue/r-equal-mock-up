// 査定部「査定」の画面。鑑定士が登録した高額品（紫・赤のシール）を、郵送で受け取り、シールのQRを読み取って登録内容を確認し、確定する。
// 画面の部品だけ（状態は honsha.js が持つ）。確定の判定は src/unitAppraisal.js。
import { yen, fmtTime, esc } from '../src/format.js';
import { RANKS } from '../src/data.js';
import { photoOf } from '../src/image.js';
import { USERS } from '../src/dashboard.js';
import { appraisalStatus, appraisalQueue } from '../src/unitAppraisal.js';
import { moneyInputHtml } from '../src/moneyInput.js';
import { helpIcon } from '../src/help.js';
import { sealBadge } from '../warehouse/ui.js';

export const AP_FILTERS = [['pending', '査定待ち'], ['confirmed', '確定済み']];
const STATUS = { pending: ['査定待ち', 'bg-amber-100 text-amber-800'], confirmed: ['確定済み', 'bg-teal-100 text-teal-700'] };
const FIELD_LABEL = { name: '商品名', rank: 'ランク', price: '金額（1点）' };
const staffName = (u) => USERS.find((x) => x.id === u.userId)?.name ?? '';
const dateTime = (ms) => `${fmtTime(ms)}`;
const statusBadge = (s) => `<span class="rounded px-2 py-0.5 text-xs font-bold whitespace-nowrap ${STATUS[s][1]}">${STATUS[s][0]}</span>`;
const changeText = (c) => `${FIELD_LABEL[c.field]}: ${c.field === 'price' ? `${yen(c.from)} → ${yen(c.to)}` : `${esc(c.from)} → ${esc(c.to)}`}`;

// 左: 査定の一覧（査定待ち／確定済み）。選ぶと、読み取ったのと同じ確認の画面が開く
function listPane({ units, master, filter, code }) {
  const rows = appraisalQueue(units, master, filter);
  const count = (f) => appraisalQueue(units, master, f).length;
  return `
  <aside class="bg-white border-r overflow-y-auto">
    <div class="p-3 border-b bg-slate-50 space-y-2">
      <div class="flex items-center justify-between"><b>査定の一覧</b>${helpIcon('紫・赤のシールの商品が対象です。鑑定士（一般）が登録した内容を、査定員が確認して確定します。')}</div>
      <div class="flex gap-1">${AP_FILTERS.map(([k, l]) => `<button class="flex-1 rounded border px-2 py-1 text-sm font-bold ${filter === k ? 'bg-teal-700 text-white border-teal-700' : 'bg-white'}" data-ap-filter="${k}">${l} ${count(k)}</button>`).join('')}</div>
    </div>
    ${rows.length ? rows.map((u) => `
    <button class="w-full text-left p-3 border-b hover:bg-slate-50 ${u.code === code ? 'bg-slate-100' : ''}" data-ap-open="${esc(u.code)}">
      <div class="flex justify-between items-center gap-2"><b class="truncate">${esc(u.name)}</b>${sealBadge(u)}</div>
      <div class="text-xs text-slate-500">${esc(u.customerName)} 様 ／ 鑑定士 ${esc(staffName(u))} ／ ${esc(u.category)}</div>
      <div class="flex justify-between items-center text-sm mt-1"><span class="font-mono text-xs">${esc(u.code)}</span><span class="font-bold">${yen(u.price)}</span></div>
    </button>`).join('') : `<div class="p-6 text-slate-400 text-sm space-y-3"><p>${filter === 'pending' ? '査定待ちの商品はありません' : '確定済みの商品はまだありません'}</p>${filter === 'pending' ? '<button class="demo-only" data-ap-demo>デモ用の査定待ちを入れる</button>' : ''}</div>`}
  </aside>`;
}

// 読み取り（シールNo.の入力・カメラ）
function scanPane({ ap }) {
  return `
  <div class="rounded-lg border bg-white p-4 space-y-2">
    <div class="font-bold">シールを読み取る${helpIcon('郵送で届いた商品を開封し、貼ってあるシールのQRを読み取ってください。登録された内容が出ます。カメラが使えないときは、シールNo.を入力してEnterを押します。')}</div>
    <div class="flex flex-wrap items-center gap-2">
      <input class="inp !w-64 font-mono" data-ap="raw" value="${esc(ap.raw)}" placeholder="QR読取／シールNo.＋Enter" autocomplete="off" />
      <button class="b b-pri" data-ap-scan>確認する</button>
      <button class="b b-pri !bg-teal-700" data-ap-cam>カメラで読み取る</button>
    </div>
    ${ap.message ? `<div class="rounded px-3 py-2 text-sm font-bold ${ap.message.ok ? 'bg-teal-50 text-teal-800 border border-teal-300' : 'bg-rose-50 text-rose-700 border border-rose-300'}">${ap.message.ok ? '✓' : '⚠'} ${esc(ap.message.text)}</div>` : ''}
  </div>`;
}

const info = (k, v) => `<div><div class="text-xs text-slate-500">${k}</div><div class="font-bold">${v}</div></div>`;

// 確認する商品: 鑑定士が登録した内容（読むだけ）→ 確認・訂正 → 確定
function checkPane({ unit, master, ap }) {
  const status = appraisalStatus(unit, master);
  const done = status === 'confirmed';
  const rankOptions = RANKS.map((r) => `<option value="${r.value}" ${ap.rank === r.value ? 'selected' : ''}>${esc(r.label)}</option>`).join('');
  const changed = ap.name.trim() !== unit.name || ap.rank !== unit.rank || ap.price !== unit.price;
  return `
  <div class="rounded-lg border-2 ${done ? 'border-teal-300' : 'border-amber-400'} bg-white p-4 space-y-4">
    <div class="flex items-start justify-between gap-3"><div><div class="text-xl font-bold">${esc(unit.name)}</div>
      <div class="text-sm text-slate-500">${esc(unit.code)} ／ ${sealBadge(unit)}</div></div>${statusBadge(status)}</div>
    <section class="space-y-2"><h3 class="text-sm font-bold text-slate-700">鑑定士が登録した内容</h3>
      <div class="flex gap-4"><img src="${photoOf(unit)}" alt="${esc(unit.name)}" class="h-28 w-28 object-cover rounded border bg-slate-100 ${unit.photo ? '' : 'opacity-60'}" />
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm flex-1">
          ${info('お客様', `${esc(unit.customerName)} 様`)}${info('鑑定士', esc(staffName(unit)))}${info('買取日', esc(unit.date))}
          ${info('カテゴリ', esc(unit.category))}${info('ランク', esc(unit.rank))}${info('金額（1点）', yen(unit.price))}
        </div></div></section>
    ${done ? `<section class="rounded bg-teal-50 border border-teal-200 p-3 text-sm space-y-1">
        <div class="font-bold text-teal-800">✓ 査定を確定しました（${esc(unit.appraisal.by)}・${dateTime(unit.appraisal.at)}）</div>
        ${unit.appraisal.changes.length ? `<div class="text-slate-700">鑑定士の登録から訂正した内容<ul class="list-disc ml-5">${unit.appraisal.changes.map((c) => `<li>${changeText(c)}</li>`).join('')}</ul></div>` : '<div class="text-slate-700">登録内容のとおり、確定しました。</div>'}</section>`
      : `<section class="space-y-3"><h3 class="text-sm font-bold text-slate-700">内容を確認して、確定する${helpIcon('実物と登録内容を見比べてください。違っていれば、ここで直します（直した内容は、記録に残ります）。')}</h3>
        <div class="grid sm:grid-cols-3 gap-3">
          <label class="block text-sm font-bold sm:col-span-3">商品名<input class="inp mt-1 font-normal" data-ap="name" value="${esc(ap.name)}" /></label>
          <label class="block text-sm font-bold">ランク<select class="inp mt-1 font-normal" data-ap="rank">${rankOptions}</select></label>
          <div class="block text-sm font-bold sm:col-span-2">金額（1点あたり）<div class="mt-1 font-normal">${moneyInputHtml({ attrs: 'data-ap="price"', value: ap.price, placeholder: '円', cls: 'inp' })}</div></div>
        </div>
        <div class="text-sm text-slate-600">${changed ? '<b class="text-amber-800">登録内容から訂正があります。</b>' : '登録内容のままです。'}　（シール1枚＝1点。数量が複数の商品は、1点ずつ確認します）</div>
        <button class="b b-pri w-full" data-ap-confirm>この内容で、査定を確定する</button></section>`}
  </div>`;
}

export function appraisalTab({ units, master, filter, ap }) {
  const unit = ap.code ? units.find((u) => u.code === ap.code) : null;
  return `
  <div class="grid grid-cols-[22rem_1fr] h-full min-h-0">
    ${listPane({ units, master, filter, code: ap.code })}
    <main class="p-5 overflow-y-auto space-y-4">
      ${scanPane({ ap })}
      ${unit ? checkPane({ unit, master, ap }) : '<p class="text-slate-400 p-10 text-center">シールを読み取るか、左の一覧から商品を選んでください</p>'}
    </main>
  </div>`;
}
