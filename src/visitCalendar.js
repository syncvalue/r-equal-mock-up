// 訪問カレンダー（エリアごと）の集計。週の表は「日 × 時間」で、その時間に訪問が入っている営業の人数（濃さ）を出し、
// 日別は「営業 × 時間」。画面から独立した純関数。訪問は、営業の元からの予定と、コールセンターの受付（取消を除く）。
import { USERS } from './dashboard.js';
import { areaOfUser, busyBlocks, attendanceOf, WORK_START, WORK_END, SLOT_STEP } from './dispatch.js';

export const slotStarts = () => Array.from({ length: (WORK_END - WORK_START) / SLOT_STEP }, (_, i) => WORK_START + i * SLOT_STEP);

// その日そのエリアの営業。エリアの営業所の営業に、その日そのエリアの訪問が入った他エリアの営業（出張など）を足す
export function areaStaff(areaId, date, reservations, now = new Date()) {
  const visiting = new Set(reservations.filter((r) => r.areaId === areaId && r.date === date && r.status !== 'cancelled' && r.userId).map((r) => r.userId));
  return USERS.filter((u) => areaOfUser(u.id) === areaId || visiting.has(u.id));
}

// 日別の列（営業ごと）。欠勤の営業は、列は残して absent を立てる
// userIds: 営業で絞り込むときの、選んだ営業（空なら全員）
export function dayColumns({ areaId, date, reservations, now = new Date(), userIds = [] }) {
  return areaStaff(areaId, date, reservations, now).filter((u) => !userIds.length || userIds.includes(u.id)).map((user) => {
    const att = attendanceOf(user.id, date, now);
    return { user, att, absent: att.kind === 'absent', blocks: busyBlocks(user.id, date, reservations, now) };
  });
}

// 同じ時間にかぶる訪問を、横に並べる（Googleカレンダーと同じ）。かぶっている訪問のまとまりごとに、列の番号（col）と、横に並ぶ数（cols）を付ける
export function layoutBlocks(blocks) {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || a.end - b.end);
  const out = [];
  let cluster = [];
  let clusterEnd = -1;
  const flush = () => {
    const colEnds = [];
    const placed = cluster.map((b) => {
      let col = colEnds.findIndex((end) => end <= b.start);
      if (col < 0) { col = colEnds.length; colEnds.push(0); }
      colEnds[col] = b.end;
      return { ...b, col };
    });
    placed.forEach((p) => out.push({ ...p, cols: colEnds.length }));
    cluster = [];
    clusterEnd = -1;
  };
  for (const b of sorted) {
    if (cluster.length && b.start >= clusterEnd) flush();
    cluster.push(b);
    clusterEnd = Math.max(clusterEnd, b.end);
  }
  if (cluster.length) flush();
  return out;
}

// 週の濃さ。blocks=その日の訪問（かぶりを横に並べる位置つき）、slots の busy=その時間に訪問が入っている営業の人数、total=その日に働く営業の人数（欠勤を除く）、ratio=busy/total
export function weekHeat({ areaId, dates, reservations, now = new Date(), userIds = [] }) {
  return dates.map((date) => {
    const present = dayColumns({ areaId, date, reservations, now, userIds }).filter((c) => !c.absent);
    const slots = slotStarts().map((start) => {
      const busy = present.filter((c) => c.blocks.some((b) => b.start < start + SLOT_STEP && b.end > start)).length;
      return { start, busy, total: present.length, ratio: present.length ? busy / present.length : 0 };
    });
    const blocks = layoutBlocks(present.flatMap((c) => c.blocks.map((b) => ({ ...b, userId: c.user.id, name: String(b.label ?? '').replace(/\s*様$/, ''), place: b.place ?? '' }))));
    return { date, total: present.length, slots, blocks };
  });
}

// 濃さ（割合 0〜1）→ 背景の透明度と文字色。空きは薄く、埋まるほど濃く
export function heatStyle(ratio) {
  const alpha = Math.round((0.06 + 0.84 * Math.min(1, Math.max(0, ratio))) * 100) / 100;
  return { alpha, bg: `rgba(13,148,136,${alpha})`, fg: alpha > 0.5 ? 'text-white' : 'text-slate-700' };
}

// 営業で絞り込むときの候補。表示する期間のどこかの日に、そのエリアにいる営業
export function areaStaffOver(areaId, dates, reservations, now = new Date()) {
  const seen = new Map();
  for (const date of dates) for (const u of areaStaff(areaId, date, reservations, now)) seen.set(u.id, u);
  return [...seen.values()];
}
