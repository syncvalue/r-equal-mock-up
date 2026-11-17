// やり取りの録音。録音データ本体（音声）はブラウザ内のIndexedDB（recordingStore.js）、ここは「いつ・誰の・どの訪問の録音か」の記録（純関数）。
export const RECORDINGS_KEY = 'rq-mock-recordings';

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']; // Chrome・Android は webm、iPhone の Safari は mp4
export const pickMime = (isSupported) => MIME_CANDIDATES.find((t) => isSupported(t)) ?? '';

// 説明事項で、録音の了承を得ていなければ、録音を始めない
export const recordingReady = (briefing) => Boolean(briefing?.checks?.record);

export const newRecordingId = () => `REC-${Date.now().toString(36).toUpperCase()}`;

export const makeRecording = ({ id, visitId, userId, customerName, startedAt, endedAt, size, mime }) => ({
  id, visitId, userId, customerName, startedAt, endedAt, size, mime,
  durationSec: Math.max(0, Math.round((endedAt - startedAt) / 1000)),
});

export const addRecording = (list, rec) => (list.some((r) => r.id === rec.id) ? list.map((r) => (r.id === rec.id ? rec : r)) : [rec, ...list]);
export const recordingsOf = (list, visitId) => list.filter((r) => r.visitId === visitId);

export const fmtDuration = (sec) => {
  const s = Math.max(0, Math.floor(sec));
  const p = (n) => String(n).padStart(2, '0');
  const h = Math.floor(s / 3600);
  return h ? `${h}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}` : `${Math.floor(s / 60)}:${p(s % 60)}`;
};

export const fmtSize = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`);

export const loadRecordings = () => {
  try { return JSON.parse(localStorage.getItem(RECORDINGS_KEY)) ?? []; } catch { return []; }
};
export const saveRecordings = (list) => {
  try { localStorage.setItem(RECORDINGS_KEY, JSON.stringify(list)); return true; } catch { return false; }
};
