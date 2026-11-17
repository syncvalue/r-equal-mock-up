// 郵便番号 → 住所の候補（モック）。外部のサービスは使わず、主な町域だけの小さな表を引く。
// 本実装では、日本郵便の郵便番号データ（KEN_ALL）か、郵便番号の検索サービスに置き換える。

// 7桁の郵便番号 → 住所（都道府県から町域まで）の候補。ひとつの郵便番号が複数の町域にまたがるときは、すべて並べる
export const ZIP_TABLE = {
  5450052: ['大阪府大阪市阿倍野区阿倍野筋'],
  5420076: ['大阪府大阪市中央区難波'],
  5300001: ['大阪府大阪市北区梅田'],
  5410044: ['大阪府大阪市中央区伏見町'],
  5640063: ['大阪府吹田市江坂町'],
  5900078: ['大阪府堺市堺区南花田口町'],
  5600021: ['大阪府豊中市本町'],
  5730032: ['大阪府枚方市岡東町'],
  6300257: ['奈良県生駒市元町'],
  6400000: ['和歌山県和歌山市'],
  6620832: ['兵庫県西宮市甲子園口'],
  6500001: ['兵庫県神戸市中央区加納町'],
  6000001: ['京都府京都市下京区四条通'],
  5200000: ['滋賀県大津市'],
  1000001: ['東京都千代田区千代田'],
  1600022: ['東京都新宿区新宿'],
  1500002: ['東京都渋谷区渋谷'],
  1540024: ['東京都世田谷区三軒茶屋'],
  1100016: ['東京都台東区台東'],
  2310001: ['神奈川県横浜市中区港町'],
  3300000: ['埼玉県さいたま市'],
  2600000: ['千葉県千葉市'],
  4600002: ['愛知県名古屋市中区丸の内'],
  4500002: ['愛知県名古屋市中村区名駅'],
  5000000: ['岐阜県岐阜市'],
  5140000: ['三重県津市'],
  4200000: ['静岡県静岡市'],
  8100001: ['福岡県福岡市中央区天神'],
};

// 全角・ハイフン・空白・「〒」を取り除いて、数字だけにする
export const normalizeZip = (zip) => String(zip ?? '').normalize('NFKC').replace(/\D/g, '');

// 7桁にそろった郵便番号だけ引く。表になければ空
export function addressCandidates(zip, table = ZIP_TABLE) {
  const digits = normalizeZip(zip);
  if (digits.length !== 7) return [];
  return [...(table[digits] ?? (table === ZIP_TABLE ? zipCache.get(digits) : null) ?? [])];
}

// 表にない郵便番号は、郵便番号の検索サービス（zipcloud。郵便番号だけを送る）で調べ、結果をおぼえておく（null＝調べたが、なかった）
const zipCache = new Map();
export const zipLookedUp = (zip) => { const d = normalizeZip(zip); return d.length === 7 && (d in ZIP_TABLE || zipCache.has(d)); };
export const zipResultsToAddresses = (results) => [...new Set((results ?? []).map((r) => `${r.address1}${r.address2}${/以下に掲載がない場合/.test(r.address3) ? '' : r.address3}`))];
export async function fetchZip(zip, fetcher = fetch) {
  const d = normalizeZip(zip);
  if (d.length !== 7 || zipLookedUp(d)) return addressCandidates(d);
  try {
    const res = await fetcher(`https://zipcloud.ibsnet.jp/api/search?zipcode=${d}`);
    if (!res.ok) throw new Error(`検索に失敗しました（${res.status}）`);
    const list = zipResultsToAddresses((await res.json()).results);
    zipCache.set(d, list); // 見つからなかったときも、おぼえる
    return [...list];
  } catch (err) { console.error(err); return []; } // 通信の失敗は、おぼえない（あとで、もう一度調べられる）
}

// 郵便番号を入れたときに、住所の欄へ自動で入れる文字。入れないときは null。
// 住所が空か、前の郵便番号から入れた町域のまま（番地を打っていない）ときだけ入れる。打ち込んだ住所は消さない。
// 候補が複数なら、その共通の頭の部分だけ入れる（残りは、候補のボタンから選ぶ）
export function autoAddress(zip, address, prevZip = '', table = ZIP_TABLE) {
  const cands = addressCandidates(zip, table);
  if (!cands.length) return null;
  const current = String(address ?? '').trim();
  const untouched = !current || addressCandidates(prevZip, table).some((c) => c.startsWith(current) && current.startsWith(commonHead(addressCandidates(prevZip, table))));
  if (!untouched) return null;
  const head = commonHead(cands);
  return head && head !== current ? head : null;
}
const commonHead = (list) => list.reduce((a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return a.slice(0, i); });
