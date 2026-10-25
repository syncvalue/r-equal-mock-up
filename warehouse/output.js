// 印刷用ページを開く・CSVをダウンロードする（ブラウザの操作）。中身の作成は src/shipping.js（純粋関数）。

// 新しいウィンドウに書き出す（読み込まれると、自動で印刷画面が開く）。ポップアップがブロックされたら false
export function openPrintWindow(html) {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}

export function downloadText(fileName, text, mime = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
