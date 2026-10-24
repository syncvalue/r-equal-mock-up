// 配車係に、誰を当てるかの目安を出す（画面に依存しない純関数）。その予約の時間に空いている営業を、お客様に合う順に並べる。
// 要注意のお客様・クーリングオフの多いお客様・資産の多いお客様は、上位ランクやリーダーの営業を優先し、そうでなければ、売りたいものと得意分野が合う営業を優先する
import { USERS, isLeader } from '../src/dashboard.js';
import { areaOfUser, canPlace, rankOfUser, specialtiesOf } from '../src/dispatch.js';
import { wantedCategories } from './intake.js';

const RANK_VALUE = { S: 4, A: 3, B: 2, C: 1 };

export function suggestStaff(rec, reservations, profile, now = new Date()) {
  const form = rec.formData ?? { cats: [], mainItems: rec.hearing?.mainItems ?? {}, wants: rec.hearing?.wants ?? '' };
  const wanted = wantedCategories(form);
  const start = Number(rec.start.slice(0, 2)) * 60 + Number(rec.start.slice(3));
  const demanding = Boolean(profile && (profile.trouble.level === 'alert' || profile.cooloff.length >= 2 || profile.rank === 'S')); // 経験のある営業が望ましいお客様
  return USERS.filter((u) => !rec.areaId || areaOfUser(u.id) === rec.areaId)
    .map((user) => {
      const matched = specialtiesOf(user.id).filter((s) => wanted.includes(s));
      const place = canPlace(rec, user.id, start, reservations, now);
      return { user, rank: rankOfUser(user.id), leader: isLeader(user), matched, free: place.ok, reason: place.reason, current: user.id === rec.userId };
    })
    .filter((c) => c.free)
    .sort((a, b) => (demanding
      ? (RANK_VALUE[b.rank] - RANK_VALUE[a.rank]) || (Number(b.leader) - Number(a.leader)) || (b.matched.length - a.matched.length)
      : (b.matched.length - a.matched.length) || (RANK_VALUE[b.rank] - RANK_VALUE[a.rank])) || a.user.id.localeCompare(b.user.id));
}
