// 経理部デスク画面（ダミー・PC想定）。営業の手持ち現金の確認、入金（営業・お客様）、経費の入力代行、経費の全体状況。
import { WORKDAY_KEY, DEPOSIT_KEY, CUSTOMER_PAY_KEY } from '../src/store.js';
import { USERS, userById } from '../src/dashboard.js';
import { AREAS, areaById, areaOfUser } from '../src/dispatch.js';
import { addDeposit, depositsOf, carryoverFor, todayRows, loadDay, loadDays, saveDay, newId, dateKey, EXPENSE_TYPES, typeOf } from '../src/workday.js';
import {
  flagsOf, expenseStats, officeUsers, onlyOffice, canProxy, proxyExpense, PAY_REASONS, reasonOf, paymentReady, loadCustomerPayments, addCustomerPayment, markPaid,
} from '../src/accounting.js';
import { tabLabel, menuView } from './menu.js';
import { seedSample } from '../src/accountingSample.js';
import { initTheme, themeToggleHtml } from '../src/theme.js';
import { initHelp, helpIcon } from '../src/help.js';
import { formatMoneyInput, moneyInputHtml } from '../src/moneyInput.js';
import { yen, fmtTime, esc } from '../src/format.js';

const $ = (s) => document.querySelector(s);
const BY = '経理部';
const PHASE = { before: ['未始業', 'bg-slate-200 text-slate-600'], open: ['業務中', 'bg-emerald-100 text-emerald-800'], closed: ['終業済み', 'bg-indigo-100 text-indigo-800'] };
const LEVEL = { danger: 'bg-rose-100 text-rose-700', warn: 'bg-amber-100 text-amber-800', info: 'bg-slate-100 text-slate-600' };
const blankDeposit = () => ({ userId: scoped()[0]?.id ?? '', amount: 0, memo: '' });
const blankPay = () => ({ customerName: '', amount: 0, reason: '', userId: '', memo: '' });
const blankExp = () => ({ userId: scoped()[0]?.id ?? '', type: '', amount: 0, memo: '' });

const pref = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
let office = AREAS.some((a) => a.id === pref('rq-mock-acc-office', '')) ? pref('rq-mock-acc-office', '') : ''; // 絞り込み中の営業所（空は全営業所）
const scoped = () => officeUsers(USERS, office, areaOfUser);
const officeOf = (userId) => areaById(areaOfUser(userId))?.name.replace('エリア', '') ?? '所属不明'; // 営業の所属する営業所（短い名前）
const withOffice = (u) => `${u.name}（${officeOf(u.id)}）`;
const scopedIds = () => scoped().map((u) => u.id);
let tab = 'cash';
let menuOpen = false; // 左側のメニューの開閉
let selUser = null; // 所持金の確認で、明細を開いている営業
let period = 'day'; // 経費の全体状況: day（今日）／ month（今月）
let dep = blankDeposit();
let pay = blankPay();
let exp = blankExp();
let dirty = false; // 入力中に届いた更新を、入力完了後に反映するためのフラグ

const signed = (n) => (n ? `${n > 0 ? '+' : '−'}${yen(Math.abs(n))}` : '一致');
const badge = (cls, text) => `<span class="rounded px-2 py-0.5 text-xs font-bold whitespace-normal ${cls}">${text}</span>`;
const userSelect = (key, value) => `<select class="inp mt-1 font-normal" data-f="${key}">${scoped().map((u) => `<option value="${u.id}" ${value === u.id ? 'selected' : ''}>${esc(withOffice(u))}</option>`).join('')}</select>`;
const card = (label, value, cls = '') => `<div class="rounded-xl bg-white border p-3 flex-1 min-w-[10rem]"><div class="text-xs text-slate-500">${label}</div><div class="text-2xl font-bold ${cls}">${value}</div></div>`;

// ---- 所持金の確認 ---------------------------------------------------------------
function expenseDetail(row) {
  const { user, day } = row;
  const s = row.summary;
  return `<tr class="bg-slate-50"><td colspan="10" class="!whitespace-normal">
    <div class="p-2 space-y-2 text-sm">
      <b>${esc(withOffice(user))} さんの今日の明細</b>
      ${row.flags.length ? `<div class="flex flex-wrap gap-1">${row.flags.map((f) => badge(LEVEL[f.level], esc(f.text))).join('')}</div>` : '<div class="text-emerald-700">確認が必要な事項はありません。</div>'}
      <table class="w-full"><thead><tr class="text-left text-slate-500 border-b"><th>時刻</th><th>種類</th><th class="text-right">金額</th><th>内容</th><th>レシート</th></tr></thead><tbody>
        ${s.expenses.length ? s.expenses.map((e) => `<tr class="border-b"><td>${fmtTime(e.at).slice(0, 5)}</td><td>${typeOf(e.type).icon} ${typeOf(e.type).label}${e.proxy ? ' <span class="text-xs text-teal-700">（経理代行）</span>' : ''}</td>
          <td class="text-right">${yen(e.amount)}</td><td class="!whitespace-normal">${esc(e.memo)}</td>
          <td>${e.photo ? `<img src="${e.photo}" alt="レシート" class="h-10 rounded border" />` : e.auto ? '<span class="text-slate-400">自動計上</span>' : '<span class="text-rose-600 font-bold">なし</span>'}</td></tr>`).join('')
          : '<tr><td colspan="5" class="text-slate-400">経費の記録はありません。</td></tr>'}
      </tbody></table>
      <div class="text-xs text-slate-500">入金: ${s.deposits.map((d) => `${yen(d.amount)}（${esc(d.memo || '入金')}）`).join('、') || 'なし'}　始業時の確認金額 ${yen(s.opening)}${day.closedAt ? `　日報 ${day.report.visitCount}件・買取${yen(day.report.purchaseTotal)}${day.close.comment ? `　所感: ${esc(day.close.comment)}` : ''}` : ''}</div>
    </div></td></tr>`;
}

function cashTab() {
  // 未始業でも、前日の繰越金（と今日の入金）は手元にあるものとして扱う
  const rows = todayRows().filter((r) => scopedIds().includes(r.user.id)).map((r) => {
    const opening = carryoverFor(r.user.id).amount;
    const depositTotal = depositsOf(r.user.id).reduce((n, d) => n + d.amount, 0);
    const cash = r.summary ?? { opening, depositTotal, expenseTotal: 0, balance: opening + depositTotal };
    return { ...r, cash, flags: r.summary ? flagsOf(r.day, r.summary) : [] };
  });
  const started = rows.filter((r) => r.summary);
  const flagged = started.filter((r) => r.flags.length);
  return `
  <div class="flex flex-wrap gap-3">
    ${card('営業の帳簿残高の合計', yen(rows.reduce((n, r) => n + r.cash.balance, 0)))}
    ${card('業務中・終業済み', `${started.length} / ${rows.length} 人`)}
    ${card('確認が必要な営業', `${flagged.length} 人`, flagged.length ? 'text-rose-600' : 'text-emerald-700')}
  </div>
  <table class="w-full text-sm bg-white rounded-xl border"><thead><tr class="text-left text-slate-500 border-b"><th>営業</th><th>営業所</th><th>状況</th><th class="text-right">始業時の金額<div class="font-normal text-xs">未始業は前日繰越</div></th><th class="text-right">入金</th><th class="text-right">経費</th><th class="text-right">帳簿残高${helpIcon('帳簿残高 ＝ 始業時の金額 ＋ 入金 − 経費（買取代金を含む）。\n行を押すと、経費の明細とレシートを確認できます。始業時・終業時に実際に数えた金額との差異は、理由と一緒に表示します。')}</th><th class="text-right">終業時の所持金</th><th class="text-right">過不足</th><th>確認事項</th></tr></thead><tbody>
    ${rows.map((r) => {
      const { user, day, phase, summary: sm, cash } = r;
      return `<tr class="border-b ${sm ? 'cursor-pointer hover:bg-slate-50' : ''}" ${sm ? `data-sel-user="${user.id}"` : ''}>
        <td class="font-bold">${esc(user.name)}</td><td>${esc(officeOf(user.id))}</td><td>${badge(PHASE[phase][1], PHASE[phase][0])}</td>
        <td class="text-right">${yen(cash.opening)}${sm ? '' : '<div class="text-xs text-slate-400">前日繰越</div>'}</td><td class="text-right">${yen(cash.depositTotal)}</td><td class="text-right">${yen(cash.expenseTotal)}</td>
        <td class="text-right font-bold ${cash.balance < 0 ? 'text-rose-600' : ''}">${cash.balance < 0 ? `−${yen(-cash.balance)}` : yen(cash.balance)}</td><td class="text-right">${day?.closedAt ? yen(day.close.counted) : '-'}</td>
        <td class="text-right font-bold ${day?.close?.diff ? 'text-rose-600' : 'text-emerald-700'}">${day?.closedAt ? signed(day.close.diff) : '-'}</td>
        <td class="!whitespace-normal">${r.flags.length ? badge(r.flags.some((f) => f.level === 'danger') ? LEVEL.danger : LEVEL.warn, `${r.flags.length}件（明細を見る）`) : sm ? '<span class="text-emerald-700 text-xs font-bold">問題なし</span>' : '-'}</td></tr>
        ${selUser === user.id && sm ? expenseDetail(r) : ''}`;
    }).join('')}
  </tbody></table>
  `;
}

// ---- 入金処理 -------------------------------------------------------------------
function depositTab() {
  // 毎朝の定例入金（ダミー）は全員にあるため、一覧には出さず、経理部が登録した入金だけを出す
  const today = scoped().flatMap((u) => depositsOf(u.id).filter((d) => !d.id.startsWith('seed-')).map((d) => ({ ...d, name: u.name }))).sort((a, b) => b.at - a.at);
  const pays = onlyOffice(loadCustomerPayments(), scopedIds(), Boolean(office)); // 担当営業が未指定の振込は、全営業所のときだけ出る
  return `
  <div class="grid lg:grid-cols-2 gap-4">
    <section class="rounded-xl border bg-white p-4 space-y-3">
      <h2 class="font-bold text-lg">🏦 営業への入金</h2>
      <div class="flex flex-wrap items-end gap-3">
        <label class="text-sm font-bold">営業${userSelect('dep.userId', dep.userId)}</label>
        <label class="text-sm font-bold">金額${moneyInputHtml({ attrs: 'data-f="dep.amount"', value: dep.amount, placeholder: '50,000', cls: 'inp mt-1 font-normal' })}</label>
        <label class="text-sm font-bold flex-1 min-w-[10rem]">メモ<input class="inp mt-1 font-normal" data-f="dep.memo" value="${esc(dep.memo)}" placeholder="例: 買取資金の追加" /></label>
        <button class="b b-pri" data-dep-send>入金する</button>
      </div>
      <div class="text-sm font-bold">今日 登録した入金${helpIcon('毎朝の定例入金は除きます。')}</div>
      <table class="w-full text-sm"><tbody>
        ${today.length ? '' : '<tr><td class="text-slate-400">登録はありません。</td></tr>'}
        ${today.map((d) => `<tr class="border-b"><td>${fmtTime(d.at).slice(0, 5)}</td><td class="font-bold">${esc(d.name)}（${esc(officeOf(d.userId))}）</td><td class="text-right">${yen(d.amount)}</td><td class="!whitespace-normal text-slate-500">${esc(d.memo)}</td></tr>`).join('')}
      </tbody></table>
    </section>
    <section class="rounded-xl border bg-white p-4 space-y-3">
      <h2 class="font-bold text-lg">👤 お客様への入金（銀行振込）${helpIcon('営業の現金が足りなかった場合や、高額のため後日振込にした場合の、お客様へのお支払いです。')}</h2>
      <div class="grid sm:grid-cols-2 gap-3">
        <label class="text-sm font-bold">お客様名<input class="inp mt-1 font-normal" data-f="pay.customerName" value="${esc(pay.customerName)}" placeholder="例: 山田 花子" /></label>
        <label class="text-sm font-bold">金額${moneyInputHtml({ attrs: 'data-f="pay.amount"', value: pay.amount, placeholder: '120,000', cls: 'inp mt-1 font-normal' })}</label>
        <label class="text-sm font-bold">理由<select class="inp mt-1 font-normal" data-f="pay.reason"><option value="">選んでください</option>${PAY_REASONS.map((r) => `<option value="${r.key}" ${pay.reason === r.key ? 'selected' : ''}>${r.label}</option>`).join('')}</select></label>
        <label class="text-sm font-bold">担当した営業<select class="inp mt-1 font-normal" data-f="pay.userId"><option value="">（指定なし）</option>${scoped().map((u) => `<option value="${u.id}" ${pay.userId === u.id ? 'selected' : ''}>${esc(withOffice(u))}</option>`).join('')}</select></label>
        <label class="text-sm font-bold sm:col-span-2">メモ（振込先の口座など）<input class="inp mt-1 font-normal" data-f="pay.memo" value="${esc(pay.memo)}" placeholder="${pay.reason === 'other' ? '理由を記入してください' : '例: ○○銀行 △△支店 普通 1234567'}" /></label>
      </div>
      <button class="b b-pri" data-pay-add>振込の依頼を登録</button>
      <table class="w-full text-sm"><thead><tr class="text-left text-slate-500 border-b"><th>登録</th><th>お客様</th><th class="text-right">金額</th><th>理由・担当</th><th>状況</th></tr></thead><tbody>
        ${pays.length ? pays.map((p) => `<tr class="border-b"><td>${fmtTime(p.at).slice(0, 5)}</td><td class="font-bold">${esc(p.customerName)} 様</td><td class="text-right">${yen(p.amount)}</td>
          <td class="!whitespace-normal text-xs">${esc(reasonOf(p.reason).label)}${p.userId ? `／${esc(withOffice(userById(p.userId)))}` : ''}${p.memo ? `<br><span class="text-slate-500">${esc(p.memo)}</span>` : ''}</td>
          <td>${p.status === 'done' ? badge('bg-emerald-100 text-emerald-800', `振込済 ${fmtTime(p.paidAt).slice(0, 5)}`) : `<button class="b b-sec !min-h-0 !py-1 !px-2 text-xs" data-pay-done="${p.id}">振込済みにする</button>`}</td></tr>`).join('')
          : '<tr><td colspan="5" class="text-slate-400">登録はありません。</td></tr>'}
      </tbody></table>
    </section>
  </div>`;
}

// ---- 経費の入力代行 ---------------------------------------------------------------
function expenseTab() {
  const day = loadDay(exp.userId);
  const ok = canProxy(day);
  const why = !day?.startedAt ? 'まだ始業していないため、入力できません。' : day.closedAt ? '終業済みのため、入力できません（営業が数えた現金と合わなくなるため）。' : '';
  return `
  <section class="rounded-xl border bg-white p-4 space-y-3 max-w-3xl">
    <h2 class="font-bold text-lg">🧾 経費の入力代行（今日分）${helpIcon('営業がレシートを入力できなかった経費を、経理部が代わりに計上します。「経理代行」の印が付き、営業の帳簿残高に反映されます。')}</h2>
    <div class="grid sm:grid-cols-2 gap-3">
      <label class="text-sm font-bold">営業${userSelect('exp.userId', exp.userId)}</label>
      <label class="text-sm font-bold">金額${moneyInputHtml({ attrs: 'data-f="exp.amount"', value: exp.amount, placeholder: '3,000', cls: 'inp mt-1 font-normal' })}</label>
      <div class="sm:col-span-2"><div class="text-sm font-bold">種類</div><div class="flex flex-wrap gap-2 mt-1">
        ${EXPENSE_TYPES.map((t) => `<button class="b b-sec ${exp.type === t.key ? 'on' : ''}" data-exp-type="${t.key}">${t.icon} ${t.label}</button>`).join('')}</div></div>
      <label class="text-sm font-bold sm:col-span-2">内容・代行する理由（必須）<input class="inp mt-1 font-normal" data-f="exp.memo" value="${esc(exp.memo)}" placeholder="例: レシートを紛失したと営業から連絡あり" /></label>
    </div>
    ${why ? `<div class="rounded bg-amber-50 text-amber-800 text-sm font-bold p-2">${esc(withOffice(userById(exp.userId)))} さんは、${why}</div>` : ''}
    <button class="b b-pri" data-exp-add ${ok ? '' : 'disabled'}>経費として計上する</button>
  </section>`;
}

// ---- 経費の全体状況 ---------------------------------------------------------------
function overviewTab() {
  const key = period === 'day' ? dateKey() : dateKey().slice(0, 7);
  const st = expenseStats(onlyOffice(Object.values(loadDays()), scopedIds(), Boolean(office)), key);
  const max = Math.max(1, ...st.byType.map((t) => t.amount));
  return `
  <div class="flex items-center gap-2">${[['day', '今日'], ['month', '今月']].map(([k, l]) => `<button class="b b-sec ${period === k ? 'on' : ''}" data-period="${k}">${l}</button>`).join('')}${helpIcon('会社全体の固定費などの管理は、業務フローの確認後に追加します。')}</div>
  <div class="flex flex-wrap gap-3">
    ${card('経費の合計', yen(st.total))}${card('経費の件数', `${st.count} 件`)}${card('買取代金（経費とは別）', yen(st.purchaseTotal), 'text-slate-600')}
  </div>
  <div class="grid lg:grid-cols-2 gap-4">
    <section class="rounded-xl border bg-white p-4"><h2 class="font-bold mb-2">種類別</h2>
      ${st.byType.length ? st.byType.map((t) => `<div class="mb-2 text-sm"><div class="flex justify-between"><span>${t.icon} ${t.label}（${t.count}件）</span><b>${yen(t.amount)}</b></div>
        <div class="h-2 rounded bg-slate-100"><div class="h-2 rounded bg-teal-600" style="width:${Math.round((t.amount / max) * 100)}%"></div></div></div>`).join('') : '<div class="text-slate-400 text-sm">経費の記録はありません。</div>'}</section>
    <section class="rounded-xl border bg-white p-4"><h2 class="font-bold mb-2">営業別</h2>
      <table class="w-full text-sm"><tbody>${st.byUser.length ? st.byUser.map((u) => `<tr class="border-b"><td class="font-bold">${esc(withOffice(userById(u.userId)))}</td><td class="text-right">${u.count}件</td><td class="text-right">${yen(u.amount)}</td></tr>`).join('') : '<tr><td class="text-slate-400">経費の記録はありません。</td></tr>'}</tbody></table></section>
  </div>`;
}

const VIEWS = { cash: cashTab, deposit: depositTab, expense: expenseTab, overview: overviewTab };

function render() {
  // 入力中の営業が、絞り込みの外なら、営業所の先頭の営業に切り替える
  if (!scopedIds().includes(dep.userId)) dep = { ...dep, userId: scopedIds()[0] ?? '' };
  if (!scopedIds().includes(exp.userId)) exp = { ...exp, userId: scopedIds()[0] ?? '' };
  if (pay.userId && !scopedIds().includes(pay.userId)) pay = { ...pay, userId: '' };
  const rows = todayRows().filter((r) => scopedIds().includes(r.user.id));
  const alerts = rows.filter((r) => r.summary && flagsOf(r.day, r.summary).length).length;
  const pending = onlyOffice(loadCustomerPayments(), scopedIds(), Boolean(office)).filter((p) => p.status === 'pending').length;
  $('#root').innerHTML = `<div class="flex flex-col h-screen">
  <header class="bg-teal-800 text-white px-4 md:px-6 py-2 flex flex-wrap gap-2 justify-between items-center">
    <div class="flex items-center gap-2"><button class="relative w-11 h-11 -ml-2 rounded-xl text-2xl leading-none hover:bg-white/10 active:bg-white/20" data-menu-open aria-label="メニューを開く">☰${alerts || pending ? '<span class="absolute top-1 right-1 w-3 h-3 rounded-full bg-amber-400"></span>' : ''}</button>
      <span class="font-bold text-xl">経理部</span><span class="text-teal-200">›</span><span class="font-bold">${tabLabel(tab)}</span><span class="text-xs font-normal bg-white/20 rounded px-2 py-0.5 ml-2">ダミー画面（PC）</span></div>
    <div class="text-sm flex flex-wrap items-center gap-x-3 gap-y-1"><label class="text-xs font-bold">営業所 <select class="rounded bg-white/20 text-white px-1 py-0.5 font-bold" data-office><option class="text-slate-800" value="">全営業所（${USERS.length}人）</option>${AREAS.map((a) => `<option class="text-slate-800" value="${a.id}" ${office === a.id ? 'selected' : ''}>${esc(a.name.replace('エリア', ''))}（${officeUsers(USERS, a.id, areaOfUser).length}人）</option>`).join('')}</select></label>
      <span>確認が必要な営業 <b class="text-lg">${alerts}</b>人 ／ 振込待ち <b class="text-lg">${pending}</b>件</span> <button class="text-xs underline text-white/70" data-sample>サンプルデータを入れ直す</button> ${themeToggleHtml()}</div>
  </header>
  <main class="p-4 space-y-4 overflow-y-auto flex-1 min-h-0">${VIEWS[tab]()}</main>${menuOpen ? menuView({ tab, badges: { cash: alerts, deposit: pending } }) : ''}</div>`;
}

// ---- 操作 -----------------------------------------------------------------------
function sendDeposit() {
  if (!(dep.amount > 0)) return alert('入金額を入力してください');
  addDeposit({ id: newId('DP'), userId: dep.userId, amount: dep.amount, memo: dep.memo.trim(), by: BY, at: Date.now() });
  dep = { ...dep, amount: 0, memo: '' };
}
function addPayment() {
  if (!paymentReady(pay)) return alert('お客様名・金額・理由を入力してください（理由が「その他」のときは、メモも必要です）');
  addCustomerPayment(pay);
  pay = blankPay();
}
function addProxy() {
  const day = loadDay(exp.userId);
  if (!canProxy(day)) return;
  if (!exp.type || !(exp.amount > 0) || !exp.memo.trim()) return alert('種類・金額・内容（代行する理由）を入力してください');
  if (!saveDay(proxyExpense(day, { ...exp, by: BY }))) return alert('保存できませんでした（容量超過）');
  exp = { ...exp, type: '', amount: 0, memo: '' };
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('button, tr[data-sel-user]');
  if (!t) return;
  const d = t.dataset;
  if (d.tab) { tab = d.tab; menuOpen = false; }
  else if ('menuOpen' in d) menuOpen = true;
  else if ('menuClose' in d) menuOpen = false;
  else if (d.selUser) selUser = selUser === d.selUser ? null : d.selUser;
  else if (d.period) period = d.period;
  else if ('sample' in d) { if (!confirm('営業の始業・経費・入金・お客様への入金のデータを、サンプルデータに置き換えます。よろしいですか？')) return; seedSample(Date.now(), true); selUser = null; }
  else if ('depSend' in d) sendDeposit();
  else if ('payAdd' in d) addPayment();
  else if (d.payDone) markPaid(d.payDone);
  else if (d.expType) exp = { ...exp, type: d.expType };
  else if ('expAdd' in d) addProxy();
  else return;
  render();
});
const FORMS = { dep: () => dep, pay: () => pay, exp: () => exp };
const setForm = (name, value) => { if (name === 'dep') dep = value; else if (name === 'pay') pay = value; else exp = value; };
function onField(e, isInput) {
  const [form, key] = (e.target.dataset.f ?? '').split('.');
  if (!FORMS[form]) return false;
  const isMoney = key === 'amount';
  if (isInput !== (isMoney || e.target.tagName === 'INPUT')) return true; // input欄は入力中に、選択欄は選択時に反映
  setForm(form, { ...FORMS[form](), [key]: isMoney ? formatMoneyInput(e.target) : e.target.value });
  return true;
}
document.addEventListener('input', (e) => { onField(e, true); });
document.addEventListener('change', (e) => {
  if (e.target.matches('[data-office]')) {
    office = e.target.value;
    try { localStorage.setItem('rq-mock-acc-office', office); } catch { /* 保存できなくても動作は継続（モック） */ }
    selUser = null; render(); return;
  }
  if (!onField(e, false)) return;
  if (['dep.userId', 'pay.reason', 'exp.userId'].includes(e.target.dataset.f)) render(); // 状況表示・入力例が変わるもの
});

// 営業側（タブレット）の更新を即時反映。入力中なら、入力欄から離れたときに反映する
const isEditing = () => Boolean(document.activeElement?.dataset?.f);
window.addEventListener('storage', (e) => {
  if (![WORKDAY_KEY, DEPOSIT_KEY, CUSTOMER_PAY_KEY].includes(e.key)) return;
  if (isEditing()) dirty = true;
  else render();
});
document.addEventListener('focusout', () => { if (dirty) setTimeout(() => !isEditing() && ((dirty = false), render()), 0); });

seedSample(); // 初めて開いたとき（記録が空のとき）だけ、サンプルデータを入れる
initTheme();
initHelp();
render();
