// Bộ chuyển nguồn: biểu mẫu nhập tay trên giao diện → gói dữ liệu chuẩn.
// Biểu mẫu gửi số theo TRIỆU ĐỒNG (cách cán bộ quen đọc), ở đây đổi ra đồng.
import { taoGoi } from './goi.mjs';
import { NAM } from '../core/hang-so.mjs';

export const moTa = { id: 'tay', ten: 'Nhập tay theo tuần, theo dự án' };

/**
 * body = { period_id, dong: [{ line_id, trieu, ghi_chu? }] }
 * Ô để trống không được gửi lên; muốn báo "không phát sinh" thì nhập 0.
 */
export function doc(body, nguoiNhap, nam = NAM) {
  const goi = taoGoi({ kenh: 'tay', ten_tep: `Nhập tay bởi ${nguoiNhap}`, nam, mau: 'bieu-mau' });
  for (const d of body?.dong || []) {
    if (d.trieu === '' || d.trieu == null) continue;
    const v = Number(String(d.trieu).replace(/\./g, '').replace(',', '.'));
    goi.giai_ngan.push({
      line_id: String(d.line_id || ''), period_id: String(body.period_id || ''),
      amount: Number.isFinite(v) ? Math.round(v * 1e6) : NaN, source_ref: 'Biểu mẫu nhập tay', note: String(d.ghi_chu || '').slice(0, 300)
    });
  }
  if (!goi.giai_ngan.length) goi.canh_bao.push('Chưa nhập số nào. Tuần không phát sinh thì nhập 0.');
  return goi;
}
