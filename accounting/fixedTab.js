// 固定費: 家賃・人件費などの固定費の支払（メニューから外している）
import { dateKey } from '../src/workday.js';
import { loadLedger } from '../src/ledger.js';
import { FIXED_TYPES, fixedTypeOf, loadFixed, monthlyFixed, monthlyTotals } from '../src/fixedCosts.js';
import { moneyInputHtml } from '../src/moneyInput.js';
import { helpIcon } from '../src/help.js';
import { yen, esc } from '../src/format.js';
import { badge, card, md } from './ui.js';

export const shiftMonth = (month, n) => { const d = new Date(`${month}-01T00:00:00`); d.setMonth(d.getMonth() + n); return dateKey(d).slice(0, 7); };
const monthLabel = (m) => `${m.slice(0, 4)}年${Number(m.slice(5))}月`;

export const fixedRows = (st) => monthlyFixed(loadFixed(), loadLedger(), st.month, dateKey());

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

export const fixedTab = (c) => `<div class="max-w-5xl">${fixedSection(c.st)}</div>`;
