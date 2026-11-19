// 画面ID。クライアントからの修正依頼で、「どの画面か」をはっきり伝えるための番号。全画面（ページ・タブ・状態・モーダル・ドロワー）に振る。
// 形式: アプリの記号 ＋ 番号。ページ・タブは「CC-01」、同じ画面の中の状態は「CC-01-1」、モーダル・ドロワー・重ねて出す画面は「CC-M01」。
// 画面の隅に、いつも出す（setScreenBadge）。モーダルは、モーダルの中に出す（modalBadgeHtml）。一覧は docs/SCREEN_IDS.md（scripts/gen-screen-ids.mjs で、この表から作る）。
// 画面から独立した純関数と表。DOM を触るのは、最後の2つだけ。

export const APPS = {
  LNC: '画面一覧（ランチャー）',
  CC: 'コールセンター',
  TAB: '鑑定士タブレット',
  STR: '店舗',
  WH: '倉庫・物流',
  HQ: '査定部',
  ACC: '経理部',
  MKT: 'マーケティング部',
  MST: 'マスタ管理',
  GMO: 'GMOサイン（ダミー）',
};

// [id, 画面名, 種類]  種類: page=ページ／tab=タブ／mode=同じ画面の中の状態／step=手順の1段階／modal=モーダル／overlay=ドロワー・重ねて出す画面／print=印刷用のページ
const T = (app, rows) => rows.map(([id, name, kind]) => ({ id: `${app}-${id}`, app, name, kind }));

export const SCREENS = [
  ...T('LNC', [['01', '画面一覧', 'page']]),

  ...T('CC', [
    ['01', '受電（電話番号の入力）', 'tab'],
    ['01-1', '受電（既存の予約あり：変更・取消）', 'mode'],
    ['01-2', '受電（新規受付の入力）', 'mode'],
    ['01-3', '受電（日時の変更）', 'mode'],
    ['01-4', '受電（訪問先の地図・ピン）', 'mode'],
    ['01-5', '受電（仮確定の完了）', 'mode'],
    ['02', '訪問カレンダー（週の表）', 'tab'],
    ['02-1', '訪問カレンダー（日別）', 'mode'],
    ['03', '配車確定（配車係）', 'tab'],
    ['04', 'クーリングオフ', 'tab'],
    ['05', '来店予約（店舗）', 'tab'],
    ['M01', 'メニュー', 'overlay'],
    ['M02', 'お客様の詳細（配車確定）', 'modal'],
    ['M03', '鑑定士の詳細（配車確定）', 'modal'],
    ['M04', '受付の取消（確認・理由）', 'modal'],
    ['M05', '商品写真の拡大（クーリングオフ）', 'modal'],
    ['M06', '音声入力（文字起こし。デモ）', 'overlay'],
    ['M07', '訪問ルートの地図（配車確定）', 'modal'],
  ]),

  ...T('TAB', [
    ['01', 'ログイン', 'page'],
    ['02', '2段階認証', 'page'],
    ['03', 'パスワードの再設定', 'page'],
    ['04', '本人確認', 'page'],
    ['05', '新しいパスワード', 'page'],
    ['10', '業績ダッシュボード', 'page'],
    ['11', '始業', 'page'],
    ['12', '終業・日報（終業手続き）', 'page'],
    ['13', '日報（提出後）', 'page'],
    ['14', '今日の予定（カレンダー）', 'tab'],
    ['15', '今日の予定（ルート）', 'tab'],
    ['16', '顧客検索', 'page'],
    ['17', '経費管理', 'page'],
    ['18', '商品の入庫', 'page'],
    ['19', '準備中', 'page'],
    ['20', '訪問開始', 'step'],
    ['21', '訪問できなかった場合の記録（結果）', 'step'],
    ['22', 'お客様確認', 'step'],
    ['23', '説明事項', 'step'],
    ['24', '買取明細', 'step'],
    ['25', '買取商品の確認（お客様用）', 'step'],
    ['26', '買取商品の確認（鑑定士用）', 'step'],
    ['27', 'シール紐づけ', 'step'],
    ['28', '送信・終了', 'step'],
    ['M01', 'メニュー', 'overlay'],
    ['M02', 'AIカメラで商品候補を探す', 'modal'],
    ['M03', '訪問を終了しますか？', 'modal'],
    ['M04', 'お客様情報の修正', 'modal'],
    ['M05', '商品の修正（金額・数量）', 'modal'],
    ['M06', '査定部に査定依頼／AI査定', 'modal'],
    ['M07', '査定部からのコメント', 'modal'],
    ['M08', 'お客様の評価', 'modal'],
    ['M09', '本社からのお知らせ', 'modal'],
    ['M10', 'グループのメンバーへメッセージ', 'modal'],
    ['M11', '受電時のヒアリング', 'modal'],
    ['M12', 'ダッシュボードの訪問一覧', 'modal'],
    ['M13', 'ダッシュボードの日報一覧・詳細', 'modal'],
    ['M14', 'お客様の電話・アポの記録', 'modal'],
    ['M15', '訪問できなかった場合の記録', 'modal'],
    ['M16', 'レシートの拡大', 'modal'],
    ['M17', '経費の修正', 'modal'],
    ['M18', '補充の依頼', 'modal'],
    ['M19', 'QRコード読取（カメラ）', 'overlay'],
  ]),

  ...T('STR', [
    ['01', '店舗（ログイン）', 'page'],
    ['02', '来店（受付・待ち・対応中・予約・完了）', 'page'],
    ['03', '買取 1 お客様確認', 'step'],
    ['04', '買取 2 説明事項', 'step'],
    ['05', '買取 3 買取明細', 'step'],
    ['05-1', '買取 3-2 本人確認（お客様の入力を確認）', 'step'],
    ['06', '買取 4 シール', 'step'],
    ['07', '買取 5 確認・支払い', 'step'],
    ['08', 'お客様画面（いらっしゃいませ）', 'page'],
    ['08-1', 'お客様画面 ご本人情報のご確認', 'step'],
    ['08-2', 'お客様画面 ご説明事項', 'step'],
    ['08-3', 'お客様画面 買取内容（明細）', 'step'],
    ['08-4', 'お客様画面 商品の準備中', 'step'],
    ['08-5', 'お客様画面 お支払い', 'step'],
    ['08-6', 'お客様画面 ありがとうございました', 'step'],
    ['08-7', 'お客様画面 来店の受付（お名前・電話番号の入力）', 'step'],
    ['08-8', 'お客様画面 本人確認の入力（住所・生年月日など）', 'step'],
    ['08-9', 'お客様画面 入力を受け付けました', 'step'],
  ]),

  ...T('WH', [
    ['01', '倉庫・物流（ログイン）', 'page'],
    ['02', '商品管理（一覧）', 'tab'],
    ['02-1', '商品管理（買取日・お客様別）', 'mode'],
    ['02-2', '商品管理（QR読取結果・商品の詳細）', 'mode'],
    ['03', '入庫', 'tab'],
    ['04', '倉庫間移動（パックの一覧）', 'tab'],
    ['04-1', '倉庫間移動（パックの作業）', 'mode'],
    ['05', '販売（出品）（パックの一覧）', 'tab'],
    ['05-1', '販売（出品）（パックの作業）', 'mode'],
    ['06', '売上管理', 'tab'],
    ['07', 'クーリングオフ返品', 'tab'],
    ['M01', 'メニュー', 'overlay'],
    ['M02', 'クーリングオフ依頼の詳細（やり取り・回答・返送）', 'modal'],
    ['M03', 'カメラ（商品を探す）', 'overlay'],
    ['M04', 'カメラ（読み取って入庫）', 'overlay'],
    ['M05', 'カメラ（読み取って、パックに入れる）', 'overlay'],
    ['P01', '送付明細・委託明細・納品書（印刷）', 'print'],
    ['P02', '発送伝票（印刷）', 'print'],
  ]),

  ...T('HQ', [
    ['01', '査定部・鑑定士サポート（左：訪問の一覧／中央：訪問の明細／右：訪問全体のコメント）', 'page'],
    ['02', '査定部・鑑定士サポート（右：商品の査定のやり取り）', 'mode'],
    ['03', '査定部・鑑定士サポート（右：明細に入っていない査定依頼）', 'mode'],
    ['04', '査定部・査定（左：査定待ちの一覧／右：シールの読み取り）', 'page'],
    ['04-1', '査定部・査定（右：登録内容の確認・確定）', 'mode'],
    ['M01', '鑑定士へのお知らせを送る', 'modal'],
    ['M02', 'メニュー', 'overlay'],
    ['M03', '訪問予定の事前確認（お客様の情報）', 'modal'],
  ]),

  ...T('ACC', [
    ['01', '経費精算', 'tab'],
    ['02', '残高・入出金管理', 'tab'],
    ['03', '週間収支', 'tab'],
    ['04', '固定費（メニューには出ない）', 'tab'],
    ['M01', 'メニュー', 'overlay'],
    ['M02', '鑑定士とのやり取り（経費・補充）', 'modal'],
    ['M03', '画像の拡大（領収書・写真）', 'modal'],
  ]),

  ...T('MKT', [
    ['01', 'チラシ（登録・一覧）', 'tab'],
    ['03', '配布カレンダー', 'tab'],
    ['02', '反響管理（チラシごとの受付・効果）', 'tab'],
    ['04', 'ログイン', 'page'],
    ['05', 'ダッシュボード', 'tab'],
    ['M01', 'メニュー', 'overlay'],
    ['M02', '反響管理・チラシの詳細（日ごとの受付・アポごとの買取）', 'modal'],
    ['M03', '配布カレンダー・その日に配布するチラシ', 'modal'],
  ]),

  ...T('MST', [
    ['01', '社員', 'tab'],
    ['02', '部署', 'tab'],
    ['03', '営業所', 'tab'],
    ['04', '出張', 'tab'],
    ['05', '店舗', 'tab'],
    ['06', '倉庫', 'tab'],
    ['07', '委託先', 'tab'],
    ['M01', 'メニュー', 'overlay'],
  ]),

  ...T('GMO', [
    ['01', 'GMOサイン（ログイン）', 'page'],
    ['02', '契約一覧', 'page'],
    ['03', '契約詳細', 'page'],
    ['M01', '契約書のプレビュー', 'overlay'],
    ['P01', '契約書（印刷）', 'print'],
  ]),
];

const BY_ID = new Map(SCREENS.map((s) => [s.id, s]));
export const screenOf = (id) => BY_ID.get(id) ?? null;
export const screenName = (id) => BY_ID.get(id)?.name ?? '';
export const appOf = (id) => APPS[String(id).split('-')[0]] ?? '';

// ---- 画面の状態から、いまの画面IDを決める --------------------------------------------------------

// コールセンター。tab=new|calendar|dispatch|cooloff|store。受電は、地図・完了・変更・既存の予約あり・新規の入力で分ける
export function ccScreenId({ tab, bodyStage, editId, done, mapAddress, cvMode } = {}) {
  if (tab === 'calendar') return cvMode === 'day' ? 'CC-02-1' : 'CC-02';
  if (tab === 'dispatch') return 'CC-03';
  if (tab === 'cooloff') return 'CC-04';
  if (tab === 'store') return 'CC-05';
  if (done) return 'CC-01-5';
  if (mapAddress) return 'CC-01-4';
  if (editId) return 'CC-01-3';
  if (bodyStage === 'open') return 'CC-01-1';
  if (bodyStage === 'new') return 'CC-01-2';
  return 'CC-01';
}

export const masterScreenId = (tab) => ({ employees: 'MST-01', departments: 'MST-02', offices: 'MST-03', trips: 'MST-04', stores: 'MST-05', warehouses: 'MST-06', vendors: 'MST-07' })[tab] ?? 'MST-01';
// マーケティング部。tab=dashboard|flyers|calendar|response。詳細は、モーダル（MKT-M02・M03）なので、ページのIDは変わらない
export const mktScreenId = ({ staff = true, tab } = {}) => (!staff ? 'MKT-04' : tab === 'dashboard' ? 'MKT-05' : tab === 'calendar' ? 'MKT-03' : tab === 'response' ? 'MKT-02' : 'MKT-01');
export const accountingScreenId = (tab) => ({ claims: 'ACC-01', balance: 'ACC-02', weekly: 'ACC-03', fixed: 'ACC-04' })[tab] ?? 'ACC-01';

// 鑑定士タブレット（state: user・auth.screen・view・phase・step・sched.tab・outcome・showStaff）
export function tabletScreenId(s) {
  if (!s.user) return { login: 'TAB-01', sms: 'TAB-02', forgot: 'TAB-03', 'forgot-sms': 'TAB-04', newpw: 'TAB-05' }[s.auth?.screen] ?? 'TAB-01';
  if (s.view === 'visit') {
    if (s.step === 0) return s.outcome != null ? 'TAB-21' : 'TAB-20';
    if (s.step === 4) return s.showStaff ? 'TAB-26' : 'TAB-25';
    return { 1: 'TAB-22', 2: 'TAB-23', 3: 'TAB-24', 5: 'TAB-27', 6: 'TAB-28' }[s.step] ?? 'TAB-20';
  }
  if (s.view === 'workday') return s.phase === 'before' ? 'TAB-11' : s.phase === 'closed' ? 'TAB-13' : 'TAB-12';
  if (s.view === 'schedule') return s.sched?.tab === 'route' ? 'TAB-15' : 'TAB-14';
  return { dashboard: 'TAB-10', customers: 'TAB-16', expense: 'TAB-17', return: 'TAB-18' }[s.view] ?? 'TAB-19';
}
// 鑑定士タブレットのモーダル（state.modal.type）→ 画面ID
export const TAB_MODAL_IDS = {
  ai: 'TAB-M02', 'finish-confirm': 'TAB-M03', customer: 'TAB-M04', item: 'TAB-M05', appraisal: 'TAB-M06', comments: 'TAB-M07', eval: 'TAB-M08',
  message: 'TAB-M09', leadermsg: 'TAB-M10', hearing: 'TAB-M11', dashvisits: 'TAB-M12', dashreports: 'TAB-M13', custcall: 'TAB-M14',
  outcome: 'TAB-M15', receipt: 'TAB-M16', revise: 'TAB-M17', advance: 'TAB-M18',
};

export const storeScreenId = ({ staff, view, draft } = {}) => {
  if (!staff) return 'STR-01';
  if (view !== 'purchase' || !draft) return 'STR-02';
  return ['STR-03', 'STR-04', 'STR-05', 'STR-05-1', 'STR-06', 'STR-07'][draft.step] ?? 'STR-03';
};

// 倉庫・物流。packOpen=パックを開いている（作業の画面）、scan=QR読取結果を出している、lot=買取日・お客様別
export function whScreenId({ staff, tab, packOpen = false, scan = false, lot = false } = {}) {
  if (!staff) return 'WH-01';
  if (tab === 'receive') return 'WH-03';
  if (tab === 'transfer') return packOpen ? 'WH-04-1' : 'WH-04';
  if (tab === 'list') return packOpen ? 'WH-05-1' : 'WH-05';
  if (tab === 'sales') return 'WH-06';
  if (tab === 'return') return 'WH-07';
  return scan ? 'WH-02-2' : lot ? 'WH-02-1' : 'WH-02';
}

// 査定部。tab: support（鑑定士サポート）／appraisal（査定。sel は読み取って開いている商品）
export const hqScreenId = (sel, tab = 'support') => {
  if (tab === 'appraisal') return sel ? 'HQ-04-1' : 'HQ-04';
  return !sel ? 'HQ-01' : sel.type === 'req' ? 'HQ-03' : 'HQ-02';
};

export const gmoScreenId = (route) => ({ login: 'GMO-01', detail: 'GMO-03' })[route] ?? 'GMO-02';

// ---- 画面に出す（DOM）-------------------------------------------------------------------------------

export const screenLabel = (id) => `画面ID ${id}　${screenName(id)}`;

// 画面の隅（左下）に、いまの画面IDを、いつも出す。再描画しても消えないよう、#root の外（body）に置く。クリックの邪魔にならない
export function setScreenBadge(id) {
  if (!id || typeof document?.getElementById !== 'function' || typeof document.createElement !== 'function') return; // 画面のない環境（テスト）では何もしない
  let el = document.getElementById('screen-id-badge');
  if (!el) {
    el = document.createElement('div');
    el.id = 'screen-id-badge';
    el.setAttribute('style', 'position:fixed;left:8px;bottom:8px;z-index:9999;pointer-events:none;max-width:70vw;padding:2px 8px;border-radius:9999px;background:rgba(15,23,42,.82);color:#fff;font:700 11px/1.6 system-ui,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis');
    document.body.appendChild(el);
    const css = document.createElement('style');
    css.textContent = '@media print{#screen-id-badge{display:none!important}}'; // 印刷には、画面IDを入れない
    document.head?.appendChild(css);
  }
  el.dataset.screenId = id;
  el.textContent = screenLabel(id);
}

// モーダル・ドロワーの中に出す、画面IDの札（モーダルの先頭に置く）。印刷には出さない
export const modalBadgeHtml = (id) => `<span data-screen-id="${id}" class="print:hidden" style="display:inline-block;margin:0 0 4px;padding:1px 8px;border-radius:9999px;background:#0f172a;border:1px solid rgba(255,255,255,.55);color:#fff;font:700 10px/1.6 system-ui,sans-serif">${screenLabel(id)}</span>`;
