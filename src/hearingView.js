// 受電時のヒアリング内容（コールセンターが電話口で聞き取った内容）。鑑定士が訪問前に確認する情報。
import { esc } from "./format.js";
import { hearingOf } from "./schedule.js";
import { helpIcon } from "./help.js";
import { CALL_RESULTS } from "./confirmCall.js";

const FIELDS = [
  ["profile", "性別・年齢"],
  ["trigger", "来電のきっかけ"],
  ["attendee", "当日の立会い"],
  ["companion", "ご同席者"],
  ["wants", "売りたいもの"],
  ["large", "大型品・その他"],
  ["parking", "駐車スペース"],
  ["nameplate", "表札"],
  ["contact", "前日確認の連絡時間"],
  ["notes", "訪問時の注意"],
];
// 特に見落としたくない項目
const KEY = new Set(["attendee", "large"]);

// stack: 幅の狭い場所では、項目名を上に、内容を下に並べる
export function hearingRows(e, { stack = false } = {}) {
  const h = hearingOf(e);
  return FIELDS.filter(([k]) => h[k] != null)
    .map(
      ([k, label]) => `
    <div class="flex ${stack ? "flex-col" : "gap-2"} py-1.5 ${k === "notes" ? "rounded-lg bg-amber-50 px-2" : ""}"><dt class="${stack ? "text-xs" : "w-28 shrink-0"} text-slate-500">${label}</dt>
      <dd class="flex-1 min-w-0 ${KEY.has(k) || k === "notes" ? "font-bold" : ""}">${esc(h[k])}</dd></div>`,
    )
    .join("");
}

export const hearingMeta = (e) =>
  `受付 ${esc(e.receptionNo)} ／ ${esc(e.receivedAt)} ／ 受電 ${esc(e.operator)}（コールセンター）`;

export const hearingModal = (e) => ({
  title: `${esc(e.customer.name)} 様　受電時のヒアリング`,
  body: `<div class="text-xs text-slate-500">${hearingMeta(e)}${helpIcon("コールセンターがお客様から聞き取った内容です。訪問前に確認してください。")}</div>
    <dl class="text-sm divide-y">${hearingRows(e)}</dl>${confirmCallsHtml(e)}`,
});

// 前日確認（オペレーターが、訪問の前日にお客様へ電話した記録）。お客様から告げられたこと（同席者・駐車場・時間の変更など）を、鑑定士が訪問前に読む。読むだけ。
// 受付の記録がない予定（confirmCalls がない）には、何も出さない
const stampOf = (ms) => { const d = new Date(ms); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
export function confirmCallsHtml(e) {
  if (!Array.isArray(e.confirmCalls)) return "";
  const calls = e.confirmCalls;
  const list = calls.length
    ? calls.map((c) => `<li class="py-1.5"><div class="flex flex-wrap items-center gap-x-2 text-xs"><span class="text-slate-500">${stampOf(c.at)}</span><b class="${c.result === "reached" ? "text-teal-700" : "text-amber-800"}">${esc(CALL_RESULTS[c.result] ?? c.result)}</b><span class="text-slate-500">（${esc(c.by)}）</span></div>${c.memo ? `<div class="mt-0.5 whitespace-pre-wrap rounded-lg bg-amber-50 px-2 py-1 text-sm font-bold">${esc(c.memo)}</div>` : ""}</li>`).join("")
    : '<li class="py-1.5 text-sm text-slate-500">まだ連絡していません</li>';
  return `<div class="rounded-xl border p-2.5"><div class="font-bold text-sm">前日確認（お客様に電話した記録）${helpIcon("訪問の前日に、コールセンターのオペレーターが、お客様へ電話して確認した記録です。お客様から告げられたことは、訪問前に確認してください。")}</div>
    <ul class="divide-y">${list}</ul>${e.confirmClosed ? '<div class="mt-1 text-xs text-slate-500">何度かけてもつながらず、不通のまま、前日確認を終えました</div>' : ""}</div>`;
}
