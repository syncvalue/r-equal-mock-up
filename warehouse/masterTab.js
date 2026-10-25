// 🏭 倉庫マスタ: 倉庫（営業所とは独立した施設）と、各倉庫に所属する倉庫担当の管理。
import { AREAS } from '../src/dispatch.js';
import { officeName, staffOf } from '../src/warehouseMaster.js';
import { yen, esc } from '../src/format.js';
import { SEAL_COLORS } from '../src/stock.js';
import { badge } from './ui.js';

const ON = badge('bg-emerald-100 text-emerald-800', '有効');
const OFF = badge('bg-slate-200 text-slate-600', '無効');

function warehouseTable({ master, holding }, me) {
  return `<table class="w-full text-sm"><thead><tr class="text-left text-slate-500 border-b"><th>倉庫</th><th>郵便番号・住所・電話</th><th>営業所との関係</th><th>保管場所（棚）</th><th>倉庫担当</th><th class="text-right">保管中</th><th>状態</th><th>操作</th></tr></thead><tbody>
    ${master.warehouses.map((w) => {
      const h = holding[w.id] ?? { count: 0, cost: 0 };
      const staff = staffOf(master, w.id).filter((s) => s.active);
      return `<tr class="border-b ${w.active ? '' : 'text-slate-400'}"><td class="font-bold">${esc(w.name)}${w.highValue ? ' <span class="text-xs font-normal text-violet-700">（高額品の保管先）</span>' : ''}${me.warehouseId === w.id ? ' <span class="text-xs font-normal text-sky-700">（あなたの倉庫）</span>' : ''}</td><td class="!whitespace-normal text-xs">${w.zip ? `〒${esc(w.zip)}` : '<span class="text-rose-600">郵便番号なし</span>'} ${esc(w.address)}<div>${esc(w.phone || '電話番号なし')}</div></td>
        <td>${w.highValue ? '本社' : w.officeId ? `${esc(officeName(w.officeId))}営業所と一体` : '倉庫のみ'}</td><td class="!whitespace-normal text-xs">${w.locations.map(esc).join('／')}</td>
        <td class="!whitespace-normal text-xs">${staff.map((s) => esc(s.name)).join('、') || '-'}</td><td class="text-right">${h.count}点<div class="text-xs text-slate-500">${yen(h.cost)}</div></td><td>${w.active ? ON : OFF}</td>
        <td><button class="b b-sec !min-h-0 !py-1 !px-2 text-xs" data-mw-edit="${esc(w.id)}">編集</button> <button class="b b-sec !min-h-0 !py-1 !px-2 text-xs" data-mw-toggle="${esc(w.id)}">${w.active ? '無効にする' : '有効にする'}</button></td></tr>`;
    }).join('')}
  </tbody></table>`;
}

function warehouseForm(mw) {
  return `<div class="rounded-lg border bg-slate-50 p-3 space-y-3">
    <h3 class="font-bold">${mw.id ? '倉庫の編集' : '倉庫の新規登録'}</h3>
    <div class="grid sm:grid-cols-2 gap-3">
      <label class="text-sm font-bold">倉庫名<input class="inp mt-1 font-normal" data-f="mw.name" value="${esc(mw.name)}" placeholder="例: 札幌倉庫" /></label>
      <label class="text-sm font-bold">郵便番号<input class="inp mt-1 font-normal font-mono" data-f="mw.zip" value="${esc(mw.zip)}" placeholder="例: 060-0001" /></label>
      <label class="text-sm font-bold">住所（発送伝票・CSVに使います）<input class="inp mt-1 font-normal" data-f="mw.address" value="${esc(mw.address)}" placeholder="例: 北海道札幌市中央区1-1-1" /></label>
      <label class="text-sm font-bold">電話番号<input class="inp mt-1 font-normal" data-f="mw.phone" value="${esc(mw.phone)}" placeholder="例: 011-000-0000" /></label>
      <label class="text-sm font-bold">営業所との関係<select class="inp mt-1 font-normal" data-f="mw.officeId"><option value="">倉庫のみ（営業所と別の施設）</option>
        ${AREAS.map((a) => `<option value="${a.id}" ${mw.officeId === a.id ? 'selected' : ''}>${esc(officeName(a.id))}営業所と一体</option>`).join('')}</select></label>
      <label class="text-sm font-bold">保管場所（棚）<span class="font-normal text-xs text-slate-500">カンマ・改行で区切る</span><textarea class="inp mt-1 font-normal" rows="2" data-f="mw.locations" placeholder="A棚, B棚, 金庫室（高額品）">${esc(mw.locations)}</textarea></label>
    </div>
    <label class="flex items-center gap-2 text-sm font-bold"><input type="checkbox" class="w-5 h-5" data-f="mw.highValue" ${mw.highValue ? 'checked' : ''} />本社（貴金属などの高額品の保管先にする）<span class="font-normal text-xs text-slate-500">1か所だけ</span></label>
    <div class="flex gap-2"><button class="b b-pri" data-mw-save>${mw.id ? '更新する' : '登録する'}</button>${mw.id ? '<button class="b b-sec" data-mw-cancel>やめる</button>' : ''}</div>
  </div>`;
}

// 倉庫担当の登録・所属変更・有効/無効は、ユーザー管理で行う。ここでは、所属を確認するだけ
function staffTable({ master }, me) {
  const active = master.staff.filter((s) => s.active);
  return `<table class="w-full text-sm"><thead><tr class="text-left text-slate-500 border-b"><th>氏名</th><th>ログインID</th><th>所属倉庫</th></tr></thead><tbody>
    ${active.map((s) => `<tr class="border-b"><td class="font-bold">${esc(s.name)}${me.id === s.id ? ' <span class="text-xs font-normal text-sky-700">（あなた）</span>' : ''}</td><td class="font-mono text-xs">${esc(s.loginId)}</td>
      <td>${esc(master.warehouses.find((w) => w.id === s.warehouseId)?.name ?? '-')}</td></tr>`).join('')}
  </tbody></table>`;
}

export function masterTab(data, { mw, hv, mv }, me) {
  const linked = new Set(data.master.warehouses.filter((w) => w.active).map((w) => w.officeId));
  const only = AREAS.filter((a) => !linked.has(a.id)).map((a) => officeName(a.id));
  return `<div class="space-y-4">
    <section class="rounded-xl border bg-white p-4 space-y-3">
      <h2 class="font-bold text-lg">🏭 倉庫（${data.master.warehouses.filter((w) => w.active).length}か所）</h2>
      <p class="text-xs text-slate-500">倉庫は、営業所とは独立した施設です。営業所と一体の倉庫、倉庫のみの施設があり、倉庫のない営業所（営業のみ）もあります。${only.length ? `いま倉庫のない営業所: ${esc(only.join('・'))}。` : ''}</p>
      ${warehouseTable(data, me)}${warehouseForm(mw)}${highValueForm(data, hv)}
    </section>
    <section class="rounded-xl border bg-white p-4 space-y-3">
      <h2 class="font-bold text-lg">🤝 委託先（業者）（${(data.master.vendors ?? []).filter((v) => v.active).length}社）</h2>
      <p class="text-xs text-slate-500">業者オークションなど、商品を委託して販売してもらう業者です。販売（出品）の「業者に委託する」で、委託先に選びます。</p>
      ${vendorTable(data)}${vendorForm(mv)}
    </section>
    <section class="rounded-xl border bg-white p-4 space-y-3">
      <h2 class="font-bold text-lg">👥 倉庫担当（${data.master.staff.filter((s) => s.active).length}名）</h2>
      <p class="text-xs text-slate-500">倉庫担当は、各倉庫に所属します。ログインすると、所属する倉庫が操作の対象になります（表示は、画面上部で他の倉庫に切り替えられます）。登録・所属の変更・有効/無効は、<a class="underline text-sky-700 font-bold" href="/users/index.html" target="_blank" rel="noopener">ユーザー管理</a>で行います。</p>
      ${staffTable(data, me)}
    </section>
  </div>`;
}
