// マスタ管理画面の表示（画面に依存しない純関数）。マスタの切り替え（社員・営業所・倉庫・委託先）と、各パネルの組み立て。
import { employeesPanelHtml, EMPLOYEE_REASON_TEXT } from './employeesPanel.js';
import { departmentsPanelHtml } from './departmentsPanel.js';
import { officesPanelHtml } from './officesPanel.js';
import { tripsPanelHtml } from './tripsPanel.js';
import { storesPanelHtml } from './storesPanel.js';
import { helpIcon } from '../src/help.js';
import { warehousesPanelHtml, vendorsPanelHtml } from './warehousesPanel.js';

export const MASTERS = [
  { key: 'employees', icon: '👥', label: '社員', sub: '営業・オペレーター・査定員・倉庫担当・店舗スタッフなど' },
  { key: 'departments', icon: '🧩', label: '部署', sub: '会社「REqual」の部署' },
  { key: 'offices', icon: '🏢', label: '営業所', sub: '営業所と、担当の都道府県' },
  { key: 'trips', icon: '🧳', label: '出張', sub: '営業所のないエリアへの出張と、出張メンバー' },
  { key: 'stores', icon: '🏬', label: '店舗', sub: 'お客様が持ち込む実店舗' },
  { key: 'warehouses', icon: '🏭', label: '倉庫', sub: '倉庫・保管場所・高額品の判定' },
  { key: 'vendors', icon: '🤝', label: '委託先', sub: '業者オークションなど' },
];
export const masterLabel = (key) => MASTERS.find((m) => m.key === key)?.label ?? '';

// 左側の開閉式メニュー（倉庫・物流、営業のタブレットと同じ。☰ で開き、項目を選ぶか、外側・✕で閉じる）
export function menuHtml(tab) {
  return `<div class="fixed inset-0 z-[55]">
    <button class="absolute inset-0 bg-black/50 cursor-default" data-menu-close aria-label="メニューを閉じる"></button>
    <nav class="absolute inset-y-0 left-0 w-80 max-w-[85vw] bg-slate-900 text-white flex flex-col menu-slide" aria-label="メインメニュー">
      <div class="flex items-center justify-between px-5 py-4 border-b border-white/10">
        <span class="font-bold text-xl">メニュー</span>
        <button class="w-12 h-12 rounded-xl text-2xl hover:bg-white/10" data-menu-close aria-label="メニューを閉じる">✕</button>
      </div>
      <div class="flex-1 overflow-y-auto p-3 space-y-2">
        ${MASTERS.map((m) => `<button class="w-full text-left flex items-center gap-4 rounded-xl px-4 py-3 min-h-[64px] ${tab === m.key ? 'bg-teal-700' : 'hover:bg-white/10 active:bg-white/20'}" data-master="${m.key}">
          <span class="text-3xl">${m.icon}</span><span class="flex-1"><span class="block font-bold text-lg leading-tight">${m.label}</span><span class="text-xs text-slate-300">${m.sub}</span></span>
        </button>`).join('')}
      </div>
    </nav>
  </div>`;
}

// 保存・無効化などで返る理由の文言（社員・営業所・倉庫・委託先）
export const REASON_TEXT = {
  ...EMPLOYEE_REASON_TEXT,
  dupName: '同じ名前がすでにあります', hasEmployees: 'この部署には有効な社員がいるため、無効にできません（先に、社員を別の部署に移すか、無効にしてください）', badPref: '都道府県の名前が正しくありません（例: 福岡県）', lastActive: '有効なものが、なくなってしまうため、無効にできません（先に、別のものを登録してください）',
  dupHonsha: '本社（高額品の保管先）は、すでに登録されています（1か所だけです）', noRule: '本社に納入するシールの色を、1つ以上選んでください', badColor: 'シールの色が正しくありません', noLocations: '保管場所（棚）を1つ以上入力してください', badOffice: '営業所の指定が正しくありません', badZip: '郵便番号は、123-4567 の形式で入力してください',
  noPref: '担当の都道府県を、1つ以上入力してください', inOffice: '営業所のあるエリアの都道府県は、出張にできません（営業所のないエリアだけです）', badPeriod: '開始日と終了日を入力してください（終了日は、開始日と同じか、あとの日）', noMember: '出張メンバーを、1人以上選んでください', badMember: '出張メンバーの指定が正しくありません',
  noLicense: '古物商許可番号を入力してください（店舗ごとに必要です）',
  inUse: 'この倉庫には、保管中の商品（在庫・出品中・委託中・返品対応中）があるため、無効にできません', hasStaff: '有効な倉庫担当（店舗の場合は店舗スタッフ）がいるため、無効にできません（社員で、別の所属に移すか、無効にしてください）',
};

// ctx: { tab, menuOpen, employees, departments, offices, trips, salesUsers, today, wmaster, holding, ui: { employees, offices: { mo }, warehouses: { mw, hv }, vendors: { mv } }, themeHtml }
export function masterHtml(ctx) {
  const { tab, ui } = ctx;
  const warehouses = ctx.wmaster.warehouses;
  const panel = {
    employees: () => employeesPanelHtml({ employees: ctx.employees, departments: ctx.departments, warehouses, stores: ctx.stores ?? [], ui: ui.employees }),
    departments: () => departmentsPanelHtml({ departments: ctx.departments, employees: ctx.employees, ui: { md: ui.departments.md } }),
    offices: () => officesPanelHtml({ offices: ctx.offices, warehouses, ui: { mo: ui.offices.mo } }),
    trips: () => tripsPanelHtml({ trips: ctx.trips ?? [], users: ctx.salesUsers ?? [], today: ctx.today ?? '', ui: { mt: ui.trips.mt } }),
    stores: () => storesPanelHtml({ stores: ctx.stores ?? [], warehouses, staffCount: ctx.storeStaffCount ?? {}, ui: { ms: ui.stores.ms } }),
    warehouses: () => warehousesPanelHtml({ wmaster: ctx.wmaster, holding: ctx.holding, offices: ctx.offices, ui: ui.warehouses }),
    vendors: () => vendorsPanelHtml({ wmaster: ctx.wmaster, ui: { mv: ui.vendors.mv } }),
  }[tab]();
  return `<header class="bg-teal-800 text-white px-6 h-[52px] flex justify-between items-center">
    <div class="flex items-center gap-2"><button class="w-11 h-11 -ml-2 rounded-xl text-2xl leading-none hover:bg-white/10 active:bg-white/20" data-menu-open aria-label="メニューを開く">☰</button>
      <span class="font-bold text-xl">マスタ管理</span><span class="text-teal-200">›</span><span class="font-bold">${masterLabel(tab)}</span><span class="text-xs font-normal bg-white/20 rounded px-2 py-0.5 ml-2">ダミー画面（PC）</span></div>
    <div class="text-sm flex items-center gap-3"><a class="underline text-white/80 text-xs" href="/" target="_blank" rel="noopener">画面一覧</a><button class="text-xs underline text-white/70" data-reset>初期値に戻す</button>${ctx.themeHtml ?? ''}</div>
  </header>
  <main class="max-w-6xl mx-auto p-4 space-y-4 overflow-y-auto" style="height:calc(100vh - 52px)">
    <div class="text-sm font-bold text-slate-600">マスタについて${helpIcon('マスタは、各画面で使う基本のデータです。モックのため、データどうしの連動は最小限で、ダミーのデータはダミーのままです（連動する範囲は、各マスタの説明のとおり）。')}</div>
    ${panel}
  </main>${ctx.menuOpen ? menuHtml(tab) : ''}`;
}
