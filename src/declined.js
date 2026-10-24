// 査定はしたが、結局売らなかったもの（見送り品）の記録。お客様が手元に持っているものの有力な情報になる（次回の訪問・営業の当てはめの判断に使う）。
// 営業が、買取を確認する画面で「今回は見送る」にしたものを、訪問の終了時に記録する。売らなかった理由は、聴取していないので、記録しない。
export const DECLINED_KEY = 'rq-mock-declined';

export const loadDeclined = () => {
  try {
    const list = JSON.parse(localStorage.getItem(DECLINED_KEY));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};

// 訪問ごとに1件。見送り品がなければ、その訪問の記録は残さない（あとから「売る」に変えた場合も）
export function recordDeclined({ visitId, phone, customerName, at, items }) {
  const rest = loadDeclined().filter((r) => r.visitId !== visitId);
  const kept = items.map((i) => ({ name: i.name, category: i.category ?? '', rank: i.rank ?? '', qty: i.qty ?? 1, price: i.price ?? 0 }));
  localStorage.setItem(DECLINED_KEY, JSON.stringify(kept.length ? [{ visitId, phone, customerName, at, items: kept }, ...rest] : rest));
}
