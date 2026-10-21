// 買取アプリ ⇄ GMOサイン(ダミー) 間の受け渡し。別タブでも共有できるよう localStorage を使う。
const KEY = 'rq-mock-contracts';

export const loadContracts = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? [];
  } catch {
    return [];
  }
};

const save = (list) => localStorage.setItem(KEY, JSON.stringify(list));

export const upsertContract = (record) => {
  const list = loadContracts();
  save(list.some((c) => c.id === record.id) ? list.map((c) => (c.id === record.id ? record : c)) : [record, ...list]);
};

export const newContractId = () => {
  const now = new Date();
  return `GS${now.toISOString().slice(0, 10).replaceAll('-', '')}-${String(now.getTime()).slice(-5)}`;
};

export const GMO_URL = '/gmosign/index.html';

// 本社査定依頼（営業 → 本社査定部 → 回答）
const AP_KEY = 'rq-mock-appraisals';
export const AP_STORAGE_KEY = AP_KEY;

export const loadAppraisals = () => {
  try {
    return JSON.parse(localStorage.getItem(AP_KEY)) ?? [];
  } catch {
    return [];
  }
};

export const upsertAppraisal = (record) => {
  const list = loadAppraisals();
  const next = list.some((a) => a.id === record.id) ? list.map((a) => (a.id === record.id ? record : a)) : [record, ...list];
  localStorage.setItem(AP_KEY, JSON.stringify(next));
};

export const newAppraisalId = () => `AP-${Date.now().toString(36).toUpperCase()}`;

export const HQ_URL = '/honsha/index.html';

// 訪問ごとの進行状況（本社査定部のリアルタイム画面用）。訪問ID → スナップショット
export const LIVE_KEY = 'rq-mock-live';

export const loadLive = () => {
  try {
    return JSON.parse(localStorage.getItem(LIVE_KEY)) ?? {};
  } catch {
    return {};
  }
};

export const publishLive = (snapshot) => {
  try {
    localStorage.setItem(LIVE_KEY, JSON.stringify({ ...loadLive(), [snapshot.visitId]: snapshot }));
  } catch {
    // 容量超過などは無視（モック）
  }
};

export const clearEndedLive = () => {
  const next = Object.fromEntries(Object.entries(loadLive()).filter(([, v]) => !v.endedAt));
  localStorage.setItem(LIVE_KEY, JSON.stringify(next));
};

// 本社査定部 → 営業へのコメント（査定額への意見など）。営業側で確認チェックができる
export const COMMENT_KEY = 'rq-mock-comments';

export const loadComments = () => {
  try {
    return JSON.parse(localStorage.getItem(COMMENT_KEY)) ?? [];
  } catch {
    return [];
  }
};

export const upsertComment = (record) => {
  const list = loadComments();
  const next = list.some((c) => c.id === record.id) ? list.map((c) => (c.id === record.id ? record : c)) : [record, ...list];
  localStorage.setItem(COMMENT_KEY, JSON.stringify(next));
};

export const newCommentId = () => `CM-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

export const COMMENT_TAGS = ['安すぎる', '高すぎる', '要再確認', 'その他'];

// デモ用: マスタ以外のトランザクションデータ（契約・査定依頼・コメント・訪問状況）をすべて消す
export const clearTransactions = () => {
  [KEY, AP_KEY, COMMENT_KEY, LIVE_KEY, APPROVAL_KEY].forEach((k) => localStorage.removeItem(k));
  sessionStorage.removeItem('gmo-auth');
};

export const RESET_CONFIRM = '契約・査定依頼・コメント・訪問状況のデータをすべて初期化します。よろしいですか？（商品マスタは消えません）';

// 買取承認（本社査定部が、商品が登録された時点から随時 承認／差戻し）。承認時点の金額・ランク・個数のスナップショットを持つ
export const APPROVAL_KEY = 'rq-mock-approvals';

export const loadApprovals = () => {
  try {
    return JSON.parse(localStorage.getItem(APPROVAL_KEY)) ?? [];
  } catch {
    return [];
  }
};

export const upsertApproval = (record) => {
  const list = loadApprovals();
  const next = list.some((a) => a.id === record.id) ? list.map((a) => (a.id === record.id ? record : a)) : [record, ...list];
  localStorage.setItem(APPROVAL_KEY, JSON.stringify(next));
};

export const newApprovalId = () => `AV-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

// 訪問・商品ごとの最新の承認レコード
export const latestApproval = (list, visitId, itemId) =>
  list.filter((a) => a.visitId === visitId && a.itemId === itemId).sort((a, b) => b.requestedAt - a.requestedAt)[0] ?? null;

// 承認時の内容と、現在の明細が一致しているか（変更されていたら承認は無効）
export const sameSnapshot = (rec, item) => Boolean(rec && item && rec.price === item.price && rec.rank === item.rank && rec.qty === item.qty);

// 承認の状態: none（未承認）／ok／ng（差戻し）／stale（承認・差戻し後に内容が変更された）
export const approvalState = (rec, item) => {
  if (!rec) return 'none';
  if (!sameSnapshot(rec, item)) return 'stale';
  return { 承認: 'ok', 差戻し: 'ng' }[rec.status] ?? 'none';
};
