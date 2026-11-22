// Định dạng số và dựng phần tử DOM an toàn (mọi chữ đi qua textContent, không dùng innerHTML).

export const trieu = v => v == null || !Number.isFinite(v) ? '–' : Math.round(v / 1e6).toLocaleString('vi-VN');
export const trieuDau = v => v == null ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(Math.round(v / 1e6)).toLocaleString('vi-VN');
export const phanTram = (v, so = 1) => v == null || !Number.isFinite(v) ? '–' : (v * 100).toFixed(so).replace('.', ',') + '%';
export const ngayVN = d => d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '';
export const ngayNgan = d => d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '';

/** h('div', {class:'x', onclick: fn}, 'chữ', con…) */
export function h(tag, attrs = {}, ...con) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of con.flat(Infinity)) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

const NS = 'http://www.w3.org/2000/svg';
/** s('line', {x1:0,…}) — phần tử SVG, thuộc tính trình bày (không dùng style nội tuyến). */
export function s(tag, attrs = {}, ...con) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v);
  }
  for (const c of con.flat(Infinity)) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

/** Bước chia trục "đẹp": 1, 2, 2,5, 5 × 10^n. */
export function buocDep(khoang, soVach = 5) {
  const tho = khoang / soVach, mu = 10 ** Math.floor(Math.log10(tho)), r = tho / mu;
  return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10) * mu;
}

export const MUC = {
  do: { nhan: 'Chậm nhiều', ky_hieu: '✕', lop: 'muc-do' },
  vang: { nhan: 'Cần theo dõi', ky_hieu: '!', lop: 'muc-vang' },
  xanh: { nhan: 'Đạt tiến độ', ky_hieu: '✓', lop: 'muc-xanh' }
};
export const chip = (m, chu) => h('span', { class: `chip ${MUC[m].lop}` }, h('span', { class: 'chip-icon', 'aria-hidden': 'true' }, MUC[m].ky_hieu), chu);
export const chipMuc = m => h('span', { class: `chip ${MUC[m].lop}` }, h('span', { class: 'chip-icon', 'aria-hidden': 'true' }, MUC[m].ky_hieu), MUC[m].nhan);
