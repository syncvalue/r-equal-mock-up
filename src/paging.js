// ページ分割（一覧のページネーション）。すべて純粋関数。
export const PAGE_SIZES = [20, 50, 100];

// page（1始まり）の分を取り出す。範囲外のページは、最初・最後に丸める。size が不正（0以下）なら、1ページにまとめる
export function paginate(list, page, size) {
  const total = list.length;
  const per = size > 0 ? size : Math.max(1, total);
  const pages = Math.max(1, Math.ceil(total / per));
  const p = Math.min(pages, Math.max(1, Math.floor(Number(page)) || 1));
  const start = (p - 1) * per;
  const items = list.slice(start, start + per);
  return { items, page: p, pages, total, from: total ? start + 1 : 0, to: start + items.length };
}

// ページ番号の並び。先頭・最後・いまの前後を出し、間が2ページ以上空くところは「…」にする
export function pageNumbers(page, pages) {
  const keep = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const sorted = [...keep].sort((a, b) => a - b);
  return sorted.flatMap((n, i) => {
    const gap = i ? n - sorted[i - 1] : 1;
    return gap === 1 ? [n] : gap === 2 ? [n - 1, n] : ['…', n];
  });
}
