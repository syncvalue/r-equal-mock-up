// 左側の開閉式メニュー（経理部・鑑定士のタブレット・倉庫・物流と同じ。☰ で開き、項目を選ぶか、外側・✕で閉じる）
import { modalBadgeHtml } from '../src/screenIds.js';
import { icon } from '../src/icons.js';

export const TABS = [
  { key: 'support', icon: 'chat', label: '鑑定士サポート', sub: '今日の予定・訪問状況、買取明細、査定依頼への回答、承認' },
  { key: 'appraisal', icon: 'search', label: '査定', sub: '高額品（紫・赤のシール）の登録内容を確認して確定' },
];
export const tabLabel = (key) => TABS.find((t) => t.key === key)?.label ?? '';

// badges: { support: 鑑定士への返信待ち（査定員の番）の査定依頼の件数, appraisal: 査定待ちの商品の件数 }
export function menuView({ tab, badges }) {
  const badge = { support: ['bg-rose-600', '返信待ち'], appraisal: ['bg-amber-500', '査定待ち'] };
  return `
  <div class="fixed inset-0 z-[55]">
    <button class="absolute inset-0 bg-black/50 cursor-default" data-menu-close aria-label="メニューを閉じる"></button>
    <nav class="absolute inset-y-0 left-0 w-80 max-w-[85vw] bg-slate-900 text-white flex flex-col menu-slide" aria-label="メインメニュー">
      <div class="flex items-center justify-between px-5 py-4 border-b border-white/10">
        <span class="font-bold text-xl">メニュー</span>
        <button class="w-12 h-12 rounded-xl text-2xl hover:bg-white/10" data-menu-close aria-label="メニューを閉じる">✕</button>
      </div>
      <div class="flex-1 overflow-y-auto p-3 space-y-2">
        <div>${modalBadgeHtml('HQ-M02')}</div>
        ${TABS.map((t) => `
        <button class="w-full text-left flex items-center gap-4 rounded-xl px-4 py-3 min-h-[64px] ${tab === t.key ? 'bg-teal-700' : 'hover:bg-white/10 active:bg-white/20'}" data-tab="${t.key}">
          <span class="text-3xl">${icon(t.icon, 28)}</span>
          <span class="flex-1 min-w-0"><span class="block font-bold text-lg leading-tight">${t.label}</span><span class="text-xs text-slate-300">${t.sub}</span>${badges[t.key] ? `<span class="flex flex-wrap gap-1 mt-1.5"><span class="text-xs font-bold rounded-full ${badge[t.key][0]} px-2 py-0.5 whitespace-nowrap">${badge[t.key][1]} ${badges[t.key]}</span></span>` : ''}</span>
        </button>`).join('')}
      </div>
    </nav>
  </div>`;
}
