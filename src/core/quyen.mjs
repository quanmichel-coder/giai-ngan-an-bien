// Đăng nhập, phiên làm việc và phân quyền. Mật khẩu băm scrypt (cùng định dạng bản v0.3 để
// chuyển tài khoản sang không phải đặt lại mật khẩu).
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

export class LoiNghiepVu extends Error {
  constructor(msg, status = 400) { super(msg); this.status = status; }
}
export const loi = (msg, status = 400) => { throw new LoiNghiepVu(msg, status); };

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

export function dangNhap(db, username, password) {
  const ten = String(username || '').trim().toLowerCase();
  const k = thatBai.get(ten);
  if (k && k.n >= 5 && Date.now() < k.den) loi('Sai mật khẩu quá 5 lần. Thử lại sau 5 phút.', 429);
  const u = db.prepare('SELECT * FROM users WHERE username=? AND active=1').get(ten);
  if (!u || !dungMatKhau(password, u.password_hash)) {
    const n = (k && Date.now() < k.den ? k.n : 0) + 1;
    thatBai.set(ten, { n, den: Date.now() + 5 * 60 * 1000 });
    loi('Tên đăng nhập hoặc mật khẩu không đúng.', 401);
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
