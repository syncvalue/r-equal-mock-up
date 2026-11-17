import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRecording, addRecording, recordingsOf, fmtDuration, fmtSize, pickMime, recordingReady } from '../src/recording.js';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.window = { matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener() {} };
globalThis.document = { documentElement: { classList: { toggle() {}, contains: () => false }, style: {} }, querySelector: () => ({}), querySelectorAll: () => [], addEventListener() {}, activeElement: null, head: { appendChild() {} }, createElement: () => ({}) };
const { BRIEFING_CHECKS, canProceed, briefingView } = await import('../src/views.js');

const base = { id: 'REC-1', visitId: 'V-1', userId: 'u01', customerName: '山田 花子', startedAt: 1_000_000, endedAt: 1_000_000 + 754_000, size: 2_400_000, mime: 'audio/webm' };

test('録音の記録: 録音時間を秒で持ち、同じIDは差し替える', () => {
  const r = makeRecording(base);
  assert.equal(r.durationSec, 754);
  assert.equal(r.visitId, 'V-1');
  const list = addRecording(addRecording([], r), { ...r, size: 5 });
  assert.equal(list.length, 1);
  assert.equal(list[0].size, 5);
  assert.deepEqual(recordingsOf(addRecording(list, makeRecording({ ...base, id: 'REC-2', visitId: 'V-2' })), 'V-1').map((x) => x.id), ['REC-1']);
});

test('録音の表示: 時間とサイズ', () => {
  assert.equal(fmtDuration(754), '12:34');
  assert.equal(fmtDuration(3725), '1:02:05');
  assert.equal(fmtDuration(0), '0:00');
  assert.equal(fmtSize(2_400_000), '2.3 MB');
  assert.equal(fmtSize(30_000), '29 KB');
});

test('録音の形式: 端末が対応しているものを選ぶ（なければブラウザ任せ）', () => {
  assert.equal(pickMime((t) => t === 'audio/mp4'), 'audio/mp4');
  assert.equal(pickMime((t) => t.startsWith('audio/webm')), 'audio/webm;codecs=opus');
  assert.equal(pickMime(() => false), '');
});

test('録音できるのは、説明事項で録音の了承を得たあとだけ', () => {
  assert.ok(BRIEFING_CHECKS.some((c) => c.key === 'record'));
  assert.equal(recordingReady({ checks: {} }), false);
  assert.equal(recordingReady({ checks: { record: true } }), true);
});

test('録音を始めるまで、説明事項の次へ進めない（録音は必須）', () => {
  const checks = Object.fromEntries(BRIEFING_CHECKS.map((c) => [c.key, true]));
  const s = { step: 2, visitId: 'V-X', briefing: { checks, propose: 'yes' }, rec: null };
  assert.equal(canProceed(s), false);
  assert.match(briefingView(s), /録音を開始/);
  assert.equal(canProceed({ ...s, rec: { startedAt: 1 } }), true);
  mem.set('rq-mock-recordings', JSON.stringify([{ id: 'R', visitId: 'V-X', durationSec: 5 }])); // 登録済みでもよい
  assert.equal(canProceed(s), true);
  mem.clear();
});
