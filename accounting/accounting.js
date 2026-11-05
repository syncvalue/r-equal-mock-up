// 経理部デスク画面（ダミー・PC想定）。経費精算／残高・入出金管理／週間収支。（固定費・小口金管理は、メニューから外している）
import { WORKDAY_KEY, DEPOSIT_KEY, CUSTOMER_PAY_KEY, LEDGER_KEY, FIXED_KEY, PETTY_KEY, DAILY_CHECK_KEY } from '../src/store.js';
import { USERS } from '../src/dashboard.js';
import { AREAS, areaById, areaOfUser } from '../src/dispatch.js';
import { dateKey } from '../src/workday.js';
import { officeUsers, giveAdvance, advanceReady, addCustomerPayment, paymentReady, markPaid, loadCustomerPayments, onlyOffice } from '../src/accounting.js';
import { loadLedger, saveLedger, makeEntry, addEntry, entryReady, kindOf } from '../src/ledger.js';
import { loadFixed, saveFixed, fixedReady, saveFixedCost, setFixedActive, loadPettyUses, savePettyUses, pettyUseReady, makePettyUse, addPettyUse, decidePettyUse, pettyRows, fieldStaff } from '../src/fixedCosts.js';
import { loadChecks, saveChecks, markOk, markReturned, reopen, shiftDate } from '../src/dailyCheck.js';
import { weekStart, shiftWeek } from '../src/weekly.js';
import { tabLabel, menuView } from './menu.js';
import { balanceTab } from './balanceTab.js';
import { claimsTab, dayRows, pendingBefore, bulkTargets } from './claimsTab.js';
import { fixedTab, shiftMonth, fixedRows } from './fixedTab.js';
import { weeklyTab } from './weeklyTab.js';
import { seedSample } from '../src/accountingSample.js';
import { initTheme, themeToggleHtml } from '../src/theme.js';
import { initHelp } from '../src/help.js';
import { formatMoneyInput } from '../src/moneyInput.js';
import { esc } from '../src/format.js';

const $ = (s) => document.querySelector(s);
const BY = '経理部';
const pref = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const today = () => dateKey();

const blank = {
  led: () => ({ kind: 'in', category: 'sales', date: today(), amount: 0, cost: 0, userId: '', memo: '' }),
  pay: () => ({ customerName: '', amount: 0, reason: '', userId: '', memo: '' }),
  fix: () => ({ id: '', type: 'rent', name: '', amount: 0, payDay: 25 }),
  pu: () => ({ userId: fieldStaff()[0]?.id ?? '', date: today(), amount: 0, memo: '' }),
  ret: () => ({ id: '', reason: '' }),
};

const st = {
  tab: 'claims', menuOpen: false,
  office: AREAS.some((a) => a.id === pref('rq-mock-acc-office', '')) ? pref('rq-mock-acc-office', '') : '', // 絞り込み中の営業所（空は全営業所）
  ledger: loadLedger(), selDay: null, selUser: null,
  led: blank.led(), pay: blank.pay(), fix: blank.fix(), pu: blank.pu(), returning: null, pettyReject: null,
  claimFilter: 'pending', claimUser: null, checkDate: shiftDate(today(), -1), month: today().slice(0, 7), week: weekStart(today()),
};
let dirty = false; // 入力中に届いた更新を、入力完了後に反映するためのフラグ

const scoped = () => officeUsers(USERS, st.office, areaOfUser);
const scopedIds = () => scoped().map((u) => u.id);
const officeOf = (userId) => areaById(areaOfUser(userId))?.name.replace('エリア', '') ?? '所属不明';
const withOffice = (u) => `${u.name}（${officeOf(u.id)}）`;
const ctx = { st, scoped, scopedIds, officeOf, withOffice, today };
const FILTERED_TABS = ['claims', 'balance']; // 営業所での絞り込みが効く画面（鑑定士の記録がある画面）
const VIEWS = { balance: balanceTab, claims: claimsTab, fixed: fixedTab, weekly: weeklyTab };

function render() {
  st.ledger = loadLedger();
  if (!scopedIds().includes(st.led.userId)) st.led = { ...st.led, userId: scopedIds()[0] ?? '' };
  if (st.pay.userId && !scopedIds().includes(st.pay.userId)) st.pay = { ...st.pay, userId: '' };
  const pending = onlyOffice(loadCustomerPayments(), scopedIds(), Boolean(st.office)).filter((p) => p.status === 'pending').length;
  const badges = { balance: pending, claims: pendingBefore(ctx, today()) };
  const filter = FILTERED_TABS.includes(st.tab)
    ? `<label class="text-xs font-bold">営業所 <select class="rounded bg-white/20 text-white px-1 py-0.5 font-bold" data-office><option class="text-slate-800" value="">全営業所（${USERS.length}人）</option>${AREAS.map((a) => `<option class="text-slate-800" value="${a.id}" ${st.office === a.id ? 'selected' : ''}>${esc(a.name.replace('エリア', ''))}（${officeUsers(USERS, a.id, areaOfUser).length}人）</option>`).join('')}</select></label>` : '';
  $('#root').innerHTML = `<div class="flex flex-col h-screen">
  <header class="bg-teal-800 text-white px-4 md:px-6 py-2 flex flex-wrap gap-2 justify-between items-center">
    <div class="flex items-center gap-2"><button class="relative w-11 h-11 -ml-2 rounded-xl text-2xl leading-none hover:bg-white/10 active:bg-white/20" data-menu-open aria-label="メニューを開く">☰${Object.values(badges).some(Boolean) ? '<span class="absolute top-1 right-1 w-3 h-3 rounded-full bg-amber-400"></span>' : ''}</button>
      <span class="font-bold text-xl">経理部</span><span class="text-teal-200">›</span><span class="font-bold">${tabLabel(st.tab)}</span><span class="text-xs font-normal bg-white/20 rounded px-2 py-0.5 ml-2">ダミー画面（PC）</span></div>
    <div class="text-sm flex flex-wrap items-center gap-x-3 gap-y-1">${filter}<button class="text-xs underline text-white/70" data-sample>サンプルデータを入れ直す</button> ${themeToggleHtml()}</div>
  </header>
  <main class="p-4 space-y-4 overflow-y-auto flex-1 min-h-0">${VIEWS[st.tab](ctx)}</main>${st.menuOpen ? menuView({ tab: st.tab, badges }) : ''}</div>`;
}

// ---- 操作 -----------------------------------------------------------------------
function addLedger() {
  const f = st.led;
  if (!entryReady(f)) return alert('区分・金額を入力してください（「その他」は、メモも必要です）');
  if (f.category === 'advance') {
    if (!advanceReady(f)) return alert('鑑定士を選んでください');
    if (!giveAdvance(f, { by: BY })) return alert('保存できませんでした（容量超過）');
    if (f.date !== today()) alert('鑑定士への補充金は、今日の日付で記録しました（鑑定士に今日振り込まれるため）');
  } else if (!saveLedger(addEntry(loadLedger(), makeEntry(f, { by: BY })))) return alert('保存できませんでした（容量超過）');
  st.led = { ...blank.led(), kind: f.kind, category: f.category, userId: f.userId };
}
function addPay() {
  if (!paymentReady(st.pay)) return alert('お客様名・金額・理由を入力してください（理由が「その他」のときは、メモも必要です）');
  addCustomerPayment(st.pay);
  st.pay = blank.pay();
}
function payFixed(id) {
  const row = fixedRows(st).find((r) => r.id === id);
  if (!row || row.paid) return;
  if (!confirm(`${row.name}（${st.month.replace('-', '年')}月分）を、支払済みにします。よろしいですか？`)) return;
  saveLedger(addEntry(loadLedger(), makeEntry({ category: 'fixed', amount: row.amount, memo: row.name, fixedId: row.id, month: st.month }, { by: BY })));
}
function saveFix() {
  if (!fixedReady(st.fix)) return alert('名前・金額・支払日（1〜28日）を入力してください');
  saveFixed(saveFixedCost(loadFixed(), st.fix));
  st.fix = blank.fix();
}
function refillPetty(id) {
  const r = pettyRows(loadLedger(), loadPettyUses(), fieldStaff()).find((x) => x.user.id === id);
  if (!r?.suggest || !confirm(`${r.user.name} さんへ、小口金を ${r.suggest.toLocaleString('ja-JP')}円 補充します。よろしいですか？`)) return;
  saveLedger(addEntry(loadLedger(), makeEntry({ category: 'petty', amount: r.suggest, memo: '小口金の補充', userId: id }, { by: BY })));
}
function usePetty() {
  if (!pettyUseReady(st.pu)) return alert('鑑定士・金額・用途を入力してください');
  savePettyUses(addPettyUse(loadPettyUses(), makePettyUse(st.pu, { by: BY, proxy: true }))); // 経理代行は、承認済みで記録する
  st.pu = { ...blank.pu(), userId: st.pu.userId };
}
const balanceOfAppraiser = (id) => pettyRows(loadLedger(), loadPettyUses(), fieldStaff()).find((r) => r.user.id === id)?.balance ?? 0;
function approvePetty(id) {
  const u = loadPettyUses().find((x) => x.id === id);
  if (!u) return;
  if (u.amount > balanceOfAppraiser(u.userId)) return alert('小口金の残りが足りません。先に補充してください');
  savePettyUses(decidePettyUse(loadPettyUses(), id, 'approved', { by: BY, balance: balanceOfAppraiser(u.userId) }));
}
function rejectPetty() {
  if (!st.pettyReject?.reason.trim()) return alert('却下の理由を入力してください');
  savePettyUses(decidePettyUse(loadPettyUses(), st.pettyReject.id, 'rejected', { reason: st.pettyReject.reason, by: BY }));
  st.pettyReject = null;
}
const review = (fn) => saveChecks(fn(loadChecks()));

const ACTIONS = {
  tab: (d) => { st.tab = d.tab; st.menuOpen = false; },
  menuOpen: () => { st.menuOpen = true; },
  menuClose: () => { st.menuOpen = false; },
  selUser: (d) => { st.selUser = st.selUser === d.selUser ? null : d.selUser; },
  selDay: (d) => { st.selDay = st.selDay === d.selDay ? null : d.selDay; },
  ledKind: (d) => { st.led = { ...st.led, kind: d.ledKind, category: d.ledKind === 'in' ? 'sales' : 'advance' }; },
  ledAdd: addLedger,
  payAdd: addPay,
  payDone: (d) => markPaid(d.payDone),
  claimFilter: (d) => { st.claimFilter = d.claimFilter; },
  claimUser: (d) => { st.claimUser = d.claimUser; st.returning = null; },
  checkShift: (d) => { st.checkDate = shiftDate(st.checkDate, Number(d.checkShift)); st.claimUser = null; st.returning = null; },
  checkYesterday: () => { st.checkDate = shiftDate(today(), -1); st.claimUser = null; st.returning = null; },
  claimOk: (d) => review((c) => markOk(c, d.claimOk, st.checkDate, { by: BY })),
  claimRet: (d) => { st.returning = { id: d.claimRet, reason: '' }; },
  claimRetCancel: () => { st.returning = null; },
  claimRetSend: () => {
    if (!st.returning?.reason.trim()) return alert('差戻しの理由を入力してください');
    review((c) => markReturned(c, st.returning.id, st.checkDate, st.returning.reason, { by: BY }));
    st.returning = null;
  },
  claimReopen: (d) => review((c) => reopen(c, d.claimReopen, st.checkDate)),
  claimBulk: () => {
    const targets = bulkTargets(dayRows(ctx));
    if (targets.length && confirm(`指摘のない未チェックの鑑定士 ${targets.length}人を、まとめてチェック済みにします。よろしいですか？`)) review((c) => targets.reduce((acc, r) => markOk(acc, r.userId, st.checkDate, { by: BY }), c));
  },
  month: (d) => { st.month = shiftMonth(st.month, Number(d.month)); },
  fixPay: (d) => payFixed(d.fixPay),
  fixEdit: (d) => { const f = loadFixed().find((x) => x.id === d.fixEdit); if (f) st.fix = { id: f.id, type: f.type, name: f.name, amount: f.amount, payDay: f.payDay }; },
  fixToggle: (d) => saveFixed(setFixedActive(loadFixed(), d.fixToggle, !loadFixed().find((x) => x.id === d.fixToggle)?.active)),
  fixSave: saveFix,
  fixCancel: () => { st.fix = blank.fix(); },
  pettyRefill: (d) => refillPetty(d.pettyRefill),
  pettyUse: usePetty,
  pettyOk: (d) => approvePetty(d.pettyOk),
  pettyRej: (d) => { st.pettyReject = { id: d.pettyRej, reason: '' }; },
  pettyRejCancel: () => { st.pettyReject = null; },
  pettyRejSend: rejectPetty,
  week: (d) => { st.week = shiftWeek(st.week, Number(d.week)); },
  pickWeek: (d) => { st.week = d.pickWeek; },
  sample: () => {
    if (!confirm('鑑定士の始業・経費・補充金、入出金の帳簿、固定費、小口金、経費精算（一次チェック）の結果を、サンプルデータに置き換えます。よろしいですか？')) return false;
    try { localStorage.removeItem(FIXED_KEY); } catch { /* 固定費は、初期の登録に戻らないだけ（モック） */ }
    seedSample(Date.now(), true); st.selUser = null; st.selDay = null; st.fix = blank.fix();
    return true;
  },
};
// data属性名（camelCase）の対応: 押された要素の dataset のうち、最初に ACTIONS にあるもの
const toKey = (d) => Object.keys(d).find((k) => ACTIONS[k]);

document.addEventListener('click', (e) => {
  const t = e.target.closest('button, tr[data-sel-user], tr[data-sel-day], tr[data-pick-week], tr[data-claim-user]');
  if (!t || t.disabled) return;
  const key = toKey(t.dataset);
  if (!key) return;
  if (ACTIONS[key](t.dataset) === false) return;
  render();
});

const FORMS = ['led', 'pay', 'fix', 'pu', 'ret', 'rej'];
const MONEY = ['amount', 'cost'];
const SLOT = { ret: 'returning', rej: 'pettyReject' }; // 入力欄の名前と、状態の名前が違うもの
const setForm = (name, value) => { st[SLOT[name] ?? name] = value; };
const getForm = (name) => st[SLOT[name] ?? name];
function onField(e, isInput) {
  const [form, key] = (e.target.dataset.f ?? '').split('.');
  if (!FORMS.includes(form)) return false;
  const isMoney = MONEY.includes(key);
  const live = isMoney || e.target.tagName === 'INPUT' && e.target.type !== 'date' && e.target.type !== 'number';
  if (isInput !== live) return true; // 文字入力欄は入力中に、選択欄・日付は選択時に反映
  const value = isMoney ? formatMoneyInput(e.target) : key === 'payDay' ? Number(e.target.value) : e.target.value;
  setForm(form, { ...getForm(form), [key]: value });
  return true;
}
document.addEventListener('input', (e) => { onField(e, true); });
document.addEventListener('change', (e) => {
  if (e.target.matches('[data-check-date]')) {
    if (e.target.value && e.target.value <= today()) { st.checkDate = e.target.value; st.claimUser = null; st.returning = null; }
    render(); return;
  }
  if (e.target.matches('[data-office]')) {
    st.office = e.target.value;
    try { localStorage.setItem('rq-mock-acc-office', st.office); } catch { /* 保存できなくても動作は継続（モック） */ }
    st.selUser = null; render(); return;
  }
  if (!onField(e, false)) return;
  if (e.target.dataset.f === 'led.category') st.led = { ...st.led, kind: kindOf(st.led.category) };
  if (['led.category', 'pay.reason'].includes(e.target.dataset.f)) render(); // 入力欄・入力例が変わるもの
});

// 鑑定士側（タブレット）などの更新を即時反映。入力中なら、入力欄から離れたときに反映する
const isEditing = () => Boolean(document.activeElement?.dataset?.f);
window.addEventListener('storage', (e) => {
  if (![WORKDAY_KEY, DEPOSIT_KEY, CUSTOMER_PAY_KEY, LEDGER_KEY, FIXED_KEY, PETTY_KEY, DAILY_CHECK_KEY].includes(e.key)) return;
  if (isEditing()) dirty = true;
  else render();
});
document.addEventListener('focusout', () => { if (dirty) setTimeout(() => !isEditing() && ((dirty = false), render()), 0); });

seedSample(); // 初めて開いたとき（記録が空のとき）だけ、サンプルデータを入れる
initTheme();
initHelp();
render();
