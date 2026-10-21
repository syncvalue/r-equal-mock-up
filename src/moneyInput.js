// 金額入力欄の共通処理。入力中に3桁区切り（カンマ）で表示し、全角数字も受け付ける。
const toHalf = (s) => s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));

// 入力欄の表示を整え、数値を返す。カーソル位置は「何桁目か」で保持する
export function formatMoneyInput(el) {
  const digits = toHalf(el.value).replace(/\D/g, '').slice(0, 10);
  const n = Number(digits) || 0;
  const before = toHalf(el.value.slice(0, el.selectionStart ?? el.value.length)).replace(/\D/g, '').length;
  el.value = n ? n.toLocaleString('ja-JP') : '';
  let pos = 0;
  for (let seen = 0; pos < el.value.length && seen < before; pos += 1) if (/\d/.test(el.value[pos])) seen += 1;
  el.setSelectionRange(pos, pos);
  return n;
}

export const yenText = (n) => (n ? Number(n).toLocaleString('ja-JP') : '');

// ¥ と 円 を添えた金額入力欄
export const moneyInputHtml = ({ attrs = '', value = 0, placeholder = '金額を入力', cls = '' } = {}) => `
  <div class="relative">
    <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">¥</span>
    <input class="${cls} text-right font-bold tracking-wide pl-8 pr-10" type="text" inputmode="numeric" autocomplete="off" value="${yenText(value)}" placeholder="${placeholder}" ${attrs} />
    <span class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">円</span>
  </div>`;
