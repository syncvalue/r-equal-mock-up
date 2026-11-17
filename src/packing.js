// 持ち帰りの箱詰め。買い取った商品のQRコードを読み取りながら、持ち帰り用の箱に入れる。
// 「買い取った商品を、持ち帰り忘れる」「買い取っていない商品を、持って帰ってしまう」を防ぐ。画面から独立した純関数。
const norm = (code) => String(code ?? '').trim().toUpperCase();

// 箱に入れる対象: シールを貼った、買い取った商品（1点ずつ）。slots は買取商品のシール枠、labels は枠ごとのシールのQRコード
export const packTargets = (slots, labels) => slots.filter((x) => labels[x.key]).map((x) => ({ key: x.key, code: norm(labels[x.key]), name: x.item.name, n: x.n, qty: x.item.qty ?? 1 }));

// QRコードを読み取って、箱に入れる。type: ok（入れた）／dup（すでに入っている）／foreign（買い取っていない商品。箱には入れない）
export function scanIntoBox(targets, packed, rawCode) {
  const code = norm(rawCode);
  const target = targets.find((t) => t.code === code);
  if (!target) return { type: 'foreign', code, packed };
  if (packed.includes(code)) return { type: 'dup', code, target, packed };
  return { type: 'ok', code, target, packed: [...packed, code] };
}

export function packProgress(targets, packed) {
  const done = targets.filter((t) => packed.includes(t.code));
  const missing = targets.filter((t) => !packed.includes(t.code));
  return { total: targets.length, done: done.length, left: missing.length, missing, complete: missing.length === 0 };
}

const label = (t) => `${t.name}${t.qty > 1 ? `（${t.n}/${t.qty}点目）` : ''}`;
export function packMessage(r) {
  if (r.type === 'ok') return `✓ 箱に入れました（${label(r.target)}）`;
  if (r.type === 'dup') return `${label(r.target)} は、すでに箱に入っています`;
  return 'この商品は、今回買い取っていません。箱に入れず、お客様にお返ししてください';
}
