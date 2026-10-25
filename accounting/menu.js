// 左側の開閉式メニュー（営業のタブレット・倉庫・物流と同じ。☰ で開き、項目を選ぶか、外側・✕で閉じる）
export const TABS = [
  { key: 'cash', icon: '💴', label: '所持金の確認', sub: '営業ごとの所持金と、確認事項' },
  { key: 'deposit', icon: '🏦', label: '入金処理', sub: '営業・お客様への入金' },
  { key: 'expense', icon: '🧾', label: '経費の入力代行', sub: 'レシート紛失などの代行入力' },
  { key: 'overview', icon: '📊', label: '経費の全体状況', sub: '今日・今月の集計' },
];
export const tabLabel = (key) => TABS.find((t) => t.key === key)?.label ?? '';

// badges: { cash: 確認が必要な営業の人数, deposit: 振込待ちの件数 }
export function menuView({ tab, badges }) {
  const badge = { cash: ['bg-rose-600', '確認が必要'], deposit: ['bg-amber-500', '振込待ち'] };
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
          ${badges[t.key] ? `<span class="text-xs font-bold rounded-full ${badge[t.key][0]} px-2 py-0.5 whitespace-nowrap">${badge[t.key][1]} ${badges[t.key]}</span>` : ''}
        </button>`).join('')}
      </div>
    </nav>
  </div>`;
}
