export const yen = (n) => `¥${Number(n || 0).toLocaleString('ja-JP')}`;

export const fmtTime = (d) =>
  d ? new Date(d).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--:--';

export const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString('ja-JP', { dateStyle: 'medium', timeStyle: 'medium' }) : '-';

export const fmtElapsed = (from, to = Date.now()) => {
  const s = Math.max(0, Math.floor((to - from) / 1000));
  const p = (n) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
};

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const total = (items) => items.reduce((sum, i) => sum + i.price, 0);
