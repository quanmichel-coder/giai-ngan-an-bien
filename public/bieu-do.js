// Biểu đồ SVG tự dựng, không thư viện. Màu lấy qua lớp CSS (style.css) để đổi sáng/tối một chỗ.
// Nguyên tắc: một trục; xám cho mốc so sánh, một màu nhấn (xanh dương) cho số thực hiện;
// màu trạng thái chỉ dùng cho trạng thái và luôn kèm ký hiệu + chữ; nhãn trực tiếp, có lớp di chuột.
import { h, s, trieu, phanTram, ngayNgan, buocDep } from './dinh-dang.js';

/**
 * Biểu đồ 1 — Lũy kế giải ngân so với hai kịch bản, kèm dự báo theo nhịp hiện tại.
 * d = kết quả /api/dieu-hanh
 */
export function bieuDoLuyKe(khung, d) {
  khung.replaceChildren();
  const W = Math.max(320, Math.round(khung.clientWidth || 720)), hep = W < 560;
  const H = hep ? 280 : 330, m = { l: hep ? 44 : 56, r: hep ? 118 : 150, t: 22, b: 30 };
  const pts = d.duong_luy_ke, hien = d.diem_hien_tai, cs = d.chi_so;
  const t0 = Date.parse(pts[0].ngay), t1 = Date.parse(pts.at(-1).ngay);
  const X = ngay => m.l + (Date.parse(ngay) - t0) / (t1 - t0) * (W - m.l - m.r);

  const giaTri = [cs.khv, hien.thuc_hien, ...pts.flatMap(p => [p.thuc_hien, p.kb_phuong, p.kb_tp, p.du_bao_cao, p.du_bao_thap])].filter(v => v != null);
  const lo = Math.min(...giaTri), hi = Math.max(...giaTri);
  const buoc = buocDep(hi - lo || hi, 5), y0 = Math.floor(lo / buoc) * buoc, y1 = Math.ceil(hi / buoc) * buoc;
  const Y = v => m.t + (1 - (v - y0) / (y1 - y0)) * (H - m.t - m.b);
  const duong = ds => ds.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join('');

  const thucHien = [...pts.filter(p => p.thuc_hien != null).map(p => [p.ngay, p.thuc_hien])];
  if (thucHien.at(-1)?.[0] !== hien.ngay) thucHien.push([hien.ngay, hien.thuc_hien]);
  const duBao = [[hien.ngay, hien.thuc_hien], ...pts.filter(p => p.du_bao != null).map(p => [p.ngay, p.du_bao])];
  const dai = [[hien.ngay, hien.thuc_hien], ...pts.filter(p => p.du_bao != null).map(p => [p.ngay, p.du_bao_cao])];
  const dao = [...pts.filter(p => p.du_bao != null).map(p => [p.ngay, p.du_bao_thap])].reverse();
  const phuong = pts.filter(p => p.kb_phuong != null).map(p => [p.ngay, p.kb_phuong]);
  const tp = pts.filter(p => p.kb_tp != null).map(p => [p.ngay, p.kb_tp]);

  const tieuDe = `Lũy kế giải ngân ${d.pham_vi.ten.toLowerCase()} so với hai kịch bản, tháng 6 – tháng 12`;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': tieuDe, class: 'bd' });

  // Lưới và trục (chìm)
  const luoi = s('g', { class: 'bd-luoi' });
  for (let v = y0; v <= y1 + 1; v += buoc) {
    luoi.append(s('line', { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v) }),
      s('text', { x: m.l - 8, y: Y(v) + 4, 'text-anchor': 'end', class: 'bd-truc' }, trieu(v)));
  }
  for (const p of pts) luoi.append(s('text', { x: X(p.ngay), y: H - 8, 'text-anchor': 'middle', class: 'bd-truc' }, p.nhan));
  luoi.append(s('text', { x: m.l - 8, y: 12, 'text-anchor': 'end', class: 'bd-truc' }, 'triệu đ'));
  svg.append(luoi);

  // Mốc KHV và vạch kỳ đang xem
  svg.append(s('line', { x1: m.l, x2: W - m.r, y1: Y(cs.khv), y2: Y(cs.khv), class: 'bd-khv' }));
  svg.append(s('line', { x1: X(hien.ngay), x2: X(hien.ngay), y1: m.t, y2: H - m.b, class: 'bd-hom-nay' }),
    s('text', { x: X(hien.ngay) + 4, y: m.t - 8, class: 'bd-chu-phu' }, `${hien.nhan} · ${ngayNgan(hien.ngay)}`));

  // Kịch bản (xám, phân biệt bằng nét), dải dự báo, dự báo, thực hiện (màu nhấn)
  if (tp.length) svg.append(s('path', { d: duong(tp), class: 'bd-tp' }));
  if (phuong.length) svg.append(s('path', { d: duong(phuong), class: 'bd-phuong' }));
  if (duBao.length > 1) {
    svg.append(s('path', { d: duong(dai) + dao.map(p => `L${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join('') + 'Z', class: 'bd-dai' }));
    svg.append(s('path', { d: duong(duBao), class: 'bd-du-bao' }));
  }
  svg.append(s('path', { d: duong(thucHien), class: 'bd-thuc' }));
  for (const [ng, v] of thucHien) svg.append(s('circle', { cx: X(ng), cy: Y(v), r: ng === hien.ngay ? 5 : 3.5, class: ng === hien.ngay ? 'bd-diem-chinh' : 'bd-diem' }));

  // Nhãn trực tiếp ở mép phải; giãn cách tối thiểu 15px, có đường dẫn khi phải dịch.
  const cuoi = pts.at(-1), nhan = [];
  const trungKhv = cuoi.kb_phuong != null && Math.abs(cuoi.kb_phuong - cs.khv) < 1e6;
  if (cuoi.kb_phuong != null) nhan.push({ y: Y(cuoi.kb_phuong), chu: trungKhv ? `KH phường = KHV ${trieu(cs.khv)}` : `KH phường ${trieu(cuoi.kb_phuong)}`, lop: 'bd-nhan' });
  if (!trungKhv) nhan.push({ y: Y(cs.khv), chu: `KHV ${trieu(cs.khv)}`, lop: 'bd-nhan' });
  if (cuoi.kb_tp != null) nhan.push({ y: Y(cuoi.kb_tp), chu: `Kịch bản TP ${trieu(cuoi.kb_tp)}`, lop: 'bd-nhan' });
  if (cuoi.du_bao != null) nhan.push({ y: Y(cuoi.du_bao), chu: `Dự báo ${trieu(cuoi.du_bao)}`, lop: 'bd-nhan-nhan' });
  nhan.sort((a, b) => a.y - b.y);
  for (let i = 0; i < nhan.length; i++) nhan[i].ve = Math.max(nhan[i].y, i ? nhan[i - 1].ve + 15 : m.t);
  const xn = W - m.r + 10;
  for (const n of nhan) {
    if (Math.abs(n.ve - n.y) > 2) svg.append(s('path', { d: `M${W - m.r + 2} ${n.y}L${xn - 3} ${n.ve - 4}`, class: 'bd-dan' }));
    svg.append(s('text', { x: xn, y: n.ve + 4, class: n.lop }, hep ? n.chu.replace('Kịch bản ', 'KB ').replace('KH phường = KHV', 'KH = KHV') : n.chu));
  }

  // Lớp di chuột + bàn phím: thước dọc bám vào các mốc, một chú giải cho mọi đường
  const moc = [...new Set([...pts.map(p => p.ngay), hien.ngay])].sort();
  const thuoc = s('line', { y1: m.t, y2: H - m.b, class: 'bd-thuoc', visibility: 'hidden' });
  const goiY = h('div', { class: 'goi-y', role: 'status', hidden: true });
  const phu = s('rect', { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: 'transparent', tabindex: 0, 'aria-label': 'Di chuột hoặc dùng phím mũi tên để xem số từng tháng' });
  svg.append(thuoc, phu);
  let chon = -1;
  const hien1 = i => {
    chon = Math.max(0, Math.min(moc.length - 1, i));
    const ng = moc[chon], p = pts.find(x => x.ngay === ng), laHien = ng === hien.ngay;
    const x = X(ng);
    thuoc.setAttribute('x1', x); thuoc.setAttribute('x2', x); thuoc.setAttribute('visibility', 'visible');
    const dong = [];
    const th = laHien ? hien.thuc_hien : p?.thuc_hien;
    if (th != null) dong.push(['bd-k-thuc', 'Thực hiện', trieu(th)]);
    if (p?.du_bao != null) dong.push(['bd-k-du-bao', 'Dự báo', trieu(p.du_bao), `khoảng ${trieu(p.du_bao_thap)}–${trieu(p.du_bao_cao)}`]);
    if (p?.kb_phuong != null) dong.push(['bd-k-phuong', 'KH phường', trieu(p.kb_phuong)]);
    if (p?.kb_tp != null) dong.push(['bd-k-tp', 'Kịch bản TP', trieu(p.kb_tp)]);
    goiY.replaceChildren(h('div', { class: 'goi-y-tieu-de' }, laHien ? `${hien.nhan} (${ngayNgan(ng)})` : `Cuối ${p.nhan} (${ngayNgan(ng)})`),
      ...dong.map(([k, ten, v, phu]) => h('div', { class: 'goi-y-dong' }, h('span', { class: `khoa ${k}` }), h('b', {}, v), h('span', { class: 'goi-y-ten' }, ten), phu && h('span', { class: 'goi-y-phu' }, phu))),
      h('div', { class: 'goi-y-don-vi' }, 'triệu đồng'));
    goiY.hidden = false;
    const rong = khung.clientWidth;
    goiY.style.left = `${Math.min(rong - 240, Math.max(0, x / W * rong + 12))}px`;
    goiY.style.top = '8px';
  };
  const an = () => { thuoc.setAttribute('visibility', 'hidden'); goiY.hidden = true; };
  phu.addEventListener('pointermove', e => {
    const r = svg.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * W;
    let best = 0; moc.forEach((ng, i) => { if (Math.abs(X(ng) - x) < Math.abs(X(moc[best]) - x)) best = i; });
    hien1(best);
  });
  phu.addEventListener('pointerleave', an);
  phu.addEventListener('blur', an);
  phu.addEventListener('focus', () => hien1(moc.indexOf(hien.ngay)));
  phu.addEventListener('keydown', e => { if (e.key === 'ArrowRight') { hien1(chon + 1); e.preventDefault(); } if (e.key === 'ArrowLeft') { hien1(chon - 1); e.preventDefault(); } });

  khung.append(svg, goiY);
}

/** Chú giải đặt trên biểu đồ (khóa bằng nét, không bằng ô màu). */
export function chuGiaiLuyKe(coTp) {
  const muc = [['bd-k-thuc', 'Thực hiện'], ['bd-k-du-bao', 'Dự báo theo nhịp 4 tuần (vùng nhạt: khoảng dao động)'], ['bd-k-phuong', 'Kế hoạch phường']];
  if (coTp) muc.push(['bd-k-tp', 'Kịch bản thành phố']);
  return h('div', { class: 'chu-giai' }, muc.map(([k, t]) => h('span', {}, h('span', { class: `khoa ${k}` }), t)));
}

/** Biểu đồ nhỏ — phát sinh 12 tuần (cột xám, tuần đang xem màu nhấn) và vạch "cần mỗi tuần". */
export function cotNho(ds, can) {
  const W = 168, H = 40, max = Math.max(...ds.map(x => x.phat_sinh), can || 0, 1), bw = W / ds.length;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'cot-nho', role: 'img',
    'aria-label': `Phát sinh ${ds.length} tuần gần nhất; vạch đứt là mức cần mỗi tuần` });
  ds.forEach((x, i) => {
    const hh = Math.max(x.phat_sinh > 0 ? 2 : 0, x.phat_sinh / max * (H - 4));
    svg.append(s('rect', { x: i * bw + 1, y: H - hh, width: bw - 2, height: hh, rx: 1.5, class: i === ds.length - 1 ? 'cn-nhan' : 'cn-cot' },
      s('title', {}, `${x.nhan}: ${trieu(x.phat_sinh)} triệu`)));
  });
  if (can) svg.append(s('line', { x1: 0, x2: W, y1: H - can / max * (H - 4), y2: H - can / max * (H - 4), class: 'cn-can' }));
  return svg;
}

/** Thanh tiến độ trong bảng dự án: nền = KHV, phần tô = lũy kế, vạch đứng = mục tiêu lũy kế tháng. */
export function thanhTienDo(d) {
  const W = 200, H = 20, tl = Math.min(1, d.ty_le ?? 0), mt = d.ty_le_kb_thang;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', class: 'thanh', role: 'img',
    'aria-label': `Đã giải ngân ${phanTram(d.ty_le)} KHV${mt != null ? `, mục tiêu tháng ${phanTram(mt)}` : ''}` });
  svg.append(s('rect', { x: 0, y: 6, width: W, height: 8, rx: 4, class: 'thanh-nen' }));
  if (tl > 0) svg.append(s('rect', { x: 0, y: 6, width: Math.max(4, tl * W), height: 8, rx: 4, class: `thanh-to t-${d.muc}` }));
  if (mt != null) svg.append(s('line', { x1: Math.min(W - 1, mt * W), x2: Math.min(W - 1, mt * W), y1: 1, y2: 19, class: 'thanh-moc', 'vector-effect': 'non-scaling-stroke' }));
  return svg;
}
