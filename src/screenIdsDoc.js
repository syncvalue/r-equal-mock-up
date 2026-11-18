// 画面ID一覧（Markdown）を、表から組み立てる。scripts/gen-screen-ids.mjs と、テスト（一覧が表と合っているか）が使う
import { APPS, SCREENS } from './screenIds.js';

const KIND = { page: 'ページ', tab: 'タブ', mode: '状態', step: '手順', modal: 'モーダル', overlay: 'ドロワー・重ねて出す画面', print: '印刷用' };

export function screenIdsDoc() {
  const head = [
    '# 画面ID一覧',
    '',
    '**クライアントからの修正依頼で、「どの画面か」を伝えるための番号**です。画面の左下に、いまの画面IDを、いつも出しています（モーダル・ドロワーは、その中にも出します）。',
    '',
    '- 形式: アプリの記号＋番号。ページ・タブは `CC-01`、同じ画面の中の状態は `CC-01-1`、モーダル・ドロワー・重ねて出す画面は `CC-M01`、印刷用は `WH-P01`。',
    '- この一覧は、`src/screenIds.js` の表から作っています（`node scripts/gen-screen-ids.mjs`）。**新しい画面・モーダルを足したら、表に足して、一覧を作り直してください**（テストが、一覧と表のずれを見つけます）。',
    '- 画面に出ない、ブラウザの確認ダイアログ（OK／キャンセル）・入力ダイアログ・トーストは、IDを振っていません。',
    '',
  ];
  const body = Object.entries(APPS).flatMap(([app, name]) => {
    const rows = SCREENS.filter((s) => s.app === app);
    return [`## ${app}　${name}`, '', '| 画面ID | 画面名 | 種類 |', '|---|---|---|', ...rows.map((s) => `| ${s.id} | ${s.name} | ${KIND[s.kind]} |`), ''];
  });
  return [...head, ...body].join('\n');
}
