// GMOサイン管理画面（ダミー）。実サービスとは無関係のモックです。
import { RESET_CONFIRM, clearTransactions, loadContracts, upsertContract } from '../src/store.js';
import { ID_TYPES } from '../src/data.js';
import { buildKyc, kycPhotos } from '../src/kyc.js';
import { initTheme, themeToggleHtml } from '../src/theme.js';
import { initHelp, helpIcon } from '../src/help.js';
import { contractFormHtml } from './contractForm.js';
import { yen, fmtDateTime, esc } from '../src/format.js';

const $ = (s) => document.querySelector(s);
const authed = () => sessionStorage.getItem('gmo-auth') === '1';
const STATUS_CLS = { 本人確認待ち: 'bg-amber-100 text-amber-800', 印刷待ち: 'bg-sky-100 text-sky-800', 印刷済み: 'bg-emerald-100 text-emerald-800' };
const badge = (st) => `<span class="rounded px-2 py-0.5 text-sm font-bold ${STATUS_CLS[st]}">${st}</span>`;

const topbar = () => `
  <header class="bg-sky-800 text-white px-6 py-3 flex justify-between items-center">
    <div class="font-bold text-xl">GMOサイン <span class="text-xs font-normal bg-white/20 rounded px-2 py-0.5 ml-2">ダミー画面</span></div>
    <span class="flex items-center gap-3">${themeToggleHtml()}<button class="underline" data-act="logout">ログアウト</button></span>
  </header>`;

function loginView() {
  return `
  <div class="fixed top-3 right-3">${themeToggleHtml()}</div>
  <div class="min-h-screen flex items-center justify-center p-4">
    <form class="bg-white shadow rounded-lg p-8 w-full max-w-sm space-y-4" data-form="login">
      <h1 class="text-2xl font-bold text-sky-800">GMOサイン ログイン${helpIcon('ダミー画面です。任意の値でログインできます。')}</h1>
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
  const printed = c.status === '印刷済み';
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
          ? `<p class="text-emerald-700 font-bold">✅ 登録済み：${esc(c.kyc.type)}（${kycPhotos(c.kyc).length}枚）</p>
             <div class="flex gap-2">${kycPhotos(c.kyc).map((p, i) => `<img src="${p}" alt="本人確認書類（${SIDES[i]}）" class="h-32 rounded border" />`).join('')}</div>`
          : kycForm()}
        <h2 class="font-bold text-lg pt-2">② 契約書の印刷${helpIcon('印刷した契約書に、お客様がボールペンで「チェック項目への記入」と「署名」をします（この画面では行いません）。')}</h2>
        ${!c.kyc
          ? '<p class="text-slate-400">本人確認書類の登録後に印刷できます。</p>'
          : `${printed ? `<p class="text-emerald-700 font-bold">✅ 印刷済み（${fmtDateTime(c.printedAt)}）</p>` : ''}
             <div class="flex gap-2"><button class="b b-sec flex-1" data-act="preview">プレビュー</button>
             <button class="b b-pri flex-1" data-act="print">${printed ? '再印刷' : '印刷（会社控え・お客様控え）'}</button></div>`}
      </section>
    </div>
  </main>`;
}

const SIDES = ['表面', '裏面'];
// 登録前の入力（画像は選んだ時点で読み込み、画面を描き直しても残す）
let draft = { type: ID_TYPES[0], photos: ['', ''] };
const kycForm = () => `
  <select class="inp" id="kyc-type">${ID_TYPES.map((t) => `<option${t === draft.type ? ' selected' : ''}>${t}</option>`).join('')}</select>
  <div class="grid grid-cols-2 gap-2">${SIDES.map((side, i) => `
    <div class="space-y-1 text-center"><div class="text-sm font-bold">${side}${i ? '（任意）' : '（必須）'}</div>
      ${draft.photos[i] ? `<img src="${draft.photos[i]}" alt="${side}" class="h-24 mx-auto rounded border" /><button class="text-xs text-sky-700 underline" data-act="kyc-clear" data-i="${i}">選び直す</button>`
        : `<label class="b b-sec cursor-pointer block">ファイル選択<input type="file" accept="image/*" class="hidden" data-kyc-file="${i}" /></label>`}</div>`).join('')}</div>
  <div class="flex gap-2"><button class="b b-pri flex-1" data-act="kyc-save"${draft.photos[0] ? '' : ' disabled'}>登録する</button>
  <button class="b b-sec" data-act="kyc-dummy">ダミー画像（2枚）で登録</button></div>`;

const COPIES = ['会社控え', 'お客様控え'];
let previewOpen = false;

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
  $('#root').innerHTML = (route === 'login' ? loginView() : route === 'detail' ? detailView(c) : listView()) + (previewOpen && c?.kyc ? previewView(c) : '');
  $('#print-area').innerHTML = c?.kyc ? contractFormHtml(c, COPIES) : '';
}

const current = () => loadContracts().find((x) => x.id === location.hash.split('/')[1]);
const update = (patch) => { upsertContract({ ...current(), ...patch }); render(); };
const DUMMY = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" rx="14" fill="#e2e8f0"/><circle cx="70" cy="80" r="32" fill="#94a3b8"/><rect x="120" y="55" width="160" height="14" fill="#94a3b8"/><rect x="120" y="85" width="120" height="14" fill="#94a3b8"/><text x="20" y="175" font-size="20" fill="#475569">DUMMY ID</text></svg>');

const acts = {
  logout: () => { sessionStorage.removeItem('gmo-auth'); location.hash = '#login'; },
  reload: render,
  'reset-all': () => { if (confirm(RESET_CONFIRM)) { clearTransactions(); location.hash = '#login'; render(); } },
  'kyc-dummy': () => { draft = { ...draft, photos: [DUMMY, DUMMY] }; acts['kyc-save'](); },
  'kyc-save': () => { const kyc = buildKyc(draft.type, ...draft.photos); if (kyc) { draft = { type: ID_TYPES[0], photos: ['', ''] }; update({ kyc, status: '印刷待ち' }); } },
  'kyc-clear': (a) => { draft = { ...draft, photos: draft.photos.map((p, i) => (i === Number(a.dataset.i) ? '' : p)) }; render(); },
  preview: () => { previewOpen = true; render(); },
  'close-preview': () => { previewOpen = false; render(); },
  // 印刷時刻を契約日として記録してから印刷する（紙には契約日時が印字される）
  print: () => {
    const c = current();
    if (c && c.status !== '印刷済み') upsertContract({ ...c, printedAt: Date.now(), status: '印刷済み' });
    render();
    window.print();
  },
};

document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (go) { location.hash = go.dataset.go; return; }
  const a = e.target.closest('[data-act]');
  if (a) acts[a.dataset.act]?.(a);
});
document.addEventListener('submit', (e) => {
  if (e.target.dataset.form !== 'login') return;
  e.preventDefault();
  sessionStorage.setItem('gmo-auth', '1');
  location.hash = '#list';
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'kyc-type') { draft = { ...draft, type: e.target.value }; return; }
  const i = e.target.dataset.kycFile;
  if (i === undefined || !e.target.files[0]) return;
  const r = new FileReader();
  r.onload = () => { draft = { ...draft, photos: draft.photos.map((p, k) => (k === Number(i) ? r.result : p)) }; render(); };
  r.readAsDataURL(e.target.files[0]);
});
window.addEventListener('hashchange', () => { previewOpen = false; draft = { type: ID_TYPES[0], photos: ['', ''] }; render(); });
initTheme();
initHelp();
render();
