// XUẤT TRANG BÁO CÁO CÔNG KHAI (chỉ đọc) — trang web tĩnh, đặt trên GitHub Pages.
//   GSHEETS_URL=<link bảng> node src/cli/xuat-cong-khai.mjs <thư mục ra>
//   node src/cli/xuat-cong-khai.mjs <thư mục ra> --tep <tệp .xlsx>        (chạy thử từ tệp trên máy)
//
// Lấy số trực tiếp từ Google Sheets, cho qua đúng bộ đọc và bộ tính của app nội bộ (CSDL tạm trong bộ nhớ),
// rồi ghi ra một trang tĩnh: giao diện màn hình Điều hành + mỗi (kỳ × nguồn vốn) một tệp JSON.
// Trang KHÔNG chứa đường liên kết bảng, tài khoản hay chức năng nhập liệu.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync, existsSync, readdirSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { moCsdl } from '../core/db.mjs';
import { NAM } from '../core/hang-so.mjs';
import { ghi } from '../nghiep-vu/nhap.mjs';
import { dieuHanh } from '../nghiep-vu/tong-hop.mjs';
import { docTep } from '../nguon/index.mjs';
import * as gsheets from '../nguon/google-sheets.mjs';

const GOC = fileURLToPath(new URL('../../', import.meta.url));
/** Tệp giao diện chép sang trang công khai: [nguồn trong kho mã, tên trên trang]. */
export const TEP_GIAO_DIEN = [
  ['cong-khai/index.html', 'index.html'], ['cong-khai/cong-khai.js', 'cong-khai.js'],
  ['public/man-dieu-hanh.js', 'man-dieu-hanh.js'], ['public/bieu-do.js', 'bieu-do.js'],
  ['public/dinh-dang.js', 'dinh-dang.js'], ['public/style.css', 'style.css']
];
const NGUOI_XUAT = { id: 0, username: 'cong-khai', role: 'kinhte' };

/** Từ một gói dữ liệu chuẩn → các tệp của trang công khai trong thư mục `ra`. Trả về mục lục. */
export function xuatCongKhai(goi, ra, { luc = new Date(), nam = NAM } = {}) {
  const db = moCsdl(':memory:');
  ghi(db, goi, NGUOI_XUAT);
  const dau = dieuHanh(db, { nam });
  if (dau.trong) throw new Error(`Bảng chưa có số liệu giải ngân: ${dau.ly_do}`);

  // Chỉ xóa thư mục ra khi nó trống hoặc là trang công khai xuất lần trước — tránh lỡ tay xóa nhầm thư mục khác.
  if (existsSync(ra) && readdirSync(ra).length && !existsSync(join(ra, 'du-lieu', 'muc-luc.json')))
    throw new Error(`Thư mục ${ra} đã có tệp khác, không phải trang công khai xuất trước đó. Chọn thư mục trống.`);
  rmSync(ra, { recursive: true, force: true });
  mkdirSync(join(ra, 'du-lieu'), { recursive: true });
  for (const [nguon, ten] of TEP_GIAO_DIEN) copyFileSync(join(GOC, nguon), join(ra, ten));
  writeFileSync(join(ra, '.nojekyll'), '');     // GitHub Pages phục vụ nguyên tệp, không qua Jekyll

  const tuan = dau.danh_muc_loc.tuan.map(t => t.id), nguon = dau.danh_muc_loc.nguon.map(n => n.id);
  for (const t of tuan) for (const n of nguon) {
    const d = dieuHanh(db, { tuan: t, nguon: n, nam });
    writeFileSync(join(ra, 'du-lieu', `${t}_${n}.json`), JSON.stringify(d));
  }
  const mucLuc = { nam, cap_nhat_luc: luc.toISOString(), mac_dinh: { tuan: tuan[0], nguon: 'tat-ca' }, tuan, nguon };
  writeFileSync(join(ra, 'du-lieu', 'muc-luc.json'), JSON.stringify(mucLuc));
  db.close();
  return mucLuc;
}

// ------------------------------------------------------------------ Chạy từ dòng lệnh
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const [ra, co, tep] = process.argv.slice(2);
  if (!ra) { console.error('Cách dùng: node src/cli/xuat-cong-khai.mjs <thư mục ra> [--tep <tệp .xlsx>]'); process.exit(2); }
  let goi;
  if (co === '--tep') {
    if (!tep || !existsSync(tep)) { console.error('Không thấy tệp', tep); process.exit(2); }
    goi = docTep(readFileSync(tep), tep, NAM);
  } else {
    const url = process.env.GSHEETS_URL;
    if (!gsheets.diaChiTai(url)) { console.error('Thiếu biến GSHEETS_URL (link bảng Google Sheets) hoặc link không hợp lệ.'); process.exit(2); }
    goi = await gsheets.doc(url, NAM);     // lỗi mạng/chia sẻ: dừng, trang cũ giữ nguyên
  }
  const m = xuatCongKhai(goi, ra);
  console.log(`Đã xuất trang công khai vào ${ra}: ${m.tuan.length} kỳ × ${m.nguon.length} phạm vi, số liệu đến ${m.tuan[0]}.`);
}
