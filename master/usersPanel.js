// マスタ管理「ユーザー」パネルの表示（画面に依存しない純関数）。状態は引数で受け取り、HTML文字列を返す。
import { ROLES, roleLabel, isReadOnlyRole, filterUsers, countByRole } from '../src/users.js';
import { GROUPS } from '../src/dashboard.js';
import { areaById, areaOfUser } from '../src/dispatch.js';
import { esc } from '../src/format.js';

export const USER_REASON_TEXT = {
  badRole: '役割を選んでください', readOnly: '営業は、ここでは登録・変更できません（参照のみです）', notFound: '対象のユーザーが見つかりません', roleLocked: '役割は、登録したあとは変えられません（別の役割にするときは、新しく登録してください）',
  noName: '氏名を入力してください', badLoginId: 'ログインIDは、英数字・ハイフン・アンダースコアの3〜20文字にしてください', dupLoginId: '同じログインIDのユーザーがすでにいます',
  noWarehouse: '所属する倉庫を選んでください', noGroup: '担当するグループを、1つ以上選んでください', lastActive: 'この役割で有効なユーザーが、いなくなってしまうため、無効にできません（先に、別のユーザーを登録してください）',
};

export const blankForm = (role = 'operator') => ({ id: '', role, name: '', loginId: '', warehouseId: '', groups: [] });
export const formFromUser = (u) => ({ id: u.id, role: u.role, name: u.name, loginId: u.loginId, warehouseId: u.warehouseId ?? '', groups: u.groups ?? [] });

const groupName = (id) => GROUPS.find((g) => g.id === id)?.name ?? id;
const officeShort = (userId) => areaById(areaOfUser(userId))?.name.replace('エリア', '') ?? '所属不明';
const badge = (cls, label) => `<span class="rounded-full px-2 py-0.5 text-xs font-bold ${cls}">${esc(label)}</span>`;

// 役割ごとの、所属・担当の表示
function belongs(u, warehouses) {
  if (u.role === 'sales') return `${esc(groupName(u.groups?.[0]))} ／ ${esc(officeShort(u.id))}営業所${u.leader ? ` ${badge('bg-sky-100 text-sky-800', 'グループリーダー')}` : ''}`;
  if (u.role === 'warehouse') return esc(warehouses.find((w) => w.id === u.warehouseId)?.name ?? '（所属不明）');
  if (u.role === 'appraiser') return `担当 ${(u.groups ?? []).map((g) => esc(groupName(g))).join('・')}`;
  return `<span class="text-slate-400">-</span>`;
}

function row(u, warehouses) {
  const readOnly = isReadOnlyRole(u.role);
  const ops = readOnly
    ? '<span class="text-xs text-slate-400">参照のみ</span>'
    : `<button class="b b-sec !min-h-0 !py-1 !px-2 text-xs" data-edit="${esc(u.id)}">編集</button> <button class="b b-sec !min-h-0 !py-1 !px-2 text-xs" data-toggle="${esc(u.id)}">${u.active ? '無効にする' : '有効にする'}</button>`;
  return `<tr class="border-b ${u.active ? '' : 'text-slate-400'}"><td class="font-bold">${esc(u.name)}</td><td class="font-mono text-xs">${esc(u.loginId)}</td><td>${esc(roleLabel(u.role))}</td>
    <td class="!whitespace-normal text-xs">${belongs(u, warehouses)}</td><td>${u.active ? badge('bg-emerald-100 text-emerald-800', '有効') : badge('bg-slate-200 text-slate-600', '無効')}</td><td>${ops}</td></tr>`;
}

export function listHtml({ users, warehouses, ui }) {
  const rows = filterUsers(users, ui);
  if (!rows.length) return '<p class="text-sm text-slate-500 py-6 text-center">該当するユーザーはいません</p>';
  return `<table class="w-full text-sm"><thead><tr class="text-left text-slate-500 border-b"><th>氏名</th><th>ログインID</th><th>役割</th><th>所属・担当</th><th>状態</th><th>操作</th></tr></thead><tbody>${rows.map((u) => row(u, warehouses)).join('')}</tbody></table>`;
}

function formHtml({ warehouses, ui }) {
  const f = ui.form;
  if (!f) return '';
  const editing = Boolean(f.id);
  const roleOptions = ROLES.filter((r) => !isReadOnlyRole(r.key) || r.key === f.role).map((r) => `<option value="${r.key}" ${r.key === f.role ? 'selected' : ''}>${esc(r.label)}</option>`).join('');
  const extra = f.role === 'warehouse'
    ? `<label class="text-sm font-bold">所属倉庫<select class="inp mt-1 font-normal" data-f="warehouseId"><option value="">選んでください</option>${warehouses.filter((w) => w.active || w.id === f.warehouseId).map((w) => `<option value="${esc(w.id)}" ${w.id === f.warehouseId ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}</select></label>`
    : f.role === 'appraiser'
      ? `<fieldset class="text-sm font-bold">担当グループ<div class="mt-2 flex gap-4 font-normal">${GROUPS.map((g) => `<label class="flex items-center gap-1"><input type="checkbox" class="w-5 h-5" data-group="${g.id}" ${f.groups.includes(g.id) ? 'checked' : ''} />${esc(g.name)}</label>`).join('')}</div></fieldset>`
      : '';
  return `<section class="rounded-xl border bg-white p-4 space-y-3 border-teal-600">
    <h2 class="font-bold">${editing ? 'ユーザーの編集' : 'ユーザーの新規登録'}</h2>
    <div class="grid sm:grid-cols-4 gap-3">
      <label class="text-sm font-bold">役割<select class="inp mt-1 font-normal" data-f="role" ${editing ? 'disabled' : ''}>${roleOptions}</select></label>
      <label class="text-sm font-bold">氏名<input class="inp mt-1 font-normal" data-f="name" value="${esc(f.name)}" placeholder="例: 新人 太郎" /></label>
      <label class="text-sm font-bold">ログインID<span class="font-normal text-xs text-slate-500"> 英数字3〜20字</span><input class="inp mt-1 font-normal font-mono" data-f="loginId" value="${esc(f.loginId)}" placeholder="例: wh09" autocapitalize="none" /></label>
      ${extra}
    </div>
    ${editing ? '<p class="text-xs text-slate-500">役割は、登録したあとは変えられません。別の役割にするときは、新しく登録して、いまのユーザーを無効にしてください。</p>' : ''}
    <div class="flex gap-2"><button class="b b-pri" data-save>${editing ? '更新する' : '登録する'}</button><button class="b b-sec" data-cancel>やめる</button></div>
  </section>`;
}

export function usersPanelHtml(ctx) {
  const { users, ui } = ctx;
  const counts = countByRole(users);
  const tab = (key, label) => `<button class="b !min-h-0 !py-1.5 !px-3 text-sm ${ui.role === key ? 'on' : 'b-sec'}" data-role="${key}">${esc(label)} <b>${counts[key || 'all']}</b></button>`;
  return `<section class="rounded-xl border bg-white p-4 space-y-3">
      <h2 class="font-bold text-lg">👥 ユーザー（${users.filter((u) => u.active).length}名）</h2>
      <p class="text-xs text-slate-500">ユーザーは、このシステムを使う社内の人です。役割はひとつで、使う画面が決まります。倉庫担当・オペレーター・査定員は、ここで登録した人が、各画面に反映されます。</p>
      <details class="text-xs text-slate-600"><summary class="cursor-pointer font-bold">役割と、使う画面</summary>
        <ul class="mt-1 grid sm:grid-cols-2 gap-x-6">${ROLES.map((r) => `<li><b>${esc(r.label)}</b> … ${esc(r.where)}</li>`).join('')}</ul></details>
      <div class="flex flex-wrap items-center gap-2">${tab('', 'すべて')}${ROLES.map((r) => tab(r.key, r.label)).join('')}</div>
      <div class="flex flex-wrap items-center gap-3">
        <input class="inp !w-64" data-q value="${esc(ui.q)}" placeholder="氏名・ログインIDで探す" />
        <select class="inp !w-36" data-status><option value="">すべての状態</option><option value="active" ${ui.status === 'active' ? 'selected' : ''}>有効</option><option value="inactive" ${ui.status === 'inactive' ? 'selected' : ''}>無効</option></select>
        <button class="b b-pri ml-auto" data-new>＋ 新規登録</button>
      </div>
      ${ui.role === 'sales' ? '<p class="rounded bg-amber-50 border border-amber-300 text-amber-900 text-xs p-2">営業は、業績・担当エリア・始業終業などの記録が、各画面に固定されていて、まだこの名簿とつながっていないため、ここでは参照のみです（登録・変更は、各画面とつなぐときに対応します）。</p>' : ''}
      <div data-list>${listHtml(ctx)}</div>
    </section>
    ${formHtml(ctx)}`;
}
