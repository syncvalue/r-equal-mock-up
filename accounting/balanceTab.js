// 残高・入出金管理: 日次残高、入金・支払の登録、鑑定士の補充金、お客様への支払
import { todayRows, carryoverFor, depositsOf, dateKey } from '../src/workday.js';
import { flagsOf, PAY_REASONS, reasonOf, loadCustomerPayments, onlyOffice } from '../src/accounting.js';
import { IN_CATEGORIES, OUT_CATEGORIES, categoryOf, dailyBalances, totals } from '../src/ledger.js';
import { userById } from '../src/dashboard.js';
import { moneyInputHtml } from '../src/moneyInput.js';
import { helpIcon } from '../src/help.js';
import { yen, fmtTime, esc } from '../src/format.js';
import { loadRequests, openRequests, requestBall, REQUEST_STATUS, advThread, advUnread } from '../src/advanceRequest.js';
import { loadChats } from '../src/expenseChat.js';
import { chatView } from '../src/expenseChatView.js';
import { LEVEL, signed, signedYen, badge, card, mdw } from './ui.js';

const PHASE = { before: ['未始業', 'bg-slate-200 text-slate-600'], open: ['業務中', 'bg-emerald-100 text-emerald-800'], closed: ['終業済み', 'bg-indigo-100 text-indigo-800'] };
const MANUAL = { in: IN_CATEGORIES, out: OUT_CATEGORIES.filter((c) => c.key !== 'fixed') }; // 固定費は、固定費の画面から

const ledgerForm = (c) => {
  const f = c.st.led;
  const cat = categoryOf(f.category);
  return `
  <section class="rounded-xl border bg-white p-4 space-y-3">
    <h2 class="font-bold text-lg">✍️ 入金・支払の登録${helpIcon('家賃・人件費などの固定費は、固定費の画面から支払います。')}</h2>
    <div class="flex gap-2">${[['in', '入金'], ['out', '支払']].map(([k, l]) => `<button class="b b-sec ${f.kind === k ? 'on' : ''}" data-led-kind="${k}">${l}</button>`).join('')}</div>
    <div class="grid sm:grid-cols-2 gap-3">
      <label class="text-sm font-bold">区分<select class="inp mt-1 font-normal" data-f="led.category">${MANUAL[f.kind].map((x) => `<option value="${x.key}" ${f.category === x.key ? 'selected' : ''}>${x.label}</option>`).join('')}</select><span class="text-xs font-normal text-slate-500">${esc(cat?.hint ?? '')}</span></label>
      <label class="text-sm font-bold">日付<input type="date" class="inp mt-1 font-normal" data-f="led.date" value="${f.date}" max="${dateKey()}" /></label>
      <label class="text-sm font-bold">金額${moneyInputHtml({ attrs: 'data-f="led.amount"', value: f.amount, placeholder: '300,000', cls: 'inp mt-1 font-normal' })}</label>
      ${f.category === 'sales' ? `<label class="text-sm font-bold">原価（粗利の計算に使う）${moneyInputHtml({ attrs: 'data-f="led.cost"', value: f.cost, placeholder: '200,000', cls: 'inp mt-1 font-normal' })}</label>` : ''}
      ${f.category === 'advance' ? `<label class="text-sm font-bold">鑑定士<select class="inp mt-1 font-normal" data-f="led.userId">${c.scoped().map((u) => `<option value="${u.id}" ${f.userId === u.id ? 'selected' : ''}>${esc(c.withOffice(u))}</option>`).join('')}</select></label>` : ''}
      <label class="text-sm font-bold sm:col-span-2">メモ${/^other_/.test(f.category) ? '（必須）' : ''}<input class="inp mt-1 font-normal" data-f="led.memo" value="${esc(f.memo)}" placeholder="例: 買取資金の追加" /></label>
    </div>
    <button class="b b-pri" data-led-add>${f.kind === 'in' ? '入金を登録' : '支払を登録'}</button>
  </section>`;
};

const dailyTable = (c) => {
  const to = dateKey();
  const from = dateKey(new Date(Date.now() - 13 * 86400000));
  const rows = dailyBalances(c.st.ledger, from, to);
  return `
  <section class="rounded-xl border bg-white p-4 space-y-2">
    <h2 class="font-bold text-lg">📅 日次残高（直近14日）${helpIcon('残高 ＝ 前日の残高 ＋ 入金 − 支払。行を押すと、その日の入出金の明細が出ます。')}</h2>
    <table class="w-full text-sm"><thead><tr class="text-left text-slate-500 border-b"><th>日付</th><th class="text-right">前日残高</th><th class="text-right">入金</th><th class="text-right">支払</th><th class="text-right">残高</th></tr></thead><tbody>
    ${rows.map((r) => `<tr class="border-b ${r.count ? 'cursor-pointer hover:bg-slate-50' : 'text-slate-400'}" ${r.count ? `data-sel-day="${r.date}"` : ''}><td>${mdw(r.date)}${r.date === to ? ' <span class="text-xs text-teal-700 font-bold">今日</span>' : ''}</td><td class="text-right">${yen(r.opening)}</td><td class="text-right text-emerald-700">${r.in ? `+${yen(r.in)}` : '-'}</td><td class="text-right text-rose-700">${r.out ? `−${yen(r.out)}` : '-'}</td><td class="text-right font-bold ${r.balance < 0 ? 'text-rose-600' : ''}">${signedYen(r.balance)}</td></tr>
      ${c.st.selDay === r.date ? dayDetail(c, r.date) : ''}`).join('')}
    </tbody></table>
  </section>`;
};

const dayDetail = (c, date) => `<tr class="bg-slate-50"><td colspan="5" class="!whitespace-normal"><table class="w-full text-xs">
  ${c.st.ledger.filter((e) => e.date === date).sort((a, b) => a.at - b.at).map((e) => `<tr class="border-b"><td>${fmtTime(e.at).slice(0, 5)}</td><td>${badge(e.kind === 'in' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-700', e.kind === 'in' ? '入金' : '支払')} ${esc(categoryOf(e.category)?.label ?? '')}</td><td class="text-right">${yen(e.amount)}</td><td class="!whitespace-normal">${esc(e.memo)}${e.userId ? `（${esc(c.withOffice(userById(e.userId)))}）` : ''}</td>${e.category === 'sales' ? `<td class="text-slate-500">原価 ${yen(e.cost)}</td>` : '<td></td>'}</tr>`).join('')}
</table></td></tr>`;

export function advanceTable(c) {
  const rows = todayRows().filter((r) => c.scopedIds().includes(r.user.id)).map((r) => {
    const opening = carryoverFor(r.user.id).amount;
    const depositTotal = depositsOf(r.user.id).reduce((n, d) => n + d.amount, 0);
    const cash = r.summary ?? { opening, depositTotal, withdrawalTotal: 0, expenseTotal: 0, balance: opening };
    return { ...r, cash, flags: r.summary ? flagsOf(r.day, r.summary) : [] };
  });
  return `
  <section class="rounded-xl border bg-white p-4 space-y-2">
    <h2 class="font-bold text-lg">👤 鑑定士の補充金（今日）${helpIcon('補充金 ＝ 経理部が振り込んだ金額。引き出し金額 ＝ そのうち鑑定士が引き出した金額（鑑定士が入力。通常は補充金と一致）。所持金 ＝ 始業時の金額（未始業は前日繰越）＋ 引き出し金額 − 経費（買取代金を含む）。終業時に鑑定士が数えた金額との差異は、理由と一緒に出します。')}</h2>
    <table class="w-full text-sm"><thead><tr class="text-left text-slate-500 border-b"><th>鑑定士</th><th>営業所</th><th>状況</th><th class="text-right">始業時</th><th class="text-right">補充金</th><th class="text-right">引き出し金額</th><th class="text-right">経費</th><th class="text-right">所持金</th><th class="text-right">過不足</th><th>確認事項</th></tr></thead><tbody>
    ${rows.map((r) => {
      const { user, day, phase, summary: sm, cash } = r;
      return `<tr class="border-b ${sm ? 'cursor-pointer hover:bg-slate-50' : ''}" ${sm ? `data-sel-user="${user.id}"` : ''}>
        <td class="font-bold">${esc(user.name)}</td><td>${esc(c.officeOf(user.id))}</td><td>${badge(PHASE[phase][1], PHASE[phase][0])}</td>
        <td class="text-right">${yen(cash.opening)}${sm ? '' : '<div class="text-xs text-slate-400">前日繰越</div>'}</td><td class="text-right">${yen(cash.depositTotal)}</td><td class="text-right ${cash.depositTotal !== cash.withdrawalTotal ? 'text-amber-700 font-bold' : ''}">${yen(cash.withdrawalTotal)}</td><td class="text-right">${yen(cash.expenseTotal)}</td>
        <td class="text-right font-bold ${cash.balance < 0 ? 'text-rose-600' : ''}">${signedYen(cash.balance)}</td>
        <td class="text-right font-bold ${day?.close?.diff ? 'text-rose-600' : 'text-emerald-700'}">${day?.closedAt ? signed(day.close.diff) : '-'}</td>
        <td class="!whitespace-normal">${r.flags.length ? badge(r.flags.some((f) => f.level === 'danger') ? LEVEL.danger : LEVEL.warn, `${r.flags.length}件`) : sm ? '<span class="text-emerald-700 text-xs font-bold">問題なし</span>' : '-'}</td></tr>
        ${c.st.selUser === user.id && sm ? `<tr class="bg-slate-50"><td colspan="10" class="!whitespace-normal text-sm">${r.flags.length ? r.flags.map((f) => badge(LEVEL[f.level], esc(f.text))).join(' ') : '確認が必要な事項はありません。'}<div class="text-xs text-slate-500 mt-1">経費の明細は、経費精算で確認します。</div></td></tr>` : ''}`;
    }).join('')}
    </tbody></table>
  </section>`;
}

function customerPayments(c) {
  const f = c.st.pay;
  const pays = onlyOffice(loadCustomerPayments(), c.scopedIds(), Boolean(c.st.office)); // 担当鑑定士が未指定の振込は、全営業所のときだけ出る
  return `
  <section class="rounded-xl border bg-white p-4 space-y-3">
    <h2 class="font-bold text-lg">💸 お客様への支払（銀行振込）${helpIcon('鑑定士の現金が足りなかった場合や、高額のため後日振込にした場合の、お客様へのお支払いです。「振込済みにする」と、日次残高に支払として載ります。')}</h2>
    <div class="grid sm:grid-cols-2 gap-3">
      <label class="text-sm font-bold">お客様名<input class="inp mt-1 font-normal" data-f="pay.customerName" value="${esc(f.customerName)}" placeholder="例: 山田 花子" /></label>
      <label class="text-sm font-bold">金額${moneyInputHtml({ attrs: 'data-f="pay.amount"', value: f.amount, placeholder: '120,000', cls: 'inp mt-1 font-normal' })}</label>
      <label class="text-sm font-bold">理由<select class="inp mt-1 font-normal" data-f="pay.reason"><option value="">選んでください</option>${PAY_REASONS.map((r) => `<option value="${r.key}" ${f.reason === r.key ? 'selected' : ''}>${r.label}</option>`).join('')}</select></label>
      <label class="text-sm font-bold">担当した鑑定士<select class="inp mt-1 font-normal" data-f="pay.userId"><option value="">（指定なし）</option>${c.scoped().map((u) => `<option value="${u.id}" ${f.userId === u.id ? 'selected' : ''}>${esc(c.withOffice(u))}</option>`).join('')}</select></label>
      <label class="text-sm font-bold sm:col-span-2">メモ（振込先の口座など）<input class="inp mt-1 font-normal" data-f="pay.memo" value="${esc(f.memo)}" placeholder="${f.reason === 'other' ? '理由を記入してください' : '例: ○○銀行 △△支店 普通 1234567'}" /></label>
    </div>
    <button class="b b-pri" data-pay-add>振込の依頼を登録</button>
    <table class="w-full text-sm"><thead><tr class="text-left text-slate-500 border-b"><th>登録</th><th>お客様</th><th class="text-right">金額</th><th>理由・担当</th><th>状況</th></tr></thead><tbody>
      ${pays.length ? pays.map((p) => `<tr class="border-b"><td>${fmtTime(p.at).slice(0, 5)}</td><td class="font-bold">${esc(p.customerName)} 様</td><td class="text-right">${yen(p.amount)}</td>
        <td class="!whitespace-normal text-xs">${esc(reasonOf(p.reason).label)}${p.userId ? `／${esc(c.withOffice(userById(p.userId)))}` : ''}${p.memo ? `<br><span class="text-slate-500">${esc(p.memo)}</span>` : ''}</td>
        <td>${p.status === 'done' ? badge('bg-emerald-100 text-emerald-800', `振込済 ${fmtTime(p.paidAt).slice(0, 5)}`) : `<button class="b b-sec !min-h-0 !py-1 !px-2 text-xs" data-pay-done="${p.id}">振込済みにする</button>`}</td></tr>`).join('')
        : '<tr><td colspan="5" class="text-slate-400">登録はありません。</td></tr>'}
    </tbody></table>
  </section>`;
}

// 鑑定士からの補充の依頼: 鑑定士とチャットでやり取りする。実際の振込は、銀行システムで行うので、ここでは、金額・結果を扱わない。完了にできるのは、依頼を出した鑑定士
function advancePanel(c, r, chats) {
  return `<tr class="bg-slate-50"><td colspan="7"><div class="p-2 max-w-3xl"><div class="font-bold text-sm mb-1">💬 ${esc(userById(r.userId).name)} さんとのやり取り${helpIcon('この依頼について、鑑定士とチャットでやり取りします。実際の振込は、銀行システムで行います。やり取りが終わったら（振り込んだ場合も、見送りの場合も）、依頼を出した鑑定士が「完了」にします。補充金を鑑定士の画面に反映するときは、下の「入金・支払の登録」で、鑑定士への補充金を入力します。')}</div>
    ${chatView(advThread(chats, r.id), { inputAttrs: 'data-f="chat.text"', sendAttrs: 'data-adv-chat-send', draft: c.st.chat?.text ?? '' })}</div></td></tr>`;
}

function advanceRequests(c) {
  const ids = c.scopedIds();
  const all = loadRequests().filter((r) => ids.includes(r.userId));
  const open = openRequests(all);
  const chats = loadChats();
  const turn = open.filter((r) => requestBall(r, advThread(chats, r.id)) === 'accounting').length;
  const closed = all.filter((r) => r.status === 'closed').sort((a, b) => b.closedAt - a.closedAt).slice(0, 5);
  return `
  <section class="rounded-xl border-2 ${turn ? 'border-amber-400' : 'border-slate-200'} bg-white p-4 space-y-3">
    <h2 class="font-bold text-lg">🙋 鑑定士からの補充の依頼${turn ? ` ${badge('bg-amber-400 text-slate-900', `対応待ち ${turn}`)}` : ''}${helpIcon('鑑定士が、鑑定士タブレットから、補充金の振込を依頼します。「開く」で、鑑定士とチャットでやり取りします。実際の振込は、銀行システムで行うので、ここでは、金額や結果は扱いません。やり取りが終わったら（振り込んだ場合も、見送りの場合も）、依頼を出した鑑定士が「完了」にします。')}</h2>
    <table class="w-full text-sm"><thead><tr class="text-left text-slate-700 bg-slate-200 border-b-2 border-slate-300"><th>依頼</th><th>鑑定士</th><th class="text-right">金額</th><th>理由・用途</th><th>やり取り</th><th>誰の番</th><th>操作</th></tr></thead><tbody>
      ${open.map((r) => { const isOpen = c.st.advOpen === r.id; const talk = advThread(chats, r.id).messages.length; const unread = advUnread(chats, r.id, 'accounting'); const ball = requestBall(r, advThread(chats, r.id));
        return `<tr class="border-b ${isOpen ? '!bg-teal-100' : ''}"><td>${fmtTime(r.at).slice(0, 5)}</td><td class="font-bold">${esc(c.withOffice(userById(r.userId)))}</td><td class="text-right font-bold">${yen(r.amount)}</td><td class="!whitespace-normal">${esc(r.memo) || '<span class="text-slate-400">（記入なし）</span>'}</td>
          <td class="whitespace-nowrap">${talk ? `<span class="text-xs">💬 ${talk}</span>` : '<span class="text-slate-300">－</span>'}${unread ? ` <span class="rounded-full bg-rose-600 text-white text-[10px] font-bold px-1.5 py-0.5">新着 ${unread}</span>` : ''}</td>
          <td>${ball === 'accounting' ? '<span class="rounded bg-rose-600 text-white text-[11px] font-bold px-1.5 py-0.5">▶ 経理部の番</span>' : '<span class="rounded bg-slate-200 text-slate-700 text-[11px] font-bold px-1.5 py-0.5">⏳ 鑑定士待ち</span>'}</td>
          <td><button class="b ${isOpen ? 'b-sec' : 'b-pri'} !min-h-0 !py-1 !px-3 text-xs" data-adv-open="${r.id}">${isOpen ? '閉じる' : '開く（やり取り）'}</button></td></tr>${isOpen ? advancePanel(c, r, chats) : ''}`; }).join('') || '<tr><td colspan="7" class="text-slate-400">やり取り中の依頼はありません。</td></tr>'}
    </tbody></table>
    ${closed.length ? `<div class="text-sm font-bold">最近完了した依頼</div><table class="w-full text-sm"><tbody>${closed.map((r) => `<tr class="border-b"><td>${mdw(dateKey(new Date(r.closedAt)))} ${fmtTime(r.closedAt).slice(0, 5)}</td><td class="font-bold">${esc(c.withOffice(userById(r.userId)))}</td><td class="text-right">${yen(r.amount)}</td><td>${badge(REQUEST_STATUS.closed.cls, REQUEST_STATUS.closed.label)}</td><td class="!whitespace-normal text-xs">${esc(r.memo)}</td></tr>`).join('')}</tbody></table>` : ''}
  </section>`;
}

export function balanceTab(c) {
  const today = dateKey();
  const t = totals(c.st.ledger.filter((e) => e.date === today));
  const bal = dailyBalances(c.st.ledger, today, today)[0];
  const pending = loadCustomerPayments().filter((p) => p.status === 'pending').length;
  return `
  <div class="flex flex-wrap gap-3">
    ${card('今日の残高', signedYen(bal.balance), bal.balance < 0 ? 'text-rose-600' : '')}${card('今日の入金', yen(t.in), 'text-emerald-700')}${card('今日の支払', yen(t.out), 'text-rose-700')}${card('振込待ち', `${pending} 件`, pending ? 'text-amber-700' : '')}
  </div>
  ${advanceRequests(c)}
  <div class="grid xl:grid-cols-2 gap-4">${ledgerForm(c)}${dailyTable(c)}</div>
  ${advanceTable(c)}
  ${customerPayments(c)}`;
}
