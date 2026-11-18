// ランクの色（配車確定のカレンダー、ランクの札）。鑑定士のランクも、顧客ランクも、同じ色で表す（SS鑑定士とSS顧客は同じ色、S鑑定士とS顧客は同じ色…）。
// 暖かい色ほど上位（熱いほど高ランク）: SS＝赤／S＝橙／A＝緑／B＝青。隣り合うランクでも、はっきり見分けがつく色にする。画面から独立した純関数
// fill=帯・見出し・札の塗り／edge=枠線／text=文字／tint=薄い背景
export const RANK_COLORS = {
  SS: { fill: '#dc2626', edge: '#7f1d1d', text: '#ffffff', tint: '#fecaca' },
  S: { fill: '#f97316', edge: '#9a3412', text: '#0f172a', tint: '#fed7aa' },
  A: { fill: '#15803d', edge: '#14532d', text: '#ffffff', tint: '#bbf7d0' },
  B: { fill: '#2563eb', edge: '#1e3a8a', text: '#ffffff', tint: '#bfdbfe' },
};
// ランクが分からない（買取の実績がない新規のお客様・元からの予定）
export const UNRANKED = { fill: '#f8fafc', edge: '#94a3b8', text: '#0f172a', tint: '#ffffff' };
export const rankColor = (rank) => RANK_COLORS[rank] ?? UNRANKED;
// ランクの札（鑑定士の名前の横・顧客ランク）の色
export const rankBadgeStyle = (rank) => { const c = rankColor(rank); return `background:${c.fill};color:${c.text}`; };

// 状態は枠線で表す: 確定済み＝実線／仮確定（未確定）＝点線／確定から仮確定に戻った＝黒の二重線（ランクの色と重ならないように）
export const BLOCK_STATES = ['confirmed', 'tentative', 'reverted'];
export function boardBlockStyle(rank, state) {
  const c = rankColor(rank);
  const border = state === 'tentative' ? `3px dashed ${c.edge}` : state === 'reverted' ? '4px double #0f172a' : `3px solid ${c.edge}`;
  return `background:${c.fill};color:${c.text};border:${border};background-clip:padding-box`; // padding-box: 点線・二重線のすき間は、塗らない
}
// 鑑定士の見出し: ランクの色（帯と同じ色）で塗る。文字は、その色の上で読める色
export const staffHeadStyle = (rank) => { const c = rankColor(rank); return `background:${c.fill};color:${c.text}`; };
// 見出しの上の札は、見出しと同じ色だと見えなくなるので、反転（白地に、ランクの色の文字）
export const rankBadgeInverse = (rank) => `background:#ffffff;color:${rankColor(rank).edge}`;
