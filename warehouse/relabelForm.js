// シールの貼り替え。シールの色が変わる（間違えていた）と、シールそのものが別になるため、商品のシールNo.（ID）も新しくなる。
import { SEAL_COLORS } from '../src/stock.js';
import { esc } from '../src/format.js';

export const relabelForm = (rl, unit) => `<div class="rounded-lg border-2 border-amber-300 bg-amber-50 p-3 space-y-2 text-sm">
  <b>🏷 シールの貼り替え</b>（現在: <span class="font-mono">${esc(unit.code)}</span>）
  <p class="text-xs text-slate-600">シールの色が変わると、シールそのものが別になり、商品のシールNo.（ID）も新しくなります。新しいシールを貼り、そのQRを読み取って（またはシールNo.を入力して）、色を選んでください。古いシールNo.は、履歴に残ります。</p>
  <div class="flex flex-wrap items-end gap-2">
    <label class="text-xs font-bold">新しいシールNo.<input class="inp mt-1 font-mono font-normal !w-56" data-f="rl.newCode" value="${esc(rl.newCode)}" placeholder="RQ-XXXXXXXX" autocomplete="off" /></label>
    <div class="flex flex-wrap items-center gap-1.5"><span class="text-xs font-bold">新しいシールの色</span>
      ${SEAL_COLORS.map((c) => `<button class="b b-sec !min-h-[40px] !py-1 !px-3 text-sm ${rl.color === c.key ? 'on' : ''}" data-rl-color="${c.key}">${c.dot} ${c.label}</button>`).join('')}</div>
    <button class="b b-pri" data-rl-do="${esc(unit.code)}" ${rl.newCode.trim() && rl.color ? '' : 'disabled'}>貼り替えを記録</button>
    <button class="b b-sec" data-rl-cancel>やめる</button>
  </div></div>`;
