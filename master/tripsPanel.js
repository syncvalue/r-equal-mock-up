// マスタ管理「出張」パネルの表示。出張（期間・担当の都道府県・出張メンバー）の一覧と、登録・変更。
import { tripStatus } from '../src/trips.js';
import { esc } from '../src/format.js';

export const blankTrip = () => ({ id: '', name: '', prefs: '', start: '', end: '', memberIds: [] });
export const formFromTrip = (t) => ({ id: t.id, name: t.name, prefs: t.prefs.join('、'), start: t.start, end: t.end, memberIds: [...t.memberIds] });

const badge = (cls, label) => `<span class="rounded-full px-2 py-0.5 text-xs font-bold ${cls}">${esc(label)}</span>`;
const STATUS = {
  ongoing: ['bg-orange-100 text-orange-800', '出張中'], upcoming: ['bg-sky-100 text-sky-800', 'これから'],
  ended: ['bg-slate-200 text-slate-600', '終了'], inactive: ['bg-slate-200 text-slate-600', '無効'],
};
const md = (ymd) => `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}`;

function table(trips, users, today) {
  const name = (id) => users.find((u) => u.id === id)?.name ?? id;
  if (!trips.length) return '<p class="text-sm text-slate-500">出張はまだありません。</p>';
  return `<table class="w-full text-sm"><thead><tr class="text-left text-slate-500 border-b"><th>出張</th><th>期間</th><th>担当の都道府県</th><th>出張メンバー</th><th>状態</th><th>操作</th></tr></thead><tbody>
    ${trips.map((t) => {
      const st = tripStatus(t, today);
      return `<tr class="border-b ${st === 'ended' || st === 'inactive' ? 'text-slate-400' : ''}"><td class="font-bold">${esc(t.name)}</td><td>${md(t.start)}〜${md(t.end)}</td>
      <td class="!whitespace-normal text-xs">${t.prefs.map(esc).join('・')}</td><td class="!whitespace-normal text-xs">${t.memberIds.map((id) => esc(name(id))).join('、')}</td>
      <td>${badge(...STATUS[st])}</td>
      <td><button class="b b-sec !min-h-0 !py-1 !px-2 text-xs" data-mt-edit="${esc(t.id)}">編集</button> <button class="b b-sec !min-h-0 !py-1 !px-2 text-xs" data-mt-toggle="${esc(t.id)}">${t.active ? '無効にする' : '有効にする'}</button></td></tr>`;
    }).join('')}
  </tbody></table>`;
}

function form(mt, users) {
  return `<div class="rounded-lg border bg-slate-50 p-3 space-y-3">
    <h3 class="font-bold">${mt.id ? '出張の編集' : '出張を新規登録'}</h3>
    <div class="grid sm:grid-cols-2 gap-3">
      <label class="text-sm font-bold">出張の名前<input class="inp mt-1 font-normal" data-f="mt.name" value="${esc(mt.name)}" placeholder="例: 福岡出張" /></label>
      <label class="text-sm font-bold">担当の都道府県<span class="font-normal text-xs text-slate-500">営業所のないエリアだけ。カンマ・読点・空白で区切る</span><textarea class="inp mt-1 font-normal" rows="2" data-f="mt.prefs" placeholder="福岡県、佐賀県">${esc(mt.prefs)}</textarea></label>
      <label class="text-sm font-bold">開始日<input type="date" class="inp mt-1 font-normal" data-f="mt.start" value="${esc(mt.start)}" /></label>
      <label class="text-sm font-bold">終了日<input type="date" class="inp mt-1 font-normal" data-f="mt.end" value="${esc(mt.end)}" /></label>
    </div>
    <fieldset class="text-sm"><legend class="font-bold">出張メンバー<span class="font-normal text-xs text-slate-500">（営業）</span></legend>
      <div class="mt-1 grid grid-cols-2 sm:grid-cols-4 gap-1">${users.map((u) => `<label class="flex items-center gap-1.5"><input type="checkbox" data-trip-member="${esc(u.id)}" ${mt.memberIds.includes(u.id) ? 'checked' : ''} />${esc(u.name)}</label>`).join('')}</div>
    </fieldset>
    <div class="flex gap-2"><button class="b b-pri" data-mt-save>${mt.id ? '更新する' : '登録する'}</button>${mt.id ? '<button class="b b-sec" data-mt-cancel>やめる</button>' : ''}</div>
  </div>`;
}

// ctx: { trips, users: 出張メンバーに選べる営業 [{ id, name }], today: YYYY-MM-DD, ui: { mt } }
export function tripsPanelHtml({ trips, users, today, ui }) {
  return `<section class="rounded-xl border bg-white p-4 space-y-3">
      <h2 class="font-bold text-lg">🧳 出張（${trips.filter((t) => t.active).length}件）</h2>
      <p class="text-xs text-slate-500">営業所のないエリアへ、チラシを配って、期間を決めて訪問買取をする営業方法です。出張メンバーの本来の営業所は変わりません。期間中だけ、出張エリアの候補にも加わり（本来の営業所のエリアの候補にも残ります）、コールセンターでは「出張中」と分かるように出ます。</p>
      ${table(trips, users, today)}${form(ui.mt, users)}
    </section>`;
}
