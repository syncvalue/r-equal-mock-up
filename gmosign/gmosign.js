// GMOサイン管理画面（ダミー）。実サービスとは無関係のモックです。
import { RESET_CONFIRM, clearTransactions, loadContracts, upsertContract } from '../src/store.js';
import { mountSignaturePad } from '../src/signature.js';
import { ID_TYPES } from '../src/data.js';
import { CHECK_ITEMS, contractFormHtml, wareki } from './contractForm.js';
import { yen, fmtDateTime, esc } from '../src/format.js';

const $ = (s) => document.querySelector(s);
const authed = () => sessionStorage.getItem('gmo-auth') === '1';
const STATUS_CLS = { 本人確認待ち: 'bg-amber-100 text-amber-800', 署名待ち: 'bg-sky-100 text-sky-800', 締結済み: 'bg-emerald-100 text-emerald-800' };
const badge = (st) => `<span class="rounded px-2 py-0.5 text-sm font-bold ${STATUS_CLS[st]}">${st}</span>`;

const topbar = () => `
  <header class="bg-sky-800 text-white px-6 py-3 flex justify-between items-center">
    <div class="font-bold text-xl">GMOサイン <span class="text-xs font-normal bg-white/20 rounded px-2 py-0.5 ml-2">ダミー画面</span></div>
    <button class="underline" data-act="logout">ログアウト</button>
  </header>`;

function loginView() {
  return `
  <div class="min-h-screen flex items-center justify-center p-4">
    <form class="bg-white shadow rounded-lg p-8 w-full max-w-sm space-y-4" data-form="login">
      <h1 class="text-2xl font-bold text-sky-800">GMOサイン ログイン</h1>
      <p class="text-xs text-slate-500">※ダミー画面です。任意の値でログインできます。</p>
      <label class="block text-sm font-bold">メールアドレス<input class="inp mt-1" value="staff@example.com" /></label>
      <label class="block text-sm font-bold">パスワード<input class="inp mt-1" type="password" value="password" /></label>
      <button class="b b-pri w-full">ログイン</button>
    </form>
  </div>`;
}

function listView() {
  const list = loadContracts();
  return `${topbar()}
  <main class="max-w-5xl mx-auto p-6 space-y-4">
    <h1 class="text-2xl font-bold">契約一覧</h1>
    <div class="bg-white shadow rounded-lg overflow-hidden">
      <table class="w-full text-left">
        <thead class="bg-slate-100 text-sm text-slate-600"><tr><th class="p-3">契約No.</th><th>お客様</th><th>買取金額</th><th>送信日時</th><th>状態</th></tr></thead>
        <tbody>${
          list.length
            ? list.map((c) => `<tr class="border-t hover:bg-sky-50 cursor-pointer" data-go="#detail/${c.id}">
                <td class="p-3 font-mono text-sky-700 underline">${esc(c.id)}</td><td>${esc(c.customer.name)}</td>
                <td>${yen(c.total)}</td><td>${fmtDateTime(c.sentAt)}</td><td>${badge(c.status)}</td></tr>`).join('')
            : '<tr><td colspan="5" class="p-8 text-center text-slate-400">契約がありません。買取アプリから送信してください。</td></tr>'
        }</tbody>
      </table>
    </div>
    <button class="b b-sec" data-act="reload">🔄 更新</button>
    <button class="text-xs underline text-slate-400 ml-4" data-act="reset-all">（デモ用）データ初期化</button>
  </main>`;
}

function detailView(c) {
  if (!c) return `${topbar()}<main class="p-6">契約が見つかりません。<a class="underline" href="#list">一覧へ</a></main>`;
  const done = c.status === '締結済み';
  return `${topbar()}
  <main class="max-w-5xl mx-auto p-6 space-y-5">
    <a class="text-sky-700 underline" href="#list">← 契約一覧</a>
    <div class="flex items-center gap-3"><h1 class="text-2xl font-bold">契約詳細 <span class="font-mono">${esc(c.id)}</span></h1>${badge(c.status)}</div>
    <div class="grid md:grid-cols-2 gap-5">
      <section class="bg-white shadow rounded-lg p-5 space-y-2">
        <h2 class="font-bold text-lg">契約内容</h2>
        <p>${esc(c.customer.name)} 様（${esc(c.customer.phone)}）<br><span class="text-sm text-slate-500">${esc(c.customer.zip)} ${esc(c.customer.address)}</span></p>
        <table class="w-full text-sm"><tbody>${c.items.map((i) => `<tr class="border-t"><td class="py-1">${esc(i.name)}<div class="text-xs font-mono text-slate-500">${i.codes.map(esc).join(' / ')}</div></td>
          <td>${i.rank}</td><td>×${i.qty}</td><td class="text-right">${yen(i.price)}</td></tr>`).join('')}</tbody></table>
        <div class="text-right text-2xl font-bold text-sky-800">${yen(c.total)}</div>
      </section>
      <section class="bg-white shadow rounded-lg p-5 space-y-3">
        <h2 class="font-bold text-lg">① 本人確認書類の登録</h2>
        ${c.kyc
          ? `<p class="text-emerald-700 font-bold">✅ 登録済み：${esc(c.kyc.type)}</p><img src="${c.kyc.photo}" alt="本人確認書類" class="h-32 rounded border" />`
          : `<select class="inp" id="kyc-type">${ID_TYPES.map((t) => `<option>${t}</option>`).join('')}</select>
             <div class="flex gap-2"><label class="b b-sec cursor-pointer flex-1 text-center">ファイル選択<input type="file" accept="image/*" class="hidden" id="kyc-file" /></label>
             <button class="b b-pri" data-act="kyc-dummy">ダミー画像で登録</button></div>`}
        <h2 class="font-bold text-lg pt-2">② 契約者確認（チェック項目）</h2>
        ${!c.kyc
          ? '<p class="text-slate-400">本人確認書類の登録後に確認できます。</p>'
          : done
            ? '<p class="text-emerald-700 font-bold">✅ 全項目確認済み</p>'
            : `<div class="space-y-2">${CHECK_ITEMS.map((q) => `<label class="flex gap-2 items-start text-sm">
                <input type="checkbox" class="mt-1 w-5 h-5" data-chk="${q.key}" /><span>${q.section ? `<b class="text-rose-600">[${q.section[0]}]</b> ` : ''}${esc(q.text).replace('{cooling}', coolingText())}</span></label>`).join('')}
              <div class="flex gap-2 items-center text-sm font-bold pt-1">引渡場所
                <select class="inp !w-28" id="dp"><option>自宅</option><option>その他</option></select>
                <input class="inp" id="dpo" placeholder="その他の場合の場所" /></div></div>`}
        <h2 class="font-bold text-lg pt-2">③ お客様署名・契約締結</h2>
        ${!c.kyc
          ? '<p class="text-slate-400">本人確認書類の登録後に署名できます。</p>'
          : done
            ? `<p class="text-emerald-700 font-bold">✅ 締結済み（${fmtDateTime(c.signedAt)}）</p><img src="${c.signature}" alt="署名" class="h-24 border rounded bg-white" />
               <button class="b b-pri" data-act="preview">契約書PDFを表示・印刷</button>`
            : `<canvas id="sign" class="w-full h-44 border border-slate-400 rounded bg-white touch-none"></canvas>
               <div class="flex gap-2"><button class="b b-sec" data-act="clear-sign">クリア</button>
               <button class="b b-pri flex-1" id="sign-btn" data-act="sign" disabled>署名して契約を締結</button></div>
               <p class="text-xs text-slate-500">すべてのチェック項目にチェックし、署名すると締結できます。</p>`}
      </section>
    </div>
  </main>`;
}

const COPIES = ['会社控え', 'お客様控え'];
let clearSign = null;
let pendingSig = null;
let checks = {};
let previewOpen = false;

const coolingText = () => {
  const w = wareki(new Date(Date.now() + 7 * 86400000));
  return `令和 ${w.year} 年 ${w.month} 月 ${w.day} 日`;
};
const refreshSign = () => {
  const btn = $('#sign-btn');
  if (btn) btn.disabled = !(pendingSig && CHECK_ITEMS.every((q) => checks[q.key]));
};

const previewView = (c) => `
  <div class="fixed inset-0 z-50 bg-slate-700/90 overflow-auto p-4">
    <div class="sticky top-0 z-10 flex justify-end gap-2 mb-3">
      <button class="b b-pri" data-act="print">印刷／PDF保存</button><button class="b b-sec" data-act="close-preview">閉じる</button></div>
    <div class="flex flex-col items-center gap-4">${contractFormHtml(c, COPIES)}</div>
  </div>`;

function render() {
  const hash = location.hash || '#login';
  const [route, id] = hash.slice(1).split('/');
  if (route !== 'login' && !authed()) return void (location.hash = '#login');
  const c = loadContracts().find((x) => x.id === id);
  $('#root').innerHTML = (route === 'login' ? loginView() : route === 'detail' ? detailView(c) : listView()) + (previewOpen && c?.signature ? previewView(c) : '');
  $('#print-area').innerHTML = c?.signature ? contractFormHtml(c, COPIES) : '';
  pendingSig = null;
  if (!c?.signature) checks = {};
  const canvas = $('#sign');
  if (canvas) clearSign = mountSignaturePad(canvas, null, (sig) => { pendingSig = sig; refreshSign(); });
}

const current = () => loadContracts().find((x) => x.id === location.hash.split('/')[1]);
const update = (patch) => { upsertContract({ ...current(), ...patch }); render(); };
const DUMMY = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" rx="14" fill="#e2e8f0"/><circle cx="70" cy="80" r="32" fill="#94a3b8"/><rect x="120" y="55" width="160" height="14" fill="#94a3b8"/><rect x="120" y="85" width="120" height="14" fill="#94a3b8"/><text x="20" y="175" font-size="20" fill="#475569">DUMMY ID</text></svg>');

const acts = {
  logout: () => { sessionStorage.removeItem('gmo-auth'); location.hash = '#login'; },
  reload: render,
  'reset-all': () => { if (confirm(RESET_CONFIRM)) { clearTransactions(); location.hash = '#login'; render(); } },
  'kyc-dummy': () => update({ kyc: { type: $('#kyc-type').value, photo: DUMMY }, status: '署名待ち' }),
  'clear-sign': () => clearSign?.(),
  sign: () => pendingSig && update({
    signature: pendingSig, signedAt: Date.now(), status: '締結済み', checks: { ...checks },
    deliveryPlace: $('#dp').value, deliveryOther: $('#dpo').value,
  }),
  preview: () => { previewOpen = true; render(); },
  'close-preview': () => { previewOpen = false; render(); },
  print: () => window.print(),
};

document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (go) { location.hash = go.dataset.go; return; }
  const a = e.target.closest('[data-act]');
  if (a) acts[a.dataset.act]?.();
});
document.addEventListener('submit', (e) => {
  if (e.target.dataset.form !== 'login') return;
  e.preventDefault();
  sessionStorage.setItem('gmo-auth', '1');
  location.hash = '#list';
});
document.addEventListener('change', (e) => {
  if (e.target.dataset.chk) { checks = { ...checks, [e.target.dataset.chk]: e.target.checked }; refreshSign(); return; }
  if (e.target.id !== 'kyc-file' || !e.target.files[0]) return;
  const type = $('#kyc-type').value;
  const r = new FileReader();
  r.onload = () => update({ kyc: { type, photo: r.result }, status: '署名待ち' });
  r.readAsDataURL(e.target.files[0]);
});
window.addEventListener('hashchange', () => { previewOpen = false; render(); });
render();
