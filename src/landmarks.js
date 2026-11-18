// ダミーデータの訪問先に使う、実在する場所（駅・城・市役所など）。住所は、Googleマップで検索すれば出る場所で、座標は、その場所の概算（数百m以内）。
// お客様の氏名・電話は架空（住所だけが実在）。住所（address）から座標を引く spotPos は、locateAddress（src/dispatch.js）が使う。
export const SPOTS = {
  osakajo: { name: '大阪城天守閣', address: '大阪府大阪市中央区大阪城1-1', zip: '540-0002', lat: 34.6873, lng: 135.5262, area: 'osaka' },
  umeda: { name: '大阪駅', address: '大阪府大阪市北区梅田3-1-1', zip: '530-0001', lat: 34.7025, lng: 135.4959, area: 'osaka' },
  namba: { name: 'なんばCITY', address: '大阪府大阪市中央区難波5-1-60', zip: '542-0076', lat: 34.6655, lng: 135.5013, area: 'osaka' },
  tennoji: { name: '天王寺動物園', address: '大阪府大阪市天王寺区茶臼山町1-108', zip: '543-0063', lat: 34.6511, lng: 135.5064, area: 'osaka' },
  shinosaka: { name: '新大阪駅', address: '大阪府大阪市淀川区西中島5-16-1', zip: '532-0011', lat: 34.7335, lng: 135.5001, area: 'osaka' },
  kyobashi: { name: '京橋駅', address: '大阪府大阪市都島区東野田町2-1-38', zip: '534-0021', lat: 34.6969, lng: 135.5342, area: 'osaka' },
  sakai: { name: '堺市役所', address: '大阪府堺市堺区南瓦町3-1', zip: '590-0078', lat: 34.5733, lng: 135.4829, area: 'osaka' },
  toyonaka: { name: '豊中市役所', address: '大阪府豊中市中桜塚3-1-1', zip: '561-8501', lat: 34.7815, lng: 135.4696, area: 'osaka' },
  hirakata: { name: '枚方市役所', address: '大阪府枚方市大垣内町2-1-20', zip: '573-8666', lat: 34.8143, lng: 135.6513, area: 'osaka' },
  higashiosaka: { name: '東大阪市役所', address: '大阪府東大阪市荒本北1-1-1', zip: '577-8521', lat: 34.6793, lng: 135.6003, area: 'osaka' },
  expo: { name: '万博記念公園', address: '大阪府吹田市千里万博公園1-1', zip: '565-0826', lat: 34.8083, lng: 135.5321, area: 'osaka' },
  kobe: { name: '神戸市役所', address: '兵庫県神戸市中央区加納町6-5-1', zip: '650-0001', lat: 34.6913, lng: 135.183, area: 'hyogo' },
  kyoto: { name: '京都駅', address: '京都府京都市下京区東塩小路町901', zip: '600-8216', lat: 34.9858, lng: 135.7588, area: 'hyogo' },
  koshien: { name: '甲子園球場', address: '兵庫県西宮市甲子園町1-1', zip: '663-8152', lat: 34.7211, lng: 135.3619, area: 'hyogo' },
  otsu: { name: '大津市役所', address: '滋賀県大津市御陵町3-1', zip: '520-8575', lat: 35.0045, lng: 135.8686, area: 'hyogo' },
  shinjuku: { name: '新宿駅', address: '東京都新宿区新宿3-38-1', zip: '160-0022', lat: 35.6896, lng: 139.7006, area: 'kanto' },
  tokyotower: { name: '東京タワー', address: '東京都港区芝公園4-2-8', zip: '105-0011', lat: 35.6586, lng: 139.7454, area: 'kanto' },
  landmark: { name: '横浜ランドマークタワー', address: '神奈川県横浜市西区みなとみらい2-2-1', zip: '220-8130', lat: 35.4545, lng: 139.6317, area: 'kanto' },
  omiya: { name: '大宮駅', address: '埼玉県さいたま市大宮区錦町630', zip: '330-0853', lat: 35.9064, lng: 139.6237, area: 'kanto' },
  chiba: { name: '千葉市役所', address: '千葉県千葉市中央区千葉港1-1', zip: '260-8722', lat: 35.6073, lng: 140.1065, area: 'kanto' },
  nagoya: { name: '名古屋駅', address: '愛知県名古屋市中村区名駅1-1-4', zip: '450-0002', lat: 35.1709, lng: 136.8815, area: 'tokai' },
  nagoyajo: { name: '名古屋城', address: '愛知県名古屋市中区本丸1-1', zip: '460-0031', lat: 35.1856, lng: 136.8996, area: 'tokai' },
  toyota: { name: '豊田スタジアム', address: '愛知県豊田市千石町7-2', zip: '471-0016', lat: 35.085, lng: 137.171, area: 'tokai' },
  hamamatsu: { name: '浜松城', address: '静岡県浜松市中央区元城町100-2', zip: '430-0946', lat: 34.7117, lng: 137.7261, area: 'tokai' },
  gifu: { name: '岐阜駅', address: '岐阜県岐阜市橋本町1-10', zip: '500-8856', lat: 35.4097, lng: 136.7563, area: 'tokai' },
};

// 画面に出す住所（建物・施設名つき）
export const spotAddress = (key) => `${SPOTS[key].address}（${SPOTS[key].name}）`;

// 住所の文字から、実在する場所の座標を引く（ダミーに使っている場所だけ。見つからなければ null）
export function spotPos(address) {
  const text = String(address ?? '').trim();
  const hit = Object.values(SPOTS).find((s) => text.startsWith(s.address));
  return hit ? { lat: hit.lat, lng: hit.lng } : null;
}
