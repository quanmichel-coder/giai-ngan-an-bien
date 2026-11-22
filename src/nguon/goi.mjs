// GÓI DỮ LIỆU CHUẨN — điểm hẹn của mọi nguồn nhập.
// Mỗi bộ chuyển nguồn (Excel, CSV, nhập tay, sau này: phần mềm kế toán, Kho bạc…) chỉ có một việc:
// biến dữ liệu của nó thành đúng khuôn dưới đây. Phần kiểm tra, đối chiếu, ghi CSDL dùng chung.
//
// {
//   kenh: 'excel' | 'csv' | 'tay' | …,   ten_tep, sha256 (null nếu nhập tay), nam, mau,
//   dong_von:  [{ line_id, project_id, source_id, label, plan, source_ref }]   // danh mục + KHV (tùy chọn)
//   moc_nen:   [{ line_id, amount, as_of, source_ref }]                       // lũy kế đầu kỳ (tùy chọn)
//   giai_ngan: [{ line_id, period_id, amount, source_ref, note? }]            // phát sinh từng tuần
//   kich_ban:  [{ set_id, scope_kind:'line'|'source', scope_id, month, amount, source_ref }]
//   doi_chieu: [{ line_id, amount, source_ref }]                              // lũy kế tệp tự tính, để soát
//   ky_tep:    [{ period_id, start, end, source_ref }]                        // ngày tuần theo tệp, để soát
//   ghi_chu: [], canh_bao: []
// }
// Đơn vị tiền: ĐỒNG, số nguyên không âm.

export function taoGoi({ kenh, ten_tep = '', sha256 = null, nam, mau = '' }) {
  return { kenh, ten_tep, sha256, nam, mau, dong_von: [], moc_nen: [], giai_ngan: [], kich_ban: [], doi_chieu: [], ky_tep: [], ghi_chu: [], canh_bao: [] };
}

const MA_KY = /^\d{4}-T\d{2}$/;

/** Kiểm tra hình thức gói (không cần CSDL). Trả về danh sách lỗi chặn ghi. */
export function kiemTraHinhThuc(goi) {
  const loi = [];
  const so = (v, noi) => { if (!Number.isSafeInteger(v) || v < 0) loi.push(`${noi}: số tiền không hợp lệ (${v}).`); };
  for (const g of goi.giai_ngan) {
    if (!g.line_id) loi.push(`${g.source_ref || 'Dòng'}: thiếu mã dòng vốn.`);
    if (!MA_KY.test(g.period_id || '')) loi.push(`${g.source_ref || g.line_id}: kỳ "${g.period_id}" không đúng dạng 2026-T41.`);
    so(g.amount, g.source_ref || `${g.line_id} ${g.period_id}`);
  }
  for (const m of goi.moc_nen) so(m.amount, m.source_ref || m.line_id);
  for (const k of goi.kich_ban) {
    so(k.amount, k.source_ref || k.scope_id);
    if (!(k.month >= 1 && k.month <= 12)) loi.push(`${k.source_ref}: tháng ${k.month} không hợp lệ.`);
  }
  const trung = new Set();
  for (const g of goi.giai_ngan) {
    const k = g.line_id + '|' + g.period_id;
    if (trung.has(k)) loi.push(`Dòng vốn ${g.line_id} kỳ ${g.period_id} xuất hiện hai lần trong cùng một lần nhập.`);
    trung.add(k);
  }
  return loi;
}
