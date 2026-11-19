// 本人確認書類の読み取り（OCR。モック）。お客様の入力の負担を減らすため、書類から読み取れた項目を、あらかじめ入れておく。
// お客様は、入った内容を確かめて、違うところだけ直す。実際のOCRは正式版（docs/shared/production-gaps.md）。ここでは、決まった見本を返す。
export const SAMPLE_ID_FIELDS = { zip: '542-0076', address: '大阪府大阪市中央区難波1-1-1', birth: '1985-04-12' };

const blank = (v) => String(v ?? '').trim() === '';

// 読み取った内容を入れたお客様の情報を返す（元は変えない）。書類から読み取れる項目（郵便番号・住所・生年月日）は書き換え、フリガナは空のときだけ入れる。
// お名前・電話番号・職業・予備の電話番号は、書類にないので触らない
export const scanIdDocument = (customer, read = SAMPLE_ID_FIELDS) => ({
  ...customer,
  ...read,
  kana: blank(customer.kana) ? (read.kana ?? '') : customer.kana,
});

// 古物台帳に要る項目のうち、まだ空のもの（お客様の入力の案内に使う）
export const missingIdentity = (customer) => [['address', '住所'], ['birth', '生年月日']].filter(([k]) => blank(customer?.[k])).map(([, label]) => label);
