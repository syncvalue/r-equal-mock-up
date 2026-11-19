// 左側の開閉式メニュー（経理部・査定部・倉庫・物流と同じ。☰ で開き、項目を選ぶか、外側・✕で閉じる）
import { modalBadgeHtml } from '../src/screenIds.js';
import { icon } from '../src/icons.js';

export const TABS = [
  { key: 'flyers', icon: 'inbox', label: 'チラシ', sub: 'チラシの登録（ID・配布方法・エリア・期間・部数・費用・デザインデータ）' },
  { key: 'calendar', icon: 'calendar', label: '配布カレンダー', sub: '日ごとに、どのチラシを配るかを、月の表で見る' },
  { key: 'response', icon: 'chart', label: '反響管理', sub: 'どのチラシが効果的だったか（受付の件数・反響率・1件あたりの費用）' },
];
export const tabLabel = (key) => TABS.find((t) => t.key === key)?.label ?? '';

// badges: { flyers: 今日配布のチラシの数 }
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
        <div>${modalBadgeHtml('MKT-M01')}</div>
        ${TABS.map((t) => `
        <button class="w-full text-left flex items-center gap-4 rounded-xl px-4 py-3 min-h-[64px] ${tab === t.key ? 'bg-teal-700' : 'hover:bg-white/10 active:bg-white/20'}" data-tab="${t.key}">
          <span class="text-3xl">${icon(t.icon, 28)}</span>
          <span class="flex-1 min-w-0"><span class="block font-bold text-lg leading-tight">${t.label}</span><span class="text-xs text-slate-300">${t.sub}</span>${badges[t.key] ? `<span class="flex flex-wrap gap-1 mt-1.5"><span class="text-xs font-bold rounded-full bg-amber-500 px-2 py-0.5 whitespace-nowrap">今日配布 ${badges[t.key]}</span></span>` : ''}</span>
        </button>`).join('')}
      </div>
    </nav>
  </div>`;
}
