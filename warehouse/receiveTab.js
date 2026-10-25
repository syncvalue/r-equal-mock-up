// 📥 入庫: 倉庫担当が、営業から渡された買取商品を入庫する。QRシール（シールNo.）を読み取るか、契約書（明細）と実物を見比べて☑を付けた商品を入庫する。
// ☑（照合）は、誰がいつ付けたかが、入庫した商品に記録される。
// 営業のタブレットでも入庫できる。倉庫では、誰が買い取った商品でも入庫できる。
import { handlerLabel } from '../src/unitHandler.js';
import { destinationProblem } from '../src/warehouseMaster.js';
import { yen, esc } from '../src/format.js';
import { helpIcon } from '../src/help.js';
import { badge, md, mdTime, sealBadge, photoSlot } from './ui.js';
import { relabelForm } from './relabelForm.js';

const TAG = { pending: badge('bg-amber-100 text-amber-800', '入庫待ち'), missing: badge('bg-rose-100 text-rose-700', '所在不明'), stored: badge('bg-emerald-100 text-emerald-800', '入庫済み') };

function scanPanel(rc, todo, warehouse) {
  return `
  <section class="rounded-xl border bg-white p-4 space-y-3">
    <h2 class="font-bold text-lg">📥 入庫する <span class="text-sm font-normal text-sky-700">入庫先: ${esc(warehouse.name)}</span>${helpIcon('営業から、買い取った商品が契約書（明細）とともに届いたら、ここで入庫します。入庫した商品は、あなたの所属する倉庫（上記）に保管されます。\nシールの色が紫・赤の高額品は、納入のときから本社に入るため、本社の倉庫担当だけが入庫できます（本社以外では、高額品以外を入庫します）。\n営業が自分でタブレットから、納入先の倉庫を選んで入庫することもできます。')}</h2>
    <div><div class="text-sm font-bold mb-1">保管場所${helpIcon('入庫する商品は、ここに保管します。')}</div>
      <div class="flex flex-wrap gap-1.5">${warehouse.locations.map((l) => `<button class="b b-sec !min-h-[40px] !py-1 !px-3 text-sm ${rc.location === l ? 'on' : ''}" data-rc-loc="${esc(l)}">${esc(l)}</button>`).join('')}</div></div>
    <label class="text-sm font-bold block">シールNo.${helpIcon('スキャナ・手入力。Enterで入庫。読み取りで、照合したものとして記録します。')}
      <div class="flex gap-2 mt-1"><input class="inp font-mono font-normal" data-rc-code placeholder="RQ-XXXXXXXX" autocomplete="off" /><button class="b b-pri" data-rc-submit>入庫</button></div></label>
    <button class="b b-pri w-full !bg-teal-700" data-cam-receive>📷 カメラで読み取って入庫</button>
    ${rc.last ? `<div class="rounded-xl border-2 p-3 text-sm font-bold ${rc.last.ok ? 'bg-emerald-50 border-emerald-400 text-emerald-800' : 'bg-rose-50 border-rose-400 text-rose-700'}">${rc.last.ok ? '✓' : '⚠'} ${esc(rc.last.text)}</div>` : ''}
    <div class="text-sm rounded bg-slate-50 p-2">入庫待ち <b class="text-lg">${todo.filter((u) => u.status === 'pending').length}</b> 点　所在不明 <b class="text-lg ${todo.some((u) => u.status === 'missing') ? 'text-rose-600' : ''}">${todo.filter((u) => u.status === 'missing').length}</b> 点</div>
  </section>`;
}

const checkInfo = (u) => (u.check
  ? `☑ ${esc(u.check.by)} ${mdTime(u.check.at)}（${u.check.method === 'scan' ? 'シール読取' : '明細と照合'}）`
  : '営業が入庫（倉庫での照合なし）');

// 納入先の規則: 高額品は本社で、高額品以外は倉庫で入庫する（自分の倉庫で入庫できない商品は、☑できない）
const PROBLEM_TEXT = { highToHonsha: '高額品 → 本社で入庫', normalToWarehouse: '高額品以外 → 倉庫で入庫' };

function contractCard(units, rc, rl, warehouse, master) {
  const first = units[0];
  const todo = units.filter((u) => u.status !== 'stored');
  const actionable = todo.filter((u) => !destinationProblem(master, u, warehouse.id));
  const checked = actionable.filter((u) => rc.checks.includes(u.code));
  return `<div class="rounded-lg border p-3 space-y-2">
    <div class="flex flex-wrap items-center gap-2">
      <b class="text-base">${esc(first.customerName)} 様</b><span class="text-xs text-slate-500">${md(first.date)} 買取／${esc(handlerLabel(first))}／${units.length}点 ${yen(units.reduce((n, u) => n + u.price, 0))}</span>
      <span class="ml-auto text-sm">${units.length - todo.length} / ${units.length} 点 入庫</span>
    </div>
    <table class="w-full text-sm"><thead><tr class="text-left text-slate-500"><th>☑ 明細と一致</th><th>シールNo.</th><th>商品</th><th>ランク</th><th class="text-right">買取額</th><th>状態</th><th>照合・保管場所</th></tr></thead><tbody>${units.map((u) => `<tr class="border-t ${u.status === 'stored' ? 'text-slate-400' : ''}">
      <td>${u.status === 'stored' ? '' : destinationProblem(master, u, warehouse.id) ? `<span class="text-xs text-amber-700 font-bold whitespace-normal">${PROBLEM_TEXT[destinationProblem(master, u, warehouse.id)]}</span>` : `<input type="checkbox" class="w-5 h-5" data-rc-check="${esc(u.code)}" ${rc.checks.includes(u.code) ? 'checked' : ''} aria-label="${esc(u.name)}を明細と照合した" />`}</td>
      <td class="font-mono text-xs">${esc(u.code)}</td><td class="font-bold"><div class="flex items-center gap-2">${photoSlot(u)}<div>${esc(u.name)}<div class="text-xs font-normal">${esc(u.category)} ${sealBadge(u)}</div></div></div></td><td>${esc(u.rank)}</td><td class="text-right">${yen(u.price)}</td>
      <td>${TAG[u.status]}</td><td class="text-xs !whitespace-normal">${u.status === 'stored' ? `📍 ${esc(u.location)}<div>${checkInfo(u)}</div>` : `<button class="b b-sec !min-h-0 !py-1 !px-2 text-xs" data-rl-open="${esc(u.code)}">シール貼り替え</button>`}</td></tr>${rl.code === u.code ? `<tr><td colspan="7">${relabelForm(rl, u)}</td></tr>` : ''}`).join('')}</tbody></table>
    ${actionable.length ? `<div class="flex flex-wrap items-center gap-2">
      <button class="b b-sec !min-h-0 !py-1.5 !px-3 text-sm" data-rc-all="${esc(first.visitId)}">${checked.length === actionable.length ? '☑をすべて外す' : '残りをすべて☑'}</button>
      <button class="b b-pri !min-h-0 !py-1.5 !px-3 text-sm" data-rc-visit="${esc(first.visitId)}" ${checked.length ? '' : 'disabled'}>☑した${checked.length}点を入庫（${esc(rc.location.replace(/（.*/, ''))}）</button>
      ${helpIcon('明細にあるのに届いていない商品は、☑せずに残します（営業に確認してください）。')}</div>` : ''}
  </div>`;
}

export function receiveTab({ units }, { rc, rl }, warehouse, master) {
  const todo = units.filter((u) => u.status !== 'stored');
  const visits = [...new Set(todo.map((u) => u.visitId))];
  const contracts = visits.map((v) => units.filter((u) => u.visitId === v)).sort((a, b) => b[0].at - a[0].at);
  return `<div class="grid xl:grid-cols-[26rem_1fr] gap-4 items-start">${scanPanel(rc, todo, warehouse)}
    <section class="rounded-xl border bg-white p-4 space-y-3">
      <h2 class="font-bold text-lg">入庫待ちの契約（${contracts.length}件）${helpIcon('契約書（明細）と、届いた商品を見比べて、一致した商品に☑を付けてから入庫します。\n☑は、誰がいつ付けたかが、商品の記録に残ります。')}</h2>
      ${contracts.length ? contracts.map((c) => contractCard(c, rc, rl, warehouse, master)).join('') : '<p class="text-sm text-slate-500 py-8 text-center">入庫待ちの商品はありません。</p>'}
    </section></div>`;
}
