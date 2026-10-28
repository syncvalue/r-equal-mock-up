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

// 週の濃さ。slots の visits=その時間の訪問、busy=その時間に訪問が入っている営業の人数、total=その日に働く営業の人数（欠勤を除く）、ratio=busy/total
export function weekHeat({ areaId, dates, reservations, now = new Date(), userIds = [] }) {
  return dates.map((date) => {
    const present = dayColumns({ areaId, date, reservations, now, userIds }).filter((c) => !c.absent);
    const slots = slotStarts().map((start) => {
      // visits: その時間に入っている訪問（1件1行で出す。お客様の名前と、訪問先の住所）
      const visits = present.flatMap((c) => c.blocks.filter((b) => b.start < start + SLOT_STEP && b.end > start).map((b) => ({ userId: c.user.id, name: String(b.label ?? '').replace(/\s*様$/, ''), place: b.place ?? '', rid: b.rid ?? null })));
      const busy = new Set(visits.map((v) => v.userId)).size;
      return { start, busy, total: present.length, ratio: present.length ? busy / present.length : 0, visits };
    });
    return { date, total: present.length, slots };
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
