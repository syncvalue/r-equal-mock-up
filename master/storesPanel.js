// マスタ管理「店舗」パネルの表示。店舗（お客様が買取希望品を持ち込む実店舗）の一覧と、登録・変更。
import { storeLabel } from '../src/stores.js';
import { esc } from '../src/format.js';
import { helpIcon } from '../src/help.js';

export const blankStore = () => ({ id: '', name: '', zip: '', address: '', phone: '', hours: '10:00〜19:00', licenseNo: '', warehouseId: '' });
export const formFromStore = (s) => ({ id: s.id, name: s.name, zip: s.zip ?? '', address: s.address ?? '', phone: s.phone ?? '', hours: s.hours ?? '', licenseNo: s.licenseNo ?? '', warehouseId: s.warehouseId ?? '' });

const badge = (cls, label) => `<span class="rounded-full px-2 py-0.5 text-xs font-bold ${cls}">${esc(label)}</span>`;

function table(stores, warehouses, staffCount) {
  return `<table class="w-full text-sm"><thead><tr class="text-left text-slate-500 border-b"><th>店舗</th><th>住所・電話</th><th>営業時間</th><th>古物商許可番号</th><th>納入先の倉庫</th><th>店舗スタッフ</th><th>状態</th><th>操作</th></tr></thead><tbody>
    ${stores.map((s) => `<tr class="border-b ${s.active ? '' : 'text-slate-400'}"><td class="font-bold">${esc(storeLabel(s))}</td>
      <td class="!whitespace-normal text-xs">${esc(s.zip ?? '')} ${esc(s.address ?? '')}<br>${esc(s.phone ?? '')}</td><td class="text-xs">${esc(s.hours ?? '')}</td><td class="text-xs font-mono">${esc(s.licenseNo ?? '')}</td>
      <td class="text-xs">${esc(warehouses.find((w) => w.id === s.warehouseId)?.name ?? '（不明）')}</td><td class="text-right">${staffCount[s.id] ?? 0}名</td>
      <td>${s.active ? badge('bg-emerald-100 text-emerald-800', '有効') : badge('bg-slate-200 text-slate-600', '無効')}</td>
      <td><button class="b b-sec !min-h-0 !py-1 !px-2 text-xs" data-ms-edit="${esc(s.id)}">編集</button> <button class="b b-sec !min-h-0 !py-1 !px-2 text-xs" data-ms-toggle="${esc(s.id)}">${s.active ? '無効にする' : '有効にする'}</button></td></tr>`).join('')}
  </tbody></table>`;
}

function form(ms, warehouses) {
  const options = warehouses.filter((w) => !w.highValue && (w.active || w.id === ms.warehouseId));
  return `<div class="rounded-lg border bg-slate-50 p-3 space-y-3">
    <h3 class="font-bold">${ms.id ? '店舗の編集' : '店舗の新規登録'}</h3>
    <div class="grid sm:grid-cols-3 gap-3">
      <label class="text-sm font-bold">店舗の名前<span class="font-normal text-xs text-slate-500">「店」は付けない</span><input class="inp mt-1 font-normal" data-f="ms.name" value="${esc(ms.name)}" placeholder="例: 梅田" /></label>
      <label class="text-sm font-bold">郵便番号<input class="inp mt-1 font-normal" data-f="ms.zip" value="${esc(ms.zip)}" placeholder="530-0001" /></label>
      <label class="text-sm font-bold">電話番号<input class="inp mt-1 font-normal" data-f="ms.phone" value="${esc(ms.phone)}" placeholder="06-0000-0000" /></label>
      <label class="text-sm font-bold sm:col-span-2">住所<input class="inp mt-1 font-normal" data-f="ms.address" value="${esc(ms.address)}" /></label>
      <label class="text-sm font-bold">営業時間<input class="inp mt-1 font-normal" data-f="ms.hours" value="${esc(ms.hours)}" placeholder="10:00〜19:00" /></label>
      <label class="text-sm font-bold">古物商許可番号${helpIcon('古物営業法では、古物商の許可が、営業所（店舗）ごとに必要です。買取の契約書・古物台帳に、店舗の許可番号を載せます。')}<input class="inp mt-1 font-normal font-mono" data-f="ms.licenseNo" value="${esc(ms.licenseNo)}" placeholder="第000000000号" /></label>
      <label class="text-sm font-bold">納入先の倉庫${helpIcon('店舗で買い取った商品を、入庫する倉庫です。高額品（紫・赤のシール）は、これまでどおり本社に入ります。')}<select class="inp mt-1 font-normal" data-f="ms.warehouseId"><option value="">選んでください</option>${options.map((w) => `<option value="${esc(w.id)}" ${w.id === ms.warehouseId ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}</select></label>
    </div>
    <div class="flex gap-2"><button class="b b-pri" data-ms-save>${ms.id ? '更新する' : '登録する'}</button>${ms.id ? '<button class="b b-sec" data-ms-cancel>やめる</button>' : ''}</div>
  </div>`;
}

// ctx: { stores, warehouses: 倉庫の一覧, staffCount: 店舗ID → 有効な店舗スタッフの人数, ui: { ms } }
export function storesPanelHtml({ stores, warehouses, staffCount = {}, ui }) {
  return `<section class="rounded-xl border bg-white p-4 space-y-3">
      <h2 class="font-bold text-lg">🏬 店舗（${stores.filter((s) => s.active).length}店）${helpIcon('お客様が、買取希望品を持ち込む実店舗です（訪問はしません）。店舗スタッフは、いずれかの店舗に所属し、店舗の画面で来店の受付と買取を行います。\n店舗の買取は、クーリング・オフの対象外なので、買い取った商品に保管期間（10日間）はありません。')}</h2>
      ${table(stores, warehouses, staffCount)}${form(ui.ms, warehouses)}
    </section>`;
}
