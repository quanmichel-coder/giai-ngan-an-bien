// CẢNH BÁO – ĐỀ XUẤT GIẢI PHÁP theo quy tắc. Chạy tại chỗ, không gọi dịch vụ bên ngoài.
// Mỗi đề xuất nêu rõ: quy tắc nào, con số nào, ngưỡng nào → để cán bộ kiểm tra lại được.
// Thêm quy tắc = thêm một phần tử vào QUY_TAC (hàm nhận một dự án, trả về đề xuất hoặc null).

const tr = v => Math.round((v || 0) / 1e6).toLocaleString('vi-VN');
const pct = v => v == null ? '–' : (v * 100).toFixed(1).replace('.', ',') + '%';
const congNgay = (ngay, n) => { const d = new Date(ngay + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export const TEN_QUY_TAC = {
  CHAM_KH_THANG: 'Chậm so với kế hoạch tháng của phường',
  DUNG_IM: 'Nhiều tuần không phát sinh giải ngân',
  NGUY_CO_DU_VON: 'Nguy cơ không giải ngân hết KHV',
  THIEU_SO_LIEU: 'Chưa có số liệu kỳ báo cáo',
  CO_THE_NHAN_THEM: 'Có thể tiếp nhận vốn điều chuyển',
  TOAN_PHAM_VI: 'Tiến độ chung của phạm vi đang xem'
};

const QUY_TAC = [
  // R1 — Chậm so với mục tiêu lũy kế cuối tháng của phường
  (d, c) => {
    if (d.kb_thang == null || d.thieu <= 0) return null;
    const muc = d.dat_kb_thang < c.N.dat_ke_hoach_thang_do ? 'do' : d.dat_kb_thang < c.N.dat_ke_hoach_thang_vang ? 'vang' : null;
    if (!muc) return null;
    const t = c.chi_so.tuan_con_lai_thang;
    return {
      quy_tac: 'CHAM_KH_THANG', muc,
      tom_tat: `Thiếu ${tr(d.thieu)} triệu so với KH T${c.ky.thang}`,
      viec_ngan: 'Rà soát khối lượng, hoàn thiện hồ sơ thanh toán gửi Kho bạc trong tuần',
      van_de: `Lũy kế đạt ${pct(d.dat_kb_thang)} mục tiêu cuối T${c.ky.thang} của phường; còn thiếu ${tr(d.thieu)} triệu.`,
      giai_phap: t > 0
        ? `Cần bình quân ${tr(d.can_moi_tuan)} triệu/tuần trong ${t} tuần còn lại của tháng (nhịp ${c.N.so_tuan_tinh_nhip} tuần gần nhất: ${tr(d.nhip_gan_day)} triệu/tuần). Đề nghị chủ đầu tư rà soát khối lượng hoàn thành, hoàn thiện hồ sơ nghiệm thu, thanh toán gửi Kho bạc ngay trong tuần.`
        : `Tháng đã hết tuần báo cáo. Đưa phần thiếu ${tr(d.thieu)} triệu vào kế hoạch tháng sau và nêu rõ nguyên nhân trong báo cáo tháng.`,
      so_lieu: { dat: d.dat_kb_thang, thieu: d.thieu, can_moi_tuan: d.can_moi_tuan, nhip: d.nhip_gan_day, nguong: [c.N.dat_ke_hoach_thang_do, c.N.dat_ke_hoach_thang_vang] }
    };
  },
  // R2 — Đứng im nhiều tuần trong khi còn vốn
  (d, c) => {
    if (d.tuan_dung_im < c.N.so_tuan_dung_im || d.khv - d.luy_ke < c.N.bo_qua_duoi_dong) return null;
    return {
      quy_tac: 'DUNG_IM', muc: 'do',
      tom_tat: `${d.tuan_dung_im} tuần liên tiếp không giải ngân`,
      viec_ngan: 'Báo cáo bằng văn bản nguyên nhân, vướng mắc và thời điểm giải ngân tiếp',
      van_de: `Không phát sinh giải ngân ${d.tuan_dung_im} tuần liên tiếp; còn ${tr(d.khv - d.luy_ke)} triệu chưa giải ngân.`,
      giai_phap: 'Yêu cầu chủ đầu tư báo cáo bằng văn bản nguyên nhân, vướng mắc (mặt bằng, hồ sơ, nhà thầu, thủ tục) và thời điểm giải ngân tiếp theo; Phòng Kinh tế kiểm tra thực địa, tham mưu UBND phường tháo gỡ.',
      so_lieu: { tuan_dung_im: d.tuan_dung_im, nguong: c.N.so_tuan_dung_im }
    };
  },
  // R3 — Dự báo cuối năm không hết vốn
  (d, c) => {
    const conLai = d.khv - d.luy_ke;
    if (d.du_bao_ty_le == null || d.du_bao_ty_le >= c.N.du_bao_het_von_vang || conLai < c.N.bo_qua_duoi_dong) return null;
    const du = Math.max(0, d.khv - d.du_bao_cuoi_nam), tuan = Math.max(1, c.chi_so.tuan_con_lai_nam);
    return {
      quy_tac: 'NGUY_CO_DU_VON', muc: d.du_bao_ty_le < c.N.du_bao_het_von_do ? 'do' : 'vang', du_kien_du: du,
      tom_tat: `Dự báo 31/12 đạt ${pct(d.du_bao_ty_le)} KHV, dư ${tr(du)} triệu`,
      viec_ngan: 'Lập kế hoạch giải ngân từng tuần đến 31/12; không hết vốn thì báo cáo sớm để điều chuyển',
      van_de: `Giữ nhịp hiện tại (${tr(d.nhip_gan_day)} triệu/tuần) thì đến 31/12 đạt ${pct(d.du_bao_ty_le)} KHV, dư khoảng ${tr(du)} triệu.`,
      giai_phap: `Chủ đầu tư lập kế hoạch giải ngân từng tuần đến 31/12 (cần ${tr(conLai / tuan)} triệu/tuần). Nếu xác định không giải ngân hết, báo cáo sớm để UBND phường đề xuất điều chuyển khoảng ${tr(du)} triệu sang dự án giải ngân tốt hơn.`,
      so_lieu: { du_bao_ty_le: d.du_bao_ty_le, du, nguong: [c.N.du_bao_het_von_do, c.N.du_bao_het_von_vang] }
    };
  },
  // R4 — Thiếu số liệu kỳ đang xem
  (d, c) => d.thieu_so_lieu ? {
    quy_tac: 'THIEU_SO_LIEU', muc: 'vang',
    tom_tat: `Chưa có số ${c.ky.nhan.toLowerCase()}`,
    viec_ngan: 'Gửi số liệu tuần (không phát sinh thì nhập 0)',
    van_de: `Chưa có số liệu ${c.ky.nhan.toLowerCase()} (${c.ky.tu} – ${c.ky.den}).`,
    giai_phap: 'Đôn đốc chủ đầu tư gửi số liệu; tuần không phát sinh thì nhập 0 để phân biệt với chưa báo cáo.', so_lieu: {}
  } : null,
  // R5 — Ứng viên nhận vốn điều chuyển
  (d, c) => (d.dat_kb_thang != null && d.dat_kb_thang >= 1 && (d.du_bao_ty_le ?? 0) >= 1 && (d.ty_le ?? 1) < 0.999) ? {
    quy_tac: 'CO_THE_NHAN_THEM', muc: 'xanh',
    tom_tat: 'Vượt kế hoạch, có thể nhận thêm vốn',
    viec_ngan: 'Báo cáo nhu cầu vốn bổ sung kèm khối lượng dự kiến',
    van_de: `Vượt mục tiêu T${c.ky.thang} (${pct(d.dat_kb_thang)}); dự báo giải ngân hết KHV trước 31/12.`,
    giai_phap: 'Có thể tiếp nhận vốn điều chuyển nếu còn khối lượng; đề nghị chủ đầu tư báo cáo nhu cầu vốn bổ sung kèm khối lượng dự kiến.',
    so_lieu: { dat: d.dat_kb_thang, du_bao_ty_le: d.du_bao_ty_le }
  } : null
];

export function danhGia({ du_an, chi_so, ky, nam, nguong: N, ten_pham_vi, hom_nay = ky.den }) {
  const c = { du_an, chi_so, ky, nam, N };
  // Hạn xử lý tính từ ngày lập đề xuất (hôm nay), không từ ngày cuối kỳ số liệu — số về trễ thì hạn không bị lùi về quá khứ.
  const han = congNgay(hom_nay > ky.den ? hom_nay : ky.den, 7);
  const ra = [], muc = new Map(), bac = { do: 2, vang: 1, xanh: 0 };
  for (const d of du_an) {
    for (const q of QUY_TAC) {
      const r = q(d, c);
      if (!r) continue;
      ra.push({ ...r, ma: `${r.quy_tac}:${d.project_id}:${ky.id}`, ten_quy_tac: TEN_QUY_TAC[r.quy_tac], project_id: d.project_id, ten_du_an: d.ten, dau_moi: d.dau_moi, han });
      if ((bac[r.muc] ?? 0) > (bac[muc.get(d.project_id)] ?? -1)) muc.set(d.project_id, r.muc);
    }
  }

  // R6 — Toàn phạm vi: nhịp chung và phương án điều chuyển nội bộ
  if (chi_so.du_bao_ty_le != null && chi_so.du_bao_ty_le < N.du_bao_het_von_vang) {
    const du = ra.filter(x => x.quy_tac === 'NGUY_CO_DU_VON');
    const nhan = ra.filter(x => x.quy_tac === 'CO_THE_NHAN_THEM');
    const lan = chi_so.nhip_gan_day > 0 ? chi_so.can_moi_tuan_nam / chi_so.nhip_gan_day : null;
    let gp = lan != null && lan < 1
      ? `Nhịp chung (${tr(chi_so.nhip_gan_day)} triệu/tuần) đủ về tổng, nhưng dồn vào các dự án sắp hết vốn; phần thiếu nằm ở các dự án mức đỏ. Cần đôn đốc riêng từng dự án đó thay vì nhìn số tổng.`
      : `Cần nâng nhịp chung lên ${tr(chi_so.can_moi_tuan_nam)} triệu/tuần${lan ? ` (gấp ${lan.toFixed(1).replace('.', ',')} lần nhịp hiện tại)` : ''} trong ${chi_so.tuan_con_lai_nam} tuần còn lại. Tập trung chỉ đạo các dự án mức đỏ.`;
    if (du.length && nhan.length)
      gp += ` Phương án điều chuyển nội bộ để cân nhắc: dư dự kiến ${tr(du.reduce((s, x) => s + x.du_kien_du, 0))} triệu ở ${du.map(x => x.project_id).join(', ')}; dự án có thể nhận: ${nhan.map(x => x.project_id).join(', ')}.`;
    ra.unshift({
      quy_tac: 'TOAN_PHAM_VI', ten_quy_tac: TEN_QUY_TAC.TOAN_PHAM_VI, muc: chi_so.du_bao_ty_le < N.du_bao_het_von_do ? 'do' : 'vang',
      ma: `TOAN_PHAM_VI:${ten_pham_vi}:${ky.id}`, project_id: null, ten_du_an: ten_pham_vi, dau_moi: 'Phòng Kinh tế', han,
      tom_tat: `Dự báo 31/12 đạt ${pct(chi_so.du_bao_ty_le)} KHV`,
      viec_ngan: lan != null && lan >= 1 ? `Nâng nhịp chung lên ${tr(chi_so.can_moi_tuan_nam)} triệu/tuần; tập trung các dự án mức đỏ` : 'Đôn đốc riêng từng dự án mức đỏ',
      van_de: `Giữ nhịp ${N.so_tuan_tinh_nhip} tuần gần nhất (${tr(chi_so.nhip_gan_day)} triệu/tuần) thì đến 31/12 đạt ${pct(chi_so.du_bao_ty_le)} KHV.`,
      giai_phap: gp, so_lieu: { du_bao_ty_le: chi_so.du_bao_ty_le, can_moi_tuan_nam: chi_so.can_moi_tuan_nam }
    });
  }
  ra.sort((a, b) => (a.project_id === null ? -1 : b.project_id === null ? 1 : 0) || bac[b.muc] - bac[a.muc]);
  return { de_xuat: ra, muc };
}
