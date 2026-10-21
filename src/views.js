import { PRODUCTS, RANKS } from './data.js';
import { masterBodyView } from './masterView.js';
import { approvalState, latestApproval } from './store.js';
import { themeToggleHtml } from './theme.js';
import { roleLabel, userById } from './dashboard.js';
import { eventById } from './schedule.js';
import { messagesFor, unreadCount } from './messages.js';
import { pendingCount } from './stockView.js';
import { yen, fmtTime, fmtDateTime, fmtElapsed, esc, total } from './format.js';

export const STEPS = ['訪問開始', 'お客様確認', '買取明細', '取捨選択', 'シール紐づけ', 'GMOサイン送信・訪問終了'];

export const selectedItems = (s) => s.items.filter((i) => i.sell);

// 取捨選択で「売る」にした商品ごとの、査定部の承認状態
export const approvalOf = (s, item) => {
  const rec = latestApproval(s.approvals, s.visitId, item.id);
  return { state: approvalState(rec, item), rec };
};
export const allApproved = (s) => selectedItems(s).every((i) => approvalOf(s, i).state === 'ok');

// 実物1点ごとのシール枠（個数分に展開）
export const labelSlots = (s) =>
  selectedItems(s).flatMap((i) =>
    Array.from({ length: i.qty }, (_, k) => ({ key: `${i.id}-${k + 1}`, item: i, n: k + 1 })),
  );
export const codesOf = (s, item) =>
  labelSlots(s).filter((x) => x.item.id === item.id).map((x) => s.labels[x.key]).filter(Boolean);

const STATUS = (s) =>
  s.visitEndedAt
    ? { label: '訪問完了', cls: 'bg-slate-500' }
    : s.visitStartedAt
      ? { label: '訪問中', cls: 'bg-emerald-500' }
      : { label: '訪問前', cls: 'bg-amber-500' };


const unackedComments = (s) => s.comments.filter((c) => !c.ack);

const commentBadge = (s) => {
  if (!s.comments.length) return '';
  const n = unackedComments(s).length;
  return n
    ? `<button class="relative bg-rose-600 rounded-full w-11 h-11 text-2xl font-bold animate-pulse" data-action="open-comments" aria-label="本社からのコメント">❗<span class="absolute -top-1 -right-1 bg-white text-rose-600 text-xs rounded-full min-w-[20px] h-5 flex items-center justify-center">${n}</span></button>`
    : '<button class="bg-slate-700 rounded-full w-11 h-11 text-xl" data-action="open-comments" aria-label="本社からのコメント">💬</button>';
};

// 明細行に出す本社査定の状態
const apTag = (s, itemId) => {
  const list = s.appraisals.filter((a) => a.itemId === itemId);
  if (!list.length) return '';
  if (list.some((a) => a.status === '依頼中')) return '<span class="ml-1 rounded whitespace-nowrap inline-block bg-amber-100 text-amber-800 text-xs font-bold px-2 py-0.5">本社査定中</span>';
  return '<span class="ml-1 rounded whitespace-nowrap inline-block bg-emerald-100 text-emerald-800 text-xs font-bold px-2 py-0.5">本社回答済</span>';
};

const itemWarn = (s, itemId) =>
  s.comments.some((c) => c.itemId === itemId && !c.ack) ? '<span class="text-rose-600 text-xl ml-1" title="本社からのコメント">❗</span>' : '';

// ---- メインメニュー（開閉式ドロワー）。機能の中身は準備中 -------------------------------
export const MENU = [
  { key: 'workday', icon: '⏰', label: '始業・終業', sub: '始業点検・終業の現金締めと日報' },
  { key: 'dashboard', icon: '📊', label: 'ダッシュボード', sub: '本社からのお知らせ・業績の確認' },
  { key: 'schedule', icon: '📅', label: '今日の予定', sub: '3日間の予定・ルート確認・訪問開始' },
  { key: 'visit', icon: '🏠', label: '現地買取', sub: 'お客様の前での買取手続き' },
  { key: 'expense', icon: '💴', label: '経費管理', sub: '所持金・経費の計上（レシート撮影）' },
  { key: 'return', icon: '📦', label: '商品の持ち帰り', sub: '買取商品のQR読取・倉庫への入庫' },
];

const menuBadge = (s) =>
  s.visitStartedAt && !s.visitEndedAt && s.view !== 'visit'
    ? '<span class="absolute top-1 right-1 w-3 h-3 rounded-full bg-emerald-400 border-2 border-slate-900"></span>'
    : '';

// 始業するまで（終業後も）、始業・終業以外の機能は使えない
const WORKDAY_SUB = { before: '始業点検をして、業務を開始します', open: '終業の現金締めと、日報の提出', closed: '本日の日報' };
const isLocked = (s, m) => s.phase !== 'open' && m.key !== 'workday';

export function menuView(s) {
  if (!s.menuOpen) return '';
  const visiting = s.visitStartedAt && !s.visitEndedAt;
  return `
  <div class="fixed inset-0 z-[55]">
    <div class="absolute inset-0 bg-black/50" data-action="close-menu"></div>
    <nav class="absolute inset-y-0 left-0 w-80 max-w-[85vw] bg-slate-900 text-white flex flex-col menu-slide" aria-label="メインメニュー">
      <div class="flex items-center justify-between px-5 py-4 border-b border-white/10">
        <span class="font-bold text-xl">メニュー</span>
        <button class="w-12 h-12 rounded-xl text-2xl hover:bg-white/10" data-action="close-menu" aria-label="メニューを閉じる">✕</button>
      </div>
      <div class="flex-1 overflow-y-auto p-3 space-y-2">
        ${MENU.map((m) => `
        <button class="w-full text-left flex items-center gap-4 rounded-xl px-4 py-3 min-h-[68px] ${s.view === m.key ? 'bg-teal-600' : 'hover:bg-white/10 active:bg-white/20'} ${isLocked(s, m) ? 'opacity-40' : ''}" data-action="nav" data-value="${m.key}" ${isLocked(s, m) ? 'disabled' : ''}>
          <span class="text-3xl">${m.key === 'workday' ? { before: '☀', open: '🌙', closed: '📝' }[s.phase] : m.icon}</span>
          <span class="flex-1"><span class="block font-bold text-lg leading-tight">${m.key === 'workday' ? { before: '始業開始', open: '終業・日報', closed: '本日の日報' }[s.phase] : m.label}</span><span class="text-xs text-slate-300">${m.key === 'workday' ? WORKDAY_SUB[s.phase] : m.sub}</span></span>
          ${m.key === 'workday' && s.phase === 'before' ? '<span class="text-xs font-bold rounded-full bg-amber-500 px-2 py-0.5">未実施</span>' : ''}
          ${isLocked(s, m) ? '<span class="text-lg">🔒</span>' : ''}
          ${m.key === 'visit' && visiting ? `<span class="text-xs font-bold rounded-full bg-emerald-500 px-2 py-0.5">訪問中</span>` : ''}
          ${m.key === 'dashboard' && unreadCount(userById(s.user)) ? `<span class="text-xs font-bold rounded-full bg-rose-600 px-2 py-0.5">未読 ${unreadCount(userById(s.user))}</span>` : ''}
          ${m.key === 'return' && pendingCount(s) ? `<span class="text-xs font-bold rounded-full bg-amber-500 px-2 py-0.5">入庫待ち ${pendingCount(s)}</span>` : ''}
        </button>`).join('')}
      </div>
      <div class="px-5 py-3 text-xs text-slate-400 border-t border-white/10">${esc(userById(s.user).name)}（${roleLabel(userById(s.user))}）</div>
    </nav>
  </div>`;
}

// 準備中の画面（機能の中身は今後）
export function placeholderView(s) {
  const m = MENU.find((x) => x.key === s.view);
  const visiting = s.visitStartedAt && !s.visitEndedAt;
  return `
  <section class="${SEC} flex items-center justify-center">
    <div class="card w-full max-w-2xl space-y-4">
      <div class="flex items-center gap-4"><span class="text-5xl">${m.icon}</span>
        <div><h2 class="text-2xl font-bold">${m.label}</h2><p class="text-slate-500">${m.sub}</p></div>
        <span class="ml-auto rounded-full bg-amber-100 text-amber-800 font-bold px-3 py-1">準備中</span></div>
      <div class="rounded-xl bg-slate-50 border p-4"><div class="font-bold mb-2">予定している機能</div>
        <ul class="list-disc pl-5 space-y-1 text-slate-700">${m.plan.map((t) => `<li>${t}</li>`).join('')}</ul></div>
      ${visiting ? `<button class="btn btn-primary w-full" data-action="nav" data-value="visit">現地買取に戻る（${esc(s.customer.name)} 様 訪問中）</button>` : ''}
    </div>
  </section>`;
}

export function headerView(s) {
  const st = STATUS(s);
  return `
  <header class="shrink-0 bg-slate-900 text-white">
    <div class="flex items-center justify-between px-5 py-2">
      <div class="flex items-center gap-3">
        <button class="relative w-12 h-12 -ml-2 rounded-xl text-3xl leading-none hover:bg-white/10 active:bg-white/20" data-action="open-menu" aria-label="メニューを開く">☰${menuBadge(s)}</button>
        <span class="font-bold text-xl">出張買取</span>
        ${s.view !== 'visit' ? `<span class="text-slate-300">›</span><span class="font-bold">${esc(MENU.find((m) => m.key === s.view)?.label)}</span>` : ''}
        <span class="${st.cls} rounded-full px-3 py-0.5 font-bold text-sm">${st.label}</span>
      </div>
      <div class="flex items-center gap-3 text-sm">
        ${themeToggleHtml()}
        ${commentBadge(s)}
        <span>開始 ${fmtTime(s.visitStartedAt)} ／ 終了 ${fmtTime(s.visitEndedAt)}</span>
        <span class="text-2xl font-mono font-bold" id="timer">${s.visitStartedAt ? fmtElapsed(s.visitStartedAt, s.visitEndedAt ?? Date.now()) : '00:00:00'}</span>
      </div>
    </div>
    ${s.view !== 'visit' ? '' : `<ol class="flex bg-slate-800 text-xs">
      ${STEPS.map((n, i) => `<li class="flex-1 text-center py-1.5 ${i === s.step ? 'bg-teal-600 font-bold' : i < s.step ? 'text-teal-300' : 'text-slate-400'}">${i + 1}. ${n}</li>`).join('')}
    </ol>`}
  </header>`;
}

export function footerView(s) {
  if (s.step === 0 || s.step === 5) return '';
  const ok = canProceed(s);
  return `
  <footer class="shrink-0 bg-white border-t px-5 py-2 flex justify-between items-center">
    <button class="btn btn-secondary w-40" data-action="back">← 戻る</button>
    <span class="text-slate-500">${ok ? '' : hint(s)}</span>
    ${s.step === 4
      ? `<button class="btn btn-primary" data-action="send-gmo" ${ok ? '' : 'disabled'}>確定してGMOサインに送信 →</button>`
      : `<button class="btn btn-primary w-40" data-action="next" ${ok ? '' : 'disabled'}>次へ →</button>`}
  </footer>`;
}

export function canProceed(s) {
  switch (s.step) {
    case 1: return s.customerConfirmed && s.customer.name.trim() !== '' && s.customer.phone.trim() !== '';
    case 2: return s.items.length > 0 && s.items.every((i) => i.price > 0);
    case 3: return selectedItems(s).length > 0 && allApproved(s);
    case 4: return labelSlots(s).every((x) => s.labels[x.key]);
    default: return true;
  }
}

const hint = (s) =>
  ({
    1: 'お客様の確認を行ってください（氏名・電話番号は必須）',
    2: '商品を1点以上追加し、査定金額を入力してください',
    3: '買取するすべての商品に、査定部の承認が必要です（承認待ち）',
    4: 'すべての商品にシールのQRコードを紐づけてください',
  })[s.step] ?? '';


const field = (label, key, value, { type = 'text', placeholder = '', required = false } = {}) => `
  <label class="block">
    <span class="font-bold text-base">${label}${required ? '<span class="text-rose-600 ml-1">必須</span>' : ''}</span>
    <input class="field mt-1" data-field="${key}" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}" />
  </label>`;

const SEC = 'h-full min-h-0 p-4';

export function startView(s) {
  const ev = eventById(s.visitEventId);
  return `
  <section class="h-full flex flex-col items-center justify-center gap-4 p-6">
    <div class="text-6xl">🚗</div>
    <h1 class="text-3xl font-bold">訪問先に到着しましたか？</h1>
    <div class="card !p-4 w-full max-w-md text-center space-y-1">
      <div class="text-xs text-slate-500">${ev ? `予定 ${ev.start}–${ev.end}` : '訪問先'}</div>
      <div class="text-xl font-bold">${esc(s.customer.name)} 様</div>
      <div class="text-sm text-slate-600">📍 ${esc(s.customer.address)}</div>
      ${ev ? `<div class="text-xs text-slate-500">予定の商材：${esc(ev.items)}</div>` : ''}
    </div>
    <p class="text-slate-500">ボタンを押すと訪問開始時刻が記録されます。</p>
    <button class="btn btn-primary text-3xl px-16 py-8" data-action="start">訪問開始</button>
    <button class="text-sm underline text-slate-400" data-action="nav" data-value="schedule">今日の予定に戻る</button>
    <button class="text-sm underline text-slate-400" data-action="reset-all">（デモ用）データを初期化</button>
  </section>`;
}

export function customerView(s) {
  const c = s.customer;
  const call = s.callInfo;
  const row = (k, v) => `<dt class="text-slate-500">${k}</dt><dd class="font-bold">${esc(v) || '-'}</dd>`;
  return `
  <section class="${SEC} flex items-center justify-center">
    <div class="card w-full max-w-3xl space-y-4">
      <div class="flex justify-between items-baseline">
        <h2 class="text-2xl font-bold">お客様のご確認</h2>
        <span class="text-sm text-slate-500">受付 ${esc(call.receptionNo)} ／ ${esc(call.receivedAt)} ／ 担当 ${esc(call.operator)}</span>
      </div>
      <p class="text-slate-600">コールセンターで承った内容です。ご本人であることを確認してください。</p>
      <dl class="grid grid-cols-[8rem_1fr] gap-y-2 text-xl">
        ${row('氏名', c.name)}${row('フリガナ', c.kana)}${row('生年月日', c.birth)}
        ${row('電話番号', c.phone)}${row('住所', `${c.zip} ${c.address}`)}${row('職業', c.occupation)}
      </dl>
      <div class="grid grid-cols-2 gap-4">
        <button class="btn btn-secondary" data-action="edit-customer">相違あり（修正する）</button>
        <button class="btn btn-primary ${s.customerConfirmed ? 'ring-4 ring-teal-300' : ''}" data-action="confirm-customer">
          ${s.customerConfirmed ? '✅ 確認済み' : 'このお客様で間違いありません'}</button>
      </div>
    </div>
  </section>`;
}

export function itemsListView(s) {
  if (!s.items.length) return '<p class="text-slate-400 text-center py-10">左の商品マスターか、AIカメラから追加してください</p>';
  const btn = 'rounded-lg border-2 px-2 min-h-[44px] min-w-[58px] text-sm font-bold leading-tight';
  return s.items
    .map(
      (i) => `
    <div class="flex items-center gap-2 rounded-xl border-2 border-slate-200 pl-3 pr-2 py-1">
      <div class="flex-1 min-w-0 leading-tight">
        <div class="font-bold text-[15px] line-clamp-2">${esc(i.name)}${itemWarn(s, i.id)}</div>
        <div class="text-xs text-slate-500 mt-0.5">ランク${i.rank}・${i.qty}個${apvTag(s, i)}${apTag(s, i.id)}</div>
      </div>
      ${i.price ? `<div class="font-bold text-right whitespace-nowrap">${yen(i.price)}</div>` : '<div class="font-bold text-rose-600 text-sm text-right leading-tight">金額<br>未入力</div>'}
      <button class="${btn} border-slate-300 bg-white text-slate-700" data-action="open-item" data-id="${i.id}" aria-label="詳細を編集">✎<br>編集</button>
      <button class="${btn} border-indigo-600 bg-indigo-600 text-white" data-action="open-appraisal-item" data-id="${i.id}" aria-label="本社に査定依頼">📨<br>査定</button>
    </div>`,
    )
    .join('');
}

export function itemsView(s) {
  return `
  <section class="${SEC} grid grid-cols-2 gap-4">
    <div class="card flex flex-col gap-2 min-h-0 !p-4">
      <button class="btn btn-primary !py-1 !min-h-[48px]" data-action="open-ai">🤖 AIカメラで商品候補を探す</button>
      <div class="relative">
        <input class="field !py-2 pr-12" id="search" type="search" enterkeyhint="search" autocomplete="off" placeholder="🔍 ブランド・商品名・型番で検索" value="${esc(s.search)}" />
        <button id="search-clear" class="${s.search ? '' : 'hidden'} absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 text-2xl text-slate-400" data-action="mclear-search" aria-label="クリア">✕</button>
      </div>
      <div id="master" class="flex flex-col gap-2 min-h-0 flex-1">${masterBodyView(s)}</div>
    </div>
    <div class="card flex flex-col gap-2 min-h-0 !p-4">
      <h2 class="text-xl font-bold">買取明細 </h2>
      <div class="space-y-1.5 overflow-y-auto min-h-0 flex-1" data-scroll="items">${itemsListView(s)}</div>
      <div class="flex justify-between items-center border-t-2 pt-2">
        <span class="font-bold">合計（${s.items.reduce((n, i) => n + i.qty, 0)}点）</span>
        <span class="text-3xl font-bold text-teal-700">${yen(total(s.items))}</span>
      </div>
    </div>
  </section>`;
}

export function aiView(s) {
  const ai = s.ai;
  const body =
    ai.status === 'loading'
      ? '<p class="text-teal-700 font-bold animate-pulse py-6 text-center">🔍 AIが画像を解析中…</p>'
      : ai.status === 'done'
        ? `<div class="space-y-2">${ai.candidates
            .map((c) => {
              const added = s.items.some((i) => i.id === c.id);
              return `<button class="w-full text-left flex justify-between items-center p-3 rounded-xl border-2 ${added ? 'border-slate-200 bg-slate-100' : 'border-teal-300'} active:bg-teal-50 min-h-[60px]" data-action="add-item" data-id="${c.id}">
              <span><span class="block font-bold">${esc(c.name)}</span><span class="text-sm text-slate-500">${c.category}</span></span>
              <span class="text-teal-700 font-bold">一致度 ${c.confidence}% ${added ? '✓追加済み' : '＋追加'}</span></button>`;
            })
            .join('')}</div>`
        : '<p class="text-slate-400 text-center py-6">商品を撮影すると、候補が表示されます</p>';
  return `
    <div class="flex gap-2 items-center">
      ${ai.photo ? `<img src="${ai.photo}" alt="撮影画像" class="h-16 w-16 object-cover rounded-lg border" />` : ''}
      <label class="btn btn-primary flex-1 text-center cursor-pointer">📷 撮影して判定
        <input type="file" accept="image/*" capture="environment" class="hidden" data-ai-photo /></label>
      <button class="btn btn-secondary" data-action="ai-dummy">ダミー</button>
    </div>
    ${body}`;
}

const APV = {
  none: ['査定部の承認待ち', 'bg-amber-100 text-amber-800'],
  stale: ['変更あり・再承認待ち', 'bg-orange-100 text-orange-800'],
  ok: ['✓ 承認済み', 'bg-emerald-100 text-emerald-800'],
  ng: ['差戻し', 'bg-rose-100 text-rose-800'],
};

// 買取明細の行に出す承認の状態（金額入力後のみ）
const apvTag = (s, item) => {
  if (!item.price) return '';
  const { state } = approvalOf(s, item);
  const [label, cls] = { none: ['承認待ち', 'bg-slate-100 text-slate-600'], stale: ['再承認待ち', 'bg-orange-100 text-orange-800'], ok: ['✓承認', 'bg-emerald-100 text-emerald-800'], ng: ['差戻し', 'bg-rose-100 text-rose-700'] }[state];
  return `<span class="ml-1 rounded whitespace-nowrap inline-block text-xs font-bold px-2 py-0.5 ${cls}">${label}</span>`;
};

export function selectView(s) {
  const all = total(s.items);
  const sel = total(selectedItems(s));
  const okCount = selectedItems(s).filter((i) => approvalOf(s, i).state === 'ok').length;
  return `
  <section class="${SEC} flex flex-col">
    <div class="card flex flex-col min-h-0 flex-1 !p-4 gap-2">
      <div><h2 class="text-xl font-bold">査定結果の確認・査定部の承認</h2>
        <p class="text-slate-500 text-sm">売らない商品は「売らない」に切り替えてください。査定部は商品の登録時から随時承認しています（承認 ${okCount} / ${selectedItems(s).length} 点）。</p></div>
      <div class="space-y-2 overflow-y-auto min-h-0 flex-1" data-scroll="select">
      ${s.items
        .map((i) => {
          const a = i.sell ? approvalOf(s, i) : null;
          const [label, cls] = a ? APV[a.state] : ['', ''];
          return `
      <div class="px-3 py-2 rounded-xl border-2 ${i.sell ? (a.state === 'ok' ? 'border-emerald-400 bg-white' : 'border-teal-400 bg-white') : 'border-slate-200 bg-slate-100 opacity-70'}">
        <div class="flex items-center justify-between gap-3">
          <div class="flex-1"><div class="font-bold ${i.sell ? '' : 'line-through'}">${esc(i.name)}${itemWarn(s, i.id)}
              ${a ? `<span class="ml-2 rounded whitespace-nowrap inline-block text-xs font-bold px-2 py-0.5 ${cls}">${label}</span>` : ''}</div>
            <div class="text-sm text-slate-500">ランク${i.rank} ／ ${i.qty}個${i.aiAppraisal ? ` ／ 🤖AI査定 ${yen(i.aiAppraisal.price)}` : ''}</div></div>
          <div class="text-xl font-bold w-32 text-right ${i.sell ? '' : 'line-through'}">${yen(i.price)}</div>
          <button class="btn w-32 !py-2 ${i.sell ? 'btn-primary' : 'btn-secondary'}" data-action="toggle-sell" data-id="${i.id}">${i.sell ? '✓ 売る' : '売らない'}</button>
        </div>
        ${a?.state === 'ng' ? `<p class="text-sm text-rose-700 font-bold mt-1">差戻し理由：${esc(a.rec.comment)}（買取明細で金額を見直してください）</p>` : ''}
        ${a?.state === 'stale' ? '<p class="text-sm text-orange-700 font-bold mt-1">承認後に金額・ランク・個数が変更されたため、査定部の再承認が必要です。</p>' : ''}
      </div>`;
        })
        .join('')}
      </div>
      <div class="border-t-2 pt-2 flex justify-between items-end gap-3">
        <div class="space-y-1"><div class="text-slate-500 text-sm">査定合計 ${yen(all)} ／ 除外 −${yen(all - sel)}</div>
          <div class="text-sm font-bold ${okCount === selectedItems(s).length ? 'text-emerald-700' : 'text-amber-700'}">${okCount === selectedItems(s).length ? '✓ すべて承認済みです。次へ進めます' : `承認待ち ${selectedItems(s).length - okCount}点（承認されると自動で更新されます）`}</div></div>
        <span class="text-right"><span class="mr-3">お買取り金額（${selectedItems(s).length}点）</span><span class="text-4xl font-bold text-teal-700">${yen(sel)}</span></span>
      </div>
    </div>
  </section>`;
}

// 疑似QRコード（コード文字列から決まる模様）。見た目だけのダミー
function fakeQr(code) {
  const N = 21;
  let seed = [...code].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 9973, 7);
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const finder = (x, y) => [[0, 0], [N - 7, 0], [0, N - 7]].some(([fx, fy]) => x >= fx && x < fx + 7 && y >= fy && y < fy + 7);
  const inFinder = (x, y) => {
    const [fx, fy] = [[0, 0], [N - 7, 0], [0, N - 7]].find(([a, b]) => x >= a && x < a + 7 && y >= b && y < b + 7);
    const dx = x - fx;
    const dy = y - fy;
    return dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4);
  };
  let cells = '';
  for (let y = 0; y < N; y += 1) {
    for (let x = 0; x < N; x += 1) {
      const on = finder(x, y) ? inFinder(x, y) : rnd() > 0.5;
      if (on) cells += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
    }
  }
  return `<svg viewBox="-1 -1 ${N + 2} ${N + 2}" class="w-full h-full" shape-rendering="crispEdges"><rect x="-1" y="-1" width="${N + 2}" height="${N + 2}" fill="#fff"/><g fill="#111">${cells}</g></svg>`;
}

// QR読取のカメラ画面（モック）。タブレットのカメラが起動しているように見せる
export function scanView(s) {
  if (!s.scan) return '';
  const stock = s.scan.mode === 'stock';
  const slot = stock ? null : labelSlots(s).find((x) => x.key === s.scan.key);
  const found = s.scan.status === 'found';
  const col = found ? '#22c55e' : '#fff';
  const corner = (pos) => `<span class="cam-corner" style="${pos};border-color:${col}"></span>`;
  return `
  <div class="fixed inset-0 z-[70] bg-black text-white flex flex-col" role="dialog" aria-label="QRコード読み取り">
    <div class="flex items-center justify-between px-5 py-3 bg-black/70 z-10">
      <div class="flex items-center gap-3"><span class="inline-block w-3 h-3 rounded-full bg-rose-500 animate-pulse"></span><span class="font-bold">カメラ起動中</span></div>
      <div class="text-center leading-tight">${stock
        ? `<div class="font-bold">入庫 ${s.scan.stored} 点／残り ${s.scan.left} 点</div><div class="text-xs text-slate-300">保管場所: ${esc(s.scan.location)}</div>`
        : `<div class="font-bold">${esc(slot?.item.name ?? '')}${slot && slot.item.qty > 1 ? `（${slot.n}/${slot.item.qty}個目）` : ''}</div><div class="text-xs text-slate-300">貼付したシールのQRコードを読み取ります</div>`}</div>
      <button class="rounded-xl border-2 border-white/50 px-5 min-h-[44px] font-bold" data-action="scan-cancel">${stock ? '完了' : 'キャンセル'}</button>
    </div>
    <div class="relative flex-1 overflow-hidden">
      <div class="absolute inset-[-6%] cam-bg"></div>
      <div class="absolute inset-0 flex items-center justify-center">
        <div class="relative w-[min(60vh,70vw)] aspect-square">
          <div class="absolute inset-[12%] cam-sticker rounded-md shadow-2xl overflow-hidden">${fakeQr(found ? s.scan.code : 'scanning-preview')}</div>
          ${corner('top:0;left:0;border-top-width:6px;border-left-width:6px;border-top-left-radius:14px')}
          ${corner('top:0;right:0;border-top-width:6px;border-right-width:6px;border-top-right-radius:14px')}
          ${corner('bottom:0;left:0;border-bottom-width:6px;border-left-width:6px;border-bottom-left-radius:14px')}
          ${corner('bottom:0;right:0;border-bottom-width:6px;border-right-width:6px;border-bottom-right-radius:14px')}
          ${found || s.scan.status === 'empty' ? '' : '<div class="cam-line"></div>'}
        </div>
      </div>
      <div class="absolute inset-x-0 bottom-6 flex justify-center">
        ${s.scan.status === 'empty'
          ? '<div class="rounded-2xl bg-emerald-600 px-6 py-3 text-center shadow-lg"><div class="font-bold text-lg">🎉 対象の商品をすべて入庫しました</div><div class="text-sm">「完了」を押してください</div></div>'
          : found
          ? `<div class="rounded-2xl bg-emerald-600 px-6 py-3 text-center shadow-lg"><div class="font-bold text-lg">✓ ${stock ? `入庫しました（${esc(s.scan.name)}）` : '読み取りました'}</div><div class="font-mono text-2xl tracking-wider">${esc(s.scan.code)}</div></div>`
          : '<div class="rounded-full bg-black/60 px-5 py-2 text-lg">QRコードを枠内に合わせてください</div>'}
      </div>
    </div>
  </div>`;
}

export function labelView(s) {
  const slots = labelSlots(s);
  const done = slots.filter((x) => s.labels[x.key]).length;
  return `
  <section class="${SEC} flex flex-col">
    <div class="card flex flex-col min-h-0 flex-1 !p-4 gap-2">
      <div class="flex justify-between items-end">
        <div><h2 class="text-xl font-bold">商品へのシール貼付・QR紐づけ</h2>
          <p class="text-slate-500 text-sm">シールを貼り、QRコードを読み取ってください（${done} / ${slots.length} 点）</p></div>
        <button class="btn btn-secondary !py-2 !min-h-[44px]" data-action="dummy-scan-all">残りを一括ダミー読取</button>
      </div>
      <div class="space-y-2 overflow-y-auto min-h-0 flex-1" data-scroll="labels">
      ${slots
        .map((x) => {
          const code = s.labels[x.key];
          const err = s.labelError?.key === x.key ? s.labelError.msg : '';
          return `
      <div class="px-3 py-2 rounded-xl border-2 ${code ? 'border-teal-400' : 'border-slate-200'}">
        <div class="flex items-center gap-3">
          <div class="w-64 font-bold text-sm">${esc(x.item.name)}${x.item.qty > 1 ? `（${x.n}/${x.item.qty}）` : ''}</div>
          <input class="field flex-1 font-mono !py-2" placeholder="QRを読み取り／手入力" value="${esc(code)}" data-label-key="${x.key}" ${code ? 'readonly' : ''} />
          ${code
            ? `<span class="text-teal-700 font-bold w-16">✅済</span><button class="btn btn-secondary !py-2 !min-h-[44px]" data-action="clear-label" data-key="${x.key}">解除</button>`
            : `<button class="btn btn-primary !py-2 !min-h-[44px]" data-action="dummy-scan" data-key="${x.key}">📷 QR読取</button>`}
        </div>
        ${err ? `<p class="text-rose-600 font-bold text-sm">${esc(err)}</p>` : ''}
      </div>`;
        })
        .join('')}
      </div>
    </div>
  </section>`;
}

// 訪問終了前（お客様宅を出る前）のチェックリスト。システムで確認できるものは自動、他は営業が確認してチェックする
export const LEAVE_CHECKS = [
  { key: 'kyc', text: '本人確認書類を確認し、GMOサインで登録した' },
  { key: 'paper', text: '契約書を印刷し、お客様がチェック項目・署名を記入した' },
  { key: 'copy', text: '契約書の会社控えを回収し、お客様控えをお渡しした' },
  { key: 'cooling', text: 'クーリング・オフについて説明し、満了日をお伝えした' },
  { key: 'pay', text: '買取代金をお支払いし、お客様の受領を確認した' },
  { key: 'pack', text: '買取商品をすべて梱包し、持ち帰り用にまとめた' },
  { key: 'count', text: '商品の数が、シール・契約書と一致している' },
  { key: 'lost', text: '忘れ物がない（書類・端末・お客様のお預かり品）' },
];
export const leaveRemaining = (s) => LEAVE_CHECKS.filter((c) => !s.leaveChecks[c.key]).length;

// ---- お客様の評価（営業の記録。お客様には見せない） ---------------------------------------
export const EVAL_OPTIONS = {
  attitude: ['良好', '普通', '難あり'],
  repeat: ['高い', '普通', '低い'],
  wealth: ['高そう', '普通', '低そう'],
  timing: ['1か月以内', '3か月以内', '半年以内', '当面不要'],
  cats: ['ブランドバッグ', '腕時計', 'ジュエリー・貴金属', 'カメラ・家電', 'ゲーム・ホビー', 'その他'],
  flags: ['価格交渉が強い', '他社と比較中', '家族の同意が必要', '時間にルーズ', 'クレーム注意', '紹介が見込める'],
};
export const blankEval = () => ({ overall: 0, attitude: '', repeat: '', wealth: '', timing: '', cats: [], flags: [], memo: '' });
export const evalFilled = (e) => Boolean(e && (e.overall || e.attitude || e.repeat || e.wealth || e.timing || e.cats.length || e.flags.length || e.memo.trim()));

function evalModalView(s) {
  const d = s.evalDraft;
  const single = (field, label) => `
    <div><div class="font-bold text-sm mb-1">${label}</div><div class="flex flex-wrap gap-1.5">
      ${EVAL_OPTIONS[field].map((o) => `<button class="chip !min-h-[40px] !py-0 !px-3 text-sm ${d[field] === o ? 'active' : ''}" data-action="eval-set" data-field="${field}" data-value="${o}">${o}</button>`).join('')}</div></div>`;
  const multi = (field, label) => `
    <div><div class="font-bold text-sm mb-1">${label}<span class="font-normal text-xs text-slate-500">（複数選択可）</span></div><div class="flex flex-wrap gap-1.5">
      ${EVAL_OPTIONS[field].map((o) => `<button class="chip !min-h-[40px] !py-0 !px-3 text-sm ${d[field].includes(o) ? 'active' : ''}" data-action="eval-toggle" data-field="${field}" data-value="${o}">${o}</button>`).join('')}</div></div>`;
  return modalShell(
    `⭐ お客様の評価　<span class="text-sm font-normal text-slate-500">${esc(s.customer.name)} 様</span>`,
    `<p class="text-xs text-slate-500">次の営業活動に生かすための社内記録です。お客様には表示されません。</p>
    <div class="grid sm:grid-cols-2 gap-3 items-start">
      <div class="space-y-2.5">
        <div><div class="font-bold text-sm mb-1">総合評価</div><div class="flex gap-1">
          ${[1, 2, 3, 4, 5].map((n) => `<button class="text-4xl leading-none w-11 h-11 ${n <= d.overall ? 'text-amber-400' : 'text-slate-300'}" data-action="eval-set" data-field="overall" data-value="${n}" aria-label="${n}点">★</button>`).join('')}
          <span class="self-center ml-2 font-bold">${d.overall ? `${d.overall} / 5` : '未評価'}</span></div></div>
        ${single('attitude', 'お客様の態度・対応')}
        ${single('repeat', 'リピート見込み')}
        ${single('wealth', '資力（お金を持っていそうか）')}
      </div>
      <div class="space-y-2.5">
        ${multi('cats', '次回、提案できそうな商材')}
        ${single('timing', '次回アプローチの時期')}
        ${multi('flags', '特記事項')}
        <label class="block"><span class="font-bold text-sm">メモ</span>
          <textarea class="field !py-2 mt-1" rows="2" data-evalmemo placeholder="会話の内容、趣味、家族構成、次回のきっかけなど">${esc(d.memo)}</textarea></label>
      </div>
    </div>
    <button class="btn btn-primary w-full !min-h-[48px] !py-2" data-action="eval-save">保存する</button>`,
    { wide: true },
  );
}

export function endView(s) {
  const done = Boolean(s.visitEndedAt);
  const left = leaveRemaining(s);
  const auto = [
    ['GMOサインへの送信が完了している', Boolean(s.contract)],
    ['買取商品すべてに、シールのQRコードを紐づけ済み', labelSlots(s).every((x) => s.labels[x.key])],
  ];
  return `
  <section class="${SEC} flex items-center justify-center">
    <div class="w-full max-w-5xl grid md:grid-cols-[2fr_3fr] gap-4 items-stretch max-h-full">
      <div class="card space-y-3 flex flex-col justify-between !p-4">
        <div class="text-center space-y-1">
          <div class="text-5xl">${done ? '🎉' : '📨'}</div>
          <div class="font-bold text-lg">GMOサインに送信しました</div>
          <div class="text-slate-600 text-sm">契約No. ${esc(s.contract.id)}<br>買取合計 <b class="text-xl text-teal-700">${yen(total(selectedItems(s)))}</b></div>
        </div>
        <div class="rounded-xl bg-sky-50 border border-sky-200 p-2 text-xs text-sky-900">本人確認書類の登録・契約書の印刷は、GMOサイン管理画面で行います。</div>
        <button class="btn w-full bg-sky-600 text-white !min-h-[48px] !py-2" data-action="open-gmo">GMOサイン管理画面を開く（別タブ）</button>
        <button class="btn btn-secondary w-full !min-h-[48px] !py-2 flex items-center justify-center gap-2" data-action="open-eval">⭐ お客様の評価を登録${evalFilled(s.evaluation) ? `<span class="text-xs rounded bg-emerald-100 text-emerald-800 px-2 py-0.5">登録済み${s.evaluation.overall ? ` ★${s.evaluation.overall}` : ''}</span>` : '<span class="text-xs text-slate-500">（任意）</span>'}</button>
        ${
          done
            ? `<div class="rounded-xl bg-slate-100 p-3 text-center text-sm">訪問時間 ${fmtTime(s.visitStartedAt)} 〜 ${fmtTime(s.visitEndedAt)}（${fmtElapsed(s.visitStartedAt, s.visitEndedAt)}）
               <button class="btn btn-secondary block mx-auto mt-2 !min-h-[44px] !py-1" data-action="reset">新しい訪問を開始</button></div>`
            : `<button class="btn btn-primary w-full text-xl !py-3" data-action="finish" ${left ? 'disabled' : ''}>${left ? `あと${left}項目のチェックが必要です` : '訪問終了'}</button>`
        }
      </div>
      <div class="card !p-4 flex flex-col gap-2 min-h-0">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-bold">🚪 お客様宅を出る前の確認</h2>
          <span class="font-bold ${left ? 'text-amber-700' : 'text-emerald-700'}">${LEAVE_CHECKS.length - left} / ${LEAVE_CHECKS.length}</span></div>
        <p class="text-xs text-slate-500">すべて確認してチェックすると、訪問を終了できます。</p>
        <div class="space-y-1.5 overflow-y-auto min-h-0 flex-1" data-scroll="leave">
          ${auto.map(([t, ok]) => `<div class="flex items-center gap-3 rounded-xl border-2 ${ok ? 'border-emerald-300 bg-emerald-50' : 'border-rose-300'} px-3 py-2 min-h-[48px]">
              <span class="w-7 h-7 rounded-md flex items-center justify-center text-white font-bold ${ok ? 'bg-emerald-600' : 'bg-rose-500'}">${ok ? '✓' : '!'}</span>
              <span class="flex-1">${t}</span><span class="text-xs text-slate-500">自動確認</span></div>`).join('')}
          ${LEAVE_CHECKS.map((c) => `<label class="flex items-center gap-3 rounded-xl border-2 px-3 py-2 min-h-[48px] ${s.leaveChecks[c.key] ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200'} ${done ? 'opacity-60' : 'cursor-pointer'}">
              <input type="checkbox" class="w-7 h-7 shrink-0" data-action="leave-check" data-key="${c.key}" ${s.leaveChecks[c.key] ? 'checked' : ''} ${done ? 'disabled' : ''} />
              <span class="flex-1 ${s.leaveChecks[c.key] ? '' : 'font-bold'}">${c.text}</span></label>`).join('')}
        </div>
        ${done ? '' : '<button class="text-xs underline text-slate-400 self-end" data-action="leave-all">（デモ用）すべてチェック</button>'}
      </div>
    </div>
  </section>`;
}

const modalShell = (title, body, { wide = false } = {}) => `
  <div class="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-3" data-action="close-backdrop">
    <div class="bg-white rounded-2xl w-full ${wide ? 'max-w-3xl p-4 gap-2' : 'max-w-2xl p-5 gap-3'} max-h-[96dvh] flex flex-col">
      <div class="flex justify-between items-center gap-2"><h2 class="${wide ? 'text-lg' : 'text-xl'} font-bold leading-tight">${title}</h2>
        <button class="btn btn-secondary !py-1 !min-h-[40px] !px-4" data-action="close-modal">閉じる</button></div>
      <div class="overflow-y-auto min-h-0 flex-1 ${wide ? 'space-y-2' : 'space-y-3'}" data-scroll="modal">${body}</div>
    </div>
  </div>`;

// 1個あたりの買取額（買取金額は個数分の合計で入力するため、参考値との比較は1個あたりで行う）
export const unitPrice = (item) => (item.price && item.qty ? Math.round(item.price / item.qty) : 0);

// 金額バーの目盛り（入力額に依存しない固定軸）と、操作の刻み幅。いずれも1個あたりの金額
export function priceAxis(m) {
  const lo = Math.min(m.range.min, m.history.min) * 0.8;
  const hi = Math.max(m.range.max, m.history.max) * 1.15;
  const step = hi < 50000 ? 100 : hi < 500000 ? 1000 : 5000;
  return { lo: Math.floor(lo / step) * step, hi: Math.ceil(hi / step) * step, step };
}

// 個数2以上の場合は「1個あたり」の算出と、レンジ内かどうかの判定を出す
export function rangeWarn(item) {
  const master = PRODUCTS.find((p) => p.id === item.id);
  if (!item.price) return '';
  const u = unitPrice(item);
  const unitLine = item.qty > 1
    ? `<div class="rounded-lg bg-white border px-2 py-1 text-sm">${yen(item.price)} ÷ ${item.qty}個 ＝ <b class="text-base">1個あたり ${yen(u)}</b></div>`
    : '';
  if (!master) return unitLine;
  const { range, history } = master;
  const who = item.qty > 1 ? '1個あたりの金額が' : '';
  let verdict = '<p class="text-sm font-bold text-emerald-700">✓ マスタ登録レンジ内です</p>';
  if (u < range.min || u > range.max) verdict = `<p class="text-sm font-bold text-rose-600">⚠ ${who}マスタ登録レンジの範囲外です（${u < range.min ? '安すぎ' : '高すぎ'}）</p>`;
  else if (u < history.min || u > history.max) verdict = `<p class="text-sm font-bold text-amber-600">レンジ内ですが、${who}過去実績の範囲外です</p>`;
  return unitLine + verdict;
}

// 参考値（マスタのレンジ幅・過去実績。いずれも1個あたり）と、ドラッグで金額を決められるバー
export function rangeView(item) {
  const m = PRODUCTS.find((p) => p.id === item.id);
  if (!m) return `<div class="space-y-2"><p class="text-sm text-slate-500">商品マスタに登録のない商品です（参考値なし）。</p><div data-warn>${rangeWarn(item)}</div></div>`;
  const { range, history } = m;
  const { lo, hi, step } = priceAxis(m);
  const u = unitPrice(item);
  const ratio = (v) => Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
  const pos = (v) => `${(ratio(v) * 100).toFixed(1)}%`;
  const band = (a, b, cls) => `<div class="absolute h-full rounded ${cls}" style="left:${pos(a)};width:${((ratio(b) - ratio(a)) * 100).toFixed(1)}%"></div>`;
  const out = u && (u < range.min || u > range.max);
  return `
  <div class="rounded-xl bg-slate-50 border p-2.5 space-y-1.5">
    <div class="font-bold text-sm">参考値（1個あたり） <span class="font-normal text-xs text-slate-500">${item.qty > 1 ? 'バー＝1個あたり' : 'バーで金額を設定'}</span></div>
    <div class="grid grid-cols-2 gap-2 text-sm">
      <div><div class="text-slate-500">マスタ登録レンジ</div><div class="font-bold">${yen(range.min)} 〜 ${yen(range.max)}</div></div>
      <div><div class="text-slate-500">過去実績（${history.count}件）</div><div class="font-bold">最安 ${yen(history.min)} 〜 最高 ${yen(history.max)}</div></div>
    </div>
    <div class="relative h-9 mx-3 cursor-pointer select-none" style="touch-action:none" data-slider data-id="${item.id}" data-lo="${lo}" data-hi="${hi}" data-step="${step}">
      <div class="absolute inset-x-0 top-1/2 -translate-y-1/2 h-4 bg-slate-200 rounded pointer-events-none">
        <div class="absolute inset-0">${band(range.min, range.max, 'bg-sky-300')}</div>
        <div class="absolute inset-y-1 inset-x-0">${band(history.min, history.max, 'bg-teal-600')}</div>
      </div>
      <div data-thumb class="${item.price ? '' : 'hidden'} absolute top-1/2 w-8 h-8 -mt-4 -ml-4 rounded-full border-4 border-white shadow-lg pointer-events-none ${out ? 'bg-rose-600' : 'bg-slate-900'}" style="left:${pos(u || lo)}"></div>
    </div>
    <div class="flex gap-3 text-[11px] text-slate-500"><span><span class="inline-block w-3 h-2 bg-sky-300 rounded"></span> マスタレンジ</span><span><span class="inline-block w-3 h-2 bg-teal-600 rounded"></span> 過去実績</span><span><span class="inline-block w-3 h-3 bg-slate-900 rounded-full"></span> 1個あたりの入力額</span></div>
    <div data-warn class="space-y-1">${rangeWarn(item)}</div>
    <div class="flex gap-2 flex-wrap items-center">
      <span class="text-xs text-slate-500">1個あたりを</span>
      <button class="chip !min-h-[36px] !py-0 !px-3 text-sm" data-action="price-set" data-id="${item.id}" data-value="${history.min * item.qty}">実績最安</button>
      <button class="chip !min-h-[36px] !py-0 !px-3 text-sm" data-action="price-set" data-id="${item.id}" data-value="${Math.round((history.min + history.max) / 2 / step) * step * item.qty}">実績中間</button>
      <button class="chip !min-h-[36px] !py-0 !px-3 text-sm" data-action="price-set" data-id="${item.id}" data-value="${history.max * item.qty}">実績最高</button>
    </div>
  </div>`;
}

export function modalView(s) {
  const m = s.modal;
  if (!m) return '';
  if (m.type === 'ai') return modalShell('🤖 AIカメラで商品候補を探す', `<div id="ai" class="space-y-3">${aiView(s)}</div>`);
  if (m.type === 'customer') {
    const c = s.customer;
    return modalShell(
      'お客様情報の修正',
      `<div class="grid grid-cols-2 gap-4">
      ${field('氏名', 'name', c.name, { required: true })}${field('フリガナ', 'kana', c.kana)}
      ${field('生年月日', 'birth', c.birth, { type: 'date' })}${field('電話番号', 'phone', c.phone, { type: 'tel', required: true })}
      ${field('郵便番号', 'zip', c.zip)}${field('職業', 'occupation', c.occupation)}
      <div class="col-span-2">${field('住所', 'address', c.address)}</div></div>
      <button class="btn btn-primary w-full" data-action="confirm-customer">修正を確定する</button>`,
    );
  }
  if (m.type === 'item') {
    const i = s.items.find((x) => x.id === m.id);
    if (!i) return '';
    const warn = s.comments.filter((c) => c.itemId === i.id && !c.ack);
    return modalShell(
      esc(i.name),
      `${warn.length ? `<button class="w-full text-left rounded-xl bg-rose-50 border-2 border-rose-400 p-3 font-bold text-rose-700" data-action="open-comments">❗ 本社からのコメントが${warn.length}件あります（タップで確認）</button>` : ''}
      <div class="grid sm:grid-cols-2 gap-3 items-start">
        <div class="space-y-2">
          <div class="font-bold text-sm">買取金額（円）<span class="font-normal text-xs text-slate-500">　${i.qty}個分の合計</span></div>
          <div class="relative">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-xl text-slate-400 pointer-events-none">¥</span>
            <input class="field !py-2 text-right text-2xl font-bold tracking-wide pl-8 pr-10" type="text" inputmode="numeric" autocomplete="off" value="${i.price ? i.price.toLocaleString('ja-JP') : ''}" placeholder="査定金額を入力" data-item-field="price" data-id="${i.id}" />
            <span class="absolute right-3 top-1/2 -translate-y-1/2 text-lg text-slate-500 pointer-events-none">円</span>
          </div>
          <div class="grid grid-cols-6 gap-1">${[-100, -10, -1, 1, 10, 100].map((d) => `<button class="btn btn-secondary !px-0 !py-0 !min-h-[40px] text-base ${d < 0 ? 'text-rose-700' : 'text-teal-700'}" data-action="price-add" data-id="${i.id}" data-delta="${d}">${d > 0 ? '＋' : '−'}${Math.abs(d)}</button>`).join('')}</div>
          <div class="flex items-center gap-2"><span class="font-bold text-sm w-12">個数</span>
            <button class="btn btn-secondary !px-0 w-14 !min-h-[44px]" data-action="qty" data-id="${i.id}" data-delta="-1">−</button>
            <span class="text-2xl font-bold w-12 text-center">${i.qty}</span>
            <button class="btn btn-secondary !px-0 w-14 !min-h-[44px]" data-action="qty" data-id="${i.id}" data-delta="1">＋</button></div>
          <div><div class="font-bold text-sm mb-1">状態ランク</div><div class="grid grid-cols-5 gap-1">
            ${RANKS.map((r) => `<button class="rounded-xl border-2 py-1 leading-tight text-center ${r.value === i.rank ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-slate-300'}" data-action="rank" data-id="${i.id}" data-value="${r.value}"><span class="block text-lg font-bold">${r.value}</span><span class="block text-[10px]">${esc(r.label.slice(2, -1))}</span></button>`).join('')}</div></div>
        </div>
        <div id="range-box">${rangeView(i)}</div>
      </div>
      <div class="flex gap-3 pt-1">
        <button class="btn btn-secondary text-rose-600 !min-h-[48px] !py-2" data-action="remove-item" data-id="${i.id}">削除</button>
        <button class="btn btn-primary flex-1 !min-h-[48px] !py-2" data-action="close-modal">完了</button></div>`,
      { wide: true },
    );
  }
  if (m.type === 'message') {
    const msg = messagesFor(userById(s.user)).find((x) => x.id === m.id);
    if (!msg) return '';
    return modalShell(
      `${msg.important ? '<span class="text-xs font-bold rounded bg-rose-600 text-white px-2 py-0.5 mr-2 align-middle">重要</span>' : '<span class="text-xs font-bold rounded bg-slate-200 text-slate-600 px-2 py-0.5 mr-2 align-middle">お知らせ</span>'}${esc(msg.title)}`,
      `<div class="text-xs text-slate-500">${esc(msg.sender)}${msg.target !== 'all' ? `（グループ${esc(msg.target)}宛）` : ''} ／ ${fmtDateTime(msg.sentAt)}</div>
       <p class="text-lg whitespace-pre-wrap leading-relaxed">${esc(msg.body)}</p>
       <button class="btn btn-primary w-full" data-action="close-modal">閉じる</button>`,
    );
  }
  if (m.type === 'eval') return evalModalView(s);
  if (m.type === 'comments') return commentsModalView(s);
  if (m.type === 'appraisal') return appraisalComposeView(s, m);
  return '';
}

const TAG_CLS = { 差戻し: 'bg-rose-600 text-white', 安すぎる: 'bg-sky-100 text-sky-800', 高すぎる: 'bg-rose-100 text-rose-800', 要再確認: 'bg-amber-100 text-amber-800', その他: 'bg-slate-100 text-slate-700' };

function commentsModalView(s) {
  const list = [...s.comments].sort((a, b) => b.createdAt - a.createdAt);
  return modalShell(
    '💬 本社査定部からのコメント',
    `${list.length ? '' : '<p class="text-slate-400 text-center py-8">コメントはありません</p>'}
    ${list.map((c) => {
      const item = s.items.find((i) => i.id === c.itemId);
      return `<div class="border-2 rounded-xl p-3 space-y-2 ${c.ack ? 'border-slate-200' : 'border-rose-400 bg-rose-50'}">
        <div class="flex justify-between items-center gap-2">
          <span>${c.tag ? `<span class="rounded px-2 py-0.5 text-sm font-bold ${TAG_CLS[c.tag] ?? TAG_CLS['その他']}">${esc(c.tag)}</span>` : ''}
            <span class="font-bold ml-2">${item ? esc(item.name) : '訪問全体'}</span></span>
          <span class="text-xs text-slate-500">${fmtTime(c.createdAt)}</span></div>
        <p class="text-lg whitespace-pre-wrap">${esc(c.text)}</p>
        ${c.price && item
          ? `<div class="rounded-lg bg-indigo-50 border border-indigo-200 p-2 flex items-center justify-between gap-2">
              <span>本社の提案査定額 <b class="text-xl text-indigo-800">${yen(c.price)}</b>（ランク${esc(c.rank)}）</span>
              ${c.adopted ? '<span class="text-emerald-700 font-bold">✓ 買取金額に反映済み</span>' : `<button class="btn btn-primary !py-2 !min-h-[44px]" data-action="adopt-comment" data-id="${c.id}">買取金額に反映</button>`}</div>`
          : ''}
        ${item ? `<button class="underline text-sm text-teal-700" data-action="open-item" data-id="${item.id}">この商品の明細を開く</button>` : ''}
        <label class="flex items-center gap-3 text-lg font-bold min-h-[44px]">
          <input type="checkbox" class="w-7 h-7" data-action="ack-comment" data-id="${c.id}" ${c.ack ? 'checked' : ''} />
          確認しました${c.ack ? `<span class="text-sm font-normal text-slate-500">（${fmtTime(c.ackAt)}）</span>` : ''}</label>
      </div>`;
    }).join('')}`,
  );
}

const AP_CLS = { 依頼中: 'bg-amber-100 text-amber-800', 回答済み: 'bg-emerald-100 text-emerald-800' };

function apCardView(a) {
  return `
  <div class="border-2 rounded-xl p-3 mt-2 space-y-2 ${a.status === '回答済み' ? 'border-emerald-400' : 'border-slate-200'}">
    <div class="flex justify-between items-center">
      <span class="text-sm text-slate-500">${fmtTime(a.createdAt)} 依頼${a.note ? `：${esc(a.note)}` : ''}</span>
      <span class="rounded px-2 py-0.5 text-sm font-bold ${AP_CLS[a.status]}">${a.status}</span></div>
    <div class="flex gap-1">${a.photos.slice(0, 4).map((p) => `<img src="${p}" class="h-12 w-12 object-cover rounded border" alt="" />`).join('')}</div>
    ${a.reply
      ? '<p class="text-sm text-emerald-700 font-bold">✓ 本社から回答がありました（❗のコメントをご確認ください）</p>'
      : '<p class="text-sm text-amber-700">本社の回答をお待ちください…</p>'}
  </div>`;
}

function aiResultView(s, item) {
  const r = item.aiAppraisal;
  if (s.aiBusy) return '<p class="text-violet-700 font-bold animate-pulse py-6 text-center">🤖 AIが画像から査定中…</p>';
  if (!r) return '';
  const adopted = item.price === r.price && item.rank === r.rank;
  return `
  <div class="rounded-xl border-2 border-violet-300 bg-violet-50 p-3 space-y-2">
    <div class="flex justify-between items-center"><b>🤖 AI査定結果</b><span class="text-xs text-slate-500">${fmtTime(r.at)}</span></div>
    <div class="flex items-end justify-between gap-3">
      <div><div class="text-sm text-slate-500">推定買取額（個数分の合計）</div><div class="text-3xl font-bold text-violet-800">${yen(r.price)}</div>
        <div class="text-xs text-slate-500">目安 ${yen(r.min)} 〜 ${yen(r.max)}</div></div>
      <div class="text-right text-sm"><div>推定ランク <b class="text-xl">${r.rank}</b></div><div>信頼度 <b class="${r.confidence < 70 ? 'text-rose-600' : 'text-emerald-700'}">${r.confidence}%</b></div></div>
    </div>
    <p class="text-sm text-slate-700">${esc(r.reason)}</p>
    ${r.confidence < 70 ? '<p class="text-sm font-bold text-rose-600">⚠ 信頼度が低めです。本社査定部への依頼をおすすめします。</p>' : ''}
    ${adopted ? '<p class="text-emerald-700 font-bold">✓ 買取金額に反映済み</p>' : `<button class="btn btn-primary w-full !py-2" data-action="ai-adopt" data-id="${item.id}">この査定額・ランクを買取金額に反映</button>`}
  </div>`;
}

function appraisalComposeView(s, m) {
  const d = s.draft;
  const item = s.items.find((i) => i.id === m.itemId);
  const history = s.appraisals.filter((a) => a.itemId === m.itemId);
  const ai = s.apMode === 'ai';
  const tab = (key, label) => `<button class="flex-1 py-3 rounded-xl font-bold text-lg ${s.apMode === key ? (key === 'ai' ? 'bg-violet-600' : 'bg-indigo-600') + ' text-white' : 'bg-slate-100 text-slate-600'}" data-action="ap-mode" data-value="${key}">${label}</button>`;
  return modalShell(
    ai ? '🤖 AI査定' : '📨 本社に査定依頼',
    `<p class="font-bold text-lg">${esc(d.name)}</p>
    <div class="flex gap-2">${tab('hq', '👤 本社査定部に依頼')}${tab('ai', '🤖 AI査定')}</div>
    <p class="text-sm text-slate-500">${ai ? '撮影した画像から、AIが買取額と状態ランクを推定します（即時）。' : '写真を本社査定部に送り、査定してもらいます（回答待ち）。'}</p>
    <label class="block"><span class="font-bold">状態・補足</span>
      <textarea class="field mt-1" rows="2" data-draft="note" placeholder="傷、付属品、お客様の希望額など">${esc(d.note)}</textarea></label>
    <div><div class="font-bold mb-1">写真（${d.photos.length}枚）</div>
      <div class="flex gap-2 flex-wrap">
        ${d.photos.map((p, i) => `<div class="relative"><img src="${p}" class="h-20 w-20 object-cover rounded-lg border" alt="写真${i + 1}" />
          <button class="absolute -top-2 -right-2 bg-rose-600 text-white rounded-full w-7 h-7" data-action="ap-remove-photo" data-idx="${i}" aria-label="削除">✕</button></div>`).join('')}
        <label class="h-20 w-20 rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center text-3xl cursor-pointer">📷
          <input type="file" accept="image/*" capture="environment" class="hidden" data-ap-photo /></label>
      </div>
      <button class="btn btn-secondary !py-1 !min-h-[40px] mt-2" data-action="ap-dummy-photo">ダミー写真を追加</button></div>
    ${ai
      ? `${item ? aiResultView(s, item) : ''}
         <button class="btn w-full bg-violet-600 text-white" data-action="ai-run" ${d.photos.length && !s.aiBusy ? '' : 'disabled'}>${item?.aiAppraisal ? 'もう一度AI査定する' : 'AI査定を実行'}</button>`
      : `${history.length ? `<div><div class="font-bold">これまでの依頼・回答</div>${history.map(apCardView).join('')}</div>` : ''}
         <button class="btn btn-primary w-full" data-action="send-appraisal" ${d.photos.length ? '' : 'disabled'}>本社に送信</button>
         <button class="text-xs underline text-slate-400" data-action="open-hq">（デモ用）本社査定画面を別タブで開く</button>`}`,
  );
}




export { yen, total } from './format.js';
export { masterBodyView } from './masterView.js';
export { dashboardView } from './dashboardView.js';
export { scheduleView } from './scheduleView.js';
export { workdayView, expenseView, receiptModalView } from './workdayView.js';
export { stockView } from './stockView.js';
