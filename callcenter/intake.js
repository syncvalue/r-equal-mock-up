// 受付の入力チェック（画面に依存しない純関数）。オペレーターが手で入力して確定できる条件をここで決める。
const digits = (s) => String(s ?? '').replace(/\D/g, '');

// 確定に足りない項目の名前を返す（空なら確定できる）。areaConfirmed=Googleマップで確認して営業エリアを確定済み／selected=担当の営業が決まっている
export function missingFields(form, { areaConfirmed, selected, today }) {
  const missing = [];
  if (!/^0\d{9,10}$/.test(digits(form.phone))) missing.push('電話番号');
  if (!form.name.trim()) missing.push('お名前');
  if (!form.gender) missing.push('性別');
  if (!form.address.trim()) missing.push('訪問先の住所');
  else if (!areaConfirmed) missing.push('営業エリアの確認（Googleマップ）');
  if (form.chirashi === null) missing.push(form.flyerId.trim() ? 'チラシのID（該当なし）' : '来電のきっかけ（チラシのID）');
  if (!form.cats.length && !form.wants.trim()) missing.push('売りたいもの');
  if (!form.date || form.date < today) missing.push('希望日（今日以降）');
  if (!selected) missing.push('担当の営業');
  return missing;
}

// 同席者の記録用の文字（あり の場合は、誰が同席するかも）
export const companionText = (form) => (form.companion === 'あり' && form.companionNote.trim() ? `あり（${form.companionNote.trim()}）` : form.companion || '未確認');
