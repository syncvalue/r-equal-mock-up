// 倉庫・物流のログイン画面（倉庫担当ごとにログインし、操作した人を記録する）
import { esc } from '../src/format.js';
import { helpIcon } from '../src/help.js';

export const loginView = (error = '', master) => `
  <div class="min-h-screen flex items-center justify-center p-4">
    <div class="w-full max-w-sm rounded-2xl border bg-white p-6 space-y-4 shadow">
      <h1 class="font-bold text-xl">🏭 倉庫・物流 <span class="text-xs font-normal bg-sky-100 text-sky-800 rounded px-2 py-0.5 ml-1">ダミー画面（PC）</span>${helpIcon('倉庫担当ごとにログインします。倉庫担当は、各倉庫に所属します。\n入庫・出品・売却・返品の操作は、ログインした倉庫担当の名前で記録されます。')}</h1>
      ${error ? `<div class="rounded bg-rose-50 border border-rose-300 p-2 text-sm font-bold text-rose-700" role="alert">${esc(error)}</div>` : ''}
      <label class="text-sm font-bold block">ログインID<input class="inp mt-1 font-normal" data-login-id placeholder="例: wh01" autocomplete="username" autocapitalize="none" /></label>
      <label class="text-sm font-bold block">パスワード<input class="inp mt-1 font-normal" type="password" data-login-pw autocomplete="current-password" /></label>
      <button class="b b-pri w-full" data-login>ログイン</button>
      <details class="rounded bg-slate-50 border p-2 text-xs text-slate-500"><summary class="cursor-pointer">デモ用アカウント</summary>
        <div class="mt-1">IDは下のいずれか。パスワードは、何か入力すれば可（モック）。</div>
        <div class="mt-1 space-y-0.5">${master.staff.filter((s) => s.active).map((s) => `<div><b class="font-mono">${esc(s.loginId)}</b> ${esc(s.name)} <span class="text-slate-400">${esc(master.warehouses.find((w) => w.id === s.warehouseId)?.name ?? '')}</span></div>`).join('')}</div></details>
    </div>
  </div>`;
