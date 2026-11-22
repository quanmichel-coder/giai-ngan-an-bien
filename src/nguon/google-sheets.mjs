// Bộ chuyển nguồn: bảng Google Sheets → gói dữ liệu chuẩn.
// Phần mềm TỰ ĐI LẤY (máy chủ tải bảng về), không mở cổng nào để Google gửi vào.
// Bảng phải giữ đúng bố cục tệp Excel bảng điều hành (sheet NHAP_LIEU + DU_AN) hoặc
// giải ngân theo tuần (02_NHAP_TUAN): tải về dạng .xlsx rồi dùng lại nguyên bộ đọc Excel.
import { createHash } from 'node:crypto';
import * as excel from './excel.mjs';
import { NAM } from '../core/hang-so.mjs';

export const moTa = { id: 'gsheets', ten: 'Bảng Google Sheets (tự đồng bộ định kỳ)' };

/** Đổi đường liên kết người dùng dán vào thành địa chỉ tải về dạng .xlsx. */
export function diaChiTai(link) {
  const s = String(link || '').trim();
  let m = /docs\.google\.com\/spreadsheets\/d\/e\/([A-Za-z0-9_-]{20,})/.exec(s);
  if (m) return `https://docs.google.com/spreadsheets/d/e/${m[1]}/pub?output=xlsx`;    // "Xuất bản lên web"
  m = /docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/.exec(s);
  if (m) return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=xlsx`;
  return null;
}

export class LoiNguonMang extends Error {}

/** Tải bảng về (tối đa 10 MB, chờ tối đa 30 giây). `layFetch` thay được khi kiểm thử. */
export async function tai(link, { layFetch = globalThis.fetch } = {}) {
  const url = diaChiTai(link);
  if (!url) throw new LoiNguonMang('Đường liên kết không phải bảng Google Sheets (cần dạng docs.google.com/spreadsheets/d/…).');
  let r;
  try { r = await layFetch(url, { redirect: 'follow', signal: AbortSignal.timeout(30000) }); }
  catch (e) { throw new LoiNguonMang(`Không kết nối được tới Google (${e.name === 'TimeoutError' ? 'quá 30 giây' : e.message}). Kiểm tra mạng Internet của máy chủ.`); }
  const loai = r.headers.get('content-type') || '';
  if (r.status === 401 || r.status === 403 || (r.ok && loai.includes('text/html')))
    throw new LoiNguonMang('Google không cho tải bảng: hãy bật chia sẻ "Bất kỳ ai có đường liên kết – Người xem" cho bảng này.');
  if (r.status === 404) throw new LoiNguonMang('Không tìm thấy bảng (đường liên kết sai hoặc bảng đã bị xóa).');
  if (!r.ok) throw new LoiNguonMang(`Google trả lỗi ${r.status}. Thử lại sau.`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > 10 * 1024 * 1024) throw new LoiNguonMang('Bảng vượt quá 10 MB.');
  return buf;
}

/**
 * Tải và đọc bảng thành gói chuẩn.
 * Mã nhận diện (sha256) tính trên NỘI DUNG SỐ LIỆU, không trên tệp: mỗi lần Google xuất lại tệp
 * có dấu thời gian khác nhau, nếu băm cả tệp thì lần nào cũng tưởng là có thay đổi.
 */
export async function doc(link, nam = NAM, tuyChon = {}) {
  const buf = await tai(link, tuyChon);
  const goi = excel.doc(buf, 'Google Sheets', nam);
  goi.kenh = 'gsheets';
  goi.ten_tep = `Google Sheets (${String(link).slice(0, 80)})`;
  const noiDung = JSON.stringify([goi.dong_von, goi.moc_nen, goi.giai_ngan, goi.kich_ban].map(ds =>
    ds.map(x => Object.entries(x).filter(([k]) => k !== 'source_ref').sort())));
  goi.sha256 = createHash('sha256').update(noiDung).digest('hex');
  return goi;
}
