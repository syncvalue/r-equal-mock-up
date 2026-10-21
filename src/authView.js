// ログイン画面（ID・パスワード → SMS認証コード）と、パスワードを忘れた場合の再設定
import { esc } from './format.js';
import { ACCOUNTS, DEMO_PASSWORD, maskPhone, findAccount, lockedUntil, RESEND_WAIT } from './auth.js';
import { userById } from './dashboard.js';

const input = (label, key, value, { type = 'text', placeholder = '', autocomplete = 'off', inputmode = '', maxlength = '' } = {}) => `
  <label class="block"><span class="font-bold text-sm">${label}</span>
    <input class="field mt-1" type="${type}" data-auth="${key}" value="${esc(value)}" placeholder="${placeholder}" autocomplete="${autocomplete}" ${inputmode ? `inputmode="${inputmode}"` : ''} ${maxlength ? `maxlength="${maxlength}"` : ''} autocapitalize="none" spellcheck="false" /></label>`;

const message = (a) => `${a.error ? `<div class="rounded-xl bg-rose-50 border-2 border-rose-300 p-3 text-sm font-bold text-rose-700" role="alert">${esc(a.error)}</div>` : ''}${a.info ? `<div class="rounded-xl bg-emerald-50 border-2 border-emerald-300 p-3 text-sm font-bold text-emerald-800">${esc(a.info)}</div>` : ''}`;
const link = (action, label) => `<button class="text-sm underline text-slate-500" data-action="${action}">${label}</button>`;

// 受信したSMS（モック）。実際はSMSで届くため、この表示はデモ用
const smsPreview = (p) => (p?.userId ? `
  <div class="rounded-2xl bg-slate-800 text-white p-3 text-sm shadow-lg">
    <div class="text-[11px] text-slate-300 mb-0.5">📱 デモ用：端末に届いたSMS（実際は画面に表示されません）</div>
    <div>【出張買取】認証コード <b class="text-xl tracking-widest font-mono">${p.code}</b>（5分間有効）。他人には教えないでください。</div></div>` : '');

function loginScreen(a) {
  const lock = a.id && lockedUntil(String(a.id).trim().toLowerCase());
  return `
    ${message(a)}
    ${lock ? `<div class="rounded-xl bg-amber-50 border-2 border-amber-300 p-3 text-sm font-bold text-amber-800">入力ミスが続いたため、しばらくロックしています（あと約${Math.ceil((lock - Date.now()) / 1000)}秒）。</div>` : ''}
    ${input('ログインID', 'id', a.id, { placeholder: '例: sales01', autocomplete: 'username' })}
    <label class="block"><span class="font-bold text-sm">パスワード</span>
      <div class="relative mt-1"><input class="field pr-16" type="${a.showPw ? 'text' : 'password'}" data-auth="pw" value="${esc(a.pw)}" autocomplete="current-password" autocapitalize="none" spellcheck="false" />
        <button type="button" class="absolute right-2 top-1/2 -translate-y-1/2 text-sm underline text-slate-500 px-2 py-2" data-action="auth-toggle-pw">${a.showPw ? '隠す' : '表示'}</button></div></label>
    <button class="btn btn-primary w-full" data-action="auth-login">ログイン</button>
    <div class="text-center">${link('auth-forgot', 'パスワードをお忘れの方')}</div>
    <details class="rounded-xl bg-slate-50 border p-2 text-xs text-slate-500"><summary class="cursor-pointer">デモ用アカウント</summary>
      <div class="mt-1">パスワードは全員 <b class="font-mono">${DEMO_PASSWORD}</b>（再設定すると変わります）</div>
      <div class="mt-1 grid grid-cols-2 gap-x-3">${ACCOUNTS.map((x) => `<span><b class="font-mono">${x.loginId}</b> ${esc(userById(x.userId).name)}</span>`).join('')}</div></details>`;
}

function smsScreen(a, forgot) {
  const p = a.pending;
  const wait = p ? Math.max(0, Math.ceil((p.sentAt + RESEND_WAIT - Date.now()) / 1000)) : 0;
  const phone = p?.userId ? maskPhone(ACCOUNTS.find((x) => x.userId === p.userId).phone) : 'ご登録の電話番号';
  return `
    ${message(a)}
    <p class="text-sm text-slate-600">${esc(phone)} 宛に、6桁の認証コードをSMSでお送りしました。コードを入力してください。</p>
    ${smsPreview(p)}
    ${input('認証コード（6桁）', 'code', a.code, { inputmode: 'numeric', maxlength: 6, autocomplete: 'one-time-code', placeholder: '000000' })}
    <button class="btn btn-primary w-full" data-action="auth-verify">${forgot ? '次へ' : 'ログイン'}</button>
    <div class="flex justify-between items-center">${link('auth-back', '← 最初に戻る')}
      <button class="text-sm underline ${wait ? 'text-slate-300' : 'text-slate-500'}" data-action="auth-resend" ${wait ? 'disabled' : ''}>コードを再送する${wait ? `（${wait}秒後）` : ''}</button></div>`;
}

const forgotScreen = (a) => `
    ${message(a)}
    <p class="text-sm text-slate-600">ログインIDを入力してください。登録の電話番号に、本人確認のための認証コードをSMSでお送りします。</p>
    ${input('ログインID', 'id', a.id, { placeholder: '例: sales01', autocomplete: 'username' })}
    <button class="btn btn-primary w-full" data-action="auth-forgot-send">認証コードを送る</button>
    <div class="text-center">${link('auth-back', '← ログインに戻る')}</div>`;

const newPwScreen = (a) => `
    ${message(a)}
    <p class="text-sm text-slate-600">新しいパスワードを設定してください（8文字以上・英字と数字を含む）。</p>
    ${input('新しいパスワード', 'newPw', a.newPw, { type: 'password', autocomplete: 'new-password' })}
    ${input('新しいパスワード（確認）', 'newPw2', a.newPw2, { type: 'password', autocomplete: 'new-password' })}
    <button class="btn btn-primary w-full" data-action="auth-setpw">パスワードを変更する</button>`;

const TITLES = { login: 'ログイン', sms: '2段階認証', forgot: 'パスワードの再設定', 'forgot-sms': '本人確認', newpw: '新しいパスワード' };

export function authView(s) {
  const a = s.auth;
  const body = { login: loginScreen, sms: (x) => smsScreen(x, false), forgot: forgotScreen, 'forgot-sms': (x) => smsScreen(x, true), newpw: newPwScreen }[a.screen](a);
  return `
  <section class="h-full overflow-y-auto flex items-start sm:items-center justify-center p-4 bg-slate-100">
    <div class="card w-full max-w-md space-y-4">
      <div class="text-center"><div class="text-5xl">🚗</div><h1 class="text-2xl font-bold">出張買取</h1><div class="text-slate-500 font-bold">${TITLES[a.screen]}</div></div>
      ${body}
    </div>
  </section>`;
}
