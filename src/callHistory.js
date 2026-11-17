// 電話番号ごとの受電履歴。受け付けた予約・その変更・取消の記録から作り、予約にならなかった問い合わせ（ダミー）を加える。
// 新しい順。at はミリ秒、kind は 新規受付／日時変更／変更／取消／問合せ
import { loadCallLog, callsOfPhones, callNote } from './callLog.js';
const at = (s) => new Date(s.replace(' ', 'T') + ':00').getTime();

// 予約にならなかった問い合わせや、過去の受付（ダミー）。電話番号をキーにする
const SEED_CALLS = {
  '090-2468-1357': [
    { at: at('2026-09-18 11:20'), by: '渡辺', kind: '問合せ', note: '着物も買い取れるか質問。「次回の訪問時に、状態を見て相談」とご案内' },
    { at: at('2026-08-02 17:00'), by: '佐藤', kind: '前日確認の電話', note: 'つながった：8/3 の訪問を確認' },
    { at: at('2026-08-01 13:40'), by: '佐藤', kind: '日時変更', note: '訪問日時 8/2 → 8/3' },
    { at: at('2026-07-28 16:05'), by: '佐藤', kind: '新規受付', note: '8/3 訪問（ブランドバッグ）' },
    { at: at('2026-04-05 10:15'), by: '渡辺', kind: '新規受付', note: '4/12 訪問（腕時計）' },
    { at: at('2025-11-12 15:30'), by: '佐藤', kind: '新規受付', note: '11/20 訪問（貴金属）' },
  ],
  '080-8901-2345': [
    { at: at('2026-08-30 09:50'), by: '佐藤', kind: '新規受付', note: '9/5 訪問（ブランドバッグ）' },
    { at: at('2026-05-10 14:10'), by: '渡辺', kind: '取消', note: 'お客様のご都合（やめる）' },
  ],
};

// 1件ごとの、電話の向き（in＝お客様からの受電／out＝こちらからの架電）と、目的
const KIND_INFO = {
  新規受付: { dir: 'in', purpose: '訪問の予約' },
  日時変更: { dir: 'in', purpose: '予約の変更' },
  変更: { dir: 'in', purpose: '予約の変更' },
  取消: { dir: 'in', purpose: '予約の取消' },
  問合せ: { dir: 'in', purpose: '問い合わせ' },
  前日確認の電話: { dir: 'out', purpose: '前日確認' },
  鑑定士が架電: { dir: 'out', purpose: '再訪の相談' },
};
// 電話をした／受けた人。鑑定士の名前には、もともと「鑑定士」が付いている
const whoOf = (c) => (c.kind === '鑑定士が架電' ? c.by : `オペレーター ${c.by ?? ''}`.trim());
const withInfo = (c) => ({ ...c, ...KIND_INFO[c.kind], who: whoOf(c) });

const CONFIRM_RESULT = { reached: 'つながった', noanswer: 'つながらなかった' };
const digits = (s) => String(s ?? '').replace(/\D/g, '');
const stampMs = (r) => r.receivedTs ?? (Date.parse(String(r.receivedAt ?? '').replace(/\//g, '-').replace(/-(\d)(?=-|\s|$)/g, '-0$1')) || 0);
const changeMs = (s) => Date.parse(String(s ?? '').replace(/\//g, '-').replace(/-(\d)(?=-|\s|$)/g, '-0$1')) || 0;

// calls: 鑑定士が電話した記録（callLog.js）。指定がなければ、保存してあるもの。前日確認の電話（オペレーター）も、受付の記録から出す
export function callHistory(phones, reservations, calls = loadCallLog()) {
  const mine = [...new Set(phones.map(digits).filter((d) => d.length >= 10))];
  if (!mine.length) return [];
  const has = (p) => mine.includes(digits(p));
  const out = [];
  Object.entries(SEED_CALLS).filter(([p]) => has(p)).forEach(([, list]) => out.push(...list));
  reservations.filter((r) => [r.customer.phone, r.customer.phone2].some(has)).forEach((r) => {
    out.push({ at: stampMs(r), by: r.operator, kind: '新規受付', note: `${r.date.slice(5).replace('-', '/')} ${r.start}〜 訪問（${r.hearing?.wants ?? ''}）` });
    (r.changes ?? []).forEach((c) => out.push({ at: changeMs(c.at), by: c.by, kind: '変更', note: (c.diff ?? []).map((d) => `${d.label}：${d.from} → ${d.to}`).join(' ／ ') || '内容を更新' }));
    (r.confirmCalls ?? []).forEach((c) => out.push({ at: c.at, by: c.by, kind: '前日確認の電話', note: `${CONFIRM_RESULT[c.result] ?? c.result}${c.memo ? `：${c.memo}` : ''}` }));
    if (r.status === 'cancelled') out.push({ at: changeMs(r.cancelledAt), by: r.cancelledBy, kind: '取消', note: r.cancelReason ?? '' });
  });
  callsOfPhones(calls, phones).forEach((c) => out.push({ at: c.at, by: c.by, kind: '鑑定士が架電', note: callNote(c), userId: c.userId }));
  return out.sort((a, b) => b.at - a.at).map(withInfo);
}
