// マスタ管理「部署」パネルの表示。会社（REqualの1社だけ）に属する部署の一覧と、登録・変更。
import { COMPANY, departmentName } from '../src/departments.js';
import { countByDepartment } from '../src/employees.js';
import { esc } from '../src/format.js';
import { helpIcon } from '../src/help.js';

export const blankDepartment = () => ({ id: '', name: '' });
export const formFromDepartment = (d) => ({ id: d.id, name: d.name });

const badge = (cls, label) => `<span class="rounded-full px-2 py-0.5 text-xs font-bold ${cls}">${esc(label)}</span>`;

function table(departments, employees) {
  const counts = countByDepartment(employees);
  return `<table class="w-full text-sm"><thead><tr class="text-left text-slate-500 border-b"><th>部署</th><th>会社</th><th class="text-right">社員（有効）</th><th>状態</th><th>操作</th></tr></thead><tbody>
    ${departments.map((d) => `<tr class="border-b ${d.active ? '' : 'text-slate-400'}"><td class="font-bold">${esc(d.name)}</td><td>${esc(COMPANY.name)}</td><td class="text-right">${counts[d.id] ?? 0}名</td>
      <td>${d.active ? badge('bg-emerald-100 text-emerald-800', '有効') : badge('bg-slate-200 text-slate-600', '無効')}</td>
      <td><button class="b b-sec !min-h-0 !py-1 !px-2 text-xs" data-md-edit="${esc(d.id)}">編集</button> <button class="b b-sec !min-h-0 !py-1 !px-2 text-xs" data-md-toggle="${esc(d.id)}">${d.active ? '無効にする' : '有効にする'}</button></td></tr>`).join('')}
  </tbody></table>`;
}

function form(md) {
  return `<div class="rounded-lg border bg-slate-50 p-3 space-y-3">
    <h3 class="font-bold">${md.id ? '部署の編集' : '部署の新規登録'}</h3>
    <div class="grid sm:grid-cols-2 gap-3">
      <label class="text-sm font-bold">部署の名前<input class="inp mt-1 font-normal" data-f="md.name" value="${esc(md.name)}" placeholder="例: 総務部" /></label>
      <div class="text-sm font-bold">会社<div class="mt-1 py-2 font-normal">${esc(COMPANY.name)}<span class="text-xs text-slate-500">（1社だけ。変更できません）</span></div></div>
    </div>
    <div class="flex gap-2"><button class="b b-pri" data-md-save>${md.id ? '更新する' : '登録する'}</button>${md.id ? '<button class="b b-sec" data-md-cancel>やめる</button>' : ''}</div>
  </div>`;
}

// ctx: { departments: 部署マスタ, employees: 社員の一覧, ui: { md } }
export function departmentsPanelHtml({ departments, employees, ui }) {
  return `<section class="rounded-xl border bg-white p-4 space-y-3">
      <h2 class="font-bold text-lg">🧩 部署（${departments.filter((d) => d.active).length}か所）${helpIcon(`会社「${COMPANY.name}」の部署です（会社は1社だけで、部署は並べるだけです）。社員は、いずれかの部署に属します。有効な社員がいる部署は、無効にできません。`)}</h2>
      ${table(departments, employees)}${form(ui.md)}
    </section>`;
}
