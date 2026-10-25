// タブレット・PCのカメラで、商品に貼ったシールのQRコードを読み取る。
// ブラウザの BarcodeDetector（Chrome 等）があれば使い、なければ jsQR（CDN）で読み取る。カメラは HTTPS（または localhost）でのみ使える。
const JSQR_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js';
const SAME_CODE_WAIT = 2500; // 同じQRを続けて読み取らない待ち時間（ms）
const INTERVAL = 200;

export const cameraSupported = () => Boolean(globalThis.navigator?.mediaDevices?.getUserMedia);

let jsqrLoading = null;
const loadJsQr = () => {
  if (globalThis.jsQR) return Promise.resolve(globalThis.jsQR);
  jsqrLoading ??= new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = JSQR_URL;
    el.onload = () => resolve(globalThis.jsQR);
    el.onerror = () => { jsqrLoading = null; reject(new Error('QR読み取りの部品を読み込めませんでした（ネットワークを確認してください）')); };
    document.head.appendChild(el);
  });
  return jsqrLoading;
};

// 読み取り方法を決める。戻り値は、動画1フレームからQRの文字列（なければ ''）を返す関数
async function makeDecoder(video) {
  if ('BarcodeDetector' in globalThis) {
    const detector = new globalThis.BarcodeDetector({ formats: ['qr_code'] });
    return async () => (await detector.detect(video))[0]?.rawValue ?? '';
  }
  const jsQR = await loadJsQr();
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return async () => {
    if (!video.videoWidth) return '';
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    return jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height)?.data ?? '';
  };
}

// video にカメラ映像を出して、QRを読み取るたびに onCode(文字列) を呼ぶ。戻り値の stop() で停止する
export async function startScanner(video, onCode) {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }); // 背面カメラ優先
  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  await video.play();
  const decode = await makeDecoder(video);
  let last = { text: '', at: 0 };
  let stopped = false;
  const timer = setInterval(async () => {
    if (stopped) return;
    let text = '';
    try { text = await decode(); } catch { return; } // 1フレームの失敗は無視して、次を読む
    const now = Date.now();
    if (!text || stopped || (text === last.text && now - last.at < SAME_CODE_WAIT)) return;
    last = { text, at: now };
    onCode(text);
  }, INTERVAL);
  return () => {
    stopped = true;
    clearInterval(timer);
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  };
}

// 失敗の理由を、利用者向けの文にする
export function cameraErrorText(e) {
  if (!cameraSupported()) return 'このブラウザ・接続では、カメラを使えません（HTTPS、または localhost で開いてください）。';
  if (e?.name === 'NotAllowedError') return 'カメラの使用が許可されていません。ブラウザの設定で許可してください。';
  if (e?.name === 'NotFoundError') return 'カメラが見つかりません。';
  return e?.message || 'カメラを起動できませんでした。';
}
