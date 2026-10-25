// 倉庫・物流のログイン画面（担当者ごとにログインし、操作した人を記録する）
import { STAFF } from '../src/warehouseStaff.js';
import { esc } from '../src/format.js';

export const loginView = (error = '') => `
  <div class="min-h-screen flex items-center justify-center p-4">
    <div class="w-full max-w-sm rounded-2xl border bg-white p-6 space-y-4 shadow">
      <h1 class="font-bold text-xl">🏭 倉庫・物流 <span class="text-xs font-normal bg-sky-100 text-sky-800 rounded px-2 py-0.5 ml-1">ダミー画面（PC）</span></h1>
      <p class="text-sm text-slate-500">担当者ごとにログインします。入庫・出品・売却・返品の操作は、ログインした担当者の名前で記録されます。</p>
      ${error ? `<div class="rounded bg-rose-50 border border-rose-300 p-2 text-sm font-bold text-rose-700" role="alert">${esc(error)}</div>` : ''}
      <label class="text-sm font-bold block">ログインID<input class="inp mt-1 font-normal" data-login-id placeholder="例: wh01" autocomplete="username" autocapitalize="none" /></label>
      <label class="text-sm font-bold block">パスワード<input class="inp mt-1 font-normal" type="password" data-login-pw autocomplete="current-password" /></label>
      <button class="b b-pri w-full" data-login>ログイン</button>
      <details class="rounded bg-slate-50 border p-2 text-xs text-slate-500"><summary class="cursor-pointer">デモ用アカウント</summary>
        <div class="mt-1">IDは下の4名のいずれか。パスワードは、何か入力すれば可（モック）。</div>
        <div class="mt-1 grid grid-cols-2 gap-x-3">${STAFF.map((s) => `<span><b class="font-mono">${esc(s.loginId)}</b> ${esc(s.name)}</span>`).join('')}</div></details>
    </div>
  </div>`;
