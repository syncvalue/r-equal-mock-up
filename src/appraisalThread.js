// 査定依頼のやり取り（鑑定士 ⇄ 査定員のチャット）。1つの商品につき、1つのやり取りが続く。
// 状態: 依頼中（鑑定士が最後に話した＝査定員の返信待ち）／回答済み（査定員が最後に話した）／完結（査定員が、やり取りを終えた）
// 商品の承認は、査定依頼があるときは、完結していることが条件（canApprove）。依頼がなければ、いつでも承認できる。

// 古い形式の記録（備考・写真・回答だけを持つ）も、発言の並びとして読む
export const messagesOf = (a) => {
  if (a.messages) return a.messages;
  const first = { id: `${a.id}-0`, from: 'sales', text: a.note ?? '', photos: a.photos ?? [], at: a.createdAt };
  const reply = a.reply && { id: `${a.id}-1`, from: 'hq', text: a.reply.comment ?? '', price: a.reply.price ?? null, rank: a.reply.rank ?? null, tag: '', at: a.reply.at };
  return reply ? [first, reply] : [first];
};

// 商品のやり取り（同じ訪問・商品の、最新の依頼）
export const threadFor = (list, visitId, itemId) =>
  list.filter((a) => a.visitId === visitId && a.itemId === itemId).sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;

// 発言を足した新しい記録を返す。完結後に誰かが話したら、やり取りを再開する
export const addMessage = (a, msg) => {
  const id = `${a.id}-${messagesOf(a).length}`;
  return {
    ...a,
    messages: [...messagesOf(a), { photos: [], ...msg, id }],
    status: msg.from === 'hq' ? '回答済み' : '依頼中',
    closedAt: null,
  };
};

export const closeThread = (a, at) => ({ ...a, status: '完結', closedAt: at });

// 商品を承認してよいか。査定依頼があって完結していなければ、不可
export function canApprove(list, visitId, itemId) {
  const t = threadFor(list, visitId, itemId);
  if (!t || t.status === '完結') return { ok: true, reason: '' };
  return { ok: false, reason: `査定依頼が完結していません（${t.status}）。やり取りを完結してから承認してください。` };
}

// 想定販売価格が決まっているか（承認の条件）。商品に入っている、または、査定部の提案（返信・コメント）に入っている。
// 想定販売価格を入れるのは査定部だけ（鑑定士は入れない）。鑑定士が提案を商品に反映する前でも、査定部は承認できる
export function hasExpectedPrice(item, visitId, threads, comments) {
  if (item.expectedPrice > 0) return true;
  const sent = (threads ?? []).some((t) => t.visitId === visitId && t.itemId === item.id && messagesOf(t).some((m) => m.from === 'hq' && m.expectedPrice > 0));
  return sent || (comments ?? []).some((c) => c.visitId === visitId && c.itemId === item.id && c.expectedPrice > 0);
}

// 相手の発言を、まだ読んでいないか。who: 'sales' | 'hq'
export const hasUnread = (a, who) => {
  const other = who === 'sales' ? 'hq' : 'sales';
  const readAt = a[`${who}ReadAt`] ?? 0;
  return messagesOf(a).some((m) => m.from === other && m.at > readAt);
};

export const markRead = (a, who, at) => ({ ...a, [`${who}ReadAt`]: at });

// 査定員の提案（発言・コメント）: 提案査定額（買取金額）と、想定販売価格の、どちらか・両方。入っているものがあれば、鑑定士が商品に反映できる
export const hasProposal = (m) => Boolean(m.price || m.expectedPrice);
// 反映するときに、商品へ書き込む内容（入っている項目だけ。ランクは、提案査定額と一緒に）
export const adoptPatch = (m, item) => ({
  ...(m.price ? { price: m.price, rank: m.rank ?? item.rank } : {}),
  ...(m.expectedPrice ? { expectedPrice: m.expectedPrice } : {}),
});
// 反映のボタンの文言・済みの表示（提案に入っている項目で変わる）
export const adoptLabel = (m) => (m.price && m.expectedPrice ? '買取金額・想定販売価格に反映' : m.price ? '買取金額に反映' : '想定販売価格に反映');
