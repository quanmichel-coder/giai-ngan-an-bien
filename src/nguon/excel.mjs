// Bộ chuyển nguồn: tệp Excel kết quả giải ngân → gói dữ liệu chuẩn.
// Nhận hai định dạng đang dùng tại phường (giữ nguyên bộ đọc đã kiểm chứng ở bản v0.3):
//   A. "Bảng điều hành" – sheet NHAP_LIEU (tuần theo dòng, dòng vốn theo cột) + DU_AN (danh mục,
//      kế hoạch tháng của phường theo dòng vốn, kịch bản thành phố theo nguồn).
//   B. "Giải ngân theo tuần" – sheet 02_NHAP_TUAN (dòng vốn theo dòng, tuần theo cột).
// Ô trống = chưa có số liệu, KHÔNG phải 0. Mỗi số mang địa chỉ ô gốc để truy ngược.
import { createHash } from 'node:crypto';
import { docExcel, chuyenSo, tenCot, LoiTepExcel } from './xlsx.mjs';
import { chuanHoaNguon, boPhuong, boThanhPho, NAM } from '../core/hang-so.mjs';
import { taoGoi } from './goi.mjs';

const DONG = tr => Math.round(Number(tr) * 1e6);          // tệp ghi bằng triệu đồng
const CUOI_THANG = { 6: '2026-06-30', 7: '2026-07-31', 8: '2026-08-31', 9: '2026-09-30', 10: '2026-10-31', 11: '2026-11-30', 12: '2026-12-31' };
const ma = (sheet, dong, cot) => `${sheet}!${tenCot(cot)}${dong}`;
const sach = s => String(s || '').replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------- Nhận diện

function timDong(sheet, cot, nhan, tuDong = 1, denDong = 60) {
  const muc = sach(nhan).toLowerCase();
  for (let r = tuDong; r <= Math.min(denDong, sheet.soDong); r++)
    if (sach(sheet.chuoiTai(r, cot)).toLowerCase() === muc) return r;
  return 0;
}

/** "22/6–26/6" hoặc "28/12–1/1" → {start,end} theo năm của kỳ. */
function khoangNgay(text, nam) {
  const m = /^(\d{1,2})\s*\/\s*(\d{1,2})\s*[–\-—]\s*(\d{1,2})\s*\/\s*(\d{1,2})$/.exec(sach(text));
  if (!m) return null;
  const [, d1, m1, d2, m2] = m.map(Number);
  const hai = Number(m2) < Number(m1) ? nam + 1 : nam;      // tuần vắt sang năm sau
  const p = (y, mo, d) => `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return { start: p(nam, m1, d1), end: p(hai, m2, d2) };
}

// ------------------------------------------------- Định dạng A: Bảng điều hành

function docBangDieuHanh(wb, nam) {
  const nguon = { layout: 'bang-dieu-hanh', sheets: [], lines: [], opening_lines: [], line_records: [],
    plans: [], kich_ban_line: [], kich_ban_tp: [], khv_thanh_pho: [], luy_ke_tep: [], ghi_chu: [], canh_bao_tep: [] };

  // ---- Sheet DU_AN: danh mục dòng vốn + kế hoạch phường theo tháng
  const du = wb.sheet['DU_AN'];
  if (du) {
    nguon.sheets.push('DU_AN');
    const hr = timDong(du, 1, 'Mã dòng');
    if (!hr) throw new LoiTepExcel('Sheet DU_AN thiếu dòng tiêu đề "Mã dòng".');
    // Cột "Cuối T6" là mốc nền (số thực tế đã giải ngân đến hết tháng 6), không phải chỉ tiêu
    // của kế hoạch, nên không đưa vào kịch bản — nếu đưa vào, nó sẽ bị chấm như một mốc phải đạt.
    const cotThang = {};
    for (let c = 9; c <= du.soCot; c++) {
      const m = /^Cuối\s*T(\d{1,2})$/i.exec(sach(du.chuoiTai(hr, c)));
      if (m && CUOI_THANG[Number(m[1])] && Number(m[1]) !== 6) cotThang[c] = CUOI_THANG[Number(m[1])];
    }
    nguon.ghi_chu.push('Cột "Cuối T6" của kế hoạch phường là mốc nền (số đã giải ngân đến hết tháng 6), hệ thống dùng làm điểm xuất phát chứ không chấm như một mốc phải đạt.');
    let ord = 0;
    for (let r = hr + 1; r <= du.soDong; r++) {
      const lineId = sach(du.chuoiTai(r, 1));
      if (!lineId || /^TỔNG/i.test(lineId)) break;
      const projectId = sach(du.chuoiTai(r, 2)) || lineId;
      const sourceId = chuanHoaNguon(du.chuoiTai(r, 4));
      if (!sourceId) { nguon.canh_bao_tep.push(`Dòng vốn ${lineId}: không nhận ra nguồn vốn "${du.chuoiTai(r, 4)}" (${ma('DU_AN', r, 4)}).`); continue }
      const khv = du.soTai(r, 8);
      nguon.lines.push({ line_id: lineId, project_id: projectId, source_id: sourceId,
        label: sach(du.chuoiTai(r, 5)) || `${lineId} · ${sach(du.chuoiTai(r, 3))}`,
        plan: khv === null ? 0 : DONG(khv), ord: ++ord, source_ref: ma('DU_AN', r, 8) });
      for (const [c, ngay] of Object.entries(cotThang)) {
        const v = du.soTai(r, Number(c));
        if (v === null) continue;
        nguon.kich_ban_line.push({ line_id: lineId, target_date: ngay, amount: DONG(v), source_ref: ma('DU_AN', r, Number(c)) });
      }
    }

    // ---- Khối kịch bản thành phố: theo nguồn vốn, không chi tiết dự án
    const hr2 = timDong(du, 1, 'Nguồn vốn', hr + 1, du.soDong);
    if (hr2) {
      const cotThang2 = {};
      for (let c = 9; c <= du.soCot; c++) {
        const m = /^Cuối\s*T(\d{1,2})$/i.exec(sach(du.chuoiTai(hr2, c)));
        if (m && CUOI_THANG[Number(m[1])]) cotThang2[c] = { ngay: CUOI_THANG[Number(m[1])], thang: Number(m[1]) };
      }
      for (let r = hr2 + 1; r <= du.soDong; r++) {
        const nhan = sach(du.chuoiTai(r, 1));
        if (!nhan) break;
        if (/^Tổng|^Tỷ lệ|^Cách áp dụng|^Ghi chú/i.test(nhan)) continue;
        const sourceId = chuanHoaNguon(nhan);
        if (!sourceId) continue;
        const khvTp = du.soTai(r, 5);
        if (khvTp !== null) nguon.khv_thanh_pho.push({ source_id: sourceId, plan: DONG(khvTp), source_ref: ma('DU_AN', r, 5) });
        else nguon.ghi_chu.push(`Nguồn ${nhan}: thành phố không giao kế hoạch (${ma('DU_AN', r, 5)}) nên không có kịch bản thành phố cho nguồn này.`);
        for (const [c, t] of Object.entries(cotThang2)) {
          const v = du.soTai(r, Number(c));
          if (v === null) continue;
          // Cột "Cuối T6" ở khối này là số thực tế đã giải ngân dùng làm mốc nền, không phải
          // số thành phố giao, nên không đưa vào kịch bản thành phố.
          if (t.thang === 6) { nguon.ghi_chu.push(`Mốc cuối tháng 6 của nguồn ${nhan} trong tệp là số thực tế đã giải ngân (${ma('DU_AN', r, Number(c))}), thành phố không giao mốc tháng 6 nên hệ thống không ghi vào kịch bản thành phố.`); continue }
          nguon.kich_ban_tp.push({ source_id: sourceId, target_date: t.ngay, amount: DONG(v), source_ref: ma('DU_AN', r, Number(c)) });
        }
      }
    }
  }

  // ---- Sheet NHAP_LIEU: số phát sinh từng tuần theo dòng vốn
  const np = wb.sheet['NHAP_LIEU'];
  if (!np) throw new LoiTepExcel('Tệp thiếu sheet NHAP_LIEU.');
  nguon.sheets.push('NHAP_LIEU');
  const hr = timDong(np, 1, 'Tuần');
  if (!hr) throw new LoiTepExcel('Sheet NHAP_LIEU thiếu dòng tiêu đề "Tuần".');
  const cot = [];
  for (let c = 4; c <= np.soCot; c++) {
    const id = sach(np.chuoiTai(hr, c));
    if (/^DA\d+(\.\d+)?$/i.test(id)) cot.push({ c, line_id: id.toUpperCase() });
  }
  if (!cot.length) throw new LoiTepExcel('Sheet NHAP_LIEU không có cột dự án nào (mã dạng DA01, DA15.1).');

  // Nếu tệp không có sheet DU_AN thì dựng tạm danh mục dòng vốn từ chính hàng tiêu đề.
  if (!nguon.lines.length)
    nguon.lines = cot.map((x, i) => ({ line_id: x.line_id, project_id: x.line_id.split('.')[0], source_id: chuanHoaNguon(np.chuoiTai(hr + 2, x.c)) || 'PHANCAP',
      label: `${x.line_id} · ${sach(np.chuoiTai(hr + 1, x.c))}`, plan: 0, ord: i + 1, source_ref: ma('NHAP_LIEU', hr, x.c) }));

  const rKhv = timDong(np, 1, 'KHV 2026', hr, hr + 6);
  if (rKhv) for (const x of cot) {
    const v = np.soTai(rKhv, x.c);
    if (v !== null) nguon.plans.push({ line_id: x.line_id, plan: DONG(v), source_ref: ma('NHAP_LIEU', rKhv, x.c) });
  }
  const rNen = timDong(np, 1, 'Mốc nền', hr, hr + 8);
  if (rNen) for (const x of cot) {
    const v = np.soTai(rNen, x.c);
    if (v !== null) nguon.opening_lines.push({ line_id: x.line_id, amount: DONG(v), as_of: '2026-06-19', source_ref: ma('NHAP_LIEU', rNen, x.c) });
  }

  for (let r = hr + 1; r <= np.soDong; r++) {
    const nhan = sach(np.chuoiTai(r, 1));
    const m = /^Tuần\s*(\d{1,2})$/i.exec(nhan);
    if (!m) continue;
    const period_id = `${nam}-T${String(Number(m[1])).padStart(2, '0')}`;
    const kn = khoangNgay(np.chuoiTai(r, 2), nam);
    if (kn) nguon.luy_ke_tep.push({ kieu: 'ky', period_id, ...kn, source_ref: ma('NHAP_LIEU', r, 2) });
    for (const x of cot) {
      const v = np.soTai(r, x.c);
      if (v === null) continue;                              // ô trống: kỳ chưa có số liệu
      nguon.line_records.push({ line_id: x.line_id, period_id, amount: DONG(v), source_ref: ma('NHAP_LIEU', r, x.c) });
    }
  }

  const rLk = timDong(np, 1, 'LŨY KẾ', hr, np.soDong);
  if (rLk) for (const x of cot) {
    const v = np.soTai(rLk, x.c);
    if (v !== null) nguon.luy_ke_tep.push({ kieu: 'luy_ke', line_id: x.line_id, amount: DONG(v), source_ref: ma('NHAP_LIEU', rLk, x.c) });
  }
  return nguon;
}

// --------------------------------------------- Định dạng B: Giải ngân theo tuần

function docGiaiNganTuan(wb, nam) {
  const nguon = { layout: 'giai-ngan-tuan', sheets: ['02_NHAP_TUAN'], lines: [], opening_lines: [], line_records: [],
    plans: [], kich_ban_line: [], kich_ban_tp: [], khv_thanh_pho: [], luy_ke_tep: [], ghi_chu: [], canh_bao_tep: [] };
  const s = wb.sheet['02_NHAP_TUAN'];
  const hr = timDong(s, 1, 'Mã');
  if (!hr) throw new LoiTepExcel('Sheet 02_NHAP_TUAN thiếu dòng tiêu đề "Mã".');
  const tuan = [];
  for (let c = 1; c <= s.soCot; c++) {
    const h = sach(s.chuoiTai(hr, c));
    const m = /^T(\d{1,2})\b/.exec(h);
    if (m) tuan.push({ c, period_id: `${nam}-T${String(Number(m[1])).padStart(2, '0')}` });
  }
  const cKhv = (() => { for (let c = 1; c <= s.soCot; c++) if (/^KHV/i.test(sach(s.chuoiTai(hr, c)))) return c; return 0 })();
  const cNen = (() => { for (let c = 1; c <= s.soCot; c++) if (/^LK đến hết/i.test(sach(s.chuoiTai(hr, c)))) return c; return 0 })();
  if (!tuan.length) throw new LoiTepExcel('Sheet 02_NHAP_TUAN không có cột tuần nào (tiêu đề dạng T26).');

  let ord = 0;
  for (let r = hr + 1; r <= s.soDong; r++) {
    const id = sach(s.chuoiTai(r, 1));
    if (!/^DA\d+(\.\d+)?$/i.test(id)) continue;
    const line_id = id.toUpperCase();
    nguon.lines.push({ line_id, project_id: line_id.split('.')[0], source_id: chuanHoaNguon(s.chuoiTai(r, 2)) || 'PHANCAP',
      label: `${line_id} · ${sach(s.chuoiTai(r, 3))}`, plan: cKhv ? DONG(s.soTai(r, cKhv) || 0) : 0, ord: ++ord, source_ref: ma('02_NHAP_TUAN', r, 1) });
    if (cKhv && s.soTai(r, cKhv) !== null) nguon.plans.push({ line_id, plan: DONG(s.soTai(r, cKhv)), source_ref: ma('02_NHAP_TUAN', r, cKhv) });
    if (cNen && s.soTai(r, cNen) !== null) nguon.opening_lines.push({ line_id, amount: DONG(s.soTai(r, cNen)), as_of: '2026-06-19', source_ref: ma('02_NHAP_TUAN', r, cNen) });
    for (const t of tuan) {
      const v = s.soTai(r, t.c);
      if (v === null) continue;
      nguon.line_records.push({ line_id, period_id: t.period_id, amount: DONG(v), source_ref: ma('02_NHAP_TUAN', r, t.c) });
    }
  }
  nguon.ghi_chu.push('Tệp theo định dạng "Giải ngân theo tuần" chỉ có số liệu tuần, không có kế hoạch tháng của phường và kịch bản của thành phố.');
  return nguon;
}

export const moTa = { id: 'excel', ten: 'Tệp Excel kết quả giải ngân (bảng điều hành hoặc giải ngân theo tuần)', duoi: ['.xlsx'] };

export function nhanDang(tenTep) { return /\.xlsx$/i.test(tenTep || ''); }

/** Đọc tệp Excel thành gói dữ liệu chuẩn. Không chạm vào cơ sở dữ liệu. */
export function doc(buf, tenTep = 'tệp tải lên.xlsx', nam = NAM) {
  if (!Buffer.isBuffer(buf) || !buf.length) throw new LoiTepExcel('Chưa chọn tệp.');
  if (buf.length > 10 * 1024 * 1024) throw new LoiTepExcel('Tệp vượt quá 10 MB.');
  const wb = docExcel(buf);
  const n = wb.co('NHAP_LIEU') ? docBangDieuHanh(wb, nam)
    : wb.co('02_NHAP_TUAN') ? docGiaiNganTuan(wb, nam)
      : (() => { throw new LoiTepExcel(`Không nhận ra định dạng tệp. Tệp cần có sheet NHAP_LIEU hoặc 02_NHAP_TUAN. Tệp này có: ${wb.ten.join(', ')}.`) })();
  const thang = d => Number(d.slice(5, 7));
  const goi = taoGoi({ kenh: 'excel', ten_tep: tenTep, sha256: createHash('sha256').update(buf).digest('hex'), nam, mau: n.layout });
  goi.dong_von = n.lines.map(l => ({ line_id: l.line_id, project_id: l.project_id, source_id: l.source_id, label: l.label, plan: l.plan, source_ref: l.source_ref }));
  goi.moc_nen = n.opening_lines.map(o => ({ line_id: o.line_id, amount: o.amount, as_of: o.as_of, source_ref: o.source_ref }));
  goi.giai_ngan = n.line_records.map(r => ({ line_id: r.line_id, period_id: r.period_id, amount: r.amount, source_ref: r.source_ref }));
  // Cột "Cuối T6" là mốc nền (đã loại ở bộ đọc), các tháng sau là mục tiêu lũy kế.
  goi.kich_ban = [
    ...n.kich_ban_line.map(k => ({ set_id: boPhuong(nam), scope_kind: 'line', scope_id: k.line_id, month: thang(k.target_date), amount: k.amount, source_ref: k.source_ref })),
    ...n.kich_ban_tp.map(k => ({ set_id: boThanhPho(nam), scope_kind: 'source', scope_id: k.source_id, month: thang(k.target_date), amount: k.amount, source_ref: k.source_ref }))
  ];
  goi.doi_chieu = (n.luy_ke_tep || []).filter(x => x.kieu === 'luy_ke').map(x => ({ line_id: x.line_id, amount: x.amount, source_ref: x.source_ref }));
  goi.ky_tep = (n.luy_ke_tep || []).filter(x => x.kieu === 'ky').map(x => ({ period_id: x.period_id, start: x.start, end: x.end, source_ref: x.source_ref }));
  goi.ghi_chu.push(...n.ghi_chu);
  goi.canh_bao.push(...(n.canh_bao_tep || []));
  return goi;
}
