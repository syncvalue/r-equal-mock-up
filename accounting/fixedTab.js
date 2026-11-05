// 固定費・小口金管理: 家賃・人件費などの固定費の支払と、鑑定士の小口金
import { dateKey } from '../src/workday.js';
import { loadLedger } from '../src/ledger.js';
import { FIXED_TYPES, fixedTypeOf, loadFixed, monthlyFixed, monthlyTotals, fieldStaff, pettyRows, loadPettyUses, pettyStatusOf, PETTY_STATUS, PETTY_LOW } from '../src/fixedCosts.js';
import { moneyInputHtml } from '../src/moneyInput.js';
import { helpIcon } from '../src/help.js';
import { yen, esc } from '../src/format.js';
import { badge, card, md } from './ui.js';

export const shiftMonth = (month, n) => { const d = new Date(`${month}-01T00:00:00`); d.setMonth(d.getMonth() + n); return dateKey(d).slice(0, 7); };
const monthLabel = (m) => `${m.slice(0, 4)}年${Number(m.slice(5))}月`;

export const fixedRows = (st) => monthlyFixed(loadFixed(), loadLedger(), st.month, dateKey());
export const pettyAlerts = () => pettyRows(loadLedger(), loadPettyUses(), fieldStaff()).filter((r) => r.low).length + loadPettyUses().filter((u) => pettyStatusOf(u) === 'pending').length; // 補充が必要な鑑定士＋承認待ちの申請

function fixedSection(st) {
  const rows = fixedRows(st);
  const t = monthlyTotals(rows);
  const f = st.fix;
  return `
  <section class="rounded-xl border bg-white p-4 space-y-3">
    <div class="flex flex-wrap items-center gap-2"><h2 class="font-bold text-lg">🏢 固定費</h2>
      <button class="b b-sec !min-h-0 !py-1 !px-3" data-month="-1" aria-label="前の月">◀</button><b>${monthLabel(st.month)}</b><button class="b b-sec !min-h-0 !py-1 !px-3" data-month="1" aria-label="次の月">▶</button>
      ${helpIcon('毎月の固定費を登録しておき、支払日に「支払う」を押すと、入出金の帳簿に「固定費」の支払として載ります（残高・週間収支に反映）。支払日は1〜28日。')}</div>
    <div class="flex flex-wrap gap-3">${card('今月の固定費', yen(t.total))}${card('支払済み', yen(t.paid), 'text-emerald-700')}${card('未払い', yen(t.unpaid), t.unpaid ? 'text-amber-700' : '')}</div>
    <table class="w-full text-sm"><thead><tr class="text-left text-slate-500 border-b"><th>支払日</th><th>種類</th><th>名前</th><th class="text-right">金額</th><th>状況</th><th></th></tr></thead><tbody>
      ${rows.map((r) => `<tr class="border-b ${r.active ? '' : 'text-slate-400'}"><td>${md(r.due)}</td><td>${fixedTypeOf(r.type).icon} ${fixedTypeOf(r.type).label}</td><td class="font-bold">${esc(r.name)}${r.active ? '' : '（無効）'}</td><td class="text-right">${yen(r.paid?.amount ?? r.amount)}</td>
        <td>${r.paid ? badge('bg-emerald-100 text-emerald-800', `支払済み ${md(r.paid.date)}`) : r.overdue ? badge('bg-rose-100 text-rose-700', '支払日を過ぎています') : badge('bg-slate-100 text-slate-600', '未払い')}</td>
        <td class="space-x-1">${r.paid ? '' : `<button class="b b-pri !min-h-0 !py-1 !px-2 text-xs" data-fix-pay="${r.id}">支払う</button>`}<button class="b b-sec !min-h-0 !py-1 !px-2 text-xs" data-fix-edit="${r.id}">編集</button><button class="b b-sec !min-h-0 !py-1 !px-2 text-xs" data-fix-toggle="${r.id}">${r.active ? '無効にする' : '有効にする'}</button></td></tr>`).join('') || '<tr><td colspan="6" class="text-slate-400">固定費の登録はありません。</td></tr>'}
    </tbody></table>
    <div class="rounded-lg bg-slate-50 p-3 space-y-2"><div class="text-sm font-bold">${f.id ? '固定費を変更する' : '固定費を登録する'}</div>
      <div class="flex flex-wrap items-end gap-3">
        <label class="text-sm font-bold">種類<select class="inp mt-1 font-normal" data-f="fix.type">${FIXED_TYPES.map((t) => `<option value="${t.key}" ${f.type === t.key ? 'selected' : ''}>${t.icon} ${t.label}</option>`).join('')}</select></label>
        <label class="text-sm font-bold flex-1 min-w-[10rem]">名前<input class="inp mt-1 font-normal" data-f="fix.name" value="${esc(f.name)}" placeholder="例: 福岡倉庫 家賃" /></label>
        <label class="text-sm font-bold">毎月の金額${moneyInputHtml({ attrs: 'data-f="fix.amount"', value: f.amount, placeholder: '300,000', cls: 'inp mt-1 font-normal' })}</label>
        <label class="text-sm font-bold">支払日（毎月）<input type="number" min="1" max="28" class="inp mt-1 font-normal" data-f="fix.payDay" value="${f.payDay}" /></label>
        <button class="b b-pri" data-fix-save>${f.id ? '変更を保存' : '登録'}</button>${f.id ? '<button class="b b-sec" data-fix-cancel>やめる</button>' : ''}
      </div></div>
  </section>`;
}

const nameOf = (id) => fieldStaff().find((a) => a.id === id)?.name ?? id;

function requestRow(st, u, balance) {
  const rejecting = st.pettyReject?.id === u.id;
  const short = u.amount > balance;
  return `<tr class="border-b"><td>${md(u.date)}</td><td class="font-bold">${esc(nameOf(u.userId))}</td><td class="text-right">${yen(u.amount)}</td><td class="!whitespace-normal">${esc(u.memo)}</td>
    <td class="space-x-1"><button class="b b-pri !min-h-0 !py-1 !px-2 text-xs" data-petty-ok="${u.id}" ${short ? 'disabled title="小口金の残りが足りません。先に補充してください"' : ''}>承認</button><button class="b b-sec !min-h-0 !py-1 !px-2 text-xs" data-petty-rej="${u.id}">却下</button>${short ? `<span class="text-xs text-rose-600 font-bold">残り ${yen(balance)}（先に補充）</span>` : ''}</td></tr>
    ${rejecting ? `<tr class="bg-rose-50"><td colspan="5"><div class="flex flex-wrap items-end gap-2 p-1"><label class="text-sm font-bold flex-1 min-w-[14rem]">却下の理由（必須・鑑定士に伝える内容）<input class="inp mt-1 font-normal" data-f="rej.reason" value="${esc(st.pettyReject.reason)}" placeholder="例: 領収書を添えて、もう一度申請してください" /></label><button class="b b-pri" data-petty-rej-send>却下する</button><button class="b b-sec" data-petty-rej-cancel>やめる</button></div></td></tr>` : ''}`;
}

function pettySection(c) {
  const st = c.st;
  const staff = c.scoped();
  const rows = pettyRows(loadLedger(), loadPettyUses(), staff);
  const f = st.pu;
  const all = loadPettyUses();
  const requests = all.filter((u) => pettyStatusOf(u) === 'pending' && staff.some((x) => x.id === u.userId)).sort((a, b) => a.at - b.at);
  const balanceOf = (id) => rows.find((r) => r.user.id === id)?.balance ?? 0;
  const recent = all.filter((u) => pettyStatusOf(u) !== 'pending' && staff.some((x) => x.id === u.userId)).sort((a, b) => b.at - a.at).slice(0, 8);
  return `
  <section class="rounded-xl border bg-white p-4 space-y-3">
    <h2 class="font-bold text-lg">👜 鑑定士の小口金${helpIcon(`鑑定士が、現場で使う道具・交通費などの小口金の使用を、鑑定士タブレットから申請し、経理部が承認します。承認した分が、残りから引かれます。残りが${yen(PETTY_LOW)}を下回ったら、補充が必要です。補充は、入出金の帳簿に「鑑定士の小口金」の支払として載ります。`)}</h2>
    <table class="w-full text-sm"><thead><tr class="text-left text-slate-500 border-b"><th>鑑定士</th><th class="text-right">補充の合計</th><th class="text-right">使った合計（承認済み）</th><th class="text-right">残り</th><th>状況</th><th></th></tr></thead><tbody>
      ${rows.map((r) => `<tr class="border-b"><td class="font-bold">${esc(r.user.name)}</td><td class="text-right">${yen(r.refill)}</td><td class="text-right">${yen(r.used)}</td><td class="text-right font-bold ${r.low ? 'text-rose-600' : ''}">${yen(r.balance)}</td>
        <td>${r.low ? badge('bg-rose-100 text-rose-700', '補充が必要') : badge('bg-emerald-100 text-emerald-800', '十分')}${r.pendingCount ? ` ${badge('bg-amber-100 text-amber-800', `承認待ち ${r.pendingCount}件`)}` : ''}</td>
        <td><button class="b b-pri !min-h-0 !py-1 !px-2 text-xs" data-petty-refill="${r.user.id}" ${r.suggest ? '' : 'disabled'}>${r.suggest ? `${yen(r.suggest)} 補充する` : '補充不要'}</button></td></tr>`).join('') || '<tr><td colspan="6" class="text-slate-400">鑑定士がいません。</td></tr>'}
    </tbody></table>
    <div class="text-sm font-bold">鑑定士からの申請（承認待ち）</div>
    <table class="w-full text-sm"><tbody>${requests.map((u) => requestRow(st, u, balanceOf(u.userId))).join('') || '<tr><td class="text-slate-400">承認待ちの申請はありません。</td></tr>'}</tbody></table>
    <div class="rounded-lg bg-slate-50 p-3 space-y-2"><div class="text-sm font-bold">鑑定士の代わりに入力する（経理代行）${helpIcon('鑑定士が申請できない場合に、経理部が代わりに記録します。承認は不要で、承認済みとして残りから引かれます。「経理代行」の印が付きます。')}</div>
      <div class="flex flex-wrap items-end gap-3">
        <label class="text-sm font-bold">鑑定士<select class="inp mt-1 font-normal" data-f="pu.userId">${staff.map((a) => `<option value="${a.id}" ${f.userId === a.id ? 'selected' : ''}>${esc(c.withOffice(a))}</option>`).join('')}</select></label>
        <label class="text-sm font-bold">日付<input type="date" class="inp mt-1 font-normal" data-f="pu.date" value="${f.date}" max="${dateKey()}" /></label>
        <label class="text-sm font-bold">金額${moneyInputHtml({ attrs: 'data-f="pu.amount"', value: f.amount, placeholder: '3,000', cls: 'inp mt-1 font-normal' })}</label>
        <label class="text-sm font-bold flex-1 min-w-[12rem]">用途・代行する理由（必須）<input class="inp mt-1 font-normal" data-f="pu.memo" value="${esc(f.memo)}" placeholder="例: 鑑定士から電話で連絡あり。査定用の手袋" /></label>
        <button class="b b-pri" data-petty-use>代行入力する</button>
      </div></div>
    <div class="text-sm font-bold">最近の承認・却下</div>
    <table class="w-full text-sm"><tbody>${recent.map((u) => `<tr class="border-b"><td>${md(u.date)}</td><td class="font-bold">${esc(nameOf(u.userId))}</td><td class="text-right">${yen(u.amount)}</td><td class="!whitespace-normal text-slate-500">${esc(u.memo)}${u.reason ? `<div class="text-rose-700 text-xs">却下の理由: ${esc(u.reason)}</div>` : ''}</td><td>${badge(PETTY_STATUS[pettyStatusOf(u)].cls, PETTY_STATUS[pettyStatusOf(u)].label)}${u.proxy ? ' <span class="text-xs text-teal-700">（経理代行）</span>' : ''}</td></tr>`).join('') || '<tr><td class="text-slate-400">記録はありません。</td></tr>'}</tbody></table>
  </section>`;
}

export const fixedTab = (c) => `<div class="grid 2xl:grid-cols-2 gap-4 items-start">${fixedSection(c.st)}${pettySection(c)}</div>`;
