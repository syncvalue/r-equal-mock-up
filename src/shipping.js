// 発送（配送業者・サイズ）の定義と、発送伝票・明細・CSVの出力。すべて純粋関数（画面は、結果を印刷・ダウンロードする）。
import { esc, yen } from './format.js';
import { SEAL_COLORS } from './stock.js';

export const CARRIERS = [
  { key: 'yamato', label: 'ヤマト運輸', service: '宅急便', csvLabel: 'ヤマト運輸（B2クラウド取込用）' },
  { key: 'sagawa', label: '佐川急便', service: '飛脚宅配便', csvLabel: '佐川急便（e飛伝取込用）' },
  { key: 'jp', label: '日本郵便', service: 'ゆうパック', csvLabel: '日本郵便（ゆうパックプリント取込用）' },
  { key: 'other', label: 'その他', service: '', csvLabel: '' },
];
export const carrierOf = (key) => CARRIERS.find((c) => c.key === key) ?? null;
export const PACK_SIZES = ['60', '80', '100', '120', '140', '160', '170'];

// ---- 出力（明細・発送伝票・CSV）-----------------------------------------------------
const ymd = (ms, sep) => { const d = new Date(ms); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${sep}${p(d.getMonth() + 1)}${sep}${p(d.getDate())}`; };
const unitsOf = (pack, units) => { const by = new Map(units.map((u) => [u.code, u])); return pack.codes.map((c) => by.get(c) ?? { code: c, name: '（商品の情報なし）', price: 0 }); };
const whOf = (master, id) => master.warehouses.find((w) => w.id === id) ?? { name: '', zip: '', address: '', phone: '' };
const describe = (count) => `買取商品（${count}点）`;

// 点数と、商品の買取額の合計（配送の補償額の目安）
export function packSummary(pack, units) {
  const by = new Map(units.map((u) => [u.code, u]));
  return { count: pack.codes.length, total: pack.codes.reduce((n, c) => n + (by.get(c)?.price ?? 0), 0) };
}

// 送り状・CSVに必要な、送り先・ご依頼主の情報で、足りないものの一覧
export function addressProblems(pack, master) {
  const check = (label, w) => [['郵便番号', w.zip], ['住所', w.address], ['電話番号', w.phone]].filter(([, v]) => !String(v ?? '').trim()).map(([k]) => `${label}（${w.name}）の${k}`);
  return [...check('送り先', whOf(master, pack.toId)), ...check('ご依頼主', whOf(master, pack.fromId))];
}

// ---- CSV
export const csvEscape = (v) => { const t = v == null ? '' : String(v); return /[",\r\n]/.test(t) ? `"${t.replaceAll('"', '""')}"` : t; };
export const toCsv = (rows) => `${rows.map((r) => r.map(csvEscape).join(',')).join('\r\n')}\r\n`;

// 配送業者ごとの取込用CSVの列（仮の並び。実際の取込形式に合わせて調整する）。各列は [見出し, (パック情報) => 値]
const COLUMNS = {
  yamato: [
    ['お客様管理番号', (c) => c.no], ['送り状種類', () => '0'], ['クール区分', () => '0'], ['伝票番号', (c) => c.pack.tracking], ['出荷予定日', (c) => c.date],
    ['お届け先電話番号', (c) => c.to.phone], ['お届け先郵便番号', (c) => c.to.zip], ['お届け先住所', (c) => c.to.address], ['お届け先名', (c) => c.to.name], ['敬称', () => '御中'],
    ['ご依頼主電話番号', (c) => c.from.phone], ['ご依頼主郵便番号', (c) => c.from.zip], ['ご依頼主住所', (c) => c.from.address], ['ご依頼主名', (c) => c.from.name],
    ['品名１', (c) => c.item], ['記事', (c) => c.pack.note], ['サイズ（参考）', (c) => c.pack.size],
  ],
  sagawa: [
    ['お客様管理番号', (c) => c.no], ['お届け先電話番号', (c) => c.to.phone], ['お届け先郵便番号', (c) => c.to.zip], ['お届け先住所１', (c) => c.to.address], ['お届け先名称１', (c) => c.to.name],
    ['ご依頼主電話番号', (c) => c.from.phone], ['ご依頼主郵便番号', (c) => c.from.zip], ['ご依頼主住所１', (c) => c.from.address], ['ご依頼主名称１', (c) => c.from.name],
    ['品名１', (c) => c.item], ['出荷個数', () => '1'], ['便種', () => '飛脚宅配便'], ['サイズ（参考）', (c) => c.pack.size], ['出荷日', (c) => c.date], ['お問い合わせ番号', (c) => c.pack.tracking], ['記事', (c) => c.pack.note],
  ],
  jp: [
    ['お客様管理番号', (c) => c.no], ['お届け先郵便番号', (c) => c.to.zip], ['お届け先住所1', (c) => c.to.address], ['お届け先氏名', (c) => c.to.name], ['お届け先電話番号', (c) => c.to.phone],
    ['ご依頼主郵便番号', (c) => c.from.zip], ['ご依頼主住所1', (c) => c.from.address], ['ご依頼主氏名', (c) => c.from.name], ['ご依頼主電話番号', (c) => c.from.phone],
    ['内容品', (c) => c.item], ['個数', () => '1'], ['サイズ区分', (c) => c.pack.size], ['発送予定日', (c) => c.date], ['お問い合わせ番号', (c) => c.pack.tracking], ['備考', (c) => c.pack.note],
  ],
  other: [
    ['管理番号', (c) => c.no], ['発送日', (c) => c.date], ['配送業者', (c) => carrierOf(c.pack.carrier)?.label ?? ''], ['追跡番号', (c) => c.pack.tracking],
    ['送り先名', (c) => c.to.name], ['送り先郵便番号', (c) => c.to.zip], ['送り先住所', (c) => c.to.address], ['送り先電話番号', (c) => c.to.phone],
    ['送り元名', (c) => c.from.name], ['送り元郵便番号', (c) => c.from.zip], ['送り元住所', (c) => c.from.address], ['送り元電話番号', (c) => c.from.phone],
    ['品名', (c) => c.item], ['個数', () => '1'], ['サイズ', (c) => c.pack.size], ['メモ', (c) => c.pack.note], ['シールNo.', (c) => c.pack.codes.join(' / ')],
  ],
};

// 取込用CSV。個口数が2以上のパックは、箱ごとに1行（管理番号に枝番）。UTF-8（BOMつき）
export function shippingCsv(carrierKey, packs, units, master, { now = Date.now() } = {}) {
  const cols = COLUMNS[carrierKey] ?? COLUMNS.other;
  const rows = packs.flatMap((pack) => Array.from({ length: pack.boxes ?? 1 }, (_, i) => {
    const ctx = {
      pack, no: (pack.boxes ?? 1) > 1 ? `${pack.id}-${i + 1}` : pack.id, date: ymd(pack.sentAt ?? now, '/'), to: whOf(master, pack.toId), from: whOf(master, pack.fromId), item: describe(pack.codes.length),
    };
    return cols.map(([, f]) => f(ctx));
  }));
  return `﻿${toCsv([cols.map(([h]) => h), ...rows])}`;
}

export const csvFileName = (carrierKey, now = Date.now()) => `${carrierOf(carrierKey)?.label ?? 'その他'}_発送_${ymd(now, '')}.csv`;

// ---- 印刷用のページ（新しいウィンドウに書き出して、印刷する）
const PAGE_CSS = 'body{font-family:"Hiragino Sans","Noto Sans JP","Yu Gothic",sans-serif;margin:24px;color:#111}h1{font-size:20px;margin:0 0 8px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #444;padding:6px 8px;font-size:13px;text-align:left;vertical-align:top}th{background:#eee}.r{text-align:right}.mono{font-family:monospace}.meta{display:flex;gap:24px;margin:8px 0;font-size:13px}.box{border:1px solid #444;padding:8px 12px;flex:1}.sign{margin-top:24px;display:flex;gap:24px;font-size:13px}.sign div{flex:1;border-bottom:1px solid #444;padding-bottom:28px}.label{border:2px solid #111;padding:14px;margin:0 0 16px;page-break-after:always;width:520px}.label h2{font-size:15px;margin:0 0 6px}.big{font-size:18px;font-weight:bold}.no-print{margin-bottom:12px}@media print{.no-print{display:none}body{margin:8mm}}';
const PRINT_JS = '<script>window.addEventListener("load",function(){window.print()})</script>';
const page = (title, body) => `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${PAGE_CSS}</style></head><body><div class="no-print"><button onclick="window.print()">印刷する</button></div>${body}${PRINT_JS}</body></html>`;

// 送付明細。パックの番号・送り元と送り先・商品の一覧・合計・受領の確認欄
export function packingListHtml(pack, units, master, { now = Date.now() } = {}) {
  const from = whOf(master, pack.fromId);
  const to = whOf(master, pack.toId);
  const list = unitsOf(pack, units);
  const { count, total } = packSummary(pack, units);
  const color = (k) => SEAL_COLORS.find((c) => c.key === k)?.label ?? '';
  return page(`送付明細 ${pack.id}`, `
  <h1>送付明細（倉庫間移動）</h1>
  <div class="meta"><div>パック番号: <b class="mono">${esc(pack.id)}</b></div><div>作成日: ${ymd(pack.createdAt ?? now, '/')}　出力: ${ymd(now, '/')}</div><div>配送: ${esc(carrierOf(pack.carrier)?.label ?? '未選択')}${pack.size ? `（サイズ ${esc(pack.size)}）` : ''}　個口数: ${pack.boxes ?? 1}</div></div>
  <div class="meta"><div class="box"><b>送り元</b><br>${esc(from.name)}<br>〒${esc(from.zip)} ${esc(from.address)}<br>TEL ${esc(from.phone)}</div><div class="box"><b>送り先</b><br>${esc(to.name)}<br>〒${esc(to.zip)} ${esc(to.address)}<br>TEL ${esc(to.phone)}</div></div>
  <table><thead><tr><th>確認</th><th>シールNo.</th><th>商品名</th><th>カテゴリ・ランク</th><th>シールの色</th><th>買取日・お客様</th><th class="r">買取額</th></tr></thead><tbody>
  ${list.map((u) => `<tr><td>☐</td><td class="mono">${esc(u.code)}</td><td>${esc(u.name)}</td><td>${esc(u.category ?? '')}${u.rank ? `／ランク${esc(u.rank)}` : ''}</td><td>${esc(color(u.sealColor))}</td><td>${esc(u.date ?? '')} ${esc(u.customerName ?? '')}</td><td class="r">${yen(u.price)}</td></tr>`).join('')}
  <tr><td colspan="6" class="r"><b>合計 ${count}点</b></td><td class="r"><b>${yen(total)}</b></td></tr></tbody></table>
  ${pack.note ? `<p>メモ: ${esc(pack.note)}</p>` : ''}
  <div class="sign"><div>受領日　　　年　　月　　日</div><div>受領者（署名）</div><div>全点確認 ☐ 相違あり ☐</div></div>`);
}

// 発送伝票（送り状の控え）。個口ごとに1枚。実際の送り状は、配送業者のシステムに、CSVを取り込んで出力する
export function shippingLabelHtml(pack, units, master, { now = Date.now() } = {}) {
  const from = whOf(master, pack.fromId);
  const to = whOf(master, pack.toId);
  const c = carrierOf(pack.carrier);
  const boxes = pack.boxes ?? 1;
  const labels = Array.from({ length: boxes }, (_, i) => `
  <section class="label">
    <h2>${esc(c ? `${c.label}${c.service ? `（${c.service}）` : ''}` : '配送業者: 未選択')}　サイズ ${esc(pack.size || '-')}　個口 ${i + 1} / ${boxes}</h2>
    <div class="box"><b>お届け先</b><br>〒${esc(to.zip)}<br>${esc(to.address)}<br><span class="big">${esc(to.name)} 御中</span><br>TEL ${esc(to.phone)}</div>
    <div class="box" style="margin-top:8px"><b>ご依頼主</b><br>〒${esc(from.zip)} ${esc(from.address)}<br>${esc(from.name)}　TEL ${esc(from.phone)}</div>
    <p>品名: ${esc(describe(pack.codes.length))}　出荷日: ${ymd(pack.sentAt ?? now, '/')}<br>お問い合わせ番号: <b class="mono">${esc(pack.tracking || '')}</b><br>管理番号: <span class="mono">${esc(boxes > 1 ? `${pack.id}-${i + 1}` : pack.id)}</span>${pack.note ? `<br>記事: ${esc(pack.note)}` : ''}</p>
  </section>`).join('');
  return page(`発送伝票 ${pack.id}`, labels);
}
