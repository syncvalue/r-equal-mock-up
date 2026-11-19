// チラシの検索（進捗・エリア・配布方法・入稿期限・フリーワード）。デザイナーなど、やるべき作業を確認するため。画面から独立した純関数
import { stageOf, stageLabel, mediaOf, shiftDay } from './flyers.js';
import { areaOf } from './areaColor.js';
import { windowStart } from './flyerDashboard.js';

export const DUE_OPTIONS = [
  { key: 'overdue', label: '期限切れ' },
  { key: 'today', label: '今日' },
  { key: 'soon', label: '3日以内' },
];
// 進捗の選択肢。todo＝作業が残っている（未着手・制作中）、off＝無効
export const STAGE_FILTERS = [
  { key: '', label: 'すべて' },
  { key: 'todo', label: '作業が残っている' },
  { key: 'plan', label: '未着手' },
  { key: 'design', label: '制作中' },
  { key: 'submitted', label: '入稿済み' },
  { key: 'distributed', label: '配布済み' },
  { key: 'off', label: '無効' },
];

// 全角の英数字を半角にして、小文字にそろえる
const norm = (s) => String(s ?? '').replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).toLowerCase();

const stageMatch = (f, stage, today) => {
  if (!stage) return true;
  if (stage === 'off') return !f.active;
  if (!f.active) return false;
  const st = stageOf(f, today);
  return stage === 'todo' ? st === 'plan' || st === 'design' : st === stage;
};

const dueMatch = (f, due, today) => {
  if (!due) return true;
  if (!f.active || !f.deadline || !['plan', 'design'].includes(stageOf(f, today))) return false;
  return due === 'overdue' ? f.deadline < today : due === 'today' ? f.deadline === today : f.deadline > today && f.deadline <= shiftDay(today, 3);
};

const haystack = (f, today) => norm([f.id, f.name, f.area, f.note, f.adType, mediaOf(f.media)?.label, f.active ? stageLabel(stageOf(f, today)) : '無効'].join(' '));

export function filterFlyers(flyers, { stage = '', area = '', media = '', due = '', q = '' } = {}, today = '') {
  const words = norm(q).split(/\s+/).filter(Boolean);
  return flyers.filter((f) => stageMatch(f, stage, today) && (!area || areaOf(f) === area) && (!media || f.media === media) && dueMatch(f, due, today) && words.every((w) => haystack(f, today).includes(w)));
}

export function stageCountsForFilter(flyers, today) {
  const c = { all: flyers.length, todo: 0, plan: 0, design: 0, submitted: 0, distributed: 0, off: 0 };
  flyers.forEach((f) => {
    if (!f.active) { c.off += 1; return; }
    const st = stageOf(f, today);
    c[st] += 1;
    if (st === 'plan' || st === 'design') c.todo += 1;
  });
  return c;
}

// ---- 反響管理の期間 ----------------------------------------------------------------------------
// 配布した日が、期間内におさまっているチラシ（はじめ・おわりの両方が、期間の中。両端の日を含む）。from・to が空なら、その側は指定なし
export const flyersInPeriod = (flyers, from, to) => flyers.filter((f) => (!from || f.from >= from) && (!to || f.to <= to) && (!from || !to || from <= to));

const p2 = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
// 期間の早見: month＝今月／lastMonth＝先月／last3＝直近3か月（今日から3か月前の同じ日まで）／all＝指定なし
export function periodPreset(key, today) {
  const [y, m] = today.split('-').map(Number);
  if (key === 'month') return { from: ymd(new Date(y, m - 1, 1)), to: ymd(new Date(y, m, 0)) };
  if (key === 'lastMonth') return { from: ymd(new Date(y, m - 2, 1)), to: ymd(new Date(y, m - 1, 0)) };
  if (key === 'last3') return { from: windowStart(today, 3), to: today };
  return { from: '', to: '' };
}
