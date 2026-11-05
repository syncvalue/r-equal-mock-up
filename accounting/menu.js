// 左側の開閉式メニュー（鑑定士のタブレット・倉庫・物流と同じ。☰ で開き、項目を選ぶか、外側・✕で閉じる）
export const TABS = [
  { key: 'claims', icon: '🧾', label: '経費精算', sub: '営業サポートの一次チェック（日ごと・鑑定士ごと）' },
  { key: 'balance', icon: '🏦', label: '残高・入出金管理', sub: '鑑定士の補充金・支払・入金・日次残高' },
  { key: 'weekly', icon: '📊', label: '週間収支', sub: '週の入出金・粗利・固定費・残高' },
];
export const tabLabel = (key) => TABS.find((t) => t.key === key)?.label ?? '';

// badges: { balance: 振込待ちの件数, claims: 前日までの未チェックの鑑定士の数 }
export function menuView({ tab, badges }) {
  const badge = { balance: ['bg-amber-500', '振込待ち'], claims: ['bg-rose-600', '未チェック'] };
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
