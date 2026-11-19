# 文書のインデックス（どこに、何が書いてあるか）

仕様書類の入口です。**知りたいことの場所**を探すときは、まず、ここを見てください。

- 1. 文書の一覧
- 2. 仕様書の章別の索引（章番号 → ファイル）
- 3. 知りたいことから探す（逆引き）
- 4. 今後の要件（FUTURE_REQUIREMENTS.md）の索引
- 5. README.md の索引
- 6. 更新のルール

---

## 1. 文書の一覧

| 文書 | 目的 | いつ読むか・書くか |
|---|---|---|
| [CLAUDE.md](../CLAUDE.md) | Claudeへの作業ルール（仕様の管理方法、用語集を使う決まり、テスト・コミットの形式） | 作業の前提。ルールを変えるとき |
| [README.md](../README.md) | **使い方**。起動方法、画面ごとの操作の手引き（特に倉庫・物流）、ファイル構成、Googleマップのキー | 画面を触る人・始めて入る人 |
| [docs/SPEC.md](SPEC.md) | **仕様書の入口**（分割の説明だけ。本文は、下の2行） | 最初に1回 |
| [docs/shared/design-philosophy.md](shared/design-philosophy.md) | **設計思想（設計者の想定）**。エンジニアへの引き継ぎ。判断の原則、画面設計の方針、守ってほしい業務上の前提、バックエンドの方針。設計者の指示を、日付つきで足していく | **開発を始める前に、最初に**。設計者が方針を指示したとき（追記） |
| [docs/shared/actors.md](shared/actors.md) | **アクター（このシステムを使う人）と、使える機能**。11のアクター（8役割＋役員・社長・システム管理者）、区分（一般・責任者）、縦＝アクター・横＝機能の○△×の表、システムを使わない関係者・外部システム | 誰が何を使えるかを知りたいとき。役割や機能を足す・変えたとき（更新） |
| [docs/shared/](shared/) | 機能をまたぐ共通の文書: 用語集・全体像（0章）・画面共通のルール（0.3.x・8章）・テストと開発ルール（9章）・本実装に向けた課題（10章） | 用語を使うとき（用語集）。共通ルールを確認・変更するとき |
| [docs/features/](features/) | **機能別の仕様**（29機能。1機能＝1フォルダの `spec.md`）。業務上の前提と決定の経緯、振る舞い、モックの限界 | **触る機能のファイルだけ読む**。機能を足す・変えるとき（先に読む）。仕様を変えたら、その機能のファイルを更新 |
| [docs/FUTURE_REQUIREMENTS.md](FUTURE_REQUIREMENTS.md) | **今後の要件**。まだコードに反映していない約束ごと。区分つき（モックで実装／正式版の要件／未定／保留） | 新しい機能を実装する前（関係する項目がないか）。「今は不要、今後の要件」と言われたとき |
| [docs/SCREEN_IDS.md](SCREEN_IDS.md) | **画面ID一覧**（約150画面）。`src/screenIds.js` の表から自動生成 | クライアントの修正依頼が、どの画面か分からないとき。画面を足すとき |
| docs/INDEX.md（この文書） | 文書の索引 | 探すとき。章や文書を足したとき |
| `tests/` | **振る舞いの正**。仕様書とコードが食い違ったら、テストが正 | `npm test` |
| （リポジトリの外）自動メモリ | 業務の前提と、作業のやり方の記録（Claudeの記憶。`~/.claude/projects/.../memory/`） | Claudeが、毎回読む |

**優先順位**: テスト・コード ＞ 仕様書（shared/・features/）＞ README.md。食い違いを見つけたら、直して、依頼者に知らせる。

---

## 2. 仕様書の章別の索引（章番号 → ファイル）

仕様書は、機能別のファイルに分割してある（[SPEC.md](SPEC.md) は入口）。**章番号は、分割前のまま**で、ほかの文書・コードのコメントからの参照が切れない。番号から、ファイルを引く。ファイルは、`docs/` からの相対パス。

### 冒頭

| 場所 | 内容 |
|---|---|
| [glossary](shared/glossary.md) | 表記の統一。**使う語**と**使わない語**。人・組織・業務の言葉は、必ず、ここにそろえる（下の3つの表） |
| [actors](shared/actors.md) | アクター（10：現場の7役割＋役員・社長・システム管理者）と、使える機能。区分（一般・責任者）。縦＝アクター・横＝機能の○△×の表 |
| [design-philosophy](shared/design-philosophy.md) | 設計思想（設計者の想定）。モックの位置づけ、設計の原則、画面設計の方針、守ってほしい業務上の前提、エンジニア（とAI）が開発を始めるときに |
| 　会社・部署・社員・役割 | 会社、部署、社員、役割、アクター、鑑定士、グループリーダー、担当鑑定士、オペレーター、配車係、査定員、査定依頼、完結、経理担当、営業サポート、倉庫担当、店舗スタッフ、マーケティング担当 |
| 　組織・場所 | 営業所、担当エリア、出張（エリア・メンバー）、店舗、グループ、倉庫、マスタ、本社、査定部・経理部、コールセンター |
| 　業務の言葉 | お客様、購入者、委託先、店頭買取、訪問買取、来店、来店予約、飛び込み、補充金、補充の依頼、引き出し金額、一次チェック、固定費、所持金、粗利、受付、訪問予定、顧客ID、訪問、前日確認、休み、仮確定、確定、契約、入庫、シール、クーリングオフ保管棚、高額品、見送り品、クーリングオフ、顧客ランク、鑑定士のランク、厄介度、チラシ、チラシID、配布方法、反響 |

### 0. 全体像

| 章 | ファイル | 内容 |
|---|---|---|
| 0（冒頭） | [shared/overview](shared/overview.md) | 全体像の章。この資料の対象と、画面共通の決まり（0.3.1〜0.3.4）、ダミーの範囲（0.4） |
| 0.1 | [shared/overview](shared/overview.md) | 登場する人と画面（役割・画面・URL・主な役割の表） |
| 0.2 | [shared/overview](shared/overview.md) | 業務の流れ（電話→仮確定→配車確定→訪問→入庫→販売。クーリングオフ、来店予約の流れ） |
| 0.3 | [shared/overview](shared/overview.md) | 技術と構成（Vite・localStorage・フォルダ構成・起動） |
| 0.3.1 | [shared/ui-rules](shared/ui-rules.md) | 補足説明は「?」にまとめる（画面共通） |
| 0.3.2 | [shared/ui-rules](shared/ui-rules.md) | 色とアイコン（使う色は4色。例外: 鑑定士の帯の色・ランクの色・性別記号。絵文字を使わない） |
| 0.3.3 | [shared/ui-rules](shared/ui-rules.md) | デモ専用の部品（「デモ｜」の見た目。本番では消える） |
| 0.3.4 | [shared/ui-rules](shared/ui-rules.md) | 入力例（プレースホルダー）は薄い灰色 |
| 0.4 | [shared/overview](shared/overview.md) | ダミーであるもの（本実装で置き換える対象の表） |

### 1. 鑑定士タブレット（`/tablet/`）

| 章 | ファイル | 内容 |
|---|---|---|
| 1（冒頭） | [features/tablet-auth-menu](features/tablet-auth-menu/spec.md) | 鑑定士タブレットの章（iPad Pro の縦・横に合わせた、現場で使う画面） |
| 1.1 | [features/tablet-auth-menu](features/tablet-auth-menu/spec.md) | ログイン（ID・パスワード・SMS認証・パスワード再設定。初期画面の切り替え） |
| 1.2 | [features/tablet-auth-menu](features/tablet-auth-menu/spec.md) | メインメニュー（項目、始業・終業の活性・非活性） |
| 1.3 | [features/tablet-workday-expense](features/tablet-workday-expense/spec.md) | 始業・終業と経費（前日繰越金、補充の依頼、所持金、補充金と引き出し金額、経費、レシート、終業の現金の枚数入力、訪問できなかった場合） |
| 1.4 | [features/tablet-dashboard](features/tablet-dashboard/spec.md) | ダッシュボード・メッセージ・業績（粗利・再訪数・年間、グループリーダーの閲覧権限） |
| 1.5 | [features/tablet-schedule](features/tablet-schedule/spec.md) | 今日の予定・ルート確認（3日表示、予定の詳細に**前日確認の記録**を出す） |
| 1.6 | [features/tablet-visit](features/tablet-visit/spec.md) | 現地買取の流れ（訪問開始→お客様確認→説明事項→買取明細→買取商品の確認→シール紐づけ→送信・終了。商品の写真、査定依頼、持ち帰りの箱詰め、録音） |
| 1.7 | [features/tablet-customer-eval](features/tablet-customer-eval/spec.md) | お客様の評価（鑑定士の記録。訪問単位・お客様単位） |
| 1.8 | [features/warehouse-receiving](features/warehouse-receiving/spec.md) | 商品の入庫（詳細は5.2） |
| 1.9 | [features/tablet-customer-search](features/tablet-customer-search/spec.md) | 顧客検索（再訪のアポ取りのための顧客リスト、お気に入りとメモ、電話の結果の記録、電話の履歴の共有、しつこい電話の防止） |

### 2. コールセンター（`/callcenter/index.html`）

| 章 | ファイル | 内容 |
|---|---|---|
| 2（冒頭） | [features/callcenter-intake](features/callcenter-intake/spec.md) | 運用の前提（オペレーターは仮確定まで、配車係が最終確定）、画面の切り替え（左メニュー） |
| 2.1 | [features/callcenter-intake](features/callcenter-intake/spec.md) | 受付（オペレーター）: 電話番号の入口、訪問の履歴、顧客ID、入力欄の順、ヒアリング項目、**顧客ランク（推測）**、問合せ種別・広告種別、郵便番号から住所、地図とピン、来電のきっかけ、エリア判定、空き確認、カレンダー、公平な配分、仮確定 |
| 2.2 | [features/callcenter-intake](features/callcenter-intake/spec.md) | 仮確定後の変更・取消（折り返しの電話） |
| 2.3 | [features/dispatch](features/dispatch/spec.md) | 配車確定（配車係）: 帯と詳細、**顧客ランクと新規／再訪**、**ランクと性別の表示**、**色（ランク）と枠線（状態）**、お客様の詳細モーダル、顧客ランクの自動判定、配車係の権限ルール |
| 2.4 | [features/callcenter-intake](features/callcenter-intake/spec.md) | 音声入力デモ |
| 2.5 | [features/callcenter-cooloff](features/callcenter-cooloff/spec.md) | クーリングオフの受電と依頼（商品の検索、依頼の作成、進捗） |
| 2.6 | [features/store-reservation](features/store-reservation/spec.md) | 来店予約（店舗への予約。空き状況のカレンダー、枠の数） |
| 2.7 | [features/visit-calendar](features/visit-calendar/spec.md) | 訪問カレンダーと前日確認: 週の表・日別、帯の色と実線・点線、鑑定士で絞り込み、右の詳細、一覧の絞り込みと並び順（希望連絡時間帯順）、前日確認の記録、不通のまま終了 |

### 3〜7

| 章 | ファイル | 内容 |
|---|---|---|
| 3 | [features/appraisal-hq](features/appraisal-hq/spec.md) | 査定部の概要: 開閉式の左メニュー（鑑定士サポート・査定の2機能） |
| 3.1 | [features/appraisal-hq](features/appraisal-hq/spec.md) | 鑑定士サポート: 担当、買取明細のリアルタイム表示、査定依頼のチャット、承認・差戻し、お知らせ送信 |
| 3.2 | [features/appraisal-hq](features/appraisal-hq/spec.md) | **査定**: 高額品（紫・赤のシール）の登録内容を、シールのQRを読み取って確認し、確定する（郵送で届く）。鑑定士の区分（責任者・一般）による違いは正式版の要件 |
| 4（冒頭） | [features/accounting-balance](features/accounting-balance/spec.md) | 経理部の概要（メニュー3つ、固定費はメニューから外している） |
| 4.1 | [features/accounting-balance](features/accounting-balance/spec.md) | 残高・入出金管理（入出金の帳簿、鑑定士への補充金、補充の依頼のやり取り、お客様への支払） |
| 4.2 | [features/accounting-expense-check](features/accounting-expense-check/spec.md) | 経費精算（営業サポートの一次チェック、確認のポイント、1件ずつの確認、ボール＝誰の番か、経理部と鑑定士のチャット、鑑定士による修正） |
| 4.3 | [features/accounting-fixed-weekly](features/accounting-fixed-weekly/spec.md) | 固定費（メニューから外している） |
| 4.4 | [features/accounting-fixed-weekly](features/accounting-fixed-weekly/spec.md) | 週間収支 |
| 4.5 | [features/accounting-balance](features/accounting-balance/spec.md) | 共通（サンプルデータ、閾値） |
| 5（冒頭） | [features/warehouse-stock](features/warehouse-stock/spec.md) | 倉庫・物流の概要 |
| 5.1 | [features/warehouse-stock](features/warehouse-stock/spec.md) | ログインと倉庫マスタ |
| 5.2 | [features/warehouse-receiving](features/warehouse-receiving/spec.md) | 入庫と、シールの色・高額品、シールの貼り替え |
| 5.3 | [features/warehouse-stock](features/warehouse-stock/spec.md) | 商品管理（状態、一覧と買取日・お客様別、商品の写真） |
| 5.4 | [features/warehouse-packing](features/warehouse-packing/spec.md) | パックの流れ（倉庫間移動・委託・購入者への発送。書類、CSV） |
| 5.5 | [features/warehouse-stock](features/warehouse-stock/spec.md) | 自分の倉庫の商品だけ扱える |
| 5.6 | [features/warehouse-sales](features/warehouse-sales/spec.md) | 販売（出品）・売上管理 |
| 5.7 | [features/warehouse-cooloff](features/warehouse-cooloff/spec.md) | クーリングオフ返品（保管10日間、依頼、倉庫の回答・返送・完了、やり取り） |
| 6 | [features/gmosign](features/gmosign/spec.md) | GMOサイン（ダミー）: 本人確認書類、契約書の印刷 |
| 7（冒頭） | [features/master-employees](features/master-employees/spec.md) | マスタ管理の共通のルール（削除はなく有効・無効だけ） |
| 7.1 | [features/master-employees](features/master-employees/spec.md) | 社員（役割ごとの項目、**鑑定士のランクの変更と変遷**、ログインID） |
| 7.2 | [features/master-organization](features/master-organization/spec.md) | 部署 |
| 7.3 | [features/master-organization](features/master-organization/spec.md) | 営業所 |
| 7.4 | [features/master-trips](features/master-trips/spec.md) | 出張（出張エリア・期間・出張メンバー、エリア判定への反映） |
| 7.5 | [features/master-warehouses-vendors](features/master-warehouses-vendors/spec.md) | 倉庫（高額品の判定） |
| 7.6 | [features/master-warehouses-vendors](features/master-warehouses-vendors/spec.md) | 委託先 |
| 7.7 | [features/master-stores](features/master-stores/spec.md) | 店舗（古物商許可番号、納入先の倉庫） |

### 8〜11

| 章 | ファイル | 内容 |
|---|---|---|
| 8 | [shared/ui-rules](shared/ui-rules.md) | 横断的な決定事項（端末、表記の統一、**「ダミー画面」はGMOサインだけ**、**画面ID**、金額入力、リンク） |
| 9 | [shared/development](shared/development.md) | テストと開発ルール |
| 10 | [shared/production-gaps](shared/production-gaps.md) | 本実装に向けた課題（モックの限界。録音、認証・認可、DB、AI・OCR、店舗の未対応、店頭用の契約書）。**正式版の要件の記録は、FUTURE_REQUIREMENTS.md** |
| 11（冒頭） | [features/store-purchase](features/store-purchase/spec.md) | 店舗（店頭買取）の概要（クーリング・オフの対象外、古物営業法） |
| 11.1 | [features/store-purchase](features/store-purchase/spec.md) | ログインと画面の構成 |
| 11.2 | [features/store-purchase](features/store-purchase/spec.md) | 来店（一覧）: 予約・待ち・対応中・完了・取消・来ず |
| 11.3 | [features/store-purchase](features/store-purchase/spec.md) | 買取の流れ（6手順。**来店時は名前・電話番号だけ、本人確認は買取が決まってから**） |
| 11.4 | [features/store-purchase](features/store-purchase/spec.md) | 完了すると作られる記録（契約、入庫待ち、見送り品） |
| 11.5 | [features/store-purchase](features/store-purchase/spec.md) | モックの範囲 |
| 11.6 | [features/store-purchase](features/store-purchase/spec.md) | **お客様画面（2枚目のモニタ）**: 店舗スタッフの画面はお客様に見せない。「お客様画面へ反映」で更新、手順ごとの内容、自動で待機に戻す。**お客様が入力する画面（来店の受付・本人確認のOCR）** |

### 12. マーケティング部

| 章 | ファイル | 内容 |
|---|---|---|
| 12（冒頭） | [features/marketing-flyers](features/marketing-flyers/spec.md) | マーケティング部の概要（チラシで電話が来る流れ、チラシのID、画面の構成） |
| 12.1 | [features/marketing-flyers](features/marketing-flyers/spec.md) | チラシ（登録・一覧）: 項目、IDの採番、進捗（あらかじめ登録して、1件ずつ配布まで進める）、入稿期限、検索（進捗・エリア・配布方法・入稿期限・フリーワード）、受付との連動 |
| 12.2 | [features/marketing-flyers](features/marketing-flyers/spec.md) | 反響管理: 受付の件数・反響率・1件あたりの費用、買取の金額・粗利・損益、アポごとの買取、配布方法ごと、日ごとの受付 |
| 12.3 | [features/marketing-flyers](features/marketing-flyers/spec.md) | オペレーターへの「今日配布のチラシ」（受電の画面）。明日の予定、過去の傾向 |
| 12.6 | [features/marketing-flyers](features/marketing-flyers/spec.md) | ダッシュボード（本日配布・本日中に入稿・直近3か月の反響の上位・今月のまとめ） |
| 12.5 | [features/marketing-flyers](features/marketing-flyers/spec.md) | 配布カレンダー（月の表。日ごとの配布。日を押すと詳細） |
| 12.4 | [features/marketing-flyers](features/marketing-flyers/spec.md) | モックの限界・確認が要ること |

---

## 3. 知りたいことから探す（逆引き）

| 知りたいこと | 場所 |
|---|---|
| **設計の考え方**・画面設計の方針・エンジニアへの引き継ぎ | [設計思想](shared/design-philosophy.md) |
| **誰が何を使えるか**（アクター・役割ごとの機能） | [アクター](shared/actors.md) |
| 言葉の使い方（使う語・使わない語） | [用語集](shared/glossary.md) |
| 画面の**ID**、どの画面か分からない | [SCREEN_IDS.md](SCREEN_IDS.md)、[8章](shared/ui-rules.md) |
| **顧客ランク**（SS・S・A・B、自動判定の区切り、新規にも付ける、変遷） | [用語集](shared/glossary.md)、[2.1](features/callcenter-intake/spec.md)（受付の欄）、[2.3](features/dispatch/spec.md)（配車確定）、FUTURE_REQUIREMENTS R-[3](features/appraisal-hq/spec.md) |
| **鑑定士のランク**（変更・変遷、色） | [7.1](features/master-employees/spec.md)、[2.3](features/dispatch/spec.md)、[0.3.2](shared/ui-rules.md) |
| **ランクの色**・性別記号・枠線（実線・点線・黒の二重線） | [2.3](features/dispatch/spec.md)、[0.3.2](shared/ui-rules.md) |
| **前日確認**（連絡の記録、不通のまま終了、鑑定士への共有） | [用語集](shared/glossary.md)、[2.7](features/visit-calendar/spec.md)、[1.5](features/tablet-schedule/spec.md) |
| 訪問カレンダーの**実線・点線・「不通」の文字** | [2.7](features/visit-calendar/spec.md) |
| **休み**（欠勤・午前休などの表記をやめた経緯、斜線） | [用語集](shared/glossary.md)、[2.1](features/callcenter-intake/spec.md)（空き確認） |
| **配車確定**（確定、仮に戻す、権限ルール） | [2.3](features/dispatch/spec.md)、[2](features/callcenter-intake/spec.md)（冒頭） |
| 受付の入力項目・必須項目 | [2.1](features/callcenter-intake/spec.md) |
| **エリア判定**・出張 | [2.1](features/callcenter-intake/spec.md)、[7.4](features/master-trips/spec.md) |
| 色・アイコン・絵文字の決まり | [0.3.2](shared/ui-rules.md) |
| 「?」アイコン、デモ専用のボタン | [0.3.1](shared/ui-rules.md)、[0.3.3](shared/ui-rules.md) |
| **補充金・補充の依頼・所持金** | [用語集](shared/glossary.md)、[1.3](features/tablet-workday-expense/spec.md)、[4.1](features/accounting-balance/spec.md) |
| 経費・レシート・インボイス | [1.3](features/tablet-workday-expense/spec.md)、[4.2](features/accounting-expense-check/spec.md) |
| 経費精算（一次チェック、差戻し、鑑定士による修正） | [用語集](shared/glossary.md)、[4.2](features/accounting-expense-check/spec.md) |
| **シールの色・高額品・本社への移動** | [5.2](features/warehouse-receiving/spec.md)、[用語集](shared/glossary.md) |
| **査定**（高額品の確認・確定、鑑定士の区分による違い） | [3.2](features/appraisal-hq/spec.md)、FUTURE_REQUIREMENTS R-[5](features/appraisal-hq/spec.md)、[用語集](shared/glossary.md) |
| パック・伝票・CSV | [5.4](features/warehouse-packing/spec.md) |
| **クーリングオフ**（保管10日、依頼、返送） | [2.5](features/callcenter-cooloff/spec.md)、[5.7](features/warehouse-cooloff/spec.md)、[用語集](shared/glossary.md) |
| **店頭買取**（クーリング・オフの対象外） | [11章](features/store-purchase/spec.md)、[用語集](shared/glossary.md) |
| **お客様画面**（店舗のデュアルモニタ、お客様に見せる専用画面、反映）・**お客様自身の入力**（来店の受付、本人確認のOCR） | [11.6](features/store-purchase/spec.md)、FUTURE_REQUIREMENTS R-[7](features/store-purchase/spec.md) |
| 来店予約 | [2.6](features/store-reservation/spec.md)、[11.2](features/store-purchase/spec.md) |
| 顧客検索・電話の履歴の共有・しつこい電話の防止 | [1.9](features/tablet-customer-search/spec.md)、FUTURE_REQUIREMENTS R-[2](features/callcenter-intake/spec.md) |
| **チラシ・反響管理**（チラシのID、どのチラシが効果的か、今日配布のチラシ） | [12章](features/marketing-flyers/spec.md)、[2.1](features/callcenter-intake/spec.md)（来電のきっかけ）、FUTURE_REQUIREMENTS R-[6](features/marketing-flyers/spec.md) |
| **電話の仕組み**（MiiTel から自前へ。受電・架電の録音、着信時のお客様情報の表示、音声からの自動入力。クライアントへの確認事項） | FUTURE_REQUIREMENTS R-[8](features/callcenter-intake/spec.md) |
| **情報の公開範囲**（他の鑑定士の情報を見せない） | FUTURE_REQUIREMENTS R-[1](features/tablet-auth-menu/spec.md) |
| ダミーであるもの・モックの限界 | [0.4](shared/overview.md)、[10章](shared/production-gaps.md) |
| まだ決まっていないこと・保留 | FUTURE_REQUIREMENTS（保留中の要件）、[2.7](features/visit-calendar/spec.md)・[4.2](features/accounting-expense-check/spec.md)・[10章](shared/production-gaps.md) |
| 画面ごとの**使い方（操作）** | README |
| 起動方法・Googleマップのキー | README（起動、Googleマップのキー） |
| テストの方針・コミット形式 | [9章](shared/development.md)、CLAUDE.md |

---

## 4. 今後の要件（FUTURE_REQUIREMENTS.md）の索引

| 項目 | 内容 | 区分 |
|---|---|---|
| 冒頭 | 区分の説明（モックで実装／正式版の要件／未定／保留）と使い方 | |
| R-1 | 情報の公開範囲: 鑑定士に、他の鑑定士の情報を見せない。決定事項（ランク・厄介度・クーリングオフ歴・リピーターは見せる、見送り品は見せない、グループリーダーは例外、他部署は対象外） | 正式版の要件（モックでは実装しない） |
| R-2 | 電話の履歴は、オペレーターを含む他の人にも見せる（他の鑑定士の名前は伏せる）。受電履歴を配車係・査定部にも見せる | 顧客検索・受電履歴はモックで実装済み。配車係・査定部への表示は未定 |
| R-3 | ランクは変わっていくもの。新規にも顧客ランクを付ける。受付の欄、鑑定士ランクの変更、前日確認の共有、連絡の期限なし | モックで実装済み |
| R-4 | アクターの区分（一般・責任者）と、役員・社長・システム管理者の追加。責任者にできること・役員に見せる範囲は要確認 | 正式版の要件 |
| R-6 | マーケティング部: 買取の金額・粗利での効果測定・デザインデータの保管・オペレーターへの明日の予定と傾向（実装済み）。配布エリアのマスタ化・責任者にだけできることは未定 | モックで実装済み（一部未定） |
| R-5 | 査定の確定の流れは、鑑定士の区分で変わる（責任者＝自分で確定／一般＝査定部が確認して確定）。モックは、紫・赤をすべて査定待ちにしている | 正式版の要件（モックでは実装しない） |
| R-7 | 店舗のお客様画面: 端末のサーバー経由のひもづけ、登録した端末だけが開ける、お客様に見せてよい項目だけをサーバーが返す | 正式版の要件（モックでは実装しない） |
| R-8 | 電話の仕組み: MiiTel から自前へ（受電・架電の録音、お客様情報の表示、音声からの自動入力）。フリーダイヤルは変えない。クライアントへの確認事項つき | 正式版の要件（モックでは実装しない） |
| 保留中の要件 | 経費精算の二次チェック以降、店舗系（レジ現金・査定部連動・店舗別業績・営業時間・納入先・古物台帳・契約書様式）、配車確定の過去日のランク、訪問カレンダーの濃さの区切り | 保留 |

---

## 5. README.md の索引

| 見出し | 内容 |
|---|---|
| 起動 | Docker／npm での起動 |
| 画面 | 画面とURLの一覧 |
| 1日の流れ（始業・終業と経費） | 鑑定士の始業・所持金・経費・終業 |
| 現地買取の流れ | 訪問買取の手順 |
| 店頭買取（店舗） | 来店・買取の6手順、お客様画面 |
| 商品の入庫 | 鑑定士の入庫、倉庫の入庫 |
| 倉庫・物流（商品管理・販売・返品） | 画面ごとの操作（倉庫マスタ、入庫、倉庫間移動、販売、売上、写真、クーリングオフ返品） |
| コールセンター（受付・配車） | 受付、空き確認、配車確定、確定の反映 |
| 　訪問カレンダーと前日確認 | 週の表・日別、前日確認の記録 |
| 　クーリングオフ | 受電と依頼 |
| 構成 | ファイル構成 |
| Googleマップのキー | 受電画面の地図 |

---

## 6. 更新のルール

- **新しい機能を足す・変えるとき**: 先に、触る機能の `spec.md`（このINDEXで引く）と FUTURE_REQUIREMENTS.md を読み、矛盾がないか確認する（CLAUDE.md）。実装したら、SPEC.md を更新し、必要なら README.md も。
- **「今は不要、今後の要件」と言われたとき**: FUTURE_REQUIREMENTS.md に、区分つきで足す。
- **画面・モーダルを足したとき**: `src/screenIds.js` の表にIDを足し、`node scripts/gen-screen-ids.mjs` で SCREEN_IDS.md を作り直す。
- **仕様書（shared/・features/）に章・節を足したとき**: この INDEX.md の「2. 章別の索引」にも足す（テストが、節の番号の抜けを見つける）。
- **機能を足したとき**: `docs/features/<機能名>/spec.md` を作り、「2. 章別の索引」に足す。1ファイルは、200〜300行までにする（大きくなったら、機能を分ける）。
- **新しい文書を足したとき**: 「1. 文書の一覧」に足す。
