// 査定依頼のやり取り（営業 ⇄ 査定員のチャット）。1つの商品につき、1つのやり取りが続く。
// 状態: 依頼中（営業が最後に話した＝査定員の返信待ち）／回答済み（査定員が最後に話した）／完結（査定員が、やり取りを終えた）
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

// 相手の発言を、まだ読んでいないか。who: 'sales' | 'hq'
export const hasUnread = (a, who) => {
  const other = who === 'sales' ? 'hq' : 'sales';
  const readAt = a[`${who}ReadAt`] ?? 0;
  return messagesOf(a).some((m) => m.from === other && m.at > readAt);
};

export const markRead = (a, who, at) => ({ ...a, [`${who}ReadAt`]: at });
