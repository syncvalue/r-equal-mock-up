// 疑似QRコード（コード文字列から決まる模様）。見た目だけのダミー。QR読取のカメラ画面（モック）で使う
export function fakeQr(code) {
  const N = 21;
  let seed = [...code].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 9973, 7);
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const finder = (x, y) => [[0, 0], [N - 7, 0], [0, N - 7]].some(([fx, fy]) => x >= fx && x < fx + 7 && y >= fy && y < fy + 7);
  const inFinder = (x, y) => {
    const [fx, fy] = [[0, 0], [N - 7, 0], [0, N - 7]].find(([a, b]) => x >= a && x < a + 7 && y >= b && y < b + 7);
    const dx = x - fx;
    const dy = y - fy;
    return dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4);
  };
  let cells = '';
  for (let y = 0; y < N; y += 1) {
    for (let x = 0; x < N; x += 1) {
      const on = finder(x, y) ? inFinder(x, y) : rnd() > 0.5;
      if (on) cells += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
    }
  }
  return `<svg viewBox="-1 -1 ${N + 2} ${N + 2}" class="w-full h-full" shape-rendering="crispEdges"><rect x="-1" y="-1" width="${N + 2}" height="${N + 2}" fill="#fff"/><g fill="#111">${cells}</g></svg>`;
}
