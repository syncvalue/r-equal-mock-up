// お客様の利用履歴（初めて／リピーター、何回目か）と、過去の評価。
// 過去の利用・評価は、ダミーの履歴に加えて、このアプリで保存した契約・評価も数える。
import { loadContracts, loadEvals } from './store.js';

const at = (date) => new Date(`${date}T10:00:00`).getTime();

// 電話番号をキーにした、過去のご利用（ダミー）。評価は、営業が記録した「お客様の評価」と同じ項目
const SEED = {
  '080-2345-6789': {
    visits: [{ at: at('2026-07-14'), items: 'ジュエリー', total: 185000 }, { at: at('2026-03-02'), items: '貴金属', total: 92000 }],
    evals: [{ savedAt: at('2026-07-14'), by: '営業 鈴木 一郎', overall: 5, attitude: '良好', repeat: '高い', wealth: '高そう', timing: '3か月以内',
      cats: ['ジュエリー・貴金属', 'ブランドバッグ'], flags: ['紹介が見込める'], memo: '亡くなったお母様の遺品整理で売却。次はバッグも見てほしいとのこと。話好きで、お茶を出してくださる。' }],
  },
  '080-5678-9012': {
    visits: [{ at: at('2026-08-20'), items: '腕時計', total: 640000 }],
    evals: [{ savedAt: at('2026-08-20'), by: '営業 田中 健', overall: 3, attitude: '普通', repeat: '普通', wealth: '普通', timing: '半年以内',
      cats: ['腕時計'], flags: ['価格交渉が強い', '他社と比較中'], memo: 'デイトナを売却。他社の見積もりを提示して交渉された。型番・相場を事前に調べておくとスムーズ。' }],
  },
  '080-8901-2345': {
    visits: [{ at: at('2026-09-05'), items: 'ブランドバッグ', total: 310000 }, { at: at('2026-05-18'), items: 'ジュエリー', total: 150000 }, { at: at('2026-01-22'), items: 'ブランドバッグ', total: 220000 }],
    evals: [{ savedAt: at('2026-09-05'), by: '営業 佐々木 美咲', overall: 4, attitude: '良好', repeat: '高い', wealth: '普通', timing: '1か月以内',
      cats: ['ブランドバッグ', 'ジュエリー・貴金属'], flags: ['家族の同意が必要'], memo: 'ご主人の同意が必要なので、事前にご在宅を確認する。' }],
  },
};

// 買取の実績のまとめ（コールセンターの受電時に見せる）。電話番号（複数可）に当たる、過去の買取を合わせる
export function purchaseSummary(phones) {
  const seen = new Set();
  const visits = [...new Set(phones.filter(Boolean))].flatMap((p) => historyOf({ phone: p }).visits)
    .filter((v) => { const k = `${v.at}/${v.total}`; return seen.has(k) ? false : (seen.add(k), true); })
    .sort((a, b) => b.at - a.at);
  return { count: visits.length, total: visits.reduce((n, v) => n + (v.total || 0), 0), latest: visits[0] ?? null };
}

// currentVisitId／before（今回の訪問の開始時刻）より前の記録だけを数える（今回の契約・評価は含めない）
export function historyOf(customer, { visitId = null, before = Infinity } = {}) {
  const seed = SEED[customer.phone] ?? { visits: [], evals: [] };
  const contracts = loadContracts()
    .filter((c) => c.customer?.phone === customer.phone && c.sentAt < before)
    .map((c) => ({ at: c.sentAt, items: c.items.map((i) => i.name).join('・'), total: c.total }));
  const evals = [...seed.evals, ...loadEvals().filter((e) => e.phone === customer.phone && e.visitId !== visitId)];
  const visits = [...seed.visits, ...contracts].sort((a, b) => b.at - a.at);
  return {
    visits, count: visits.length, isRepeat: visits.length > 0, ordinal: visits.length + 1,
    latestEval: evals.sort((a, b) => b.savedAt - a.savedAt)[0] ?? null,
  };
}
