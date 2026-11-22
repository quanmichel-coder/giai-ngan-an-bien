// TỔNG HỢP — đọc một lần, cộng ra mọi con số của bảng điều hành.
// Quy ước giữ nguyên từ bảng Excel "Giải ngân 2026":
//   - Số của một tuần tính vào tháng theo ngày kết thúc tuần; tuần vắt năm tính cho tháng 12.
//   - Cuối tháng 6 là MỐC NỀN (số đã giải ngân), là điểm xuất phát, không phải chỉ tiêu.
//   - Kịch bản phường đặt theo dòng vốn; kịch bản thành phố giao theo nguồn. Nguồn thành phố
//     không giao (tăng thu) thì phần đó lấy kế hoạch phường, và ghi rõ trên giao diện.
import { readFileSync } from 'node:fs';
import { NAM, cuoiThang, thangCua, boPhuong, boThanhPho } from '../core/hang-so.mjs';
import { kyMocNen } from '../core/db.mjs';
import { danhGia } from './de-xuat.mjs';

export const NGUONG = JSON.parse(readFileSync(new URL('../../config/nguong.json', import.meta.url), 'utf8'));

export function docSoLieu(db, nam = NAM) {
  const nguon = db.prepare('SELECT * FROM funding_sources ORDER BY ord').all();
  const duAn = db.prepare('SELECT * FROM projects WHERE active=1 ORDER BY id').all();
  const dong = db.prepare(`SELECT l.*, s.city_assigned FROM funding_lines l JOIN funding_sources s ON s.id=l.source_id
    WHERE l.year=? ORDER BY l.project_id, l.ord, l.id`).all(nam);
  const tuan = db.prepare("SELECT * FROM periods WHERE year=? AND kind='tuan' ORDER BY start_date").all(nam);
  const nen = db.prepare('SELECT * FROM periods WHERE id=?').get(kyMocNen(nam));
  const gn = db.prepare(`SELECT d.line_id, d.period_id, d.amount, d.state, p.end_date FROM disbursements d
    JOIN periods p ON p.id=d.period_id WHERE p.year=?`).all(nam);
  const diem = db.prepare('SELECT * FROM scenario_points WHERE set_id IN (?,?)').all(boPhuong(nam), boThanhPho(nam));
  return { nam, nguon, duAn, dong, tuan, nen, gn, diem };
}

/** Bộ hàm tính trên một phạm vi dòng vốn. */
export function phepTinh(sl) {
  const { nam } = sl;
  const thang = ngay => thangCua(ngay, nam);
  const P = new Map(), T = new Map();
  for (const d of sl.diem) (d.set_id === boPhuong(nam) ? P : T).set(`${d.scope_id}|${d.month}`, d.amount);

  const luyKe = (ids, ngay) => sl.gn.reduce((s, g) => s + (ids.has(g.line_id) && g.end_date <= ngay ? g.amount : 0), 0);
  const phatSinh = (ids, kyId) => sl.gn.reduce((s, g) => s + (ids.has(g.line_id) && g.period_id === kyId ? g.amount : 0), 0);
  const coSo = (ids, kyId) => sl.gn.some(g => ids.has(g.line_id) && g.period_id === kyId);

  /** Mục tiêu lũy kế của phường đến cuối tháng m. Tháng 6 = mốc nền thực tế. */
  function kbPhuong(lines, m) {
    if (m <= 6) return { amount: luyKe(new Set(lines.map(l => l.id)), cuoiThang(nam, 6)), du: true };
    let t = 0, co = 0;
    for (const l of lines) { const v = P.get(`${l.id}|${m}`); if (v != null) { t += v; co++; } }
    return co ? { amount: t, du: co === lines.length } : null;
  }
  /** Mục tiêu thành phố đến cuối tháng m, theo nguồn; nguồn TP không giao lấy kế hoạch phường. */
  function kbThanhPho(lines, m) {
    if (m <= 6) return kbPhuong(lines, 6);
    const nguon = [...new Set(lines.map(l => l.source_id))];
    let t = 0, coTp = false, bu = false;
    for (const n of nguon) {
      const cung = lines.filter(l => l.source_id === n);
      if (cung[0].city_assigned) {
        const v = T.get(`${n}|${m}`);
        if (v == null) continue;
        // Chọn một phần dòng vốn của nguồn (ví dụ một dự án) thì không có mục tiêu TP tương ứng.
        if (cung.length !== sl.dong.filter(l => l.source_id === n).length) return null;
        t += v; coTp = true;
      } else { const p = kbPhuong(cung, m); if (p) { t += p.amount; bu = true; } }
    }
    return coTp ? { amount: t, bu_ke_hoach_phuong: bu } : null;
  }

  /** Số tuần lịch còn lại sau ngày den, đến hết tháng m (theo quy ước tháng của tuần). */
  const tuanConLai = (den, m) => sl.tuan.filter(p => p.end_date > den && thang(p.end_date) <= m).length;

  /** Nhịp bình quân trượt n tuần có số liệu gần nhất (cùng phương pháp đã công bố ở bản v0.3). */
  function nhip(ids, kyId, n) {
    const v = sl.tuan.filter(p => p.id <= kyId && coSo(ids, p.id)).slice(-n).map(p => phatSinh(ids, p.id));
    if (!v.length) return { tb: 0, sd: 0, n: 0 };
    const tb = v.reduce((a, b) => a + b, 0) / v.length;
    return { tb, sd: Math.sqrt(v.reduce((a, b) => a + (b - tb) ** 2, 0) / v.length), n: v.length };
  }
  /** Số tuần liên tiếp gần nhất không phát sinh giải ngân. */
  function tuanDungIm(ids, kyId) {
    let n = 0;
    for (const p of sl.tuan.filter(p => p.id <= kyId).reverse()) {
      if (!coSo(ids, p.id)) continue;
      if (phatSinh(ids, p.id) > 0) break;
      n++;
    }
    return n;
  }
  return { thang, luyKe, phatSinh, coSo, kbPhuong, kbThanhPho, tuanConLai, nhip, tuanDungIm };
}

const tyLe = (a, b) => (b > 0 ? a / b : null);

/** Dự báo lũy kế sau `tuan` tuần: giữa = nhịp bình quân; khoảng = ± độ lệch chuẩn. Không vượt KHV. */
function duBao(lk, nh, tuan, khv) {
  const tran = v => Math.min(khv, v);
  return { giua: tran(lk + nh.tb * tuan), thap: tran(lk + Math.max(0, nh.tb - nh.sd) * tuan), cao: tran(lk + (nh.tb + nh.sd) * tuan) };
}

export function dieuHanh(db, { tuan = 'moi-nhat', nguon = 'tat-ca', nam = NAM } = {}) {
  const sl = docSoLieu(db, nam), f = phepTinh(sl), N = NGUONG;
  const tatCa = new Set(sl.dong.map(l => l.id));
  const daCo = sl.tuan.filter(p => f.coSo(tatCa, p.id));
  const danhMucLoc = {
    tuan: daCo.map(p => ({ id: p.id, nhan: `Tuần ${Number(p.id.slice(-2))} · ${p.start_date.slice(8)}/${p.start_date.slice(5, 7)}–${p.end_date.slice(8)}/${p.end_date.slice(5, 7)}` })).reverse(),
    nguon: [{ id: 'tat-ca', nhan: 'Tất cả nguồn vốn' }, ...sl.nguon.map(n => ({ id: n.id, nhan: n.name }))]
  };
  if (!daCo.length) return { trong: true, ly_do: 'Chưa có số liệu giải ngân tuần nào trong năm.', danh_muc_loc: danhMucLoc };

  const ky = daCo.find(p => p.id === tuan) || daCo.at(-1);
  const den = ky.end_date, m = f.thang(den);
  const lines = sl.dong.filter(l => nguon === 'tat-ca' || l.source_id === nguon);
  const ids = new Set(lines.map(l => l.id));
  const tenNguon = nguon === 'tat-ca' ? 'Tất cả nguồn vốn' : sl.nguon.find(n => n.id === nguon)?.name || nguon;

  // Nhóm theo dự án. Dự báo của phạm vi = tổng dự báo từng dự án, mỗi dự án không vượt KHV của nó
  // (tránh để nhịp cao của dự án sắp xong che khuất dự án đang chậm).
  const theoDuAn = new Map();
  for (const l of lines) (theoDuAn.get(l.project_id) || theoDuAn.set(l.project_id, []).get(l.project_id)).push(l);
  const nhom = [...theoDuAn].map(([pid, ls]) => {
    const pids = new Set(ls.map(l => l.id));
    return { pid, ls, pids, k: ls.reduce((s, l) => s + l.plan_amount, 0), lk: f.luyKe(pids, den), nhd: f.nhip(pids, ky.id, N.so_tuan_tinh_nhip) };
  });
  const duBaoPV = tuan => nhom.reduce((a, g) => { const b = duBao(g.lk, g.nhd, tuan, g.k); return { giua: a.giua + b.giua, thap: a.thap + b.thap, cao: a.cao + b.cao }; }, { giua: 0, thap: 0, cao: 0 });

  // ------------------------------------------------------------------ Thẻ chỉ số
  const khv = lines.reduce((s, l) => s + l.plan_amount, 0);
  const luyKe = f.luyKe(ids, den);
  const kbP = f.kbPhuong(lines, m), kbT = f.kbThanhPho(lines, m), kbP12 = f.kbPhuong(lines, 12), kbT12 = f.kbThanhPho(lines, 12);
  const tuanThang = f.tuanConLai(den, m), tuanNam = f.tuanConLai(den, 12);
  const nh = f.nhip(ids, ky.id, N.so_tuan_tinh_nhip), nhip = nh.tb;
  const db12 = duBaoPV(tuanNam);
  const can = (muc, tuanCon) => (muc == null ? null : tuanCon > 0 ? Math.max(0, muc - luyKe) / tuanCon : Math.max(0, muc - luyKe));
  const chi_so = {
    khv, luy_ke: luyKe, ty_le: tyLe(luyKe, khv), phat_sinh: f.phatSinh(ids, ky.id),
    kb_phuong_thang: kbP?.amount ?? null, chenh_phuong: kbP ? luyKe - kbP.amount : null, dat_phuong: kbP ? tyLe(luyKe, kbP.amount) : null,
    kb_tp_thang: kbT?.amount ?? null, chenh_tp: kbT ? luyKe - kbT.amount : null, dat_tp: kbT ? tyLe(luyKe, kbT.amount) : null,
    can_moi_tuan_thang: can(kbP?.amount, tuanThang), can_moi_tuan_nam: can(khv, tuanNam), nhip_gan_day: nhip,
    du_bao_cuoi_nam: db12.giua, du_bao_thap: db12.thap, du_bao_cao: db12.cao, du_bao_ty_le: tyLe(db12.giua, khv),
    du_bao_du_ky: nh.n >= 3,
    kb_phuong_cuoi_nam: kbP12?.amount ?? null, kb_tp_cuoi_nam: kbT12?.amount ?? null,
    tuan_con_lai_thang: tuanThang, tuan_con_lai_nam: tuanNam
  };

  // ------------------------------------------------------- Đường lũy kế T6 → T12
  const duong = [];
  for (let t = 6; t <= 12; t++) {
    const ngay = cuoiThang(nam, t), p = f.kbPhuong(lines, t), tp = f.kbThanhPho(lines, t);
    duong.push({
      thang: t, ngay, nhan: `T${t}`,
      thuc_hien: ngay <= den ? f.luyKe(ids, ngay) : null,
      kb_phuong: p?.amount ?? null, kb_tp: tp?.amount ?? null,
      ...(ngay > den ? (b => ({ du_bao: b.giua, du_bao_thap: b.thap, du_bao_cao: b.cao }))(duBaoPV(f.tuanConLai(den, t))) : { du_bao: null })
    });
  }
  const diemHienTai = { ngay: den, nhan: `Tuần ${Number(ky.id.slice(-2))}`, thuc_hien: luyKe };

  // Nhịp tuần (12 tuần gần nhất) – cho đường nhỏ trong thẻ
  const nhipTuan = daCo.filter(p => p.id <= ky.id).slice(-12).map(p => ({ period_id: p.id, nhan: `T${Number(p.id.slice(-2))}`, phat_sinh: f.phatSinh(ids, p.id) }));

  // ------------------------------------------------------------- Bảng theo tháng
  const bang_thang = [];
  for (let t = 7; t <= 12; t++) {
    const ngay = cuoiThang(nam, t), truoc = cuoiThang(nam, t - 1);
    const p = f.kbPhuong(lines, t), p0 = f.kbPhuong(lines, t - 1), tp = f.kbThanhPho(lines, t);
    const daQua = ngay <= den, dangDien = !daQua && t === m;
    const th = daQua ? f.luyKe(ids, ngay) : dangDien ? luyKe : null;
    bang_thang.push({
      thang: t, nhan: `T${t}/${nam}`,
      kh_trong_thang: p && p0 ? p.amount - p0.amount : null,
      th_trong_thang: th == null ? null : th - f.luyKe(ids, truoc),
      kb_phuong: p?.amount ?? null, kb_tp: tp?.amount ?? null, thuc_hien: th,
      dat_phuong: th != null && p ? tyLe(th, p.amount) : null, dat_tp: th != null && tp ? tyLe(th, tp.amount) : null,
      trang_thai: daQua ? (p && th >= p.amount - N.bo_qua_duoi_dong ? 'dat' : 'khong_dat') : dangDien ? 'dang_dien_ra' : 'chua_den'
    });
  }

  // ------------------------------------------------------------- Theo dự án
  const du_an = nhom.map(({ pid, ls, pids, k, lk, nhd }) => {
    const da = sl.duAn.find(d => d.id === pid) || { id: pid, short_name: pid, owner: '' };
    const kb = f.kbPhuong(ls, m), nh = nhd.tb, db12 = duBao(lk, nhd, tuanNam, k).giua;
    const thieu = kb ? Math.max(0, kb.amount - lk) : 0;
    return {
      project_id: pid, ten: da.short_name, ten_day_du: da.name, dau_moi: da.owner || 'Chủ đầu tư', so_dong_von: ls.length,
      khv: k, luy_ke: lk, ty_le: tyLe(lk, k), kb_thang: kb?.amount ?? null, ty_le_kb_thang: kb ? tyLe(kb.amount, k) : null,
      dat_kb_thang: kb ? tyLe(lk, kb.amount) : null, thieu: thieu < N.bo_qua_duoi_dong ? 0 : thieu,
      can_moi_tuan: thieu >= N.bo_qua_duoi_dong ? thieu / Math.max(1, tuanThang) : 0,
      nhip_gan_day: nh, tuan_dung_im: f.tuanDungIm(pids, ky.id), du_bao_cuoi_nam: db12, du_bao_ty_le: tyLe(db12, k),
      thieu_so_lieu: !f.coSo(pids, ky.id)
    };
  });

  const kyOut = { id: ky.id, nhan: `Tuần ${Number(ky.id.slice(-2))}`, tu: ky.start_date, den, thang: m, nam };
  const { de_xuat, muc } = danhGia({ du_an, chi_so, ky: kyOut, nam, nguong: N, ten_pham_vi: tenNguon });
  for (const d of du_an) d.muc = muc.get(d.project_id) || 'xanh';
  const thuTu = { do: 0, vang: 1, xanh: 2 };
  du_an.sort((a, b) => thuTu[a.muc] - thuTu[b.muc] || b.thieu - a.thieu || (a.ty_le ?? 0) - (b.ty_le ?? 0));
  chi_so.so_du_an = du_an.length;
  chi_so.so_do = du_an.filter(d => d.muc === 'do').length;
  chi_so.so_vang = du_an.filter(d => d.muc === 'vang').length;

  return {
    danh_muc_loc: danhMucLoc, bo_loc: { tuan: ky.id, nguon },
    ky: kyOut,
    pham_vi: {
      ten: tenNguon, so_du_an: du_an.length, so_dong_von: lines.length,
      ghi_chu_tp: lines.some(l => !l.city_assigned) && lines.some(l => l.city_assigned)
        ? 'Nguồn tăng thu dự toán do phường tự cân đối, thành phố không giao: phần này trong mốc "Kịch bản TP" lấy theo kế hoạch phường.'
        : lines.every(l => !l.city_assigned) ? 'Thành phố không giao kịch bản cho nguồn này.' : ''
    },
    chi_so, duong_luy_ke: duong, diem_hien_tai: diemHienTai, nhip_tuan: nhipTuan, bang_thang, du_an, de_xuat,
    nguong: { phien_ban: N.phien_ban }
  };
}
