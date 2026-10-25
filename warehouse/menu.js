// 左側の開閉式メニュー（営業のタブレットと同じ。☰ で開き、項目を選ぶか、外側・✕で閉じる）
import { esc } from '../src/format.js';

export const TABS = [
  { key: 'stock', icon: '📦', label: '商品管理', sub: '在庫の確認・検索・QR読取' },
  { key: 'receive', icon: '📥', label: '入庫', sub: '届いた商品の入庫・シール貼り替え' },
  { key: 'transfer', icon: '🚚', label: '倉庫間移動', sub: '他の倉庫へ送る・受け取る' },
  { key: 'list', icon: '🛒', label: '販売（出品）', sub: '出品・委託・売却の登録' },
  { key: 'sales', icon: '💹', label: '売上管理', sub: '売上・利益（会社全体も）' },
  { key: 'return', icon: '↩', label: 'クーリングオフ返品', sub: '依頼の一覧・やり取り・回答・返送' },
  { key: 'master', icon: '🏭', label: '倉庫マスタ', sub: '倉庫・担当者・高額品の設定' },
];
export const tabLabel = (key) => TABS.find((t) => t.key === key)?.label ?? '';

// badges: { receive: 入庫待ちの点数, transfer: 受け取り待ちの件数, return: 返品の未対応の件数 }
export function menuView({ tab, badges, staff, warehouseName }) {
  const badge = { receive: ['bg-amber-500', '入庫待ち'], transfer: ['bg-sky-500', '受け取り待ち'], return: ['bg-rose-600', '未対応'] };
  return `
  <div class="fixed inset-0 z-[55]">
    <button class="absolute inset-0 bg-black/50 cursor-default" data-menu-close aria-label="メニューを閉じる"></button>
    <nav class="absolute inset-y-0 left-0 w-80 max-w-[85vw] bg-slate-900 text-white flex flex-col menu-slide" aria-label="メインメニュー">
      <div class="flex items-center justify-between px-5 py-4 border-b border-white/10">
        <span class="font-bold text-xl">メニュー</span>
        <button class="w-12 h-12 rounded-xl text-2xl hover:bg-white/10" data-menu-close aria-label="メニューを閉じる">✕</button>
      </div>
      <div class="flex-1 overflow-y-auto p-3 space-y-2">
        ${TABS.map((t) => `
        <button class="w-full text-left flex items-center gap-4 rounded-xl px-4 py-3 min-h-[64px] ${tab === t.key ? 'bg-sky-700' : 'hover:bg-white/10 active:bg-white/20'}" data-tab="${t.key}">
          <span class="text-3xl">${t.icon}</span>
          <span class="flex-1"><span class="block font-bold text-lg leading-tight">${t.label}</span><span class="text-xs text-slate-300">${t.sub}</span></span>
          ${badges[t.key] ? `<span class="text-xs font-bold rounded-full ${badge[t.key][0]} px-2 py-0.5 whitespace-nowrap">${badge[t.key][1]} ${badges[t.key]}</span>` : ''}
        </button>`).join('')}
      </div>
      <div class="px-5 py-3 border-t border-white/10 flex items-center justify-between gap-2"><span class="text-xs text-slate-400">${esc(staff.name)}（${esc(warehouseName)}）</span>
        <button class="rounded-lg border border-white/30 px-3 py-1.5 text-sm font-bold hover:bg-white/10" data-logout>ログアウト</button></div>
    </nav>
  </div>`;
}
