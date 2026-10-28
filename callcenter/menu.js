// 左側の開閉式メニュー（経理部・倉庫・物流・営業のタブレットと同じ。☰ で開き、項目を選ぶか、外側・✕で閉じる）
export const TABS = [
  { key: 'new', icon: '📞', label: '新規受付', sub: '電話の聞き取りと、仮確定（オペレーター）' },
  { key: 'dispatch', icon: '🗓', label: '配車確定（配車係）', sub: '仮確定の訪問の確定と、営業の調整' },
  { key: 'cooloff', icon: '↩️', label: 'クーリングオフ', sub: '受電と依頼の作成、倉庫の対応の進み具合' },
  { key: 'store', icon: '🏬', label: '来店予約（店舗）', sub: '店舗への来店の予約' },
];
export const tabLabel = (key) => TABS.find((t) => t.key === key)?.label ?? '';

// badges: { 項目のkey: [{ cls: 色, text: 表示 }] }
export function menuView({ tab, badges = {} }) {
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
        <button class="w-full text-left flex items-center gap-4 rounded-xl px-4 py-3 min-h-[64px] ${tab === t.key ? 'bg-teal-700' : 'hover:bg-white/10 active:bg-white/20'}" data-tab="${t.key}">
          <span class="text-3xl">${t.icon}</span>
          <span class="flex-1"><span class="block font-bold text-lg leading-tight">${t.label}</span><span class="text-xs text-slate-300">${t.sub}</span></span>
          <span class="flex flex-col items-end gap-1">${(badges[t.key] ?? []).map((b) => `<span class="text-xs font-bold rounded-full ${b.cls} px-2 py-0.5 whitespace-nowrap">${b.text}</span>`).join('')}</span>
        </button>`).join('')}
      </div>
    </nav>
  </div>`;
}
