// Hằng số nghiệp vụ dùng chung. Đổi năm kế hoạch, thêm nguồn vốn: sửa ở đây.

export const NAM = Number(process.env.NAM_KE_HOACH || 2026);

export const NGUON_VON = [
  { id: 'NSTP', name: 'Ngân sách thành phố', ord: 1, city_assigned: 1 },
  { id: 'PHANCAP', name: 'Ngân sách phân cấp phường', ord: 2, city_assigned: 1 },
  { id: 'TANGTHU', name: 'Tăng thu dự toán phường', ord: 3, city_assigned: 0 }
];

/** Mã bộ kịch bản theo năm: phường tự lập (dùng để chấm), thành phố giao (để đối chiếu). */
export const boPhuong = (nam = NAM) => `PHUONG-${nam}`;
export const boThanhPho = (nam = NAM) => `TP-${nam}`;

/** Vai trò. Quyền cụ thể nằm ở core/quyen.mjs. */
export const VAI_TRO = {
  admin: 'Quản trị hệ thống',
  kinhte: 'Phòng Kinh tế',
  bql: 'Ban quản lý dự án / chủ đầu tư',
  lanhdao: 'Lãnh đạo UBND phường'
};

export const TRANG_THAI_VIEC = { mo: 'Mới giao', dang_xu_ly: 'Đang xử lý', xong: 'Đã xong', huy: 'Không thực hiện' };

const BO_DAU = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

/** Đoán mã nguồn vốn từ cách ghi trong tệp. */
export function chuanHoaNguon(text) {
  const t = BO_DAU(String(text || ''));
  if (!t) return null;
  if (t.includes('tang thu')) return 'TANGTHU';
  if (t.includes('phan cap') || t.includes('ngan sach phuong')) return 'PHANCAP';
  if (t.includes('thanh pho') || t.includes('nstp')) return 'NSTP';
  return null;
}

/** Ngày cuối tháng (YYYY-MM-DD). */
export const cuoiThang = (nam, thang) => new Date(Date.UTC(nam, thang, 0)).toISOString().slice(0, 10);

/**
 * Tháng của một tuần = tháng của NGÀY KẾT THÚC tuần (quy ước của bảng Excel).
 * Tuần cuối năm vắt sang tháng 1 năm sau vẫn tính cho tháng 12.
 */
export const thangCua = (ngay, nam) => (Number(ngay.slice(0, 4)) > nam ? 12 : Number(ngay.slice(5, 7)));

/** Giờ tự cập nhật số liệu từ Google Sheets mỗi ngày (giờ máy chủ). Tỷ lệ giải ngân không cần cập nhật liên tục. */
export const GIO_CAP_NHAT = '18:00';

/** Chênh lệch dưới 1.000 đồng coi là làm tròn, không phải sai lệch. */
export const LAM_TRON = 1000;
