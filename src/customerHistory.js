// お客様の利用履歴（初めて／リピーター、何回目か）と、過去の評価。
// 過去の利用・評価は、ダミーの履歴に加えて、このアプリで保存した契約・評価も数える。
import { loadContracts, loadEvals } from './store.js';
import { loadCustomerEval, saveCustomerEval, customerEvalFromVisit } from './customerEval.js';
import { loadDeclined } from './declined.js';

// 買取の品目の1行（名前・数量・金額）。品目の内訳がない記録は、品目名と合計から1行にする
const L = (name, price, qty = 1) => ({ name, qty, price });
export const visitLines = (v) => (v.lines?.length ? v.lines : [{ name: v.items, qty: 1, price: v.total }]); // price は単価（金額 = 単価 × 数量）
export const lineTotal = (l) => l.price * (l.qty ?? 1);

const at = (date) => new Date(`${date}T10:00:00`).getTime();

// 電話番号をキーにした、過去のご利用（ダミー）。評価は、営業が記録した「お客様の評価」と同じ項目
const SEED = {
  // 音声入力デモで受電するお客様（山田 花子）。過去に3回の買取実績がある見本
  '090-2468-1357': {
    declined: [{ at: at('2026-04-12'), items: [{ name: 'ロレックス エクスプローラー', category: '腕時計', qty: 1, price: 450000 }] }],
    profile: { rank: 'A', trouble: { level: 'none', tags: [] }, cooloff: [] },
    customer: { name: '山田 花子', kana: 'ヤマダ ハナコ', zip: '545-0052', address: '大阪府大阪市阿倍野区阿倍野筋1-2-3', occupation: '主婦', birth: '1964-02-11' },
    visits: [
      { at: at('2026-08-03'), items: 'ブランドバッグ', total: 185000, lines: [L('ルイ・ヴィトン スピーディ30', 95000), L('シャネル マトラッセ チェーンウォレット', 90000)] },
      { at: at('2026-04-12'), items: '腕時計', total: 420000, lines: [L('ロレックス デイトジャスト', 380000), L('オメガ シーマスター（ベルト・箱付き）', 40000)] },
      { at: at('2025-11-20'), items: '貴金属', total: 95000, lines: [L('K18 ネックレス', 52000), L('プラチナ 指輪', 43000)] }],
    evals: [
      { savedAt: at('2026-08-03'), by: '営業 佐々木 美咲', overall: 4, attitude: '良好', repeat: '高い', wealth: '普通', timing: '3か月以内',
        cats: ['ブランドバッグ', '腕時計'], flags: ['紹介が見込める'], memo: 'ご主人の同意を得てから売却される。次は着物も見てほしいとのこと。' },
      { savedAt: at('2026-04-12'), by: '営業 田中 健', overall: 5, attitude: '良好', repeat: '高い', wealth: '高そう', timing: '3か月以内',
        cats: ['腕時計'], flags: [], memo: 'ロレックスを即決で売却。時計のコレクションがまだあるとのこと。' },
      { savedAt: at('2025-11-20'), by: '営業 鈴木 一郎', overall: 3, attitude: '普通', repeat: '普通', wealth: '普通', timing: '半年以内',
        cats: ['貴金属・ジュエリー'], flags: ['価格交渉が強い'], memo: '初回。金の相場を気にされていた。買取額の根拠を丁寧に説明すると納得された。' }],
  },
  '080-2345-6789': {
    profile: { rank: 'B', trouble: { level: 'none', tags: [] }, cooloff: [] },
    visits: [{ at: at('2026-07-14'), items: 'ジュエリー', total: 185000 }, { at: at('2026-03-02'), items: '貴金属', total: 92000 }],
    evals: [{ savedAt: at('2026-07-14'), by: '営業 鈴木 一郎', overall: 5, attitude: '良好', repeat: '高い', wealth: '高そう', timing: '3か月以内',
      cats: ['ジュエリー・貴金属', 'ブランドバッグ'], flags: ['紹介が見込める'], memo: '亡くなったお母様の遺品整理で売却。次はバッグも見てほしいとのこと。話好きで、お茶を出してくださる。' }],
  },
  '080-5678-9012': {
    profile: { rank: 'A', trouble: { level: 'caution', tags: ['価格交渉が強い', '他社と比較中'], memo: '他社の見積もりを提示して値上げ交渉をされる。相場を調べてから訪問する' }, cooloff: [] },
    visits: [{ at: at('2026-08-20'), items: '腕時計', total: 640000 }],
    evals: [{ savedAt: at('2026-08-20'), by: '営業 田中 健', overall: 3, attitude: '普通', repeat: '普通', wealth: '普通', timing: '半年以内',
      cats: ['腕時計'], flags: ['価格交渉が強い', '他社と比較中'], memo: 'デイトナを売却。他社の見積もりを提示して交渉された。型番・相場を事前に調べておくとスムーズ。' }],
  },
  '080-8901-2345': {
    declined: [{ at: at('2026-09-05'), items: [{ name: 'エルメス ケリー28', category: 'ブランドバッグ', qty: 1, price: 380000 }, { name: 'ヴィトン ダミエ ボストン', category: 'ブランドバッグ', qty: 1, price: 60000 }] }, { at: at('2026-05-18'), items: [{ name: '真珠のネックレス（形見）', category: 'ジュエリー・貴金属', qty: 1, price: 120000 }] }],
    profile: { rank: 'A', trouble: { level: 'caution', tags: ['家族の同意が必要'], memo: 'ご主人の同意が必要。事前にご在宅を確認する' }, cooloff: [{ at: at('2026-01-30'), items: 'ブランドバッグ', memo: 'ご家族の反対で、契約の翌日に連絡あり' }] },
    visits: [
      { at: at('2026-09-05'), items: 'ブランドバッグ', total: 310000, lines: [L('ルイ・ヴィトン ネヴァーフル MM', 145000), L('ルイ・ヴィトン ポシェット', 95000), L('シャネル チェーンウォレット', 70000)] },
      { at: at('2026-05-18'), items: 'ジュエリー', total: 150000, lines: [L('ダイヤ 指輪', 80000), L('K18 ネックレス', 45000), L('パール イヤリング', 25000)] },
      { at: at('2026-01-22'), items: 'ブランドバッグ', total: 220000, lines: [L('エルメス ガーデンパーティ', 90000), L('グッチ ショルダーバッグ', 45000), L('プラダ ナイロントート', 30000), L('コーチ ハンドバッグ', 5000, 2), L('フェンディ 財布', 25000), L('セリーヌ ミニバッグ', 20000)] }],
    evals: [{ savedAt: at('2026-09-05'), by: '営業 佐々木 美咲', overall: 4, attitude: '良好', repeat: '高い', wealth: '普通', timing: '1か月以内',
      cats: ['ブランドバッグ', 'ジュエリー・貴金属'], flags: ['家族の同意が必要'], memo: 'ご主人の同意が必要なので、事前にご在宅を確認する。' }],
  },
  // 以下は、サンプルの受付のお客様（ランク・厄介度・クーリングオフ歴の見本）
  '090-5050-6060': {
    declined: [{ at: at('2026-09-12'), items: [{ name: 'パテック・フィリップ カラトラバ', category: '腕時計', qty: 1, price: 1200000 }, { name: 'ルイ・ヴィトン トランク（大）', category: 'ブランドバッグ', qty: 1, price: 150000 }] }, { at: at('2026-02-18'), items: [{ name: 'ダイヤ ネックレス 2.0ct', category: 'ジュエリー・貴金属', qty: 1, price: 780000 }] }],
    customer: { name: '前川 玲子', kana: 'マエカワ レイコ', zip: '543-0001', address: '大阪府大阪市天王寺区上本町6-3-2' },
    profile: { rank: 'S', trouble: { level: 'alert', tags: ['クレームが多い', '売却に至らないことが多い'], memo: '資産は多いが、査定額への不満が強く、成約まで時間がかかる。リーダーなど経験のある営業が対応する' }, cooloff: [{ at: at('2026-06-20'), items: 'エルメス', memo: '契約の3日後に、金額への不満でクーリングオフ' }, { at: at('2025-12-04'), items: '宝飾品', memo: '契約の翌日に、家族の意向で' }] },
    visits: [
      { at: at('2026-09-12'), items: 'ブランドバッグ・時計', total: 1250000, lines: [L('エルメス バーキン30', 520000), L('エルメス ケリー28', 330000), L('ルイ・ヴィトン モノグラム トランク', 120000), L('ロレックス サブマリーナ', 180000), L('カルティエ タンク', 60000), L('シャネル ボーイシャネル', 40000)] },
      { at: at('2026-02-18'), items: 'ジュエリー', total: 860000, lines: [L('ダイヤ リング 1.2ct', 420000), L('プラチナ ネックレス', 150000), L('K18 ブレスレット', 90000), L('ルビー ブローチ', 70000), L('パール ネックレス（南洋）', 80000), L('K18 イヤリング', 15000, 2), L('ピアス（ダイヤ）', 10000, 2)] },
      { at: at('2025-10-07'), items: '骨董', total: 540000, lines: [L('伊万里焼 大皿', 180000), L('掛け軸（日本画）', 150000), L('茶道具 一式', 120000), L('銀製 茶托', 6000, 10), L('象牙 置物', 30000)] }],
    evals: [
      { savedAt: at('2026-09-12'), by: '営業 田中 健', overall: 3, attitude: '難あり', repeat: '普通', wealth: '高そう', timing: '3か月以内',
        cats: ['ブランドバッグ', '腕時計'], flags: ['価格交渉が強い', '他社と比較中'], memo: 'バーキンの査定額に不満が強く、2時間以上かかった。他社の見積もりを提示された。' },
      { savedAt: at('2026-02-18'), by: '営業 佐藤 大輔', overall: 2, attitude: '難あり', repeat: '低い', wealth: '高そう', timing: '半年以内',
        cats: ['ジュエリー・貴金属'], flags: ['クレームが多い'], memo: '査定額への不満を繰り返し言われた。契約後の連絡も多い。' },
      { savedAt: at('2025-10-07'), by: '営業 田中 健', overall: 4, attitude: '良好', repeat: '普通', wealth: '高そう', timing: '3か月以内',
        cats: ['着物・骨董'], flags: [], memo: '骨董を中心に売却。初回は穏やかだった。' }],
  },
  '06-6334-9988': {
    declined: [{ at: at('2026-08-25'), items: [{ name: 'ダイヤ リング 3.0ct', category: 'ジュエリー・貴金属', qty: 1, price: 900000 }] }],
    customer: { name: '小山 敏子', kana: 'コヤマ トシコ', zip: '561-0881', address: '大阪府豊中市庄内西町3-4-5' },
    profile: { rank: 'S', trouble: { level: 'none', tags: [] }, cooloff: [] },
    visits: [{ at: at('2026-08-25'), items: 'ジュエリー', total: 980000 }, { at: at('2026-03-30'), items: '貴金属', total: 420000 }],
    evals: [],
  },
  '080-3322-1180': {
    customer: { name: '中川 昭夫', kana: 'ナカガワ アキオ', zip: '590-0956', address: '大阪府堺市堺区南花田口町2-1-8' },
    profile: { rank: 'B', trouble: { level: 'caution', tags: ['価格交渉が強い'], memo: '相場より高い金額を求められる' }, cooloff: [] },
    visits: [{ at: at('2026-07-02'), items: '腕時計', total: 260000 }],
    evals: [],
  },
  '090-9922-3344': {
    customer: { name: '藤本 雅子', kana: 'フジモト マサコ', zip: '530-0016', address: '大阪府大阪市北区中崎西2-4-12' },
    profile: { rank: 'B', trouble: { level: 'alert', tags: ['文句が多い', '売るまでに時間がかかる'], memo: '訪問のたびに、条件への不満を言われる。時間に余裕をもって訪問する' }, cooloff: [{ at: at('2026-04-09'), items: '着物', memo: '契約の2日後に、やはり手元に残したいとのことで' }] },
    visits: [{ at: at('2026-06-01'), items: '着物', total: 230000 }],
    evals: [],
  },
  '090-4411-2201': {
    customer: { name: '田村 恵子', kana: 'タムラ ケイコ', zip: '564-0053', address: '大阪府吹田市江坂町1-12-3' },
    profile: { rank: 'C', trouble: { level: 'none', tags: [] }, cooloff: [] },
    visits: [{ at: at('2026-05-14'), items: '婦人服', total: 48000 }],
    evals: [],
  },
};

// 履歴にお客様の情報（氏名・住所など）を持つ人。コールセンターが、電話番号から「過去にご利用あり」を出すのに使う
export const historyCustomers = () => Object.entries(SEED).filter(([, v]) => v.customer).map(([phone, v]) => ({ ...v.customer, phone }));

// ---- お客様のランク・厄介度・クーリングオフ歴 ------------------------------------------------
// 顧客ランク: 資産・今後の売却の見込み（S〜C。高いほど、売るものが多そう）。登録がなければ、これまでの総買取額から自動で決める。買取の実績がなければ null（新規）
// 厄介度: none=なし / caution=注意 / alert=要注意（金があっても売ってくれない・文句が多い など）。ランクとは別の軸
export const CUSTOMER_RANKS = ['S', 'A', 'B', 'C'];
export const TROUBLE_LABEL = { none: '', caution: '注意', alert: '要注意' };
const AUTO_RANK = [[1000000, 'S'], [500000, 'A'], [200000, 'B'], [1, 'C']];

export function customerProfile(phones) {
  const list = [...new Set(phones.filter(Boolean))];
  const seeds = list.map((p) => SEED[p]).filter(Boolean);
  const stored = loadCustomerEval(list); // 登録されたお客様の評価（訪問の評価とは別に管理）
  const seedProfile = seeds.find((s) => s.profile)?.profile ?? null;
  const manual = stored ?? seedProfile;
  const sum = purchaseSummary(list);
  const autoRank = AUTO_RANK.find(([min]) => sum.total >= min)?.[1] ?? null;
  const trouble = manual?.trouble ?? { level: 'none', tags: [] }; // 厄介度は、人が登録したものだけ（営業の評価から、自動では上げない）
  const cooloff = [...(stored?.cooloff?.length ? stored.cooloff : seedProfile?.cooloff ?? [])].sort((a, b) => b.at - a.at); // クーリングオフ歴は、契約の記録。お客様の評価を登録し直しても、消えない
  return {
    rank: manual?.rank ?? autoRank, rankAuto: !manual?.rank && Boolean(autoRank), purchase: sum,
    trouble: { level: trouble.level, tags: trouble.tags ?? [], memo: trouble.memo ?? '' }, cooloff,
    declined: declinedList(list).length, memo: manual?.memo ?? '', meta: stored ? { by: stored.updatedBy, at: stored.updatedAt, source: stored.source } : null,
    known: Boolean(manual) || sum.count > 0,
  };
}

// 営業の評価・メモは、訪問ごとに登録される。その訪問の評価を探す（訪問の識別子があればそれ、なければ同じ日）
const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
export const evalOfVisit = (v, evals) => evals.find((e) => (v.visitId && e.visitId ? e.visitId === v.visitId : sameDay(e.savedAt, v.at))) ?? null;

// 査定したが、売らなかったもの（見送り品）。電話番号（複数可）。新しい回の品から。サンプルの履歴と、営業のタブレットで記録したものを合わせる
export function declinedList(phones) {
  const list = [...new Set(phones.filter(Boolean))];
  const seeds = list.flatMap((p) => (SEED[p]?.declined ?? []).map((d) => ({ ...d, visitId: null })));
  const digitsOf = (x) => String(x ?? '').replace(/\D/g, '');
  const stored = loadDeclined().filter((r) => list.some((p) => digitsOf(p) === digitsOf(r.phone)));
  return [...seeds, ...stored].sort((a, b) => b.at - a.at).flatMap((d) => d.items.map((i) => ({ ...i, at: d.at, visitId: d.visitId })));
}

// お客様の詳細（配車係が、誰を当てるかを判断するための材料）。買取の履歴、営業の評価、前回までの担当、ランク・厄介度・クーリングオフ歴をまとめる。電話番号は複数可
export function customerDossier(phones) {
  const list = [...new Set(phones.filter(Boolean))];
  const hist = list.map((p) => historyOf({ phone: p }));
  const seen = new Set();
  const visits = hist.flatMap((h) => h.visits).filter((v) => { const k = `${v.at}/${v.total}`; return seen.has(k) ? false : (seen.add(k), true); }).sort((a, b) => b.at - a.at);
  const evalKeys = new Set();
  const evals = list.flatMap((p) => [...(SEED[p]?.evals ?? []), ...loadEvals().filter((e) => e.phone === p)])
    .filter((e) => { const k = `${e.savedAt}/${e.by}`; return evalKeys.has(k) ? false : (evalKeys.add(k), true); }).sort((a, b) => b.savedAt - a.savedAt);
  const profile = customerProfile(list);
  const visitsWithEval = visits.map((v) => ({ ...v, eval: evalOfVisit(v, evals) })); // 各回に、その回の評価・メモを結びつける
  const total = visits.reduce((n, v) => n + (v.total || 0), 0);
  const declined = declinedList(list);
  return {
    profile, declined, visits: visitsWithEval, evals, total, count: visits.length, average: visits.length ? Math.round(total / visits.length) : 0,
    staff: [...new Set(evals.map((e) => String(e.by).replace(/^営業\s*/, '')))], // これまでに担当した営業（評価を残した順に、新しい方から）
  };
}

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
    .map((c) => ({ at: c.sentAt, items: c.items.map((i) => i.name).join('・'), total: c.total, visitId: c.visitId, lines: c.items.map((i) => ({ name: i.name, qty: i.qty ?? 1, price: i.price })) }));
  const evals = [...seed.evals, ...loadEvals().filter((e) => e.phone === customer.phone && e.visitId !== visitId)];
  const visits = [...seed.visits, ...contracts].sort((a, b) => b.at - a.at).map((v) => ({ ...v, eval: evalOfVisit(v, evals) })); // 各訪問に、その訪問の評価を結びつける
  return {
    visits, count: visits.length, isRepeat: visits.length > 0, ordinal: visits.length + 1,
    latestEval: evals.sort((a, b) => b.savedAt - a.savedAt)[0] ?? null,
  };
}

// 営業が訪問の評価を保存したとき、これが初めての訪問で、お客様の評価が未登録なら、その訪問の評価を、お客様の評価の初期値にする
export function setFirstVisitCustomerEval(record, { before = Infinity } = {}) {
  const phone = record.phone;
  if (!phone || loadCustomerEval([phone]) || SEED[phone]?.profile) return false;
  if (historyOf({ phone }, { visitId: record.visitId, before }).count > 0) return false; // 2回目以降の訪問は、自動では設定しない
  saveCustomerEval(phone, customerEvalFromVisit(record), { by: '自動（初回の訪問の評価）', source: 'first-visit' });
  return true;
}
