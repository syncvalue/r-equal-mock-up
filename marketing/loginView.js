// マーケティング部のログイン画面（マーケティング担当ごとにログインする）
import { esc } from '../src/format.js';
import { helpIcon } from '../src/help.js';

export const loginView = (error = '', staffList = []) => `
  <div class="min-h-screen flex items-center justify-center p-4">
    <div class="w-full max-w-sm rounded-2xl border bg-white p-6 space-y-4 shadow">
      <h1 class="font-bold text-xl">マーケティング部 ${helpIcon('マーケティング担当ごとにログインします。')}</h1>
      ${error ? `<div class="rounded bg-rose-50 border border-rose-300 p-2 text-sm font-bold text-rose-700" role="alert">${esc(error)}</div>` : ''}
      <label class="text-sm font-bold block">ログインID<input class="inp mt-1 font-normal" data-login-id placeholder="例: mk01" autocomplete="username" autocapitalize="none" /></label>
      <label class="text-sm font-bold block">パスワード<input class="inp mt-1 font-normal" type="password" data-login-pw autocomplete="current-password" /></label>
      <button class="b b-pri w-full" data-login>ログイン</button>
      <details class="rounded border border-dashed border-slate-300 p-2 text-xs text-slate-400"><summary class="demo-only cursor-pointer">アカウント</summary>
        <div class="mt-1 space-y-0.5">${staffList.map((s) => `<div><b class="font-mono">${esc(s.loginId)}</b> ${esc(s.name)}</div>`).join('')}</div></details>
    </div>
  </div>`;
