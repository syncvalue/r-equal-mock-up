// マーケティング部「チラシ」: 登録フォームと、チラシの一覧（配布中・これから・終わったもの）
import { esc, yen } from '../src/format.js';
import { helpIcon } from '../src/help.js';
import { MEDIA, mediaOf, nextFlyerId, flyersOnDay } from '../src/flyers.js';
import { AD_TYPES } from '../callcenter/master.js';

export const REASON_TEXT = {
  noName: 'チラシの名前を入れてください', dupName: '同じ名前のチラシがあります（号や期間を、名前に入れてください）', badMedia: '配布方法を選んでください', noArea: '配布するエリアを入れてください',
  badDate: '配布の期間（はじめ・おわり）を入れてください', dateOrder: '配布の期間は、はじめの日より、おわりの日が後になるようにしてください', badQuantity: '部数は、1以上の整数で入れてください', badCost: '費用は、0以上の整数で入れてください', badFile: 'デザインデータは、画像（png・jpeg・webp・gif）かPDFを選んでください', bigFile: 'デザインデータが大きすぎます（500KBまで。モックは、ブラウザに保存するため）',
  notFound: '対象のチラシが見つかりません', mediaLocked: '配布方法は、登録したあとは変えられません（IDの頭文字と結びついているため。別の方法のときは、新しく登録してください）',
};

export const blankFlyer = (today) => ({ id: '', name: '', media: 'newspaper', adType: '', area: '', from: today, to: today, quantity: '', cost: '', note: '', file: undefined });
export const formFromFlyer = (f) => ({ id: f.id, name: f.name, media: f.media, adType: f.adType, area: f.area, from: f.from, to: f.to, quantity: String(f.quantity), cost: String(f.cost), note: f.note, file: undefined }); // file: undefined＝いまのデータを残す／null＝外す／{…}＝差し替え

const field = (label, body, { req = false, help = '' } = {}) => `<label class="block text-sm font-bold">${label}${req ? '<span class="text-rose-700 ml-0.5" title="必須">＊</span>' : ''}${help ? helpIcon(help) : ''}<div class="mt-1 font-normal">${body}</div></label>`;
const inp = (k, v, { type = 'text', ph = '', extra = '' } = {}) => `<input class="inp" type="${type}" data-f="${k}" value="${esc(v)}" placeholder="${esc(ph)}" ${extra}>`;

// いま付いている（または、選んだ）デザインデータ
function designNow(f, flyers) {
  const file = f.file !== undefined ? f.file : flyers.find((x) => x.id === f.id)?.file ?? null;
  return file ? `<span class="text-xs">${esc(file.name)}</span><button class="chip !py-0 !text-[11px]" data-flyer-file-clear>外す</button>` : '<span class="text-xs text-slate-500">なし</span>';
}

export function formHtml(f, flyers) {
  const editing = Boolean(f.id);
  const nextId = editing ? f.id : nextFlyerId(flyers, f.media);
  return `<section class="rounded-lg bg-white border border-slate-300 p-4 space-y-3" data-flyer-form>
    <div class="flex items-center justify-between gap-2"><h2 class="font-bold">${editing ? 'チラシの変更' : 'チラシの登録'}</h2>
      <span class="text-sm">チラシID <b class="font-mono text-base">${esc(nextId)}</b>${helpIcon('チラシに印刷するIDです（頭文字は、新聞折込=N・ポスティング=P・DM・はがき=D）。システムが、番号をつけます。お客様が電話でこのIDを伝えると、コールセンターの受付に、どのチラシを見たかが記録されます。')}</span></div>
    ${field('チラシの名前', inp('name', f.name, { ph: '例: 11/26号 着物・骨董' }), { req: true })}
    <div class="grid grid-cols-2 gap-3">
      ${field('配布方法', `<select class="inp" data-f="media" ${editing ? 'disabled' : ''}>${MEDIA.map((m) => `<option value="${m.key}" ${m.key === f.media ? 'selected' : ''}>${m.label}</option>`).join('')}</select>`, { req: true })}
      ${field('広告種別', `<select class="inp" data-f="adType"><option value="">（選ばない）</option>${AD_TYPES.map((a) => `<option ${a === f.adType ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select>`, { help: 'コールセンターの受付で選ぶ「広告種別」と同じ区分です。' })}
    </div>
    ${field('配布するエリア', inp('area', f.area, { ph: '例: 大阪府（吹田市・豊中市）' }), { req: true, help: 'コールセンターのオペレーターが、「今日は、どこからの電話が増えそうか」を見込むために、今日配布のチラシと一緒に見せます。' })}
    <div class="grid grid-cols-2 gap-3">${field('配布のはじめ', inp('from', f.from, { type: 'date' }), { req: true })}${field('配布のおわり', inp('to', f.to, { type: 'date' }), { req: true, help: '新聞折込のように、1日だけ配るときは、はじめと同じ日にします。' })}</div>
    <div class="grid grid-cols-2 gap-3">${field('部数', inp('quantity', f.quantity, { ph: '30000', extra: 'inputmode="numeric"' }), { req: true })}${field('費用（円）', inp('cost', f.cost, { ph: '150000', extra: 'inputmode="numeric"' }), { help: '印刷費・配布費など、このチラシにかかった費用の合計。反響管理の「1件あたりの費用」に使います。' })}</div>
    <div class="text-sm font-bold">デザインデータ${helpIcon('チラシの画像かPDFを、1つ保管できます（500KBまで。モックは、ブラウザに保存するため）。本実装では、ファイルの保管場所に置き換えます。')}
      <div class="mt-1 font-normal flex items-center gap-2 flex-wrap"><input type="file" accept="image/png,image/jpeg,image/webp,image/gif,application/pdf" data-flyer-file class="text-sm">
        ${designNow(f, flyers)}</div></div>
    ${field('メモ', `<textarea class="inp" rows="2" data-f="note" placeholder="例: 折込の曜日を変えて試す">${esc(f.note)}</textarea>`)}
    <div class="flex gap-2"><button class="b b-pri flex-1" data-flyer-save>${editing ? '変更を保存' : '登録する'}</button>${editing ? '<button class="b b-sec" data-flyer-cancel>やめる</button>' : ''}</div>
  </section>`;
}

const STATE = { now: ['配布中', 'bg-teal-100 text-teal-800'], soon: ['配布前', 'bg-amber-100 text-amber-800'], done: ['配布済み', 'bg-slate-100 text-slate-600'], off: ['無効', 'bg-slate-200 text-slate-500'] };
const stateOf = (f, today) => (!f.active ? 'off' : f.from <= today && today <= f.to ? 'now' : f.from > today ? 'soon' : 'done');
const period = (f) => (f.from === f.to ? f.from : `${f.from} 〜 ${f.to}`);

const designHtml = (f) => (!f.file ? '<span class="text-slate-400">―</span>' : f.file.type === 'application/pdf'
  ? `<a class="underline text-teal-700" href="${esc(f.file.dataUrl)}" download="${esc(f.file.name)}">PDF</a>`
  : `<a href="${esc(f.file.dataUrl)}" download="${esc(f.file.name)}" title="${esc(f.file.name)}（押すと保存）"><img src="${esc(f.file.dataUrl)}" alt="${esc(f.name)}のデザイン" class="h-10 w-auto rounded border border-slate-300"></a>`);

export function listHtml(flyers, today) {
  const order = { now: 0, soon: 1, done: 2, off: 3 };
  const rows = [...flyers].sort((a, b) => order[stateOf(a, today)] - order[stateOf(b, today)] || b.from.localeCompare(a.from) || a.id.localeCompare(b.id));
  const onToday = flyersOnDay(flyers, today).length;
  return `<section class="rounded-lg bg-white border border-slate-300 p-4">
    <div class="flex items-center justify-between mb-2"><h2 class="font-bold">チラシの一覧 <span class="text-sm font-normal text-slate-500">${flyers.length}件</span></h2><span class="text-sm">今日配布 <b class="text-lg text-teal-700">${onToday}</b>件</span></div>
    <div class="overflow-x-auto"><table class="w-full text-sm" data-flyer-list>
      <thead><tr class="text-left text-xs text-slate-500 border-b"><th>ID</th><th>状態</th><th>チラシ</th><th>配布方法</th><th>エリア</th><th>デザイン</th><th>期間</th><th class="text-right">部数</th><th class="text-right">費用</th><th></th></tr></thead>
      <tbody>${rows.map((f) => { const [label, cls] = STATE[stateOf(f, today)]; return `<tr class="border-b ${f.active ? '' : 'text-slate-400'}">
        <td class="font-mono font-bold">${esc(f.id)}</td><td><span class="rounded px-2 py-0.5 text-xs font-bold ${cls}">${label}</span></td>
        <td class="whitespace-normal min-w-[10rem]">${esc(f.name)}${f.note ? `<div class="text-[11px] text-slate-500">${esc(f.note)}</div>` : ''}</td><td>${esc(mediaOf(f.media)?.label)}</td><td class="whitespace-normal min-w-[8rem]">${esc(f.area)}</td><td>${designHtml(f)}</td><td>${esc(period(f))}</td>
        <td class="text-right">${f.quantity.toLocaleString('ja-JP')}</td><td class="text-right">${yen(f.cost)}</td>
        <td><button class="b b-sec !min-h-0 !py-1 !px-2 text-xs" data-flyer-edit="${esc(f.id)}">変更</button> <button class="b b-sec !min-h-0 !py-1 !px-2 text-xs" data-flyer-toggle="${esc(f.id)}">${f.active ? '無効にする' : '有効にする'}</button></td></tr>`; }).join('')}</tbody>
    </table></div>
  </section>`;
}

export const flyersTab = ({ flyers, form, today }) => `<div class="grid lg:grid-cols-[26rem_1fr] gap-4 p-4 items-start">${formHtml(form, flyers)}${listHtml(flyers, today)}</div>`;
