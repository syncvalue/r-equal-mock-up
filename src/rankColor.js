// ランクの色（配車確定のカレンダー、ランクの札）。鑑定士のランクも、顧客ランクも、同じ色で表す（SS鑑定士とSS顧客は同じ色、S鑑定士とS顧客は同じ色…）。
// ランクごとに、はっきり違う色: SS＝紫／S＝青／A＝緑／B＝灰。画面から独立した純関数
// fill=帯・札の塗り／edge=枠線／text=文字／tint=鑑定士の見出しの薄い背景
export const RANK_COLORS = {
  SS: { fill: '#6d28d9', edge: '#4c1d95', text: '#ffffff', tint: '#ddd6fe' },
  S: { fill: '#1d4ed8', edge: '#1e3a8a', text: '#ffffff', tint: '#bfdbfe' },
  A: { fill: '#15803d', edge: '#14532d', text: '#ffffff', tint: '#bbf7d0' },
  B: { fill: '#64748b', edge: '#334155', text: '#ffffff', tint: '#e2e8f0' },
};
// ランクが分からない（買取の実績がない新規のお客様・元からの予定）
export const UNRANKED = { fill: '#f8fafc', edge: '#94a3b8', text: '#0f172a', tint: '#ffffff' };
export const rankColor = (rank) => RANK_COLORS[rank] ?? UNRANKED;
// ランクの札（鑑定士の名前の横・顧客ランク）の色
export const rankBadgeStyle = (rank) => { const c = rankColor(rank); return `background:${c.fill};color:${c.text}`; };

// 状態は枠線で表す: 確定済み＝実線／仮確定（未確定）＝点線／確定から仮確定に戻った＝橙の二重線
export const BLOCK_STATES = ['confirmed', 'tentative', 'reverted'];
export function boardBlockStyle(rank, state) {
  const c = rankColor(rank);
  const border = state === 'tentative' ? `3px dashed ${c.edge}` : state === 'reverted' ? '4px double #d97706' : `3px solid ${c.edge}`;
  return `background:${c.fill};color:${c.text};border:${border};background-clip:padding-box`; // padding-box: 点線・二重線のすき間は、塗らない
}
// 鑑定士の見出し: ランクの薄い背景と、上の太い線
export const staffHeadStyle = (rank) => { const c = rankColor(rank); return `background:${c.tint};border-top:4px solid ${c.fill}`; };
