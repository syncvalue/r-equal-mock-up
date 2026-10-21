import { PRODUCTS } from './data.js';
import { loadRecent, pushRecent } from './search.js';
import { estimateByPhotos } from './ai.js';
import { fmtElapsed } from './format.js';
import {
  AP_STORAGE_KEY, APPROVAL_KEY, MSG_KEY, DEPOSIT_KEY, markRead, upsertEval, COMMENT_KEY, loadApprovals, GMO_URL, RESET_CONFIRM, clearTransactions, loadComments, upsertComment, HQ_URL, loadAppraisals, newAppraisalId, newContractId, publishLive, upsertAppraisal, upsertContract,
} from './store.js';
import { dummyPhoto, shrinkImage } from './image.js';
import * as V from './views.js';
import { initTheme } from './theme.js';
import { userById } from './dashboard.js';
import { messagesFor } from './messages.js';
import { EVENTS, eventById } from './schedule.js';
import { formatMoneyInput } from './moneyInput.js';
import {
  START_CHECKS, END_CHECKS, loadDay, saveDay, phaseOf, dateKey, startDay, closeDay, addExpense, removeExpense, recordVisit, summaryOf, carryoverFor,
  newId, blankOutcomeDraft, outcomeReady, outcomeOf, blankStartForm, blankCloseForm, blankExpenseDraft, expenseReady, startReady, closeReady,
} from './workday.js';
import {
  loadUnits, saveUnits, unitsFromVisit, addUnits, byUser, inScope, pendingOf, receive, markMissing, resultMessage, demoUnits,
} from './stock.js';
import { DEFAULT_STOCK } from './stockView.js';

// 予定（訪問）から、コールセンター受付情報の表示用データを作る
function callInfoOf(ev, userId) {
  return { receptionNo: ev.receptionNo, receivedAt: ev.receivedAt, operator: ev.operator, apType: ev.apType, appraiser: userById(userId).name };
}

const initialState = () => ({
  visitId: `V-${Date.now().toString(36).toUpperCase()}`,
  view: phaseOf(loadDay('u01')) === 'open' ? 'dashboard' : 'workday', // 始業前は、始業開始画面が初期画面
  user: 'u01',
  day: null,
  phase: 'before',
  startForm: blankStartForm(),
  closeForm: blankCloseForm(),
  expDraft: blankExpenseDraft(),
  outcome: null,
  outcomeDraft: blankOutcomeDraft(),
  units: [],
  stock: { ...DEFAULT_STOCK },
  dash: { period: 'month', scope: 'me', member: null },
  menuOpen: false,
  step: 0,
  visitStartedAt: null,
  visitEndedAt: null,
  visitEventId: EVENTS[0].id,
  sched: { sel: EVENTS[0].id, tab: 'calendar' },
  route: { day: 0, sel: 'all', origin: 'prev' },
  geo: null,
  callInfo: callInfoOf(EVENTS[0], 'u01'),
  customer: { ...EVENTS[0].customer },
  customerConfirmed: false,
  modal: null,
  items: [],
  ai: { status: 'idle', photo: null, candidates: [] },
  search: '',
  mtab: 'browse',
  mcat: '',
  mbrand: '',
  mlimit: 40,
  recent: loadRecent(),
  labels: {},
  labelError: null,
  contract: null,
  appraisals: [],
  comments: [],
  scan: null,
  leaveChecks: {},
  showStaff: false,
  briefing: { checks: {}, propose: '' },
  evaluation: null,
  evalDraft: V.blankEval(),
  approvals: [],
  apMode: 'hq',
  aiBusy: false,
  draft: { name: '', note: '', photos: [] },
});

let state = initialState();
const $ = (sel) => document.querySelector(sel);
const set = (patch) => { state = { ...state, ...patch }; };

// 現在地の取得（Googleマップの出発点）。許可されない・取得できない場合は営業所を出発点にする
function requestGeo() {
  if (state.geo || !navigator.geolocation) { if (!state.geo) set({ geo: { ok: false } }); return; }
  set({ geo: { ok: false, pending: true } });
  navigator.geolocation.getCurrentPosition(
    (pos) => { set({ geo: { ok: true, lat: pos.coords.latitude, lng: pos.coords.longitude } }); if (state.view === 'schedule' && state.sched.tab === 'route') rerenderKeepScroll(); },
    () => { set({ geo: { ok: false } }); if (state.view === 'schedule' && state.sched.tab === 'route') rerenderKeepScroll(); },
    { timeout: 6000, maximumAge: 60000 },
  );
}

function showToast(msg) {
  const el = document.createElement('div');
  el.className = 'fixed top-20 left-1/2 -translate-x-1/2 z-[60] bg-slate-900 text-white rounded-xl px-6 py-4 text-lg shadow-lg';
  el.textContent = msg;
  document.body.append(el);
  setTimeout(() => el.remove(), 4000);
}

// 経費のダミーレシート写真（デモ用）
const dummyReceipt = (d) => 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="320"><rect width="240" height="320" fill="#f8fafc" stroke="#cbd5e1"/><text x="20" y="40" font-size="20" fill="#334155">RECEIPT</text>${[70, 100, 130, 160].map((y) => `<rect x="20" y="${y}" width="${200 - (y % 3) * 30}" height="10" fill="#cbd5e1"/>`).join('')}<text x="20" y="250" font-size="22" fill="#0f172a">¥ ${Number(d.amount || 0).toLocaleString('ja-JP')}</text><text x="20" y="290" font-size="14" fill="#64748b">DUMMY ${dateKey()}</text></svg>`);

const DUMMY_ID = (label) =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" rx="14" fill="#e2e8f0"/><circle cx="70" cy="80" r="32" fill="#94a3b8"/><rect x="120" y="55" width="160" height="14" fill="#94a3b8"/><rect x="120" y="85" width="120" height="14" fill="#94a3b8"/><text x="20" y="175" font-size="20" fill="#475569">DUMMY ${label}</text></svg>`,
  );

const STEP_VIEWS = [
  V.startView,
  V.customerView,
  V.briefingView,
  V.itemsView,
  V.selectView,
  V.labelView,
  V.endView,
];

// 本社査定部のリアルタイム画面へ、現在の訪問状況を共有
function publish() {
  if (!state.visitStartedAt) return;
  publishLive({
    visitId: state.visitId,
    staff: `営業 ${userById(state.user).name}`,
    startedAt: state.visitStartedAt,
    endedAt: state.visitEndedAt,
    step: state.step,
    briefing: { propose: state.briefing.propose },
    customerName: state.customer.name,
    callInfo: state.callInfo,
    outcome: state.outcome ? { ...state.outcome, label: outcomeOf(state.outcome.type).label } : null,
    items: state.items.map(({ id, name, category, rank, qty, price, sell, aiAppraisal }) => ({ id, name, category, rank, qty, price, sell, aiAppraisal })),
    updatedAt: Date.now(),
  });
}

function render() {
  const day = loadDay(state.user);
  const phase = phaseOf(day);
  set({ day, phase, units: loadUnits() });
  // 始業するまで（終業後も）、現地買取だけは使えない
  if (phase !== 'open' && state.view === 'visit') set({ view: 'workday', modal: null });
  set({ appraisals: loadAppraisals(), comments: loadComments().filter((c) => c.visitId === state.visitId),
    approvals: loadApprovals().filter((a) => a.visitId === state.visitId),
  });
  const scrolls = Object.fromEntries([...document.querySelectorAll('[data-scroll]')].map((e) => [e.dataset.scroll, e.scrollTop]));
  $('#app').innerHTML =
    V.headerView(state) +
    `<main class="flex-1 min-h-0">${state.view === 'visit' ? STEP_VIEWS[state.step](state) : state.view === 'dashboard' ? V.dashboardView(state) : state.view === 'schedule' ? V.scheduleView(state) : state.view === 'workday' ? V.workdayView(state) : state.view === 'expense' ? V.expenseView(state) : state.view === 'return' ? V.stockView(state) : V.placeholderView(state)}</main>` +
    (state.view === 'visit' ? V.footerView(state) : '') +
    V.modalView(state) +
    V.receiptModalView(state) +
    V.outcomeModalView(state) +
    V.scanView(state) +
    V.menuView(state);
  document.querySelectorAll('[data-scroll]').forEach((e) => { e.scrollTop = scrolls[e.dataset.scroll] ?? 0; });
  publish();
  if (state.modal?.type === 'item') {
    const it = state.items.find((i) => i.id === state.modal.id);
    if (it && !it.price) $('[data-item-field=price]')?.focus();
  }
}

function updateItems(id, patch) {
  set({ items: state.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
}

// AIカメラ（モック）: 画像から疑似的に候補を返す
function runAi(photo) {
  set({ ai: { status: 'loading', photo, candidates: [] } });
  render();
  setTimeout(() => {
    const start = photo.length % PRODUCTS.length;
    const candidates = [0, 3, 7].map((off, n) => ({
      ...PRODUCTS[(start + off) % PRODUCTS.length],
      confidence: [92, 71, 48][n],
    }));
    set({ ai: { status: 'done', photo, candidates } });
    if (state.modal?.type === 'ai') $('#ai').innerHTML = V.aiView(state);
  }, 1200);
}

const newCode = () => {
  const used = Object.values(state.labels);
  let code;
  do code = `RQ-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
  while (used.includes(code));
  return code;
};

function assignLabel(key, raw) {
  const code = raw.trim().toUpperCase();
  if (!code) return;
  if (Object.values(state.labels).includes(code)) {
    set({ labelError: { key, msg: `このシール(${code})は既に別の商品に紐づいています` } });
    return;
  }
  set({ labels: { ...state.labels, [key]: code }, labelError: null });
}

let scanToken = 0;

// シールNo.（読取・入力）を入庫する。結果は画面に表示する
function receiveCode(raw) {
  const { list, result } = receive(loadUnits(), state.user, raw, { location: state.stock.location, by: userById(state.user).name });
  if (result.type === 'ok' && !saveUnits(list)) {
    showToast('入庫を保存できませんでした（保存容量不足）');
    return result;
  }
  set({ stock: { ...state.stock, last: resultMessage(result) } });
  return result;
}

function submitStockCode() {
  const input = $('#stock-code');
  if (!input) return;
  receiveCode(input.value);
  input.value = '';
}

function stockScanStep(token) {
  setTimeout(() => {
    if (token !== scanToken) return;
    const todo = pendingOf(inScope(byUser(loadUnits(), state.user), state.stock.scope));
    if (!todo.length) { set({ scan: { ...state.scan, status: 'empty', left: 0 } }); rerenderKeepScroll(); return; }
    const unit = todo[0];
    set({ scan: { ...state.scan, status: 'found', code: unit.code, name: unit.name, left: todo.length } });
    rerenderKeepScroll();
    setTimeout(() => {
      if (token !== scanToken) return;
      receiveCode(unit.code);
      set({ scan: { ...state.scan, status: 'scanning', code: '', stored: state.scan.stored + 1, left: todo.length - 1 } });
      rerenderKeepScroll();
      stockScanStep(token);
    }, 1000);
  }, 1800);
}

const actions = {
  // QR読取（モック）: カメラ画面を出し、少し待ってから読取成功 → 紐づけ
  'dummy-scan': (el) => {
    const key = el.dataset.key;
    scanToken += 1;
    const token = scanToken;
    set({ scan: { key, status: 'scanning', code: '' } });
    setTimeout(() => {
      if (token !== scanToken) return;
      set({ scan: { key, status: 'found', code: newCode() } });
      rerenderKeepScroll();
      setTimeout(() => {
        if (token !== scanToken) return;
        assignLabel(key, state.scan.code);
        set({ scan: null });
        rerenderKeepScroll();
      }, 1000);
    }, 2200);
  },
  'scan-cancel': () => { scanToken += 1; set({ scan: null }); },
  'dummy-scan-all': () => V.labelSlots(state).forEach((x) => !state.labels[x.key] && assignLabel(x.key, newCode())),
  'clear-label': (el) => {
    const { [el.dataset.key]: _removed, ...rest } = state.labels;
    set({ labels: rest, labelError: null });
  },
  // 本社からのメッセージ: タップで詳細をモーダルで開き、既読にする
  'msg-open': (el) => {
    set({ modal: { type: 'message', id: el.dataset.id } });
    markRead(state.user, [el.dataset.id]);
  },
  'msg-read-all': () => markRead(state.user, messagesFor(userById(state.user)).map((m) => m.id)),
  'dash-period': (el) => set({ dash: { ...state.dash, period: el.dataset.value } }),
  'dash-scope': (el) => set({ dash: { ...state.dash, scope: el.dataset.value, member: null } }),
  'dash-member': (el) => set({ dash: { ...state.dash, scope: 'member', member: el.dataset.id } }),
  'open-menu': () => set({ menuOpen: true }),
  'close-menu': () => set({ menuOpen: false }),
  nav: (el) => set({ view: el.dataset.value, menuOpen: false, modal: null }),
  'sched-select': (el) => set({ sched: { ...state.sched, sel: el.dataset.id } }),
  'sched-tab': (el) => { set({ sched: { ...state.sched, tab: el.dataset.value } }); if (el.dataset.value === 'route') requestGeo(); },
  'route-day': (el) => set({ route: { day: Number(el.dataset.value), sel: 'all', origin: 'prev' } }),
  // 訪問先を選ぶ（all=全行程）。2件目以降は、出発地を「前の予定の場所」「現在地」で切り替える
  'route-sel': (el) => set({ route: { ...state.route, sel: el.dataset.value, origin: 'prev' } }),
  'route-origin': (el) => set({ route: { ...state.route, origin: el.dataset.value } }),
  'route-for': (el) => { set({ view: 'schedule', sched: { ...state.sched, tab: 'route' }, route: { day: Number(el.dataset.day), sel: el.dataset.id ?? 'all', origin: 'prev' } }); requestGeo(); },
  // 予定から現地買取へ。訪問先の情報を引き継いだ、新しい訪問を始める
  'start-from-event': (el) => {
    const ev = eventById(el.dataset.id);
    if (!ev) return;
    if (state.phase !== 'open') { showToast('始業登録をしていないため、訪問を開始できません'); return; }
    if (state.visitStartedAt && !state.visitEndedAt) { showToast('現在、訪問中です。終了してから新しい訪問を開始してください'); return; }
    const keep = { user: state.user, dash: state.dash, sched: state.sched, route: state.route, geo: state.geo, stock: state.stock };
    state = {
      ...initialState(), ...keep, view: 'visit', visitEventId: ev.id,
      customer: { ...ev.customer }, callInfo: callInfoOf(ev, state.user),
    };
  },
  start: () => set({ visitStartedAt: Date.now(), step: 1 }),
  'confirm-customer': () => set({ customerConfirmed: true, modal: null }),
  'edit-customer': () => set({ customerConfirmed: false, modal: { type: 'customer' } }),
  'open-ai': () => set({ modal: { type: 'ai' } }),
  'open-item': (el) => set({ modal: { type: 'item', id: el.dataset.id } }),
  'close-modal': () => set({ modal: null }),
  rank: (el) => updateItems(el.dataset.id, { rank: el.dataset.value }),
  'price-add': (el) => {
    const item = state.items.find((i) => i.id === el.dataset.id);
    updateItems(item.id, { price: Math.max(0, item.price + Number(el.dataset.delta)) });
  },
  'price-set': (el) => updateItems(el.dataset.id, { price: Number(el.dataset.value) }),
  back: () => set({ step: Math.max(0, state.step - 1), showStaff: false }),
  next: () => V.canProceed(state) && set({ step: Math.min(V.STEPS.length - 1, state.step + 1), showStaff: false }),
  mtab: (el) => set({ mtab: el.dataset.value, mlimit: 40 }),
  // 絞り込み: カテゴリ → ブランド の順に掘り下げる（同じものを押すと解除）
  mcat: (el) => set({ mcat: state.mcat === el.dataset.value ? '' : el.dataset.value, mbrand: '', mlimit: 40 }),
  mbrand: (el) => set({ mbrand: state.mbrand === el.dataset.value ? '' : el.dataset.value, mlimit: 40 }),
  mclear: () => set({ mcat: '', mbrand: '', search: '', mlimit: 40 }),
  'mclear-search': () => set({ search: '', mlimit: 40 }),
  more: () => set({ mlimit: state.mlimit + 40 }),
  'add-item': (el) => {
    const p = PRODUCTS.find((x) => x.id === el.dataset.id);
    const existing = state.items.find((i) => i.id === p.id);
    set({ recent: pushRecent(p.id) });
    // 新規追加時は金額未入力（0）で明細に入れ、詳細モーダルで手入力する
    set(
      existing
        ? { items: state.items.map((i) => (i.id === p.id ? { ...i, qty: i.qty + 1 } : i)) }
        : {
            items: [...state.items, { id: p.id, name: p.name, category: p.category, qty: 1, rank: 'A', price: 0, sell: true }],
            modal: { type: 'item', id: p.id },
          },
    );
  },
  'remove-item': (el) => set({ items: state.items.filter((i) => i.id !== el.dataset.id), modal: null }),
  qty: (el) => {
    const item = state.items.find((i) => i.id === el.dataset.id);
    updateItems(item.id, { qty: Math.max(1, item.qty + Number(el.dataset.delta)) });
  },
  'toggle-sell': (el) =>
    set({ items: state.items.map((i) => (i.id === el.dataset.id ? { ...i, sell: !i.sell } : i)) }),
  'ai-dummy': () => runAi(DUMMY_ID('商品')),
  'send-gmo': () => {
    if (!V.canProceed(state)) return;
    const sentAt = Date.now();
    const items = V.selectedItems(state).map((i) => ({
      name: i.name, category: i.category, rank: i.rank, qty: i.qty, price: i.price, codes: V.codesOf(state, i),
    }));
    const record = {
      id: newContractId(), sentAt, status: '本人確認待ち',
      customer: state.customer, callInfo: state.callInfo, items, total: V.total(V.selectedItems(state)),
      kyc: null, signature: null, signedAt: null,
    };
    upsertContract(record);
    set({ contract: { id: record.id, sentAt }, step: V.STEPS.length - 1 });
    window.open(GMO_URL, '_blank', 'noopener');
  },
  'open-gmo': () => window.open(GMO_URL, '_blank', 'noopener'),
  'close-backdrop': (el, e) => e.target === el && set({ modal: null }),
  'open-hq': () => window.open(HQ_URL, '_blank', 'noopener'),
  'open-comments': () => set({ modal: { type: 'comments' } }),
  'open-appraisal-item': (el) => {
    const item = state.items.find((i) => i.id === el.dataset.id);
    set({ modal: { type: 'appraisal', itemId: item.id }, apMode: 'hq', draft: { name: item.name, note: '', photos: [] } });
  },
  'ap-mode': (el) => set({ apMode: el.dataset.value }),
  'ai-run': () => {
    const item = state.items.find((i) => i.id === state.modal?.itemId);
    if (!item || !state.draft.photos.length || state.aiBusy) return;
    set({ aiBusy: true });
    setTimeout(() => {
      updateItems(item.id, { aiAppraisal: estimateByPhotos(item, state.draft.photos) });
      set({ aiBusy: false });
      rerenderKeepScroll();
    }, 1400);
  },
  'ai-adopt': (el) => {
    const item = state.items.find((i) => i.id === el.dataset.id);
    if (!item?.aiAppraisal) return;
    updateItems(item.id, { price: item.aiAppraisal.price, rank: item.aiAppraisal.rank });
    showToast('AI査定の金額・ランクを買取金額に反映しました');
  },
  'ap-dummy-photo': () => set({ draft: { ...state.draft, photos: [...state.draft.photos, dummyPhoto(state.draft.photos.length + 1)] } }),
  'ap-remove-photo': (el) =>
    set({ draft: { ...state.draft, photos: state.draft.photos.filter((_, i) => i !== Number(el.dataset.idx)) } }),
  'send-appraisal': () => {
    const d = state.draft;
    if (!d.photos.length) return;
    upsertAppraisal({
      id: newAppraisalId(), createdAt: Date.now(), visitId: state.visitId, itemId: state.modal.itemId, name: d.name.trim() || '（名称未入力）',
      note: d.note, photos: d.photos, sender: `営業 ${userById(state.user).name}`, customerName: state.customer.name,
      status: '依頼中', reply: null, adopted: false,
    });
    set({ modal: { type: 'appraisal', itemId: state.modal.itemId }, draft: { ...d, note: '', photos: [] } });
    showToast('本社査定部に送信しました');
  },
  'adopt-comment': (el) => {
    const c = loadComments().find((x) => x.id === el.dataset.id);
    const target = c && state.items.find((i) => i.id === c.itemId);
    if (!target || !c.price) return;
    updateItems(target.id, { price: c.price, rank: c.rank ?? target.rank });
    upsertComment({ ...c, adopted: true });
    showToast('提案された査定額を買取金額に反映しました');
  },
  // 訪問終了は、お客様宅を出る前のチェックリストがすべて完了している場合のみ。買取代金は、経費として自動計上する
  finish: () => {
    if (V.leaveRemaining(state) !== 0) return;
    set({ visitEndedAt: Date.now() });
    const sel = V.selectedItems(state);
    const day = loadDay(state.user);
    if (day && !saveDay(recordVisit(day, { visitId: state.visitId, customerName: state.customer.name, itemCount: sel.reduce((n, i) => n + i.qty, 0), total: V.total(sel) }))) {
      showToast('買取代金を経費に計上できませんでした（保存容量不足）');
    }
    // 持ち帰り（入庫）の対象として、シールを貼った実物を1点ずつ登録する
    const units = unitsFromVisit({ visitId: state.visitId, userId: state.user, customerName: state.customer.name, slots: V.labelSlots(state), labels: state.labels });
    if (!saveUnits(addUnits(loadUnits(), units))) showToast('持ち帰り商品を登録できませんでした（保存容量不足）');
  },
  // 訪問できなかった（不在・日程変更の依頼など）場合の記録。訪問実績として残し、業績には影響させない
  'oc-open': () => set({ modal: { type: 'outcome' }, outcomeDraft: blankOutcomeDraft() }),
  'oc-type': (el) => set({ outcomeDraft: { ...state.outcomeDraft, type: el.dataset.value } }),
  'oc-submit': () => {
    const d = state.outcomeDraft;
    if (!outcomeReady(d) || !state.day) return;
    const now = Date.now();
    const outcome = { type: d.type, memo: d.memo.trim(), date: d.date, time: d.time, at: now };
    if (!saveDay(recordVisit(state.day, { visitId: state.visitId, customerName: state.customer.name, itemCount: 0, total: 0, outcome }, now))) {
      showToast('記録できませんでした（保存容量不足）');
      return;
    }
    set({ visitStartedAt: now, visitEndedAt: now, outcome, modal: null, outcomeDraft: blankOutcomeDraft() });
    showToast('訪問の結果を記録しました');
  },
  // 始業・終業
  'wd-start': () => {
    if (!startReady(state.startForm, state.user)) return;
    if (!saveDay(startDay(state.user, state.startForm))) { showToast('始業を記録できませんでした（保存容量不足）'); return; }
    set({ view: 'dashboard', startForm: blankStartForm() });
    showToast('始業を記録しました。本日もよろしくお願いします');
  },
  'wd-close': () => {
    if (!closeReady(state.closeForm, state.day, state.user, Boolean(state.visitStartedAt && !state.visitEndedAt))) return;
    if (!saveDay(closeDay(state.day, state.user, state.closeForm))) { showToast('日報を保存できませんでした（保存容量不足）'); return; }
    set({ closeForm: blankCloseForm(), modal: null });
    showToast('日報を提出し、終業しました。お疲れさまでした');
  },
  'wd-demo-start': () => set({
    startForm: { ...state.startForm, counted: carryoverFor(state.user).amount, countedSet: true, checks: Object.fromEntries(START_CHECKS.map((c) => [c.key, true])) },
  }),
  'wd-demo-close': () => set({
    closeForm: { ...state.closeForm, counted: summaryOf(state.day, state.user).balance, countedSet: true, checks: Object.fromEntries(END_CHECKS.map((c) => [c.key, true])) },
  }),
  // 商品の持ち帰り（入庫）
  'stock-tab': (el) => set({ stock: { ...state.stock, tab: el.dataset.value } }),
  'stock-scope': (el) => set({ stock: { ...state.stock, scope: el.dataset.value, last: null } }),
  'stock-loc': (el) => set({ stock: { ...state.stock, location: el.dataset.value } }),
  'stock-submit': () => submitStockCode(),
  'stock-missing': (el) => {
    if (!confirm('この商品を「所在不明」として報告します。よろしいですか？\n（後でシールを読み取れば、入庫できます）')) return;
    if (!saveUnits(markMissing(loadUnits(), el.dataset.code))) showToast('保存できませんでした（保存容量不足）');
  },
  'stock-demo-add': () => {
    if (!saveUnits(demoUnits(state.user, loadUnits()))) showToast('保存できませんでした（保存容量不足）');
  },
  // 連続QR読取（モック）: 入庫待ちのシールを順に読み取り、入庫する。「完了」で終了
  'stock-scan': () => {
    const todo = pendingOf(inScope(byUser(loadUnits(), state.user), state.stock.scope));
    if (!todo.length) return;
    scanToken += 1;
    set({ scan: { mode: 'stock', status: 'scanning', code: '', name: '', stored: 0, left: todo.length, location: state.stock.location } });
    stockScanStep(scanToken);
  },
  // 経費
  'exp-type': (el) => set({ expDraft: { ...state.expDraft, type: el.dataset.value } }),
  'exp-photo-dummy': () => set({ expDraft: { ...state.expDraft, photo: dummyReceipt(state.expDraft) } }),
  'exp-photo-clear': () => set({ expDraft: { ...state.expDraft, photo: null } }),
  'exp-submit': () => {
    const d = state.expDraft;
    if (!expenseReady(d) || !state.day) return;
    const next = addExpense(state.day, { id: newId('EX'), at: Date.now(), type: d.type, amount: d.amount, memo: d.memo.trim(), photo: d.photo, auto: false });
    if (!saveDay(next)) { showToast('保存できませんでした（写真の容量が大きすぎます）。撮り直してください'); return; }
    set({ expDraft: blankExpenseDraft() });
    showToast('経費を計上しました');
  },
  'exp-remove': (el) => {
    if (!confirm('この経費の計上を取り消します。よろしいですか？')) return;
    saveDay(removeExpense(state.day, el.dataset.id));
  },
  'exp-view': (el) => set({ modal: { type: 'receipt', id: el.dataset.id } }),
  // お客様の評価（営業の記録）。保存済みの内容があれば、それを下書きとして開く
  'open-eval': () => set({ modal: { type: 'eval' }, evalDraft: state.evaluation ? { ...state.evaluation } : V.blankEval() }),
  'eval-set': (el) => {
    const v = el.dataset.field === 'overall' ? Number(el.dataset.value) : el.dataset.value;
    set({ evalDraft: { ...state.evalDraft, [el.dataset.field]: state.evalDraft[el.dataset.field] === v ? (typeof v === 'number' ? 0 : '') : v } });
  },
  'eval-toggle': (el) => {
    const cur = state.evalDraft[el.dataset.field];
    const v = el.dataset.value;
    set({ evalDraft: { ...state.evalDraft, [el.dataset.field]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] } });
  },
  'eval-save': () => {
    const e = state.evalDraft;
    upsertEval({
      visitId: state.visitId, customerName: state.customer.name, phone: state.customer.phone, savedAt: Date.now(), by: `営業 ${userById(state.user).name}`, ...e, memo: e.memo.trim(),
    });
    set({ evaluation: { ...e, memo: e.memo.trim() }, modal: null });
    showToast('お客様の評価を保存しました');
  },
  'staff-toggle': () => set({ showStaff: !state.showStaff }),
  'brief-propose': (el) => set({ briefing: { ...state.briefing, propose: el.dataset.value } }),
  'brief-all': () => set({ briefing: { checks: Object.fromEntries(V.BRIEFING_CHECKS.map((c) => [c.key, true])), propose: 'yes' } }),
  'leave-all': () => set({ leaveChecks: Object.fromEntries(V.LEAVE_CHECKS.map((c) => [c.key, true])) }),
  reset: () => { state = initialState(); },
  'reset-all': () => { if (confirm(RESET_CONFIRM)) { clearTransactions(); state = initialState(); showToast('データを初期化しました'); } },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.tagName === 'INPUT') return;
  // 入力欄のタップや、モーダル内部のタップ（背面クリック扱いのもの）で再描画すると、フォーカスが外れて入力できなくなる
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
  if (el.dataset.action === 'close-backdrop' && e.target !== el) return;
  actions[el.dataset.action]?.(el, e);
  rerenderKeepScroll();
});
// スキャナ（キーボード入力として動作）・手入力のシールNo.は、Enterで入庫
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.target.dataset.stockCode === undefined) return;
  e.preventDefault();
  submitStockCode();
  rerenderKeepScroll();
});
document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.dashuser !== undefined) {
    // デモ用: ログインユーザーの切り替え。一般の営業に切り替えると、閲覧範囲は自分のみになる
    set({ user: el.value, dash: { ...state.dash, scope: 'me', member: null } });
    rerenderKeepScroll();
  }
  if (el.dataset.action === 'wd-check') {
    const key = el.dataset.form === 'start' ? 'startForm' : 'closeForm';
    set({ [key]: { ...state[key], checks: { ...state[key].checks, [el.dataset.key]: el.checked } } });
    rerenderKeepScroll();
  }
  if (el.dataset.expPhoto !== undefined && el.files[0]) {
    shrinkImage(el.files[0], 1000)
      .then((img) => { set({ expDraft: { ...state.expDraft, photo: img } }); rerenderKeepScroll(); })
      .catch(() => showToast('画像を読み込めませんでした'));
  }
  if (el.dataset.action === 'brief-check') {
    set({ briefing: { ...state.briefing, checks: { ...state.briefing.checks, [el.dataset.key]: el.checked } } });
    rerenderKeepScroll();
  }
  if (el.dataset.action === 'leave-check') {
    set({ leaveChecks: { ...state.leaveChecks, [el.dataset.key]: el.checked } });
    rerenderKeepScroll();
  }
  if (el.dataset.action === 'ack-comment') {
    const c = loadComments().find((x) => x.id === el.dataset.id);
    if (c) upsertComment({ ...c, ack: el.checked, ackAt: el.checked ? Date.now() : null });
    rerenderKeepScroll();
  }
  if (el.dataset.apPhoto !== undefined && el.files[0]) {
    shrinkImage(el.files[0])
      .then((img) => { set({ draft: { ...state.draft, photos: [...state.draft.photos, img] } }); rerenderKeepScroll(); })
      .catch(() => showToast('画像を読み込めませんでした'));
  }
  if (el.dataset.aiPhoto !== undefined && el.files[0]) {
    const reader = new FileReader();
    reader.onload = () => runAi(reader.result);
    reader.readAsDataURL(el.files[0]);
  }
  if (el.dataset.labelKey) { assignLabel(el.dataset.labelKey, el.value); rerenderKeepScroll(); }
  if (el.dataset.itemField === 'rank') updateItems(el.dataset.id, { rank: el.value });
});

// 金額バーのドラッグ操作（再描画せず、つまみ・入力欄・警告だけを更新してドラッグを途切れさせない）
let dragging = null;
function applySlider(track, clientX) {
  const rect = track.getBoundingClientRect();
  const lo = Number(track.dataset.lo);
  const hi = Number(track.dataset.hi);
  const step = Number(track.dataset.step);
  const cur = state.items.find((i) => i.id === track.dataset.id);
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  // バーは「1個あたり」の金額。買取金額（個数分の合計）＝ 1個あたり × 個数
  const unit = Math.max(step, Math.round((lo + ratio * (hi - lo)) / step) * step);
  const price = unit * cur.qty;
  updateItems(cur.id, { price });
  const item = state.items.find((i) => i.id === track.dataset.id);
  const thumb = track.querySelector('[data-thumb]');
  thumb.classList.remove('hidden');
  thumb.style.left = `${(Math.min(1, Math.max(0, (unit - lo) / (hi - lo))) * 100).toFixed(1)}%`;
  const warn = V.rangeWarn(item);
  thumb.classList.toggle('bg-rose-600', warn.includes('rose'));
  thumb.classList.toggle('bg-slate-900', !warn.includes('rose'));
  track.closest('#range-box').querySelector('[data-warn]').innerHTML = warn;
  const input = $('[data-item-field=price]');
  if (input) input.value = price.toLocaleString('ja-JP');
  publish();
}
document.addEventListener('pointerdown', (e) => {
  const track = e.target.closest('[data-slider]');
  if (!track) return;
  dragging = track;
  track.setPointerCapture(e.pointerId);
  applySlider(track, e.clientX);
});
document.addEventListener('pointermove', (e) => { if (dragging) applySlider(dragging, e.clientX); });
const endDrag = () => {
  if (!dragging) return;
  dragging = null;
  const next = $('[data-action="next"]');
  if (next) next.disabled = !V.canProceed(state);
};
document.addEventListener('pointerup', endDrag);
document.addEventListener('pointercancel', endDrag);

// テキスト入力は再描画せず state のみ更新（フォーカス維持）
document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset.wd) {
    // 始業・終業・経費の入力。再描画せず state だけ更新し、差異の表示とボタンだけ差し替える（フォーカス維持）
    const filled = el.value.trim() !== '';
    const amount = el.dataset.wd.endsWith('counted') || el.dataset.wd === 'exp-amount' ? formatMoneyInput(el) : 0;
    const patch = {
      'start-counted': { startForm: { ...state.startForm, counted: amount, countedSet: filled } },
      'start-note': { startForm: { ...state.startForm, note: el.value } },
      'close-counted': { closeForm: { ...state.closeForm, counted: amount, countedSet: filled } },
      'close-note': { closeForm: { ...state.closeForm, note: el.value } },
      'close-comment': { closeForm: { ...state.closeForm, comment: el.value } },
      'exp-amount': { expDraft: { ...state.expDraft, amount } },
      'exp-memo': { expDraft: { ...state.expDraft, memo: el.value } },
      'oc-memo': { outcomeDraft: { ...state.outcomeDraft, memo: el.value } },
      'oc-date': { outcomeDraft: { ...state.outcomeDraft, date: el.value } },
      'oc-time': { outcomeDraft: { ...state.outcomeDraft, time: el.value } },
    }[el.dataset.wd];
    set(patch);
    if ($('#wd-live')) $('#wd-live').innerHTML = V.wdLiveView(state);
    if ($('#exp-live')) $('#exp-live').innerHTML = V.expLiveView(state);
    if ($('#oc-live')) $('#oc-live').innerHTML = V.ocLiveView(state);
    return;
  }
  if (el.dataset.evalmemo !== undefined) {
    set({ evalDraft: { ...state.evalDraft, memo: el.value } });
  } else if (el.dataset.draft) {
    set({ draft: { ...state.draft, [el.dataset.draft]: el.value } });
  } else if (el.dataset.field) {
    set({ customer: { ...state.customer, [el.dataset.field]: el.value } });
    const next = $('[data-action="next"]');
    if (next) next.disabled = !V.canProceed(state);
  } else if (el.id === 'search') {
    set({ search: el.value, mtab: 'browse', mlimit: 40 });
    $('#master').innerHTML = V.masterBodyView(state);
    $('#search-clear')?.classList.toggle('hidden', !state.search);
  } else if (el.dataset.itemField === 'price') {
    const price = formatMoneyInput(el);
    updateItems(el.dataset.id, { price });
    const item = state.items.find((i) => i.id === el.dataset.id);
    const box = $('#range-box');
    if (box && item) box.innerHTML = V.rangeView(item);
    publish();
    const next = $('[data-action="next"]');
    if (next) next.disabled = !V.canProceed(state);
  }
});

function rerenderKeepScroll() {
  const y = window.scrollY;
  const active = document.activeElement?.id;
  render();
  window.scrollTo(0, y);
  if (active === 'search') $('#search')?.focus();
  if (active === 'stock-code') $('#stock-code')?.focus();
}

// 本社(別タブ)からの回答を受信
window.addEventListener('storage', (e) => {
  if (e.key === DEPOSIT_KEY) {
    showToast('🏦 本社から入金がありました');
    rerenderKeepScroll();
    return;
  }
  if (e.key === MSG_KEY) {
    showToast('📢 本社からメッセージが届きました');
    rerenderKeepScroll();
    return;
  }
  if (e.key === APPROVAL_KEY) {
    const decided = (l) => l.filter((a) => a.visitId === state.visitId && a.status !== '待ち').length;
    if (decided(loadApprovals()) > decided(state.approvals)) showToast('✅ 査定部から承認の結果が届きました');
    rerenderKeepScroll();
    return;
  }
  if (e.key === COMMENT_KEY) {
    const mine = (list) => list.filter((c) => c.visitId === state.visitId).length;
    if (mine(loadComments()) > state.comments.length) showToast('❗ 本社査定部からコメントが届きました');
    rerenderKeepScroll();
    return;
  }
  if (e.key !== AP_STORAGE_KEY) return;
  // 下書き入力中は再描画しない（フォーカスが外れるため）
  if (!document.activeElement?.dataset?.draft) rerenderKeepScroll();
});

setInterval(() => {
  const t = $('#timer');
  if (t && state.visitStartedAt && !state.visitEndedAt) t.textContent = fmtElapsed(state.visitStartedAt);
}, 1000);

initTheme();
render();
