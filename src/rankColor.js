// ランクの色（配車確定のカレンダー）。鑑定士のランクも、顧客ランクも、同じ色で表す（SSのお客様には、SSの鑑定士＝同じ色の列を当てる）。
// ランクは順序のある値なので、1色（藍）の濃さで表す: SS＝いちばん濃い／B＝いちばん薄い。画面から独立した純関数
// fill=帯の塗り／edge=枠線／text=帯の文字／tint=鑑定士の見出しの薄い背景
export const RANK_COLORS = {
  SS: { fill: '#312e81', edge: '#1e1b4b', text: '#ffffff', tint: '#c7d2fe' },
  S: { fill: '#4f46e5', edge: '#312e81', text: '#ffffff', tint: '#dde3ff' },
  A: { fill: '#818cf8', edge: '#4338ca', text: '#0f172a', tint: '#ebeeff' },
  B: { fill: '#c7d2fe', edge: '#6366f1', text: '#0f172a', tint: '#f5f6ff' },
};
// ランクが分からない（買取の実績がない新規のお客様・元からの予定）
export const UNRANKED = { fill: '#f1f5f9', edge: '#64748b', text: '#0f172a', tint: '#f8fafc' };
export const rankColor = (rank) => RANK_COLORS[rank] ?? UNRANKED;

// 状態は枠線で表す: 確定済み＝実線／仮確定（未確定）＝点線／確定から仮確定に戻った＝橙の二重線
export const BLOCK_STATES = ['confirmed', 'tentative', 'reverted'];
export function boardBlockStyle(rank, state) {
  const c = rankColor(rank);
  const border = state === 'tentative' ? `3px dashed ${c.edge}` : state === 'reverted' ? '4px double #d97706' : `3px solid ${c.edge}`;
  return `background:${c.fill};color:${c.text};border:${border};background-clip:padding-box`; // padding-box: 点線・二重線のすき間は、塗らない
}
// 鑑定士の見出し: ランクの薄い背景と、上の太い線
export const staffHeadStyle = (rank) => { const c = rankColor(rank); return `background:${c.tint};border-top:4px solid ${c.fill}`; };
