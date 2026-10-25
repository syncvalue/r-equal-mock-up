// マスタ管理「倉庫」パネル（倉庫・高額品の判定）と「委託先」パネルの表示。倉庫・物流の画面にあった倉庫マスタを移したもの。
import { officeName } from '../src/offices.js';
import { officeLabel } from '../src/offices.js';
import { staffOf } from '../src/warehouseMaster.js';
import { yen, esc } from '../src/format.js';
import { SEAL_COLORS } from '../src/stock.js';
import { badge } from '../warehouse/ui.js';

const ON = badge('bg-emerald-100 text-emerald-800', '有効');
const OFF = badge('bg-slate-200 text-slate-600', '無効');

function warehouseTable({ master, holding, offices }) {
  return `<table class="w-full text-sm"><thead><tr class="text-left text-slate-500 border-b"><th>倉庫</th><th>郵便番号・住所・電話</th><th>営業所との関係</th><th>保管場所（棚）</th><th>担当者</th><th class="text-right">保管中</th><th>状態</th><th>操作</th></tr></thead><tbody>
    ${master.warehouses.map((w) => {
      const h = holding[w.id] ?? { count: 0, cost: 0 };
      const staff = staffOf(master, w.id).filter((s) => s.active);
      return `<tr class="border-b ${w.active ? '' : 'text-slate-400'}"><td class="font-bold">${esc(w.name)}${w.highValue ? ' <span class="text-xs font-normal text-violet-700">（高額品の保管先）</span>' : ''}</td><td class="!whitespace-normal text-xs">${w.zip ? `〒${esc(w.zip)}` : '<span class="text-rose-600">郵便番号なし</span>'} ${esc(w.address)}<div>${esc(w.phone || '電話番号なし')}</div></td>
        <td>${w.highValue ? '本社' : w.officeId ? `${esc(officeName(w.officeId, offices))}営業所と一体` : '倉庫のみ'}</td><td class="!whitespace-normal text-xs">${w.locations.map(esc).join('／')}</td>
        <td class="!whitespace-normal text-xs">${staff.map((s) => esc(s.name)).join('、') || '-'}</td><td class="text-right">${h.count}点<div class="text-xs text-slate-500">${yen(h.cost)}</div></td><td>${w.active ? ON : OFF}</td>
        <td><button class="b b-sec !min-h-0 !py-1 !px-2 text-xs" data-mw-edit="${esc(w.id)}">編集</button> <button class="b b-sec !min-h-0 !py-1 !px-2 text-xs" data-mw-toggle="${esc(w.id)}">${w.active ? '無効にする' : '有効にする'}</button></td></tr>`;
    }).join('')}
  </tbody></table>`;
}

function warehouseForm(mw, offices) {
  return `<div class="rounded-lg border bg-slate-50 p-3 space-y-3">
    <h3 class="font-bold">${mw.id ? '倉庫の編集' : '倉庫の新規登録'}</h3>
    <div class="grid sm:grid-cols-2 gap-3">
      <label class="text-sm font-bold">倉庫名<input class="inp mt-1 font-normal" data-f="mw.name" value="${esc(mw.name)}" placeholder="例: 札幌倉庫" /></label>
      <label class="text-sm font-bold">郵便番号<input class="inp mt-1 font-normal font-mono" data-f="mw.zip" value="${esc(mw.zip)}" placeholder="例: 060-0001" /></label>
      <label class="text-sm font-bold">住所（発送伝票・CSVに使います）<input class="inp mt-1 font-normal" data-f="mw.address" value="${esc(mw.address)}" placeholder="例: 北海道札幌市中央区1-1-1" /></label>
      <label class="text-sm font-bold">電話番号<input class="inp mt-1 font-normal" data-f="mw.phone" value="${esc(mw.phone)}" placeholder="例: 011-000-0000" /></label>
      <label class="text-sm font-bold">営業所との関係<select class="inp mt-1 font-normal" data-f="mw.officeId"><option value="">倉庫のみ（営業所と別の施設）</option>
        ${offices.filter((o) => o.active || o.id === mw.officeId).map((o) => `<option value="${esc(o.id)}" ${mw.officeId === o.id ? 'selected' : ''}>${esc(officeLabel(o))}と一体</option>`).join('')}</select></label>
      <label class="text-sm font-bold">保管場所（棚）<span class="font-normal text-xs text-slate-500">カンマ・改行で区切る</span><textarea class="inp mt-1 font-normal" rows="2" data-f="mw.locations" placeholder="A棚, B棚, 金庫室（高額品）">${esc(mw.locations)}</textarea></label>
    </div>
    <label class="flex items-center gap-2 text-sm font-bold"><input type="checkbox" class="w-5 h-5" data-f="mw.highValue" ${mw.highValue ? 'checked' : ''} />本社（貴金属などの高額品の保管先にする）<span class="font-normal text-xs text-slate-500">1か所だけ</span></label>
    <div class="flex gap-2"><button class="b b-pri" data-mw-save>${mw.id ? '更新する' : '登録する'}</button>${mw.id ? '<button class="b b-sec" data-mw-cancel>やめる</button>' : ''}</div>
  </div>`;
}

function highValueForm(data, hv) {
  const cur = hv ?? data.master.highValue.colors;
  return `<div class="rounded-lg border bg-slate-50 p-3 space-y-3">
    <h3 class="font-bold">高額品の判定（シールの色）</h3>
    <p class="text-xs text-slate-500">商品に貼るシールの色で、本社の管理対象（高額品）かどうかを決めます。チェックを付けた色の商品は、納入のときから本社に入り、それ以外は倉庫に入ります。紫が最も高額で、次が赤です。黄・緑・青は、システム上は区別しません。</p>
    <div class="flex flex-wrap gap-4">${SEAL_COLORS.map((c) => `<label class="flex items-center gap-2 text-sm font-bold"><input type="checkbox" class="w-5 h-5" data-hv-color="${c.key}" ${cur.includes(c.key) ? 'checked' : ''} />${c.dot} ${c.label}<span class="font-normal text-xs text-slate-500">（${c.note}）</span></label>`).join('')}</div>
    <button class="b b-pri" data-hv-save>判定の設定を保存</button>
  </div>`;
}
function vendorTable({ master }) {
  return `<table class="w-full text-sm"><thead><tr class="text-left text-slate-500 border-b"><th>委託先（業者）</th><th>郵便番号・住所・電話</th><th>状態</th><th>操作</th></tr></thead><tbody>
    ${(master.vendors ?? []).map((v) => `<tr class="border-b ${v.active ? '' : 'text-slate-400'}"><td class="font-bold">${esc(v.name)}</td>
      <td class="!whitespace-normal text-xs">${v.zip ? `〒${esc(v.zip)}` : '<span class="text-rose-600">郵便番号なし</span>'} ${esc(v.address)}<div>${esc(v.phone || '電話番号なし')}</div></td><td>${v.active ? ON : OFF}</td>
      <td><button class="b b-sec !min-h-0 !py-1 !px-2 text-xs" data-mv-edit="${esc(v.id)}">編集</button> <button class="b b-sec !min-h-0 !py-1 !px-2 text-xs" data-mv-toggle="${esc(v.id)}">${v.active ? '無効にする' : '有効にする'}</button></td></tr>`).join('') || '<tr><td colspan="4" class="text-slate-400">登録がありません。</td></tr>'}
  </tbody></table>`;
}

function vendorForm(mv) {
  return `<div class="rounded-lg border bg-slate-50 p-3 space-y-3">
    <h3 class="font-bold">${mv.id ? '委託先の編集' : '委託先の新規登録'}</h3>
    <div class="grid sm:grid-cols-2 gap-3">
      <label class="text-sm font-bold">委託先名（業者・市場）<input class="inp mt-1 font-normal" data-f="mv.name" value="${esc(mv.name)}" placeholder="例: 名古屋時計市場" /></label>
      <label class="text-sm font-bold">郵便番号<input class="inp mt-1 font-normal font-mono" data-f="mv.zip" value="${esc(mv.zip)}" placeholder="例: 460-0008" /></label>
      <label class="text-sm font-bold">住所（発送伝票・CSVに使います）<input class="inp mt-1 font-normal" data-f="mv.address" value="${esc(mv.address)}" placeholder="例: 愛知県名古屋市中区栄1-1-1" /></label>
      <label class="text-sm font-bold">電話番号<input class="inp mt-1 font-normal" data-f="mv.phone" value="${esc(mv.phone)}" placeholder="例: 052-000-0000" /></label>
    </div>
    <div class="flex gap-2"><button class="b b-pri" data-mv-save>${mv.id ? '更新する' : '登録する'}</button>${mv.id ? '<button class="b b-sec" data-mv-cancel>やめる</button>' : ''}</div>
  </div>`;
}

// ctx: { wmaster: 倉庫マスタ, holding: 倉庫ごとの保管中, offices: 営業所マスタ, ui: { mw, hv, mv } }
export function warehousesPanelHtml({ wmaster, holding, offices, ui }) {
  const linked = new Set(wmaster.warehouses.filter((w) => w.active).map((w) => w.officeId));
  const only = offices.filter((o) => o.active && !linked.has(o.id)).map((o) => officeLabel(o));
  const data = { master: wmaster, holding, offices };
  return `<section class="rounded-xl border bg-white p-4 space-y-3">
      <h2 class="font-bold text-lg">🏭 倉庫（${wmaster.warehouses.filter((w) => w.active).length}か所）</h2>
      <p class="text-xs text-slate-500">倉庫は、営業所とは独立した施設です。営業所と一体の倉庫、倉庫のみの施設があり、倉庫のない営業所（営業のみ）もあります。${only.length ? `いま倉庫のない営業所: ${esc(only.join('・'))}。` : ''}倉庫担当の所属は、ユーザーで変更します。</p>
      ${warehouseTable(data)}${warehouseForm(ui.mw, offices)}${highValueForm(data, ui.hv)}
    </section>`;
}

export function vendorsPanelHtml({ wmaster, ui }) {
  return `<section class="rounded-xl border bg-white p-4 space-y-3">
      <h2 class="font-bold text-lg">🤝 委託先（業者）（${(wmaster.vendors ?? []).filter((v) => v.active).length}社）</h2>
      <p class="text-xs text-slate-500">業者オークションなど、商品を委託して販売してもらう業者です。販売（出品）の「業者に委託する」で、委託先に選びます。</p>
      ${vendorTable({ master: wmaster })}${vendorForm(ui.mv)}
    </section>`;
}
