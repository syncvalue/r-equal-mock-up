import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const { handlerLabel } = await import('../src/unitHandler.js');

test('商品の担当の表示: 訪問買取は「担当営業 ○○」、店頭買取は「なんば店・店舗スタッフ ○○」（店舗スタッフを営業と取り違えない）', () => {
  assert.equal(handlerLabel({ userId: 'u01' }), '担当営業 鈴木 一郎');
  assert.equal(handlerLabel({ channel: 'store', storeId: 'S-NAMBA', userId: 'st01' }), 'なんば店・店舗スタッフ 田中 美咲');
  assert.equal(handlerLabel({ channel: 'store', storeId: 'S-SHINJUKU', userId: 'st03' }), '新宿店・店舗スタッフ 松井 彩花');
  assert.equal(handlerLabel({ channel: 'store', storeId: 'S-NAMBA', userId: 'gone' }), 'なんば店・店舗スタッフ（不明）'); // 名簿にない店舗スタッフ
});
