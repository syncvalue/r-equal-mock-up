// 店舗のログイン画面（店舗スタッフごとにログインし、受付・買取を誰がしたかを記録する）
import { esc } from '../src/format.js';
import { helpIcon } from '../src/help.js';
import { storeNameOf } from '../src/stores.js';

export const loginView = (error = '', staffList = [], stores = []) => `
  <div class="min-h-screen flex items-center justify-center p-4">
    <div class="w-full max-w-sm rounded-2xl border bg-white p-6 space-y-4 shadow">
      <h1 class="font-bold text-xl">🏬 店舗 <span class="text-xs font-normal bg-indigo-100 text-indigo-800 rounded px-2 py-0.5 ml-1">ダミー画面（PC・タブレット）</span>${helpIcon('店舗スタッフごとにログインします。店舗スタッフは、いずれかの店舗に所属します。\n来店の受付と買取は、ログインした店舗スタッフの名前で記録されます。')}</h1>
      ${error ? `<div class="rounded bg-rose-50 border border-rose-300 p-2 text-sm font-bold text-rose-700" role="alert">${esc(error)}</div>` : ''}
      <label class="text-sm font-bold block">ログインID<input class="inp mt-1 font-normal" data-login-id placeholder="例: st01" autocomplete="username" autocapitalize="none" /></label>
      <label class="text-sm font-bold block">パスワード<input class="inp mt-1 font-normal" type="password" data-login-pw autocomplete="current-password" /></label>
      <button class="b b-pri w-full" data-login>ログイン</button>
      <details class="rounded bg-slate-50 border p-2 text-xs text-slate-500"><summary class="cursor-pointer">デモ用アカウント</summary>
        <div class="mt-1">IDは下のいずれか。パスワードは、何か入力すれば可（モック）。</div>
        <div class="mt-1 space-y-0.5">${staffList.map((s) => `<div><b class="font-mono">${esc(s.loginId)}</b> ${esc(s.name)} <span class="text-slate-400">${esc(storeNameOf(s.storeId, stores))}</span></div>`).join('')}</div></details>
    </div>
  </div>`;
