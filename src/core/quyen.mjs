// Đăng nhập, phiên làm việc và phân quyền. Mật khẩu băm scrypt (cùng định dạng bản v0.3 để
// chuyển tài khoản sang không phải đặt lại mật khẩu).
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

export class LoiNghiepVu extends Error {
  /** `them`: thông tin phụ gửi kèm cho giao diện (ví dụ gợi ý tên đăng nhập). */
  constructor(msg, status = 400, them = null) { super(msg); this.status = status; this.them = them; }
}
export const loi = (msg, status = 400, them = null) => { throw new LoiNghiepVu(msg, status, them); };

export function bamMatKhau(mk) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(mk, salt, 64).toString('hex')}`;
}
export function dungMatKhau(mk, luu) {
  const [salt, hash] = String(luu).split(':');
  if (!salt || !hash) return false;
  return timingSafeEqual(scryptSync(String(mk), salt, 64), Buffer.from(hash, 'hex'));
}

const bam = t => createHash('sha256').update(t).digest('hex');
const THOI_HAN = 8 * 3600 * 1000;   // một ngày làm việc
const thatBai = new Map();           // username -> {n, den}

const SO_LAN_TOI_DA = 5;
const CO_DAU = /[^\x20-\x7e]/;   // ký tự ngoài bảng ASCII in được: thường do bộ gõ tiếng Việt đang bật

/** Chuẩn hóa tên đăng nhập: bỏ khoảng trắng (cả ký tự vô hình khi dán), NFC, chữ thường. */
export const chuanTen = s => String(s ?? '').normalize('NFC').replace(/[\s​-‍﻿]/g, '').toLowerCase();

/** Khoảng cách sửa chữ (Levenshtein) — để gợi ý tên gần đúng khi gõ nhầm. */
function khoangCach(a, b) {
  let truoc = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const nay = [i];
    for (let j = 1; j <= b.length; j++) nay[j] = Math.min(truoc[j] + 1, nay[j - 1] + 1, truoc[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    truoc = nay;
  }
  return truoc[b.length];
}
const boDau = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

/** Tên đăng nhập đang hoạt động gần nhất với tên gõ sai (chỉ gợi ý khi đủ gần, tối đa một tên). */
export function goiYTen(db, ten) {
  const x = boDau(ten);
  if (!x) return null;
  let tot = null;
  for (const { username } of db.prepare('SELECT username FROM users WHERE active=1').all()) {
    const d = khoangCach(x, username);
    const dauGiong = (username.startsWith(x) || x.startsWith(username)) && Math.abs(username.length - x.length) <= 3;
    if ((d <= Math.max(1, Math.floor(username.length / 3)) || dauGiong) && (!tot || d < tot.d)) tot = { username, d };
  }
  return tot?.username || null;
}

export function dangNhap(db, username, password) {
  const ten = chuanTen(username);
  const mk = String(password ?? '');
  if (!ten || !mk) loi('Cần nhập tên đăng nhập và mật khẩu.', 400);
  const k = thatBai.get(ten);
  if (k && k.n >= SO_LAN_TOI_DA && Date.now() < k.den) loi(`Sai mật khẩu quá ${SO_LAN_TOI_DA} lần. Thử lại sau 5 phút.`, 429);
  const ghiSai = () => {
    const n = (k && Date.now() < k.den ? k.n : 0) + 1;
    thatBai.set(ten, { n, den: Date.now() + 5 * 60 * 1000 });
    return SO_LAN_TOI_DA - n;
  };
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(ten);
  if (!u) {
    ghiSai();
    if (CO_DAU.test(ten)) loi(`Tên đăng nhập "${ten}" có chữ có dấu — bộ gõ tiếng Việt đang bật. Tắt bộ gõ (chuyển sang chữ ABC) rồi gõ lại.`, 401, { ly_do: 'bo_go' });
    const g = goiYTen(db, ten);
    loi(`Không có tài khoản "${ten}".` + (g ? ` Có phải "${g}"?` : ' Kiểm tra lại tên đăng nhập với Phòng Kinh tế.'), 401, { ly_do: 'sai_ten', goi_y: g });
  }
  if (!u.active) loi(`Tài khoản "${ten}" đã bị khóa. Liên hệ Phòng Kinh tế để mở lại.`, 403, { ly_do: 'khoa' });
  if (!dungMatKhau(mk, u.password_hash)) {
    const con = ghiSai();
    const goiY = CO_DAU.test(mk)
      ? ' Mật khẩu vừa gõ có chữ có dấu — bộ gõ tiếng Việt đang bật; tắt bộ gõ rồi gõ lại.'
      : ' Kiểm tra phím Caps Lock và bộ gõ tiếng Việt.';
    loi(`Mật khẩu không đúng.${goiY}` + (con > 0 ? ` Còn ${con} lần thử.` : ` Đã sai ${SO_LAN_TOI_DA} lần, thử lại sau 5 phút.`), 401, { ly_do: 'sai_mat_khau' });
  }
  thatBai.delete(ten);
  const token = randomBytes(32).toString('hex'), csrf = randomBytes(16).toString('hex');
  db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
  db.prepare('INSERT INTO sessions(token_hash,user_id,csrf,expires) VALUES(?,?,?,?)').run(bam(token), u.id, csrf, Date.now() + THOI_HAN);
  return { token, csrf, user: congKhai(u) };
}

export function dangXuat(db, token) { if (token) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(bam(token)); }

export function phienCua(db, token) {
  if (!token) return null;
  const s = db.prepare('SELECT s.csrf,s.expires,u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND u.active=1').get(bam(token));
  if (!s || s.expires < Date.now()) return null;
  return { ...congKhai(s), csrf: s.csrf };
}

function congKhai(u) { return { id: u.id, username: u.username, name: u.name, role: u.role }; }

// ------------------------------------------------------------------------------ Phân quyền
// Một bảng quyền duy nhất, đọc là hiểu ai được làm gì.
const QUYEN = {
  xem:          ['admin', 'kinhte', 'bql', 'lanhdao'],
  nhap_tep:     ['kinhte'],
  nhap_tay:     ['kinhte', 'bql'],          // bql chỉ với dự án được phân công
  xac_nhan:     ['kinhte'],
  sua_kich_ban: ['kinhte'],
  giao_viec:    ['kinhte', 'lanhdao'],
  cap_nhat_viec:['kinhte', 'bql', 'lanhdao'],
  khoa_ky:      ['kinhte']
};

export function canQuyen(u, viec) {
  if (!u) loi('Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.', 401);
  if (!QUYEN[viec]?.includes(u.role)) loi('Tài khoản của bạn không có quyền thực hiện thao tác này.', 403);
}

/** Dự án mà người dùng được nhập số. kinhte: tất cả; bql: theo phân công. */
export function duAnDuocNhap(db, u) {
  if (u.role === 'kinhte') return null;   // null = không giới hạn
  return new Set(db.prepare('SELECT project_id FROM assignments WHERE user_id=?').all(u.id).map(r => r.project_id));
}
