import { PRODUCTS } from './data.js';
import { loadRecent, pushRecent } from './search.js';
import { estimateByPhotos, RECEIPT_SAMPLES, receiptSampleFor } from './ai.js';
import { fmtElapsed } from './format.js';
import {
  sendMessage,
  AP_STORAGE_KEY, APPROVAL_KEY, MSG_KEY, DEPOSIT_KEY, markRead, upsertEval, COMMENT_KEY, loadApprovals, GMO_URL, RESET_CONFIRM, clearTransactions, loadComments, upsertComment, HQ_URL, loadAppraisals, newAppraisalId, newContractId, publishLive, upsertAppraisal, upsertContract,
} from './store.js';
import { dummyPhoto, shrinkImage } from './image.js';
import { addPhoto, removePhoto } from './itemPhotos.js';
import { threadFor, addMessage, hasUnread, markRead as markThreadRead, messagesOf } from './appraisalThread.js';
import * as V from './views.js';
import { evalTargetOf, evalTargetOfVisit } from './scheduleView.js';
import { initTheme } from './theme.js';
import { initHelp } from './help.js';
import { userById, isLeader } from './dashboard.js';
import { ACCOUNTS } from './auth.js';
import { setFirstVisitCustomerEval } from './customerHistory.js';
import { recordDeclined } from './declined.js';
const ACCOUNTS_BY_USER = (userId) => ACCOUNTS.find((a) => a.userId === userId) ?? null;
import { messagesFor, hqMessagesFor, leaderMessagesFor } from './messages.js';
import { EVENTS, eventById, eventsOfDay } from './schedule.js';
import {
  accountFor, passwordProblem, issueCode, checkCode, loadSession, saveSession, clearSession, RESEND_WAIT, MAX_CODE_TRIES,
} from './auth.js';
import { formatMoneyInput } from './moneyInput.js';
import {
  START_CHECKS, END_CHECKS, loadDay, saveDay, phaseOf, dateKey, startDay, closeDay, addExpense, removeExpense, recordVisit, summaryOf, carryoverFor,
  newId, blankOutcomeDraft, outcomeReady, outcomeOf, blankStartForm, blankCloseForm, blankExpenseDraft, expenseReady, startReady, closeReady,
} from './workday.js';
import {
  loadUnits, saveUnits, unitsFromVisit, addUnits, byUser, inScope, pendingOf, receive, markMissing, resultMessage, demoUnits, sealColorOfCode, newSealNo,
} from './stock.js';
import { DEFAULT_STOCK, stockTarget } from './stockView.js';

// 予定（訪問）から、コールセンター受付情報の表示用データを作る
function callInfoOf(ev, userId) {
  return { receptionNo: ev.receptionNo, receivedAt: ev.receivedAt, operator: ev.operator, apType: ev.apType, appraiser: userById(userId).name };
}

const blankAuth = (id = '') => ({ screen: 'login', id, pw: '', showPw: false, code: '', newPw: '', newPw2: '', error: '', info: '', pending: null, resetUserId: null });

// ログイン中の営業の、最初の予定を、訪問・予定表の初期値にする
const firstEventOf = (userId) => (userId && eventsOfDay(0, userId)[0]) || EVENTS[0];

const initialState = () => ({
  auth: blankAuth(),
  visitId: `V-${Date.now().toString(36).toUpperCase()}`,
  view: phaseOf(loadDay(loadSession() ?? '')) === 'before' ? 'workday' : 'dashboard', // 初期画面: 未ログイン→ログイン、始業前→始業、始業済み→ダッシュボード
  user: loadSession(), // 未ログインなら null（ログイン画面を表示）
  day: null,
  phase: 'before',
  startForm: blankStartForm(),
  closeForm: blankCloseForm(),
  expDraft: blankExpenseDraft(),
  outcome: null,
  outcomeDraft: blankOutcomeDraft(),
  units: [],
  stock: { ...DEFAULT_STOCK },
  dash: { period: 'month', scope: 'me', member: null, viewAs: null, msgOpen: {} },
  leaderDraft: { title: '', body: '', important: false },
  menuOpen: false,
  step: 0,
  visitStartedAt: null,
  visitEndedAt: null,
  visitEventId: firstEventOf(loadSession()).id,
  sched: { sel: firstEventOf(loadSession()).id, tab: 'calendar' },
  route: { day: 0, sel: 'all', origin: 'prev' },
  geo: null,
  callInfo: callInfoOf(firstEventOf(loadSession()), loadSession() ?? 'u01'),
  customer: { ...firstEventOf(loadSession()).customer },
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
  sealColors: {}, // シールの色（枠ごと）。紫・赤は、のちに本社へ移す高額品
  labelError: null,
  contract: null,
  appraisals: [],
  comments: [],
  scan: null,
  leaveChecks: {},
  showStaff: false,
  briefing: { checks: {}, propose: '' },
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

// レシートのAI読み取り（モック）。種別・金額・内容を自動入力する。すでに入力済みの項目は上書きしない（再読取のときは上書き）
let receiptToken = 0;
function readReceiptAi(sample, { overwrite = false } = {}) {
  receiptToken += 1;
  const token = receiptToken;
  set({ expDraft: { ...state.expDraft, ai: { status: 'reading', sample } } });
  setTimeout(() => {
    if (token !== receiptToken || !state.expDraft.photo) return;
    const d = state.expDraft;
    const fill = { type: overwrite || !d.type, amount: overwrite || !(d.amount > 0), memo: overwrite || !d.memo.trim() };
    const now = new Date();
    set({ expDraft: {
      ...d, ai: { status: 'done', sample, filled: fill },
      type: fill.type ? sample.type : d.type, amount: fill.amount ? sample.amount : d.amount,
      memo: fill.memo ? `${sample.store}（${now.getMonth() + 1}/${now.getDate()}）` : d.memo,
    } });
    rerenderKeepScroll();
  }, 1300);
}

// 経費のダミーレシート写真（デモ用）
let dummyReceiptSeq = 0;
const dummyReceipt = (d) => 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="320"><rect width="240" height="320" fill="#f8fafc" stroke="#cbd5e1"/><text x="20" y="40" font-size="16" fill="#334155">${d.store ?? 'RECEIPT'}</text>${[70, 100, 130, 160].map((y) => `<rect x="20" y="${y}" width="${200 - (y % 3) * 30}" height="10" fill="#cbd5e1"/>`).join('')}<text x="20" y="250" font-size="22" fill="#0f172a">¥ ${Number(d.amount || 0).toLocaleString('ja-JP')}</text><text x="20" y="290" font-size="14" fill="#64748b">DUMMY ${dateKey()}</text></svg>`);

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

// 査定部のリアルタイム画面へ、現在の訪問状況を共有
function publish() {
  if (!state.visitStartedAt) return;
  publishLive({
    visitId: state.visitId,
    staff: `営業 ${userById(state.user).name}`,
    startedAt: state.visitStartedAt,
    endedAt: state.visitEndedAt,
    userId: state.user,
    eventId: state.visitEventId,
    step: state.step,
    briefing: { propose: state.briefing.propose },
    customerName: state.customer.name,
    phone: state.customer.phone,
    callInfo: state.callInfo,
    outcome: state.outcome ? { ...state.outcome, label: outcomeOf(state.outcome.type).label } : null,
    items: state.items.map(({ id, name, category, rank, qty, price, sell, aiAppraisal }) => ({ id, name, category, rank, qty, price, sell, aiAppraisal })),
    updatedAt: Date.now(),
  });
}

// 査定依頼のチャットを開いている間は、査定員の発言を既読にする
function readOpenThread() {
  if (state.modal?.type !== 'appraisal' || state.apMode !== 'hq') return;
  const t = threadFor(loadAppraisals(), state.visitId, state.modal.itemId);
  if (t && hasUnread(t, 'sales')) upsertAppraisal(markThreadRead(t, 'sales', Date.now()));
}

function render() {
  if (!state.user) { $('#app').innerHTML = V.authView(state); return; } // 未ログイン
  const day = loadDay(state.user);
  const phase = phaseOf(day);
  set({ day, phase, units: loadUnits() });
  // 始業するまで（終業後も）、現地買取だけは使えない
  if (phase !== 'open' && state.view === 'visit') set({ view: 'workday', modal: null });
  readOpenThread();
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
  document.querySelectorAll('[data-msgs]').forEach((e) => e.dispatchEvent(new Event('scroll', { bubbles: true }))); // 「他○件あります」の表示を、スクロール位置に合わせる
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
  do code = newSealNo();
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
  const color = sealColorOfCode(code); // QRから色が分かれば、自動で選ぶ
  set({ labels: { ...state.labels, [key]: code }, labelError: null, sealColors: color ? { ...state.sealColors, [key]: color } : state.sealColors });
}

let scanToken = 0;

// シールNo.（読取・入力）を入庫する。結果は画面に表示する
function receiveCode(raw) {
  const target = stockTarget(state);
  const { list, result } = receive(loadUnits(), state.user, raw, { location: target.location, by: userById(state.user).name, warehouseId: target.warehouse.id });
  if (result.type === 'ok' && !saveUnits(list)) {
    showToast('入庫を保存できませんでした（保存容量不足）');
    return result;
  }
  set({ stock: { ...state.stock, last: result.type === 'ok' ? null : resultMessage(result) } }); // 入庫できたときは、メッセージを出さない（一覧が入庫済みに変わる）
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
    const todo = pendingOf(inScope(byUser(loadUnits(), state.user), state.stock.scope))
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
  // デモ用: 残りを一括で読み取る（色は、QRから自動で選ばれる）
  'dummy-scan-all': () => {
    V.labelSlots(state).forEach((x) => !state.labels[x.key] && assignLabel(x.key, newCode()));
    set({ sealColors: Object.fromEntries(V.labelSlots(state).map((x) => [x.key, state.sealColors[x.key] ?? sealColorOfCode(state.labels[x.key]) ?? 'yellow'])) });
  },
  'seal-color': (el) => set({ sealColors: { ...state.sealColors, [el.dataset.key]: el.dataset.value } }),
  'clear-label': (el) => {
    const { [el.dataset.key]: _removed, ...rest } = state.labels;
    const { [el.dataset.key]: _color, ...colors } = state.sealColors;
    set({ labels: rest, sealColors: colors, labelError: null });
  },
  // 本社からのメッセージ: タップで詳細をモーダルで開き、既読にする
  'msg-open': (el) => {
    set({ modal: { type: 'message', id: el.dataset.id } });
    markRead(state.user, [el.dataset.id]);
  },
  'msg-read-all': (el) => markRead(state.user, (el.dataset.kind === 'leader' ? leaderMessagesFor : hqMessagesFor)(userById(state.user)).map((m) => m.id)),
  'hearing-open': (el) => { if (el.dataset.id) set({ modal: { type: 'hearing', eventId: el.dataset.id } }); },
  'msg-toggle': (el) => set({ dash: { ...state.dash, msgOpen: { ...state.dash.msgOpen, [el.dataset.key]: !state.dash.msgOpen?.[el.dataset.key] } } }),
  // グループリーダーから、グループのメンバーへのメッセージ
  'leader-compose': () => set({ modal: { type: 'leadermsg' }, leaderDraft: { title: '', body: '', important: false } }),
  'leader-important': () => set({ leaderDraft: { ...state.leaderDraft, important: !state.leaderDraft.important } }),
  'leader-send': () => {
    const u = userById(state.user);
    const d = state.leaderDraft;
    if (!isLeader(u)) return;
    if (!d.title.trim() || !d.body.trim()) { showToast('タイトルと本文を入力してください'); return; }
    sendMessage({ id: `ldr-${Date.now().toString(36)}`, kind: 'leader', important: d.important, sender: `リーダー ${u.name}`, target: u.group, sentAt: Date.now(), title: d.title.trim(), body: d.body.trim() });
    set({ modal: null, leaderDraft: { title: '', body: '', important: false }, dash: { ...state.dash, msgOpen: { ...state.dash.msgOpen, leader: true } } });
    showToast('グループのメンバーに送信しました');
  },
  // デモ用: ダッシュボードで表示するロール（メンバー／グループリーダー）の切り替え
  // ログイン（ID・パスワード → SMS認証コード）とパスワードの再設定
  'auth-toggle-pw': () => set({ auth: { ...state.auth, showPw: !state.auth.showPw } }),
  'auth-login': () => {
    const a = state.auth;
    if (!a.id.trim() || !a.pw) { set({ auth: { ...a, error: 'ログインIDとパスワードを入力してください', info: '' } }); return; }
    // モック: ID・パスワードは何でも通る。次は、SMSの認証コード（2要素認証）
    set({ auth: { ...a, screen: 'sms', pw: '', code: '', error: '', info: '', pending: issueCode(accountFor(a.id).userId, 'login') } });
  },
  'auth-verify': () => {
    const a = state.auth;
    const p = a.pending;
    const r = checkCode(p, a.code.trim());
    if (r === 'ok') {
      if (p.purpose === 'login') { saveSession(p.userId); state = initialState(); showToast('ログインしました'); return; }
      set({ auth: { ...a, screen: 'newpw', code: '', error: '', info: '', resetUserId: p.userId, pending: null } });
      return;
    }
    const tries = (p?.tries ?? MAX_CODE_TRIES) + 1;
    if (r === 'locked' || tries >= MAX_CODE_TRIES) {
      set({ auth: { ...blankAuth(a.id), error: '認証コードの入力ミスが続いたため、最初からやり直してください' } });
      return;
    }
    set({ auth: { ...a, code: '', info: '', pending: { ...p, tries }, error: r === 'expired' ? '認証コードの有効期限が切れました。再送してください' : `認証コードが違います（あと${MAX_CODE_TRIES - tries}回）` } });
  },
  'auth-resend': () => {
    const p = state.auth.pending;
    if (!p || Date.now() - p.sentAt < RESEND_WAIT) return;
    set({ auth: { ...state.auth, code: '', error: '', info: '認証コードを再送しました', pending: issueCode(p.userId, p.purpose) } });
  },
  'auth-forgot': () => set({ auth: { ...blankAuth(state.auth.id), screen: 'forgot' } }),
  'auth-forgot-send': () => {
    const a = state.auth;
    if (!a.id.trim()) { set({ auth: { ...a, error: 'ログインIDを入力してください' } }); return; }
    set({ auth: { ...a, screen: 'forgot-sms', code: '', error: '', info: '', pending: issueCode(accountFor(a.id).userId, 'forgot') } });
  },
  'auth-setpw': () => {
    const a = state.auth;
    const acc = ACCOUNTS_BY_USER(a.resetUserId);
    const problem = passwordProblem(a.newPw, acc?.loginId ?? '') || (a.newPw !== a.newPw2 ? '確認用のパスワードが一致しません' : '');
    if (!acc || problem) { set({ auth: { ...a, error: problem || 'もう一度、最初からやり直してください' } }); return; }
    // モック: パスワードは保存しない（ログインでは何を入力しても通る）
    set({ auth: { ...blankAuth(acc.loginId), info: 'パスワードを変更しました。新しいパスワードでログインしてください' } });
  },
  'auth-back': () => set({ auth: blankAuth(state.auth.id) }),
  logout: () => { clearSession(); state = initialState(); },
  'dash-viewas': (el) => set({ dash: { ...state.dash, viewAs: el.dataset.value === (isLeader(userById(state.user)) ? 'leader' : 'member') ? null : el.dataset.value, scope: 'me', member: null } }),
  'dash-demo': () => set({ dash: { ...state.dash, demoOpen: !state.dash.demoOpen } }),
  'dash-reports': () => set({ modal: { type: 'dashreports', userId: null, date: null } }),
  'dash-rep-user': (el) => set({ modal: { type: 'dashreports', userId: el.dataset.id, date: null } }),
  'dash-rep-day': (el) => set({ modal: { ...state.modal, date: el.dataset.date } }),
  'dash-rep-back': () => set({ modal: { ...state.modal, ...(state.modal.date ? { date: null } : { userId: null }) } }),
  'dash-visits': (el) => set({ modal: { type: 'dashvisits', date: el.dataset.date || null } }),
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
  'item-photo-dummy': (el) => { const it = state.items.find((i) => i.id === el.dataset.id); if (it) set({ items: state.items.map((i) => (i.id === it.id ? addPhoto(i, dummyPhoto(`${it.name.slice(0, 6)} ${(it.photos?.length ?? 0) + 1}`)) : i)) }); },
  'item-photo-remove': (el) => set({ items: state.items.map((i) => (i.id === el.dataset.id ? removePhoto(i, Number(el.dataset.idx)) : i)) }),
  'remove-item': (el) => set({ items: state.items.filter((i) => i.id !== el.dataset.id), labels: Object.fromEntries(Object.entries(state.labels).filter(([k]) => !k.startsWith(`${el.dataset.id}-`))), sealColors: Object.fromEntries(Object.entries(state.sealColors).filter(([k]) => !k.startsWith(`${el.dataset.id}-`))), modal: null }),
  qty: (el) => {
    const item = state.items.find((i) => i.id === el.dataset.id);
    const qty = Math.max(1, item.qty + Number(el.dataset.delta));
    updateItems(item.id, { qty });
    // 数量を減らしたら、なくなる分のシールの紐づけも外す
    const kept = (m) => Object.fromEntries(Object.entries(m).filter(([k]) => !k.startsWith(`${item.id}-`) || Number(k.slice(item.id.length + 1)) <= qty));
    set({ labels: kept(state.labels), sealColors: kept(state.sealColors) });
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
  // 査定部への依頼。写真は任意（文章か写真のどちらかは必要）。やり取りが始まったあとも、文章か写真で追記する（チャット）
  'send-appraisal': () => {
    const d = state.draft;
    const itemId = state.modal.itemId;
    const text = d.note.trim();
    const thread = threadFor(loadAppraisals(), state.visitId, itemId);
    const msg = { from: 'sales', text, photos: d.photos, at: Date.now() };
    if (!text && !d.photos.length) return;
    if (thread) {
      upsertAppraisal(addMessage(thread, msg));
    } else {
      upsertAppraisal(addMessage({
        id: newAppraisalId(), createdAt: Date.now(), visitId: state.visitId, itemId, name: d.name.trim() || '（名称未入力）',
        note: d.note, photos: d.photos, sender: `営業 ${userById(state.user).name}`, customerName: state.customer.name,
        status: '依頼中', reply: null, adopted: false, messages: [],
      }, msg));
    }
    set({ modal: { type: 'appraisal', itemId }, draft: { ...d, note: '', photos: [] } });
    showToast('査定部に送信しました');
  },
  // 査定員の提案額を、買取金額に反映する（チャットの発言ごと）
  'adopt-reply': (el) => {
    const t = loadAppraisals().find((x) => x.id === el.dataset.id);
    const m = t && messagesOf(t).find((x) => x.id === el.dataset.msg);
    const target = t && state.items.find((i) => i.id === t.itemId);
    if (!m?.price || !target) return;
    updateItems(target.id, { price: m.price, rank: m.rank ?? target.rank });
    upsertAppraisal({ ...t, messages: messagesOf(t).map((x) => (x.id === m.id ? { ...x, adopted: true } : x)) });
    showToast('提案された査定額を買取金額に反映しました');
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
  'finish-ask': () => { if (V.leaveRemaining(state) === 0) set({ modal: { type: 'finish-confirm' } }); },
  finish: () => {
    if (V.leaveRemaining(state) !== 0) return;
    set({ visitEndedAt: Date.now(), modal: null });
    // 査定はしたが売らなかったもの（見送り品）を、お客様ごとの記録に残す。次回の訪問や、営業の当てはめの判断に使う
    recordDeclined({ visitId: state.visitId, phone: state.customer.phone, customerName: state.customer.name, at: Date.now(), items: state.items.filter((i) => !i.sell) });
    const sel = V.selectedItems(state);
    const day = loadDay(state.user);
    if (day && !saveDay(recordVisit(day, { visitId: state.visitId, customerName: state.customer.name, itemCount: sel.reduce((n, i) => n + i.qty, 0), total: V.total(sel) }))) {
      showToast('買取代金を経費に計上できませんでした（保存容量不足）');
    }
    // 持ち帰り（入庫）の対象として、シールを貼った実物を1点ずつ登録する
    const appraisalPhotos = (visitId) => Object.fromEntries(loadAppraisals().filter((a) => a.visitId === visitId && a.photos?.length).map((a) => [a.itemId, a.photos[0]])); // 商品ごとの、査定依頼の1枚目の写真
    const units = unitsFromVisit({ visitId: state.visitId, userId: state.user, customerName: state.customer.name, slots: V.labelSlots(state), labels: state.labels, colors: state.sealColors, photos: appraisalPhotos(state.visitId), phones: [state.customer.phone, state.customer.phone2] });
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
  'stock-scope': (el) => set({ stock: { ...state.stock, scope: el.dataset.value, last: null } }),
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
    const todo = pendingOf(inScope(byUser(loadUnits(), state.user), state.stock.scope))
    if (!todo.length) return;
    scanToken += 1;
    set({ scan: { mode: 'stock', status: 'scanning', code: '', name: '', stored: 0, left: todo.length, location: stockTarget(state).location } });
    stockScanStep(scanToken);
  },
  // 経費
  'exp-type': (el) => set({ expDraft: { ...state.expDraft, type: el.dataset.value } }),
  'exp-photo-dummy': () => {
    const sample = RECEIPT_SAMPLES[dummyReceiptSeq % RECEIPT_SAMPLES.length];
    dummyReceiptSeq += 1;
    set({ expDraft: { ...state.expDraft, photo: dummyReceipt({ amount: sample.amount, store: sample.store }) } });
    readReceiptAi(sample);
  },
  'exp-photo-clear': () => { receiptToken += 1; set({ expDraft: { ...state.expDraft, photo: null, ai: null } }); },
  'exp-ai-retry': () => { if (state.expDraft.photo) readReceiptAi(state.expDraft.ai?.sample ?? receiptSampleFor(state.expDraft.photo.length), { overwrite: true }); },
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
  // お客様の評価（営業の記録）。訪問が完了した予定から登録する。保存済みの内容があれば、それを下書きとして開く
  'eval-open': (el) => {
    const target = el.dataset.visitId ? evalTargetOfVisit(el.dataset.visitId) : evalTargetOf(state, el.dataset.id);
    if (target) set({ modal: { type: 'eval', ...target }, evalDraft: target.existing ? { ...V.blankEval(), ...target.existing } : V.blankEval() });
  },
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
    const { visitId, startedAt, customer } = state.modal;
    const e = state.evalDraft;
    const record = { visitId, customerName: customer.name, phone: customer.phone, savedAt: Date.now(), by: `営業 ${userById(state.user).name}`, ...e, memo: e.memo.trim() };
    upsertEval(record); // 営業が入力するのは、訪問ごとの評価
    setFirstVisitCustomerEval(record, { before: startedAt ?? Infinity }); // 初めての訪問なら、お客様の評価の初期値にもなる（あとから登録し直せる）
    set({ modal: null });
    showToast('お客様の評価を保存しました');
  },
  'staff-toggle': () => set({ showStaff: !state.showStaff }),
  'brief-propose': (el) => set({ briefing: { ...state.briefing, propose: el.dataset.value } }),
  'brief-all': () => set({ briefing: { checks: Object.fromEntries(V.BRIEFING_CHECKS.map((c) => [c.key, true])), propose: 'yes' } }),
  'leave-all': () => set({ leaveChecks: Object.fromEntries(V.LEAVE_CHECKS.map((c) => [c.key, true])) }),
  reset: () => { state = { ...initialState(), view: 'schedule' }; }, // 訪問完了後の「新しい訪問を開始」は、今日の予定へ
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
  if (e.key === 'Enter' && e.target.dataset.auth) {
    e.preventDefault();
    actions[{ login: 'auth-login', sms: 'auth-verify', forgot: 'auth-forgot-send', 'forgot-sms': 'auth-verify', newpw: 'auth-setpw' }[state.auth.screen]]?.();
    rerenderKeepScroll();
    return;
  }
  if (e.key !== 'Enter' || e.target.dataset.stockCode === undefined) return;
  e.preventDefault();
  submitStockCode();
  rerenderKeepScroll();
});
document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.action === 'wd-check') {
    const key = el.dataset.form === 'start' ? 'startForm' : 'closeForm';
    set({ [key]: { ...state[key], checks: { ...state[key].checks, [el.dataset.key]: el.checked } } });
    rerenderKeepScroll();
  }
  if (el.dataset.expPhoto !== undefined && el.files[0]) {
    shrinkImage(el.files[0], 1000)
      .then((img) => { set({ expDraft: { ...state.expDraft, photo: img } }); readReceiptAi(receiptSampleFor(img.length)); rerenderKeepScroll(); })
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
  if (el.dataset.itemPhoto !== undefined && el.files[0]) {
    const id = el.dataset.itemPhoto;
    shrinkImage(el.files[0])
      .then((img) => { set({ items: state.items.map((i) => (i.id === id ? addPhoto(i, img) : i)) }); rerenderKeepScroll(); })
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
  // バーは「1点あたり」の金額。買取金額（数量分の合計）＝ 1点あたり × 数量
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
  if (el.dataset.ld) {
    set({ leaderDraft: { ...state.leaderDraft, [el.dataset.ld]: el.value } });
    return;
  }
  if (el.dataset.auth) {
    // ログイン画面の入力。再描画せず state だけ更新する（フォーカス維持）。認証コードは数字のみ
    if (el.dataset.auth === 'code') el.value = el.value.replace(/\D/g, '').slice(0, 6);
    set({ auth: { ...state.auth, [el.dataset.auth]: el.value } });
    return;
  }
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
    if ($('#wd-start-bottom')) $('#wd-start-bottom').innerHTML = V.wdStartBottomView(state);
    if ($('#exp-live')) $('#exp-live').innerHTML = V.expLiveView(state);
    if ($('#oc-live')) $('#oc-live').innerHTML = V.ocLiveView(state);
    return;
  }
  if (el.dataset.evalmemo !== undefined) {
    set({ evalDraft: { ...state.evalDraft, memo: el.value } });
  } else if (el.dataset.draft) {
    set({ draft: { ...state.draft, [el.dataset.draft]: el.value } });
    // 査定依頼の送信ボタンは、文章か写真があれば押せる（入力のたびに再描画はしない）
    const send = $('[data-action="send-appraisal"]');
    if (send) send.disabled = !(state.draft.note.trim() || state.draft.photos.length);
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
    if (mine(loadComments()) > state.comments.length) showToast('❗ 査定部からコメントが届きました');
    rerenderKeepScroll();
    return;
  }
  if (e.key !== AP_STORAGE_KEY) return;
  const unread = (l) => l.filter((a) => a.visitId === state.visitId && hasUnread(a, 'sales')).length;
  if (unread(loadAppraisals()) > unread(state.appraisals)) showToast('💬 査定部から返信が届きました');
  // 下書き入力中は再描画しない（フォーカスが外れるため）
  if (!document.activeElement?.dataset?.draft) rerenderKeepScroll();
});

// 本社からのメッセージ: 3件目以降があることを示す表示は、一番下までスクロールしたら消す
document.addEventListener('scroll', (e) => {
  if (e.target.dataset?.msgs === undefined) return;
  const more = e.target.parentElement.querySelector('[data-msgmore]');
  more?.classList.toggle('hidden', e.target.scrollTop + e.target.clientHeight >= e.target.scrollHeight - 4);
}, true);

// 認証コードの再送ボタンの待ち時間を、入力中の画面を再描画せずに更新する
setInterval(() => {
  const b = $('[data-action="auth-resend"]');
  const p = state.auth?.pending;
  if (!b || !p) return;
  const wait = Math.max(0, Math.ceil((p.sentAt + RESEND_WAIT - Date.now()) / 1000));
  b.disabled = wait > 0;
  b.textContent = `コードを再送する${wait ? `（${wait}秒後）` : ''}`;
  b.classList.toggle('text-slate-300', wait > 0);
  b.classList.toggle('text-slate-500', wait === 0);
}, 1000);

setInterval(() => {
  const t = $('#timer');
  if (t && state.visitStartedAt && !state.visitEndedAt) t.textContent = fmtElapsed(state.visitStartedAt);
}, 1000);

initTheme();
initHelp();
render();
