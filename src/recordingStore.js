// やり取りの録音（ブラウザのマイク録音 MediaRecorder）と、録音データ本体の保存（IndexedDB）。ブラウザ専用（テストの対象外）。
// 録音の記録（いつ・誰の訪問か）は recording.js。
import { pickMime } from './recording.js';

const DB = 'rq-mock-recordings-db';
const STORE = 'audio';

const openDb = () => new Promise((resolve, reject) => {
  const req = indexedDB.open(DB, 1);
  req.onupgradeneeded = () => req.result.createObjectStore(STORE);
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

const run = async (mode, fn) => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(req.result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
};

export const putAudio = (id, blob) => run('readwrite', (s) => s.put(blob, id));
export const getAudio = (id) => run('readonly', (s) => s.get(id));

export const canRecord = () => Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

let session = null; // { recorder, stream, chunks, startedAt, wake }
export const isRecording = () => Boolean(session);

export async function startRecording() {
  if (session) return session.startedAt;
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mime = pickMime((t) => MediaRecorder.isTypeSupported(t));
  const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  recorder.start(10000); // 10秒ごとにデータを確保（途中で止まっても、そこまでは残る）
  const wake = await navigator.wakeLock?.request('screen').catch(() => null); // 録音中は画面を消さない（消えると録音が止まる端末がある）
  session = { recorder, stream, chunks, startedAt: Date.now(), wake };
  return session.startedAt;
}

// 停止して、録音データを返す
export const stopRecording = () => new Promise((resolve, reject) => {
  if (!session) { reject(new Error('録音していません')); return; }
  const { recorder, stream, chunks, startedAt, wake } = session;
  session = null;
  recorder.onstop = () => {
    stream.getTracks().forEach((t) => t.stop());
    wake?.release?.().catch(() => {});
    const mime = recorder.mimeType || 'audio/webm';
    resolve({ blob: new Blob(chunks, { type: mime }), startedAt, endedAt: Date.now(), mime });
  };
  recorder.onerror = (e) => reject(e.error ?? new Error('録音を停止できませんでした'));
  recorder.stop();
});
