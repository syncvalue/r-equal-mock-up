// 受付の入力チェック（画面に依存しない純関数）。オペレーターが手で入力して確定できる条件をここで決める。
import { MAIN_ITEMS, qtyLabel, joinName } from './master.js';

const digits = (s) => String(s ?? '').replace(/\D/g, '');

// 確定に足りない項目の名前を返す（空なら確定できる）。areaConfirmed=Googleマップで確認して営業エリアを確定済み／selected=担当の営業が決まっている
export function missingFields(form, { areaConfirmed, selected, today }) {
  const missing = [];
  if (!/^0\d{9,10}$/.test(digits(form.phone))) missing.push('電話番号');
  if (!form.lastName.trim() || !form.firstName.trim()) missing.push('お名前（姓・名）');
  if (!form.lastKana.trim() || !form.firstKana.trim()) missing.push('フリガナ（セイ・メイ）');
  if (!form.gender) missing.push('性別');
  if (!String(form.age ?? '').trim() && !form.ageEst) missing.push('年齢（聞けない場合は、推測の年代）');
  if (!form.address.trim()) missing.push('訪問先の住所');
  else if (!areaConfirmed) missing.push('営業エリアの確認（Googleマップ）');
  if (form.chirashi === null) missing.push(form.flyerId.trim() ? 'チラシのID（該当なし）' : '来電のきっかけ（チラシのID）');
  if (!hasWants(form)) missing.push('売りたいもの');
  if (!form.date || form.date < today) missing.push('希望日（今日以降）');
  if (!selected) missing.push('担当の営業');
  return missing;
}

// 同席者の記録用の文字（あり の場合は、誰が同席するかも）
export const companionText = (form) => (form.companion === 'あり' && form.companionNote.trim() ? `あり（${form.companionNote.trim()}）` : form.companion || '未確認');

// 売りたいもの: メイン商材の数量・その他の商材・自由記入のどれかがあればよい
export const mainSummary = (form) => MAIN_ITEMS.filter((k) => form.mainItems?.[k] > 0).map((k) => `${k} ${qtyLabel(form.mainItems[k])}`);
export const hasWants = (form) => mainSummary(form).length > 0 || form.cats.length > 0 || form.wants.trim() !== '';
// 営業のタブレットに出す文字: メイン商材（数量）／その他の商材／詳細
export const wantsText = (form) => [mainSummary(form).join('、'), form.cats.join('・'), form.wants.trim()].filter(Boolean).join(' ／ ');

// ---- 聞き取りの確認（聞き忘れ防止） ---------------------------------------------------------
// 項目ごとに「聞いた／まだ聞いていない」を返す。「なし」「特になし」と聞いた場合も、聞いた扱い。
export const CHECK_ITEMS = [
  ['phone', '電話番号1'], ['phone2', '電話番号2'], ['name', 'お名前'], ['kana', 'フリガナ'], ['gender', '性別'], ['age', '年齢'], ['zip', '郵便番号'], ['address', '住所'],
  ['when', '希望日時'], ['flyer', '来電のきっかけ'], ['wants', '売りたいもの'], ['attendee', '当日の立会い'], ['companion', 'ご同席者'],
  ['large', '大型品'], ['parking', '駐車スペース'], ['nameplate', '表札'], ['contact', '前日確認の連絡時間'], ['notes', '訪問時の注意'],
];
// 確定に必須の項目（足りないと確定できない）。それ以外は、聞き忘れの注意だけ出す
export const REQUIRED_CHECKS = new Set(['phone', 'name', 'kana', 'gender', 'age', 'address', 'flyer', 'wants']);

export function hearingChecklist(form) {
  const filled = (v) => String(v ?? '').trim() !== '';
  const asked = {
    phone: /^0\d{9,10}$/.test(digits(form.phone)), phone2: filled(form.phone2) || Boolean(form.phone2None), name: filled(form.lastName) && filled(form.firstName), kana: filled(form.lastKana) && filled(form.firstKana), gender: filled(form.gender), age: filled(form.age) || filled(form.ageEst), zip: filled(form.zip), address: filled(form.address),
    when: Boolean(form.whenAsked), flyer: form.chirashi !== null, wants: hasWants(form), attendee: filled(form.attendee), companion: filled(form.companion),
    large: filled(form.large), parking: filled(form.parking), nameplate: filled(form.nameplate), contact: filled(form.contactFrom) || filled(form.contactTo), notes: filled(form.notes),
  };
  // 聞けなくて、声色から推測した性別・年齢は、入力済みとして数えるが、「推測」として区別する
  const estimated = { gender: form.genderEst && filled(form.gender), age: !filled(form.age) && filled(form.ageEst) };
  return CHECK_ITEMS.map(([key, label]) => ({ key, label, asked: asked[key], estimated: Boolean(estimated[key]), required: REQUIRED_CHECKS.has(key) }));
}

// お客様の売りたいものの分野（その他の商材・メイン商材・詳細の書き込みから）。営業の得意分野と合うかを見るのに使う
const WANT_WORDS = [[/ヴィトン|シャネル|エルメス|グッチ|バッグ/, 'ブランドバッグ'], [/ロレックス|オメガ|時計/, '腕時計'], [/金|プラチナ|ネックレス|指輪|ダイヤ|ジュエリー/, '貴金属・ジュエリー'], [/カメラ|家電/, 'カメラ・家電'], [/ゲーム|フィギュア/, 'ゲーム・ホビー'], [/着物|骨董|掛け軸/, '着物・骨董']];
export function wantedCategories(form) {
  const fromText = WANT_WORDS.filter(([re]) => re.test(form.wants ?? '')).map(([, c]) => c);
  return [...new Set([...(form.cats ?? []), ...MAIN_ITEMS.filter((k) => form.mainItems?.[k] > 0), ...fromText])];
}
export const matchedSpecialties = (specialties, form) => { const w = wantedCategories(form); return specialties.filter((s) => w.includes(s)); };

export const fullName = (form) => joinName(form.lastName, form.firstName);
export const fullKana = (form) => joinName(form.lastKana, form.firstKana);

// 営業のタブレットに出す、お客様の性別・年齢（聞けずに声色から推測した場合は、その旨）
export function profileText(form, genderLabel) {
  const g = form.gender ? `${genderLabel(form.gender)}${form.genderEst ? '（推測）' : ''}` : '性別未確認';
  const age = String(form.age ?? '').trim();
  const a = age ? (/^\d+$/.test(age) ? `${age}歳` : age) : form.ageEst ? `${form.ageEst}（推測）` : '年齢未確認';
  return `${g}／${a}`;
}
