// 店舗の画面（ダミー・PC／タブレット想定）。お客様が持ち込む買取希望品を、来店の受付から買取の完了まで扱う。
import { STORE_VISITS_KEY, STORE_DRAFT_KEY, STOCK_KEY, RESET_CONFIRM, clearTransactions, upsertContract, newContractId, GMO_URL } from '../src/store.js';
import { EMPLOYEES_KEY, loadEmployees, storeStaffOf } from '../src/employees.js';
import { STORES_KEY, loadStores, storeById, activeStores } from '../src/stores.js';
import { login, loadSession, saveSession, clearSession } from '../src/storeSession.js';
import {
  loadStoreVisits, saveStoreVisits, walkIn, arrive, startServing, completeVisit, cancelVisit, markNoShow, boardOf, summaryOf,
} from '../src/storeVisits.js';
import { sampleVisits } from '../src/storeSample.js';
import {
  blankDraft, loadDraft, saveDraft, clearDraft, goStep, canProceed, addProduct, updateItem, setQty, removeItem, assignLabel, setColor, clearLabel, newSealCode,
} from '../src/storeDraft.js';
import { buildContract, buildPurchase, buildDeclined } from '../src/storePurchase.js';
import { historyOf, customerProfile, declinedList } from '../src/customerHistory.js';
import { recordDeclined } from '../src/declined.js';
import { loadUnits, saveUnits, addUnits } from '../src/stock.js';
import { PRODUCTS } from '../src/data.js';
import { searchProducts, popularProducts } from '../src/search.js';
import { dateKey } from '../src/workday.js';
import { formatMoneyInput } from '../src/moneyInput.js';
import { initTheme, themeToggleHtml } from '../src/theme.js';
import { initHelp } from '../src/help.js';
import { esc } from '../src/format.js';
import { loginView } from './loginView.js';
import { headerHtml, boardHtml, blankWalkIn } from './boardView.js';
import { purchaseHtml } from './purchaseView.js';

const $ = (s) => document.querySelector(s);
const REASON_TEXT = {
  noName: 'お名前を入力してください', noStore: '店舗が正しくありません', notFound: '対象の来店が見つかりません', badStatus: 'この来店は、いまの状態では、その操作ができません',
  noReason: '理由を入力してください', tooEarly: '予約の日になってから、操作できます',
  noItems: '売る商品が、ありません', noPrice: '金額が未入力の商品があります', noSeal: 'シールNo.・色が未紐づけの商品があります', checks: '終了前の確認が、済んでいません',
};

let staff = loadSession(loadEmployees());
let loginError = '';
let view = 'board'; // board（来店）／purchase（買取）
let draft = null;
let walk = blankWalkIn();
let search = '';
let labelError = null;
let toast = '';

const today = () => dateKey(new Date());
const storeOf = () => (staff ? storeById(staff.storeId, loadStores()) : null);
const visitOpts = () => ({ storeIds: activeStores(loadStores()).map((s) => s.id), now: Date.now() });
const warn = (reason) => alert(REASON_TEXT[reason] ?? '操作できませんでした');
const visitOf = (id) => loadStoreVisits().find((v) => v.id === id);

function showToast(msg) {
  toast = msg;
  render();
  setTimeout(() => { toast = ''; render(); }, 2500);
}

// 来店の操作の結果を保存する。失敗（理由つき）は知らせる。成功なら true
function commit(r) {
  if (!r.ok) { warn(r.reason); return false; }
  if (!saveStoreVisits(r.list)) { alert('保存できませんでした（容量超過）'); return false; }
  return true;
}

const phonesOf = (c) => [c.phone, c.phone2].filter(Boolean);

function purchaseCtx() {
  const visit = visitOf(draft.visitId);
  const phones = phonesOf(draft.customer);
  const taken = loadUnits().flatMap((u) => [u.code, ...(u.relabels ?? []).map((r) => r.from)]);
  return {
    draft, visit, taken, search, labelError,
    history: historyOf({ phone: draft.customer.phone }, { before: visit?.startedAt ?? Date.now() }),
    profile: customerProfile(phones), declined: declinedList(phones),
    results: (search.trim() ? searchProducts({ q: search }) : popularProducts(8)).slice(0, 8),
  };
}

function render() {
  const employees = loadEmployees();
  staff = staff ? loadSession(employees) : null; // 無効になった店舗スタッフは、ログアウトになる
  if (!staff) { $('#root').innerHTML = loginView(loginError, storeStaffOf(employees), loadStores()); return; }
  const store = storeOf();
  if (!store) { clearSession(); staff = null; loginError = '所属の店舗が見つかりません'; render(); return; }
  const list = loadStoreVisits();
  const profileOf = (phone) => (phone ? customerProfile([phone]) : null);
  const scroll = document.querySelector('[data-scroll]')?.scrollTop ?? 0;
  const head = headerHtml({ store, staff, date: today(), summary: summaryOf(list, store.id, today()), themeHtml: themeToggleHtml() });
  const body = view === 'purchase' && draft
    ? purchaseHtml(purchaseCtx())
    : `${boardHtml({ board: boardOf(list, store.id, today()), walk, profileOf })}<div class="px-4 pb-6 text-center"><button class="underline text-xs text-slate-500" data-reset>（デモ用）データ初期化</button></div>`;
  $('#root').innerHTML = `${head}${body}${toast ? `<div class="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-lg bg-slate-900 text-white px-4 py-2 text-sm shadow-lg" role="status">${esc(toast)}</div>` : ''}`;
  const sc = document.querySelector('[data-scroll]');
  if (sc) sc.scrollTop = scroll;
}

// 入力中の欄を、再描画のあとも続けて入力できるようにする
function rerender() {
  const a = document.activeElement;
  const sel = a?.dataset && Object.keys(a.dataset).length ? `${a.tagName.toLowerCase()}${Object.entries(a.dataset).map(([k, v]) => `[data-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}="${CSS.escape(v)}"]`).join('')}` : '';
  const [start, end] = [a?.selectionStart, a?.selectionEnd];
  render();
  const el = sel && ['INPUT', 'TEXTAREA'].includes(a.tagName) ? document.querySelector(sel) : null;
  if (el) { el.focus(); try { if (start != null) el.setSelectionRange(start, end); } catch { /* 日付欄などは位置を戻せない */ } }
}

const setDraft = (next) => { draft = next; saveDraft(draft); };
const patchDraft = (patch) => setDraft({ ...draft, ...patch });

function openPurchase(id) {
  const visit = visitOf(id);
  if (!visit) return warn('notFound');
  draft = loadDraft(id) ?? blankDraft(visit);
  search = '';
  labelError = null;
  view = 'purchase';
}

// ---- 買取の完了・見送り ---------------------------------------------------------------
function finishPurchase() {
  const store = storeOf();
  const visit = visitOf(draft.visitId);
  const now = Date.now();
  const customer = draft.customer;
  const r = buildPurchase({ visit, store, staff, customer, items: draft.items, labels: draft.labels, colors: draft.colors, checks: draft.checks, now, contractId: draft.contractId, isRepeat: historyOf({ phone: customer.phone }, { before: visit.startedAt ?? now }).isRepeat });
  if (!r.ok) return warn(r.reason);
  if (!saveUnits(addUnits(loadUnits(), r.units))) return alert('商品を入庫待ちに登録できませんでした（保存容量不足）');
  recordDeclined({ visitId: visit.id, phone: customer.phone, customerName: customer.name, at: now, items: r.declined });
  if (!commit(completeVisit(loadStoreVisits(), visit.id, r.result, { now }))) return;
  clearDraft(visit.id);
  view = 'board';
  draft = null;
  showToast(`買取を完了しました（${r.result.count}点・入庫待ちに登録）`);
}

function declineVisit() {
  if (draft.contractId) return;
  if (!confirm('買取に至らず、見送りとして終了します。よろしいですか？')) return;
  const visit = visitOf(draft.visitId);
  const r = buildDeclined({ items: draft.items.map((i) => ({ ...i, sell: false })) });
  recordDeclined({ visitId: visit.id, phone: draft.customer.phone, customerName: draft.customer.name, at: Date.now(), items: r.declined });
  if (!commit(completeVisit(loadStoreVisits(), visit.id, r.result))) return;
  clearDraft(visit.id);
  view = 'board';
  draft = null;
}

function sendContract() {
  const visit = visitOf(draft.visitId);
  const id = draft.contractId ?? newContractId();
  const now = Date.now();
  const r = buildContract({ visit, store: storeOf(), staff, customer: draft.customer, items: draft.items, labels: draft.labels, colors: draft.colors, now, contractId: id, isRepeat: historyOf({ phone: draft.customer.phone }, { before: visit.startedAt ?? now }).isRepeat });
  if (!r.ok) return warn(r.reason);
  upsertContract(r.contract);
  patchDraft({ contractId: id });
  window.open(GMO_URL, '_blank', 'noopener');
}

// ---- 操作の対応表（data-属性の名前 → 処理）。false を返すと、再描画しない --------------------
const CLICK = {
  login: () => {
    const r = login($('[data-login-id]').value, $('[data-login-pw]').value, loadEmployees());
    if (!r.ok) { loginError = r.error; return; }
    loginError = '';
    saveSession(r.staff.id);
    staff = r.staff;
  },
  logout: () => { clearSession(); staff = null; view = 'board'; draft = null; },
  reset: () => {
    if (!confirm(RESET_CONFIRM)) return false;
    clearTransactions();
    staff = null;
    view = 'board';
    draft = null;
  },
  walkin: () => { if (commit(walkIn(loadStoreVisits(), { ...walk, storeId: staff.storeId, by: staff.name }, visitOpts()))) walk = blankWalkIn(); },
  arrive: (id) => { commit(arrive(loadStoreVisits(), id, visitOpts())); },
  start: (id) => { if (commit(startServing(loadStoreVisits(), id, { id: staff.id, name: staff.name }, visitOpts()))) openPurchase(id); },
  open: (id) => openPurchase(id),
  noshow: (id) => { if (confirm('来ず（予約の時間になってもお見えにならなかった）として記録します。よろしいですか？')) commit(markNoShow(loadStoreVisits(), id, visitOpts())); },
  cancelVisit: (id) => { const reason = prompt('取消の理由（例: お客様のご都合）'); if (reason !== null) commit(cancelVisit(loadStoreVisits(), id, reason, staff.name, visitOpts())); },
  backBoard: () => { view = 'board'; draft = null; },
  cok: () => patchDraft({ customerOk: !draft.customerOk }),
  ex: (k) => patchDraft({ explain: { ...draft.explain, [k]: !draft.explain[k] } }),
  propose: (v) => patchDraft({ propose: v }),
  lv: (k) => patchDraft({ checks: { ...draft.checks, [k]: !draft.checks[k] } }),
  next: () => { if (canProceed(draft)) setDraft(goStep(draft, draft.step + 1)); },
  prev: () => setDraft(goStep(draft, draft.step - 1)),
  addP: (id) => { const p = PRODUCTS.find((x) => x.id === id); if (p) setDraft(addProduct(draft, p)); },
  qty: (id, el) => setDraft(setQty(draft, id, draft.items.find((i) => i.id === id).qty + Number(el.dataset.delta))),
  sell: (id) => setDraft(updateItem(draft, id, { sell: !draft.items.find((i) => i.id === id).sell })),
  remove: (id) => setDraft(removeItem(draft, id)),
  scan: (key) => setDraft(assignLabel(draft, key, newSealCode([...Object.values(draft.labels), ...purchaseCtx().taken]), { taken: [] }).draft),
  color: (key, el) => setDraft(setColor(draft, key, el.dataset.value)),
  unseal: (key) => setDraft(clearLabel(draft, key)),
  sendGmo: sendContract,
  openGmo: () => { window.open(GMO_URL, '_blank', 'noopener'); return false; },
  finish: finishPurchase,
  decline: declineVisit,
};
const SELECTOR = Object.keys(CLICK).map((k) => `[data-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}]`).join(',');

document.addEventListener('click', (e) => {
  const el = e.target.closest(SELECTOR);
  if (!el || el.tagName === 'INPUT' && el.type !== 'checkbox') return;
  const [name, value] = Object.entries(el.dataset).find(([k]) => k in CLICK);
  if (CLICK[name](value, el) !== false) render();
});

// 入力欄。入力中は、その欄を保ったまま再描画する（次へ進めるかの表示を、すぐ更新するため）
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.w) { walk = { ...walk, [t.dataset.w]: t.value }; return; }
  if (t.dataset.c) { patchDraft({ customer: { ...draft.customer, [t.dataset.c]: t.value } }); rerender(); return; }
  if (t.dataset.psearch !== undefined) { search = t.value; rerender(); return; }
  if (t.dataset.iPrice) { setDraft(updateItem(draft, t.dataset.iPrice, { price: formatMoneyInput(t) })); rerender(); }
});
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.iRank) { setDraft(updateItem(draft, t.dataset.iRank, { rank: t.value })); render(); return; }
  if (t.dataset.seal) { // シールNo.の手入力（Enter・欄を離れたとき）
    const r = assignLabel(draft, t.dataset.seal, t.value, { taken: purchaseCtx().taken });
    labelError = r.error ? { key: t.dataset.seal, code: r.code } : null;
    setDraft(r.draft);
    render();
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('[data-login-id],[data-login-pw]')) CLICK.login() ?? render();
  if (e.key === 'Enter' && e.target.matches('[data-w]')) { CLICK.walkin(); render(); }
});

// 別のタブ（コールセンターの来店予約・マスタ管理・GMOサイン）での変更に追従する。入力中の欄は壊さない
window.addEventListener('storage', (e) => {
  if (![STORE_VISITS_KEY, STORES_KEY, EMPLOYEES_KEY, STOCK_KEY, STORE_DRAFT_KEY].includes(e.key)) return;
  if (document.activeElement?.matches?.('input,textarea,select')) return;
  render();
});

initTheme();
initHelp();
if (!loadStoreVisits().length) saveStoreVisits(sampleVisits(Date.now(), activeStores(loadStores()).map((s) => s.id))); // サンプルは、記録が空のときだけ
render();
