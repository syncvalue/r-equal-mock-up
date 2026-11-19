// マーケティング部のモーダル（詳細を、画面の下ではなく、重ねて出す）。閉じるのは、✕・外側・Esc
import { modalBadgeHtml } from '../src/screenIds.js';

export const modalHtml = (id, body) => `<div class="fixed inset-0 z-[60] flex items-center justify-center p-4" data-mkt-modal="${id}"><div class="absolute inset-0 bg-black/40" data-mkt-close></div>
  <div class="relative z-10 max-h-[92vh] w-[56rem] max-w-full overflow-y-auto rounded-lg bg-white p-5 shadow-2xl" role="dialog" aria-modal="true">
    <div class="flex items-start justify-between gap-3">${modalBadgeHtml(id)}<button class="rounded border px-3 py-1 font-bold shrink-0" data-mkt-close title="閉じる（Esc）">✕ 閉じる</button></div>
    ${body}
  </div></div>`;
