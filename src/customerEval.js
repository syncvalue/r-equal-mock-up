// お客様情報に紐づく評価（顧客ランク・厄介度・メモ）。アポ（訪問）ごとの評価とは別に管理する。
// アポごとの評価は、営業がアポごとに入力する（store.js の EVAL_KEY）。お客様の評価は、それを受けて、誰かが登録する（いまは配車係）。
// 最初のアポのときは、そのアポの評価を、そのままお客様の評価として設定してよい（あとから、登録し直せる）。
export const CUSTOMER_EVAL_KEY = 'rq-mock-customer-profiles';

const digits = (s) => String(s ?? '').replace(/\D/g, '');

const loadAll = () => {
  try {
    const v = JSON.parse(localStorage.getItem(CUSTOMER_EVAL_KEY));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
};

// 電話番号（複数可）から、登録済みのお客様の評価を探す
export function loadCustomerEval(phones) {
  const all = loadAll();
  for (const p of phones.filter(Boolean)) if (all[digits(p)]) return all[digits(p)];
  return null;
}

// 登録する。source: manual=人が登録／first-visit=初回のアポの評価から自動で設定
export function saveCustomerEval(phone, data, { by, source = 'manual', now = Date.now() } = {}) {
  const all = loadAll();
  all[digits(phone)] = {
    phone, rank: data.rank || null,
    trouble: { level: data.trouble?.level ?? 'none', tags: data.trouble?.tags ?? [], memo: data.trouble?.memo ?? '' },
    memo: data.memo ?? '', updatedAt: now, updatedBy: by, source,
  };
  localStorage.setItem(CUSTOMER_EVAL_KEY, JSON.stringify(all));
}

// 営業が入力したアポの評価から、お客様の評価の初期値を作る（初回のアポのとき）
export function customerEvalFromVisit(e) {
  const rank = { 高そう: 'A', 普通: 'B', 低そう: 'C' }[e.wealth] ?? null; // 資力 → 顧客ランク
  const flags = (e.flags ?? []).filter((f) => f !== '紹介が見込める');
  const level = flags.includes('クレーム注意') ? 'alert' : flags.length || e.attitude === '難あり' ? 'caution' : 'none';
  return { rank, trouble: { level, tags: flags, memo: '' }, memo: e.memo ?? '' };
}
