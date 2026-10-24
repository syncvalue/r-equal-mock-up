// 通話の文字起こしから、ヒアリング項目を拾い出す（デモ）。実際は音声認識＋AIで行う処理を、キーワードと正規表現で代用している。
// 画面に依存しない純関数。お客様の発話を1つ渡すと、入力欄にセットする項目だけを返す。
import { CATEGORIES, MAIN_ITEMS, snapQty, flyerOf, normalizeFlyerId } from './master.js';
import { ymdOf } from '../src/reservations.js';

export const FIELD_LABELS = {
  phone: '電話番号', name: 'お名前', kana: 'フリガナ', gender: '性別', zip: '郵便番号', address: '住所', chirashi: '来電のきっかけ', flyerId: 'チラシのID',
  cats: '売りたいもの', mainItems: 'メイン商材（数量）', wants: '点数・ブランド', attendee: '当日の立会い', companion: 'ご同席者', companionNote: 'ご同席者', parking: '駐車スペース', nameplate: '表札', contactFrom: '前日確認の連絡時間', contactTo: '前日確認の連絡時間', large: '大型品', notes: '訪問時の注意', date: '希望日', start: '開始時刻',
};

// 通話のデモ台本（op=オペレーター、cu=お客様）。お客様の発話だけから項目を拾う。
// {area}{sales}{when} は再生時に、確定したエリア・担当営業・訪問日時の名前に置き換える。action: confirmArea=マップで確認してエリアを確定 / hangup=電話を切ると同時に訪問を確定
export const DEMO_SCRIPT = [
  { who: 'op', text: 'お電話ありがとうございます。リクールでございます。' },
  { who: 'cu', text: '新聞に入っていたチラシを見て電話しました。不用品の買取をお願いしたいんです。' },
  { who: 'op', text: 'ありがとうございます。チラシに印刷されているIDを教えていただけますか？' },
  { who: 'cu', text: 'えっと、N1019です。' },
  { who: 'op', text: '確認できました。お名前とお電話番号を教えていただけますか？' },
  { who: 'cu', text: '山田花子と申します。フリガナはヤマダハナコです。電話番号は090-1234-5678です。' },
  { who: 'op', text: '訪問先のご住所をお願いします。' },
  { who: 'cu', text: '大阪府大阪市阿倍野区阿倍野筋1-2-3です。郵便番号は545-0052です。主婦をしておりまして、日中は家におります。' },
  { who: 'op', text: 'ありがとうございます。Googleマップで場所を確認しますね。…はい、{area}の担当になります。', action: 'confirmArea' },
  { who: 'op', text: 'どのようなものをお売りになりたいですか？' },
  { who: 'cu', text: '背広が5着と、婦人服が12点、婦人靴が3足あります。それと、ルイ・ヴィトンのバッグが3点、ロレックスの時計が2本、金のネックレスも少し。' },
  { who: 'op', text: '大型のものなど、ほかにございますか？' },
  { who: 'cu', text: 'ゴルフクラブも売れるでしょうか。当日は主人も一緒に立ち会います。' },
  { who: 'op', text: '駐車スペースと表札の有無、前日確認のお電話の時間帯も教えてください。' },
  { who: 'cu', text: '駐車スペースはありません。表札は出ています。前日の確認のお電話は、午後5時から7時の間でお願いします。' },
  { who: 'op', text: '承知しました。訪問はいつ頃がよろしいですか？' },
  { who: 'cu', text: '来週の土曜日の午前中でお願いできますか。' },
  { who: 'op', text: '空き状況を見ながら、他の時間もご提案しますね。午後1時はいかがでしょうか？' },
  { who: 'cu', text: 'では午後1時でお願いします。1階のエントランスで待ち合わせたいです。' },
  { who: 'op', text: 'ありがとうございます。それでは{when}に、{area}の{sales}がお伺いします。この日時で確定してよろしいでしょうか？' },
  { who: 'cu', text: 'はい、お願いします。' },
  { who: 'op', text: 'かしこまりました。本日はありがとうございました。失礼いたします。', action: 'hangup' },
];

const FULL = '０１２３４５６７８９－ー−';
const normalize = (s) => s.replace(/[Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[０-９]/g, (c) => String(FULL.indexOf(c))).replace(/[－−]/g, '-').replace(/(?<=\d)ー(?=\d)/g, '-'); // 長音「ー」は、数字の間だけハイフンとみなす
const KANJI_NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const toNum = (s) => (KANJI_NUM[s] ?? Number(s));

// ---- 項目ごとの規則 ------------------------------------------------------------------
const ADDRESS = /(?:東京都|北海道|(?:京都|大阪)府|[一-龠]{2,3}県)[^。、\s]*?(?=です|。|、|$)/;
// チラシは、お客様が伝えるIDで特定する（広告の種類だけでは、どの号か決められない）。IDのない広告だけ、言葉から判定する
const CHIRASHI_RULES = [[/ネット|検索|比較サイト/, 4], [/テレビ|ＣＭ|CM/, 5], [/紹介/, 6], [/前回|また(?:お願い|利用)/, 7]];
const FLYER_ID = /(?:^|[^A-Za-z])([NPD])\s*-?\s*(\d{4})(?!\d)/i;
const CATEGORY_RULES = [
  [/バッグ|ヴィトン|シャネル|エルメス|グッチ/, 'ブランドバッグ'], [/時計|ロレックス|オメガ/, '腕時計'], [/金|プラチナ|指輪|ネックレス|ジュエリー|ダイヤ/, '貴金属・ジュエリー'],
  [/カメラ|家電/, 'カメラ・家電'], [/ゲーム|フィギュア/, 'ゲーム・ホビー'], [/着物|骨董|掛け軸/, '着物・骨董'],
];
const ITEMS = [[/ルイ・?ヴィトン|ヴィトン/, 'ルイ・ヴィトン'], [/シャネル/, 'シャネル'], [/エルメス/, 'エルメス'], [/グッチ/, 'グッチ'], [/ロレックス/, 'ロレックス'], [/オメガ/, 'オメガ'], [/プラチナ/, 'プラチナ'], [/金のネックレス/, '金のネックレス'], [/指輪/, '指輪'], [/ダイヤ/, 'ダイヤ']];
const MAIN_RULES = [['背広', /背広|スーツ/], ['婦人服', /婦人服|レディース服|洋服/], ['婦人靴', /婦人靴|レディースシューズ|パンプス/], ['紳士靴', /紳士靴|革靴|メンズシューズ/]];
const NOTE_WORDS = /オートロック|エントランス|インターホン|犬|猫|ペット|午前中が|午後が|夜が/;
const WEEKDAYS = '日月火水木金土';

function extractItems(sentence) {
  const found = [];
  for (const clause of sentence.split(/[、。]/)) {
    for (const [re, label] of ITEMS) {
      const m = clause.match(re);
      if (!m) continue;
      const n = clause.slice(m.index + m[0].length).match(/[^\d一二三四五六七八九十]{0,8}?([\d一二三四五六七八九十]+)\s*(点|本|個|つ)/);
      found.push(n ? `${label} ${toNum(n[1])}${n[2]}` : label);
    }
  }
  return found;
}

// 「背広が5着、婦人服が10点」→ { 背広: 5, 婦人服: 10 }（数量は、選べる数量に丸める）
function extractMain(sentence) {
  const out = {};
  for (const clause of sentence.split(/[、。]/)) {
    for (const [label, re] of MAIN_RULES.filter(([l]) => MAIN_ITEMS.includes(l))) {
      const m = clause.match(re);
      if (!m) continue;
      const n = clause.slice(m.index + m[0].length).match(/[^\d一二三四五六七八九十]{0,6}?([\d一二三四五六七八九十]+)\s*(?:点|着|足|枚|個|つ|セット)/);
      if (n) out[label] = snapQty(toNum(n[1]));
    }
  }
  return out;
}

export function dateOf(s, now) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const at = (days) => ymdOf(new Date(today.getFullYear(), today.getMonth(), today.getDate() + days));
  let m;
  if ((m = s.match(/(\d{1,2})月(\d{1,2})日/))) {
    const d = new Date(today.getFullYear(), Number(m[1]) - 1, Number(m[2]));
    return ymdOf(d < today ? new Date(d.getFullYear() + 1, d.getMonth(), d.getDate()) : d);
  }
  if ((m = s.match(/(?:来週の?|再来週の?)([日月火水木金土])曜/))) {
    const monday = -((today.getDay() + 6) % 7); // 今週の月曜日までの日数
    const idx = (WEEKDAYS.indexOf(m[1]) + 6) % 7; // 月=0 … 日=6
    return at(monday + (s.includes('再来週') ? 14 : 7) + idx);
  }
  if ((m = s.match(/([日月火水木金土])曜/))) return at(((WEEKDAYS.indexOf(m[1]) - today.getDay() + 6) % 7) + 1); // 明日以降で、最も近いその曜日
  if (/明後日|あさって/.test(s)) return at(2);
  if (/明日|あした/.test(s)) return at(1);
  if ((m = s.match(/(\d{1,2})日/))) {
    const d = new Date(today.getFullYear(), today.getMonth(), Number(m[1]));
    return ymdOf(d < today ? new Date(d.getFullYear(), d.getMonth() + 1, d.getDate()) : d);
  }
  return null;
}

export function startOf(s) {
  const m = s.match(/(午前|午後)?\s*(\d{1,2})時(?!間)(半|\d{1,2}分)?/);
  if (m) {
    let h = Number(m[2]);
    if (m[1] === '午後' && h < 12) h += 12;
    if (!m[1] && h < 9) h += 12; // 「3時」は午後とみなす
    const min = m[3] === '半' ? 30 : m[3] ? parseInt(m[3], 10) : 0;
    return h * 60 + min;
  }
  if (/午前/.test(s)) return 10 * 60;
  if (/午後/.test(s)) return 13 * 60;
  return null;
}

// 1つの発話から、入力欄にセットする項目を返す。form は現在の入力（点数・種類などは追記するため）、dur は所要時間（枠に収める）
export function extractFromUtterance(text, form, now = new Date(), dur = 90) {
  const patch = {};
  for (const raw of normalize(text).split(/(?<=[。！？])/)) {
    const s = raw.trim();
    if (!s) continue;
    const phone = s.match(/0\d{1,4}-?\d{1,4}-?\d{3,4}/);
    const zip = s.match(/\b\d{3}-?\d{4}\b/);
    const address = s.match(ADDRESS);
    if (phone && /電話|携帯|番号/.test(s)) patch.phone = phone[0];
    if (zip && !phone) patch.zip = zip[0].replace(/^(\d{3})(\d{4})$/, '$1-$2');
    if (address) patch.address = address[0];
    const name = s.match(/([^\s、。]{2,8}?)(?:と申します|といいます)/);
    if (name) patch.name = name[1].replace(/^(?:私|わたし|わたくし)は?/, '');
    const kana = s.match(/(?:フリガナ|読み方?)は([ァ-ヶー]{2,})/);
    if (kana) patch.kana = kana[1];
    if (/主婦|私は女|女性の者/.test(s)) patch.gender = 'f';
    else if (/私は男|男性の者/.test(s)) patch.gender = 'm';
    const fid = s.match(FLYER_ID);
    if (fid && flyerOf(fid[1] + fid[2])) patch.flyerId = normalizeFlyerId(fid[1] + fid[2]);
    else {
      const hit = CHIRASHI_RULES.find(([re]) => re.test(s));
      if (hit) { patch.chirashi = hit[1]; patch.flyerId = ''; }
    }
    const cats = CATEGORY_RULES.filter(([re]) => re.test(s)).map(([, c]) => c).filter((c) => CATEGORIES.includes(c));
    if (cats.length) patch.cats = [...new Set([...(patch.cats ?? form.cats), ...cats])];
    const main = extractMain(s);
    if (Object.keys(main).length) patch.mainItems = { ...(patch.mainItems ?? form.mainItems), ...main };
    const items = extractItems(s);
    if (items.length) {
      const have = (patch.wants ?? form.wants).split('、').filter(Boolean);
      patch.wants = [...have, ...items.filter((i) => !have.some((h) => h.split(' ')[0] === i.split(' ')[0]))].join('、');
    }
    // 立会い（誰が立ち会うか）と、同席者（他に同席する人がいるか）は別に聞く
    const DETAIL = { 主人: 'ご主人', 夫: 'ご主人', 旦那: 'ご主人', 奥さん: '奥様', 妻: '奥様', 家内: '奥様', 家族: 'ご家族', 娘: '娘様', 息子: '息子様', 母: 'お母様', 父: 'お父様' };
    const who = s.match(/主人|夫|旦那|奥さん|妻|家内|家族|娘|息子|母|父/)?.[0];
    const whoLabel = !who ? null : /主人|夫|旦那/.test(who) ? 'ご主人' : /奥さん|妻|家内/.test(who) ? '奥様' : 'ご家族';
    if (/立ち会|対応|在宅|家にい|お迎え/.test(s)) {
      if (whoLabel && /も|と|一緒|同席/.test(s)) { patch.attendee = 'ご本人'; patch.companion = 'あり'; patch.companionNote = DETAIL[who]; } // 「主人も一緒に立ち会います」→ ご本人が立ち会い、ご主人が同席
      else if (whoLabel) patch.attendee = whoLabel; // 「主人が立ち会います」
      else if (/私|本人/.test(s)) patch.attendee = 'ご本人';
    }
    if (/同席[^。]*(いません|おりません|なし|不要)|一人で|ひとりで|私だけ/.test(s)) { patch.companion = 'なし'; patch.companionNote = ''; }
    else if (/同席(者)?(は|も)?[^。]*(います|おります|あり|予定|だけ)/.test(s) && !patch.companion) { patch.companion = 'あり'; if (who) patch.companionNote = DETAIL[who]; }
    if (/駐車[^。]*(ありません|ない|なし|難しい|できません)|コインパーキング/.test(s)) patch.parking = 'なし';
    else if (/駐車[^。]*(あります|ある|大丈夫|止められ|停められ|可能)/.test(s)) patch.parking = 'あり';
    if (/表札[^。]*(ありません|ない|なし|出して(い)?ません|出てい(ま)?せん)/.test(s)) patch.nameplate = 'なし';
    else if (/表札[^。]*(あります|ある|出て|出して)/.test(s)) patch.nameplate = 'あり';
    const confirmCall = /前日|確認の?(お)?電話/.test(s);
    if (confirmCall) {
      const r = contactRangeOf(s);
      if (r) [patch.contactFrom, patch.contactTo] = r;
      else if (/いつでも|指定(は)?(ありません|なし)/.test(s)) { patch.contactFrom = 'none'; patch.contactTo = 'none'; }
    }
    const large = s.match(/ゴルフクラブ|ゴルフ|ピアノ|家具|大型/);
    if (large) patch.large = `${large[0]}も売れるか質問あり`;
    if (NOTE_WORDS.test(s)) patch.notes = s.replace(/[。！？]$/, '');
    if (!phone && !zip && !address && !confirmCall && !/チラシ|折込|号/.test(s)) { // 住所・番号・広告の日付や数字を、訪問日と取り違えない
      const date = dateOf(s, now);
      if (date) patch.date = date;
      const start = startOf(s);
      if (start !== null) patch.start = Math.min(Math.max(Math.round(start / 30) * 30, 9 * 60), 19 * 60 - dur);
    }
  }
  return patch;
}

// 前日確認の連絡時間「午後5時から7時」→ ['17:00', '19:00']（30分刻み・9:00〜20:00に収める）
export function contactRangeOf(s) {
  const m = s.match(/(午前|午後)?\s*(\d{1,2})時(半)?\s*(?:から|〜|~|-)\s*(午前|午後)?\s*(\d{1,2})時(半)?/);
  if (!m) return null;
  const hour = (mer, h, half) => { let v = Number(h); if (mer === '午後' && v < 12) v += 12; else if (!mer && v < 9) v += 12; return v * 60 + (half ? 30 : 0); };
  const from = hour(m[1], m[2], m[3]);
  let to = hour(m[4] ?? m[1], m[5], m[6]); // 後ろに「午前・午後」がなければ、前と同じ
  if (to <= from) to += 12 * 60; // 「7時から9時」のように、どちらにも付いていない場合は、終わりが始まりより後になる向きに合わせる
  const fmt = (min) => { const c = Math.min(Math.max(Math.round(min / 30) * 30, 9 * 60), 20 * 60); return `${String(Math.floor(c / 60)).padStart(2, '0')}:${c % 60 ? '30' : '00'}`; };
  return [fmt(from), fmt(to)];
}

// 実際に値が変わった項目だけ返す
export function changedFields(patch, form) {
  return Object.keys(patch).filter((k) => JSON.stringify(patch[k]) !== JSON.stringify(form[k]));
}
