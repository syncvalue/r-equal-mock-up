import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wantsPreciousMetal, PRECIOUS_ADVICE } from '../src/preciousMetal.js';

test('売りたいものに貴金属があるか: 分野名・品名・素材の言葉から判定する', () => {
  for (const t of ['貴金属・ジュエリー', 'ブランドバッグ ／ 貴金属・ジュエリー', '指輪 3点、ネックレス 2点', '金のネックレス', '純金の延べ棒', 'プラチナの指輪', 'K18 ブレスレット', 'Pt900', 'ダイヤ', 'インゴット', '金貨', 'ゴールド', '金歯', '真珠のネックレス']) {
    assert.equal(wantsPreciousMetal(t), true, t);
  }
});

test('貴金属がないもの: ほかの分野、「お金」「金額」のような言葉、未入力・未確認は、貴金属としない', () => {
  for (const t of ['ブランドバッグ', '腕時計', 'ロレックス 2本', 'カメラ・家電', '背広 数着', '着物・骨董', 'お金を払ってほしい', 'お金のこと', '金額を知りたい', '（既存の予定）', '未確認', '', null, undefined]) {
    assert.equal(wantsPreciousMetal(t), false, String(t));
  }
});

test('配車係への案内文: 1円でも高く買い取るため、上位ランクの鑑定士をすすめる', () => {
  assert.match(PRECIOUS_ADVICE, /貴金属/);
  assert.match(PRECIOUS_ADVICE, /ランクの高い鑑定士/);
});
