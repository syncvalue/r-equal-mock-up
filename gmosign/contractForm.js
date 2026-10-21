// 出張買取契約書（会社控え／お客様控え）のHTML生成
import './contractForm.css';
import { esc, yen } from '../src/format.js';

export const CHECK_ITEMS = [
  { key: 'q1', section: null, text: '事前のご予約の上、弊社社員が訪問しましたか' },
  { key: 'q2', section: null, text: '弊社社員は行商従業証を提示しましたか' },
  { key: 'q3', section: null, text: '弊社社員による悪質な勧誘・買取はなかったですか' },
  { key: 'q4', section: null, text: '売却物の点数・特徴・金額を確認しましたか' },
  { key: 'q5', section: null, text: '購入代金を受け取りましたか' },
  { key: 'q6', section: ['個人情報の取り扱いに関して', '【個人情報の取り扱いに関する重要事項】を必ずご確認ください'], text: '個人情報の取り扱いに関する重要事項について同意いただけましたか' },
  { key: 'q7', section: ['クーリング・オフに関して', '【特定商取引法に基づくクーリング・オフ等に関する告知】を必ずご確認ください'], text: 'クーリング・オフについて説明は受けましたか' },
  { key: 'q8', section: null, text: 'クーリング・オフ満了日は{cooling}（※期間終了後の返品はできません）' },
  { key: 'q9', section: null, text: '基準外の商品がある場合の返品・返金を了承する' },
  { key: 'q10', section: null, text: '弊社社員との個人間売買は禁止されており、万が一トラブルが発生した場合であっても弊社が一切の責任を負わないことを確認しました' },
];

const ROWS = 20;
const OCC = ['会社員', '自営', 'パート', 'アルバイト', '無職'];
const circle = (on, t) => (on ? `<span class="cf-c">${t}</span>` : t);

// 和暦（令和・平成・昭和）
export function wareki(d) {
  const t = d.getTime();
  const eras = [['令和', new Date(2019, 4, 1), 2018], ['平成', new Date(1989, 0, 8), 1988], ['昭和', new Date(1926, 11, 25), 1925], ['大正', new Date(1912, 6, 30), 1911]];
  const e = eras.find(([, s]) => t >= s.getTime()) ?? eras.at(-1);
  return { era: e[0], year: d.getFullYear() - e[2], month: d.getMonth() + 1, day: d.getDate() };
}

const age = (birth, at) => {
  let a = at.getFullYear() - birth.getFullYear();
  if (at.getMonth() < birth.getMonth() || (at.getMonth() === birth.getMonth() && at.getDate() < birth.getDate())) a -= 1;
  return a;
};

const idTypeView = (kyc) => {
  const t = kyc?.type ?? '';
  const other = !['運転免許証', '健康保険証', 'マイナンバーカード'].includes(t) && t;
  return `${circle(t === '運転免許証', '免許証')}・${circle(t === '健康保険証', '健康保険資格確認書')}・${circle(t === 'マイナンバーカード', 'マイナンバーカード')}・${circle(Boolean(other), 'その他')}（番号 ${other ? esc(t) : ''}）・提示不可`;
};

function itemRows(items, start) {
  return Array.from({ length: ROWS }, (_, k) => {
    const i = items[start + k];
    return `<tr><td class="n">${start + k + 1}</td><td>${i ? esc(i.name) : ''}</td><td class="sm">${i ? esc(i.category ?? '') : ''}</td>
      <td class="ft">${i ? `ランク${esc(i.rank)}${i.codes?.length ? ` ／ ${i.codes.map(esc).join(', ')}` : ''}` : ''}</td>
      <td class="n">${i ? '有・無' : '有・無'}</td><td class="n">${i ? i.qty : ''}</td><td class="r">${i ? yen(i.price) : '¥'}</td></tr>`;
  }).join('');
}

function pageHtml(c, copy, pageIdx, pages) {
  const last = pageIdx === pages - 1;
  const at = new Date(c.signedAt ?? c.sentAt);
  const w = wareki(at);
  const cooling = wareki(new Date(at.getTime() + 7 * 86400000));
  const cu = c.customer;
  const b = cu.birth ? new Date(cu.birth) : null;
  const bw = b ? wareki(b) : null;
  const checks = c.checks ?? {};
  const mark = (k) => `<span class="bx">${checks[k] ? '☑' : '☐'}</span>`;

  const chk = CHECK_ITEMS.map((q) => `
    ${q.section ? `<div class="h">${q.section[0]} <small>${q.section[1]}</small></div>` : ''}
    <div class="q">${mark(q.key)}<span>${esc(q.text).replace('{cooling}', `令和 ${cooling.year} 年 ${cooling.month} 月 ${cooling.day} 日`)}</span></div>`).join('');

  const bottom = last
    ? `
    <div class="cf-total"><div><span class="l">合計金額</span><span class="v">${yen(c.total)}</span></div></div>
    <div class="cf-red">契約者様（甲）記入欄 <small>※書面をご確認の上、契約者様が自署にてご記入ください</small></div>
    <div class="cf-id"><b>確認書類</b><span class="g">${idTypeView(c.kyc)}</span><span class="box">${c.kyc ? '☑' : '☐'} 本人確認済み</span></div>
    <div class="cf-bottom">
      <div class="cf-chk"><div class="h">チェック項目 <small style="font-size:7pt">下記を確認の上 ✓ を記入してください</small></div>${chk}</div>
      <div class="cf-form">
        <div><span class="k">契約者<br>（甲）</span><span class="v"><small>フリガナ</small>${esc(cu.kana)}<span style="font-size:11pt;margin-top:1mm">${esc(cu.name)}</span>
          <span class="cf-seal">${c.signature ? `<img src="${c.signature}" alt="署名" />` : '印'}</span></span></div>
        <div><span class="k">（現）職業</span><span class="v"><span>${OCC.map((o) => circle(cu.occupation === o, o)).join('・')}・${circle(Boolean(cu.occupation) && !OCC.includes(cu.occupation), '他')}（${OCC.includes(cu.occupation) ? '' : esc(cu.occupation)}）</span></span></div>
        <div><span class="k">訪問先<br>住 所</span><span class="v">〒 ${esc(cu.zip)}<br>${esc(cu.address)}</span></div>
        <div><span class="k">生年月日</span><span class="v"><span>${bw ? `${bw.era} ${bw.year} 年 ${bw.month} 月 ${bw.day} 日生（満 ${age(b, at)} 歳）` : ''}</span></span></div>
        <div><span class="k">電話番号</span><span class="v">${esc(cu.phone)}</span></div>
        <div><span class="k">引渡場所</span><span class="v"><span>${circle(c.deliveryPlace !== 'その他', '自宅')}・${circle(c.deliveryPlace === 'その他', 'その他')}（${c.deliveryPlace === 'その他' ? esc(c.deliveryOther ?? '') : ''}）</span></span></div>
        <div><span class="k">身分証<br>住 所</span><span class="v">〒 ${esc(cu.zip)}<br>${esc(cu.address)}<small style="align-self:flex-end">訪問先住所と同一</small></span></div>
      </div>
    </div>`
    : '<p style="text-align:right;margin-top:2mm">（次ページに続く）</p>';

  return `
  <section class="cf-page">
    <div class="cf-head"><span>No. <b>${esc(c.id)}</b></span><span class="cf-title">出張買取契約書</span><span class="cf-badge">${copy}</span></div>
    <div class="cf-top">
      <div>
        <div style="margin-top:1mm">契約日：<b>令和</b><span class="u">${w.year}</span>年<span class="u">${w.month}</span>月<span class="u">${w.day}</span>日／時間：<span class="u">${at.getHours()}</span>時<span class="u">${String(at.getMinutes()).padStart(2, '0')}</span>分</div>
        <div style="margin-top:1.5mm">AP：　${circle(c.callInfo?.apType === '新', '新')}・${circle(c.callInfo?.apType === '再', '再')}　　鑑定士：<span class="u" style="min-width:28mm">${esc(c.callInfo?.appraiser ?? '')}</span></div>
        <p class="cf-pre">契約者（以下、甲という）は、甲の依頼により<b style="color:#111;text-decoration:underline">株式会社アールイコール</b>（以下、乙という）と本物品購入契約書の売主である甲は、本契約の各条項に同意します。また下記<b>［チェック項目］</b>および<b>［個人情報の取り扱いに関して］</b>・<b>［クーリング・オフに関して］</b>に関し、記載の通りであることに相違ありません。<br>※売却物に不製品・粗悪品及び構造品等が売買契約日の後日に発覚した場合は、弊社より売却物品代金の返金を求める事があります。</p>
      </div>
      <div class="cf-co">訪問購入事業者（乙）<br><strong>げんえきや</strong><br><b style="font-weight:bold">（株式会社アールイコール）</b><br>〒543-0002<br>大阪府大阪市天王寺区上汐5丁目1番1号<br>TEL 06-6125-5118<br>FAX 06-6125-5119<br>代表 林 毅大<br><span style="margin-top:1mm;display:block">古物許可証 大阪府公安委員会<br>第 62120R021524 号</span></div>
    </div>
    <table class="cf-tbl"><colgroup><col style="width:8mm"><col style="width:46mm"><col style="width:17mm"><col><col style="width:13mm"><col style="width:9mm"><col style="width:30mm"></colgroup>
      <thead><tr><th>No.</th><th>商品名</th><th>ｶﾃｺﾞﾘ</th><th>特徴（状態・付属品も記入）</th><th>箱</th><th>数量</th><th>購入金額</th></tr></thead>
      <tbody>${itemRows(c.items, pageIdx * ROWS)}</tbody></table>
    ${bottom}
  </section>`;
}

export function contractFormHtml(c, copies = ['会社控え']) {
  const pages = Math.max(1, Math.ceil(c.items.length / ROWS));
  return copies.flatMap((copy) => Array.from({ length: pages }, (_, i) => pageHtml(c, copy, i, pages))).join('');
}
