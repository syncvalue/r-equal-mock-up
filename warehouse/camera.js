// カメラでのQR読み取り（モック）。営業のタブレットのシール読取と同じ見せ方で、カメラが起動して、シールのQRを読み取ったように見せる。
// 実際のカメラは使わない。読み取る商品は、pickNext() が返すシールNo.（なければ、読み取る商品がない）。
import { fakeQr } from '../src/fakeQr.js';
import { esc } from '../src/format.js';

const SCAN_MS = 1800; // カメラに映してから、読み取れるまで
const FOUND_MS = 1000; // 読み取れてから、次へ進むまで

const CORNERS = ['top:0;left:0;border-top-width:6px;border-left-width:6px;border-top-left-radius:14px', 'top:0;right:0;border-top-width:6px;border-right-width:6px;border-top-right-radius:14px',
  'bottom:0;left:0;border-bottom-width:6px;border-left-width:6px;border-bottom-left-radius:14px', 'bottom:0;right:0;border-bottom-width:6px;border-right-width:6px;border-bottom-right-radius:14px'];

function overlayHtml({ title, subtitle, status, code, message }) {
  const found = status === 'found';
  const col = found ? '#22c55e' : '#fff';
  return `<div class="flex items-center justify-between px-5 py-3 bg-black/70 z-10">
    <div class="flex items-center gap-3"><span class="inline-block w-3 h-3 rounded-full bg-rose-500 animate-pulse"></span><span class="font-bold">カメラ起動中</span></div>
    <div class="text-center leading-tight"><div class="font-bold">${esc(title)}</div><div class="text-xs text-slate-300">${esc(subtitle)}</div></div>
    <button class="rounded-xl border-2 border-white/50 px-5 min-h-[44px] font-bold" data-cam-close>閉じる</button></div>
  <div class="relative flex-1 overflow-hidden"><div class="absolute inset-[-6%] cam-bg"></div>
    <div class="absolute inset-0 flex items-center justify-center"><div class="relative w-[min(60vh,70vw)] aspect-square">
      <div class="absolute inset-[12%] cam-sticker rounded-md shadow-2xl overflow-hidden">${fakeQr(found ? code : 'scanning-preview')}</div>
      ${CORNERS.map((pos) => `<span class="cam-corner" style="${pos};border-color:${col}"></span>`).join('')}
      ${found || status === 'empty' ? '' : '<div class="cam-line"></div>'}</div></div>
    <div class="absolute inset-x-0 bottom-6 flex justify-center">${
      status === 'empty' ? '<div class="rounded-2xl bg-emerald-600 px-6 py-3 text-center shadow-lg"><div class="font-bold text-lg">読み取る商品がありません</div><div class="text-sm">「閉じる」を押してください</div></div>'
        : found ? `<div class="rounded-2xl bg-emerald-600 px-6 py-3 text-center shadow-lg"><div class="font-bold text-lg">✓ 読み取りました</div><div class="font-mono text-sm">${esc(code)}</div></div>`
          : '<div class="rounded-2xl bg-black/60 px-6 py-3 text-center">シールのQRコードを枠に合わせてください</div>'}</div>
    ${message ? `<div class="absolute inset-x-0 top-3 flex justify-center"><div class="rounded-xl px-4 py-2 font-bold ${message.ok ? 'bg-emerald-700' : 'bg-rose-700'}">${message.ok ? '✓' : '⚠'} ${esc(message.text)}</div></div>` : ''}</div>`;
}

// カメラ画面（モック）を開く。onFound(code) は、読み取れたとき。continuous なら、続けて次の商品を読み取る（なくなったら終了の表示）。
// getMessage() は、直前の処理結果の表示（入庫の結果など）。戻り値の close() で閉じる
export function openMockCamera({ title, subtitle, pickNext, onFound, continuous = false, getMessage = () => null }) {
  document.querySelector('#cam')?.remove();
  const el = document.createElement('div');
  el.id = 'cam';
  el.className = 'fixed inset-0 z-50 bg-black text-white flex flex-col';
  document.body.appendChild(el);
  let alive = true;
  const close = () => { alive = false; el.remove(); };
  const draw = (status, code = '') => { el.innerHTML = overlayHtml({ title, subtitle, status, code, message: getMessage() }); el.querySelector('[data-cam-close]').addEventListener('click', close); };
  const step = () => {
    draw('scanning');
    setTimeout(() => {
      if (!alive) return;
      const code = pickNext();
      if (!code) { draw('empty'); return; }
      draw('found', code);
      setTimeout(() => {
        if (!alive) return;
        onFound(code);
        if (continuous) step();
        else close();
      }, FOUND_MS);
    }, SCAN_MS);
  };
  step();
  return close;
}
