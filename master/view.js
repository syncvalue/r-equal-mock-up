// マスタ管理画面の表示（画面に依存しない純関数）。マスタの切り替え（ユーザー・営業所・倉庫・委託先）と、各パネルの組み立て。
import { usersPanelHtml, USER_REASON_TEXT } from './usersPanel.js';
import { officesPanelHtml } from './officesPanel.js';
import { warehousesPanelHtml, vendorsPanelHtml } from './warehousesPanel.js';

export const MASTERS = [
  { key: 'users', label: '👥 ユーザー' },
  { key: 'offices', label: '🏢 営業所' },
  { key: 'warehouses', label: '🏭 倉庫' },
  { key: 'vendors', label: '🤝 委託先' },
];

// 保存・無効化などで返る理由の文言（ユーザー・営業所・倉庫・委託先）
export const REASON_TEXT = {
  ...USER_REASON_TEXT,
  dupName: '同じ名前がすでにあります', badPref: '都道府県の名前が正しくありません（例: 福岡県）', lastActive: '有効なものが、なくなってしまうため、無効にできません（先に、別のものを登録してください）',
  dupHonsha: '本社（高額品の保管先）は、すでに登録されています（1か所だけです）', noRule: '本社に納入するシールの色を、1つ以上選んでください', badColor: 'シールの色が正しくありません', noLocations: '保管場所（棚）を1つ以上入力してください', badOffice: '営業所の指定が正しくありません', badZip: '郵便番号は、123-4567 の形式で入力してください',
  inUse: 'この倉庫には、保管中の商品（在庫・出品中・委託中・返品対応中）があるため、無効にできません', hasStaff: 'この倉庫には有効な倉庫担当がいるため、無効にできません（ユーザーで、倉庫担当を別の倉庫に移すか、無効にしてください）',
};

// ctx: { tab, users, offices, wmaster, holding, ui: { users, offices: { mo }, warehouses: { mw, hv }, vendors: { mv } }, themeHtml }
export function masterHtml(ctx) {
  const { tab, ui } = ctx;
  const warehouses = ctx.wmaster.warehouses;
  const panel = {
    users: () => usersPanelHtml({ users: ctx.users, warehouses, ui: ui.users }),
    offices: () => officesPanelHtml({ offices: ctx.offices, warehouses, ui: { mo: ui.offices.mo } }),
    warehouses: () => warehousesPanelHtml({ wmaster: ctx.wmaster, holding: ctx.holding, offices: ctx.offices, ui: ui.warehouses }),
    vendors: () => vendorsPanelHtml({ wmaster: ctx.wmaster, ui: { mv: ui.vendors.mv } }),
  }[tab]();
  return `<header class="bg-teal-800 text-white px-6 h-[52px] flex justify-between items-center">
    <div class="font-bold text-xl">🗃 マスタ管理 <span class="text-xs font-normal bg-white/20 rounded px-2 py-0.5 ml-2">ダミー画面（PC）</span></div>
    <div class="text-sm flex items-center gap-3"><a class="underline text-white/80 text-xs" href="/" target="_blank" rel="noopener">画面一覧</a><button class="text-xs underline text-white/70" data-reset>初期値に戻す</button>${ctx.themeHtml ?? ''}</div>
  </header>
  <main class="max-w-6xl mx-auto p-4 space-y-4 overflow-y-auto" style="height:calc(100vh - 52px)">
    <nav class="flex flex-wrap gap-2">${MASTERS.map((m) => `<button class="b ${tab === m.key ? 'on' : 'b-sec'}" data-master="${m.key}">${m.label}</button>`).join('')}</nav>
    <p class="text-xs text-slate-500">マスタは、各画面で使う基本のデータです。モックのため、データどうしの連動は最小限で、ダミーのデータはダミーのままです（連動する範囲は、各マスタの説明のとおり）。</p>
    ${panel}
  </main>`;
}
