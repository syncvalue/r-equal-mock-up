// ユーザー管理画面（ダミー・PC想定）。社内のユーザー（営業・オペレーター・配車係・査定員・経理担当・倉庫担当）の登録・変更・有効/無効。
import { USERS_KEY, DEFAULT_USERS, loadUsers, saveUsers, saveUser, setUserActive, isReadOnlyRole } from '../src/users.js';
import { loadMaster, activeWarehouses } from '../src/warehouseMaster.js';
import { initTheme, themeToggleHtml } from '../src/theme.js';
import { usersHtml, listHtml, blankForm, formFromUser, REASON_TEXT } from './view.js';

const $ = (s) => document.querySelector(s);
let users = loadUsers();
let ui = { role: '', q: '', status: '', form: null };

const ctx = () => ({ users, warehouses: loadMaster().warehouses, ui, themeHtml: themeToggleHtml() });
const render = () => { $('#root').innerHTML = usersHtml(ctx()); };
const renderList = () => { const el = $('[data-list]'); if (el) el.innerHTML = listHtml(ctx()); };

// 保存できたときだけ、表示中の名簿を更新する
function commit(next) {
  if (!saveUsers(next)) return alert('保存できませんでした（容量超過）');
  users = next;
}

function save() {
  const current = users.find((u) => u.id === ui.form.id)?.warehouseId; // いま所属している倉庫は、無効でも保てる
  const warehouseIds = [...activeWarehouses(loadMaster()).map((w) => w.id), ...(current ? [current] : [])];
  const r = saveUser(users, { ...ui.form, id: ui.form.id || undefined }, { warehouseIds });
  if (!r.ok) return alert(REASON_TEXT[r.reason]);
  commit(r.users);
  ui = { ...ui, form: null };
}

function toggle(id) {
  const u = users.find((x) => x.id === id);
  const r = setUserActive(users, id, !u.active);
  if (!r.ok) return alert(REASON_TEXT[r.reason]);
  commit(r.users);
}

const CLICK = {
  role: (v) => { ui = { ...ui, role: v }; },
  new: () => { ui = { ...ui, form: blankForm(ui.role && !isReadOnlyRole(ui.role) ? ui.role : 'operator') }; },
  edit: (v) => { ui = { ...ui, form: formFromUser(users.find((u) => u.id === v)) }; },
  toggle,
  save,
  cancel: () => { ui = { ...ui, form: null }; },
  reset: () => {
    if (!confirm('ユーザーを、初期値（見本のユーザー）に戻します。登録・変更した内容は消えます。よろしいですか？')) return false;
    commit(DEFAULT_USERS);
    ui = { ...ui, form: null };
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-role],[data-new],[data-edit],[data-toggle],[data-save],[data-cancel],[data-reset]');
  if (!el) return;
  const [name, value] = Object.entries(el.dataset).find(([k]) => k in CLICK);
  if (CLICK[name](value) !== false) render();
});

// 入力中は再描画しない（入力欄から離れないように）。検索は、一覧だけを更新する
document.addEventListener('input', (e) => {
  if (e.target.matches('[data-q]')) { ui = { ...ui, q: e.target.value }; renderList(); return; }
  const key = e.target.dataset.f;
  if (key && e.target.tagName === 'INPUT') ui = { ...ui, form: { ...ui.form, [key]: e.target.value } };
});
document.addEventListener('change', (e) => {
  if (e.target.matches('[data-status]')) { ui = { ...ui, status: e.target.value }; renderList(); return; }
  if (e.target.dataset.group) {
    const g = e.target.dataset.group;
    const groups = e.target.checked ? [...new Set([...ui.form.groups, g])] : ui.form.groups.filter((x) => x !== g);
    ui = { ...ui, form: { ...ui.form, groups } };
    return;
  }
  if (e.target.dataset.f === 'role') { ui = { ...ui, form: { ...blankForm(e.target.value), name: ui.form.name, loginId: ui.form.loginId } }; render(); return; } // 役割で、入力欄が変わる
  if (e.target.dataset.f === 'warehouseId') ui = { ...ui, form: { ...ui.form, warehouseId: e.target.value } };
});

// 別のタブで、名簿が変わったときに追従する（入力中は、入力欄を壊さないよう一覧だけ）
window.addEventListener('storage', (e) => {
  if (e.key !== USERS_KEY) return;
  users = loadUsers();
  renderList();
});

initTheme();
render();
