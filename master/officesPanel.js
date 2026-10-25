// マスタ管理「営業所」パネルの表示。営業所（担当の都道府県つき）の一覧と、登録・変更。
import { officeLabel } from '../src/offices.js';
import { esc } from '../src/format.js';

export const blankOffice = () => ({ id: '', name: '', prefs: '' });
export const formFromOffice = (o) => ({ id: o.id, name: o.name, prefs: o.prefs.join('、') });

const badge = (cls, label) => `<span class="rounded-full px-2 py-0.5 text-xs font-bold ${cls}">${esc(label)}</span>`;

function table(offices, warehouses) {
  return `<table class="w-full text-sm"><thead><tr class="text-left text-slate-500 border-b"><th>営業所</th><th>担当の都道府県</th><th>併設の倉庫</th><th>状態</th><th>操作</th></tr></thead><tbody>
    ${offices.map((o) => `<tr class="border-b ${o.active ? '' : 'text-slate-400'}"><td class="font-bold">${esc(officeLabel(o))}</td><td class="!whitespace-normal text-xs">${o.prefs.map(esc).join('・') || '-'}</td>
      <td class="!whitespace-normal text-xs">${warehouses.filter((w) => w.officeId === o.id && w.active).map((w) => esc(w.name)).join('、') || '<span class="text-slate-400">なし（営業のみ）</span>'}</td>
      <td>${o.active ? badge('bg-emerald-100 text-emerald-800', '有効') : badge('bg-slate-200 text-slate-600', '無効')}</td>
      <td><button class="b b-sec !min-h-0 !py-1 !px-2 text-xs" data-mo-edit="${esc(o.id)}">編集</button> <button class="b b-sec !min-h-0 !py-1 !px-2 text-xs" data-mo-toggle="${esc(o.id)}">${o.active ? '無効にする' : '有効にする'}</button></td></tr>`).join('')}
  </tbody></table>`;
}

function form(mo) {
  return `<div class="rounded-lg border bg-slate-50 p-3 space-y-3">
    <h3 class="font-bold">${mo.id ? '営業所の編集' : '営業所の新規登録'}</h3>
    <div class="grid sm:grid-cols-2 gap-3">
      <label class="text-sm font-bold">営業所の名前<span class="font-normal text-xs text-slate-500">「営業所」は付けない</span><input class="inp mt-1 font-normal" data-f="mo.name" value="${esc(mo.name)}" placeholder="例: 福岡" /></label>
      <label class="text-sm font-bold">担当の都道府県<span class="font-normal text-xs text-slate-500">カンマ・読点・空白・改行で区切る</span><textarea class="inp mt-1 font-normal" rows="2" data-f="mo.prefs" placeholder="福岡県、佐賀県">${esc(mo.prefs)}</textarea></label>
    </div>
    <div class="flex gap-2"><button class="b b-pri" data-mo-save>${mo.id ? '更新する' : '登録する'}</button>${mo.id ? '<button class="b b-sec" data-mo-cancel>やめる</button>' : ''}</div>
  </div>`;
}

// ctx: { offices: 営業所マスタ, warehouses: 倉庫の一覧, ui: { mo } }
export function officesPanelHtml({ offices, warehouses, ui }) {
  return `<section class="rounded-xl border bg-white p-4 space-y-3">
      <h2 class="font-bold text-lg">🏢 営業所（${offices.filter((o) => o.active).length}か所）</h2>
      <p class="text-xs text-slate-500">営業が所属する拠点です。営業所ごとに、担当の都道府県を持ちます。倉庫の「営業所との関係」の選択肢になります。モックのため、訪問先のエリア判定・配車・営業の所属には、まだつながっていません。</p>
      ${table(offices, warehouses)}${form(ui.mo)}
    </section>`;
}
