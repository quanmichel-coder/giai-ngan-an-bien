// Quản lý tài khoản bằng dòng lệnh (chạy trên máy chủ, không qua mạng).
//   node src/cli/tai-khoan.mjs liet-ke
//   node src/cli/tai-khoan.mjs them <tên> "<Họ tên>" <admin|kinhte|bql|lanhdao>   (mật khẩu nhập từ bàn phím)
//   node src/cli/tai-khoan.mjs dat-mat-khau <tên>                                   (mật khẩu nhập từ bàn phím)
//   node src/cli/tai-khoan.mjs phan-cong <tên> DA01,DA02
//   node src/cli/tai-khoan.mjs khoa <tên> | mo <tên>
// Không xóa tài khoản: khóa lại để giữ dấu vết trong nhật ký.
import { createInterface } from 'node:readline';
import { moCsdl, nhatKy } from '../core/db.mjs';
import { bamMatKhau } from '../core/quyen.mjs';
import { VAI_TRO } from '../core/hang-so.mjs';

const db = moCsdl();
const [lenh, ten, ...du] = process.argv.slice(2);
const docMk = () => new Promise(ok => { const r = createInterface({ input: process.stdin }); r.question('', v => { r.close(); ok(v); }); });
const can = u => { const x = db.prepare('SELECT * FROM users WHERE username=?').get(String(u || '').toLowerCase()); if (!x) { console.error('Không có tài khoản', u); process.exit(1); } return x; };
async function matKhauMoi() {
  process.stdout.write('Mật khẩu mới (ít nhất 8 ký tự, tắt bộ gõ tiếng Việt khi nhập): ');
  const mk = (await docMk()).trim();
  if (mk.length < 8) { console.error('Mật khẩu quá ngắn.'); process.exit(1); }
  if (/[^\x20-\x7e]/.test(mk)) { console.error('Mật khẩu có ký tự có dấu — bộ gõ tiếng Việt đang bật. Tắt bộ gõ rồi đặt lại.'); process.exit(1); }
  return mk;
}

if (lenh === 'liet-ke') console.table(db.prepare('SELECT u.username, u.name, u.role, u.active, GROUP_CONCAT(a.project_id) du_an FROM users u LEFT JOIN assignments a ON a.user_id=u.id GROUP BY u.id').all());
else if (lenh === 'them') {
  const [hoTen, vt] = du;
  if (!ten || !hoTen || !VAI_TRO[vt]) { console.error('Cách dùng: them <tên> "<Họ tên>" <' + Object.keys(VAI_TRO).join('|') + '>'); process.exit(2); }
  const mk = await matKhauMoi();
  db.prepare('INSERT INTO users(username,name,role,password_hash) VALUES(?,?,?,?)').run(ten.toLowerCase(), hoTen, vt, bamMatKhau(mk));
  nhatKy(db, 'dong-lenh', 'users', ten, 'them', null, { name: hoTen, role: vt });
  console.log(`Đã tạo tài khoản ${ten} (${VAI_TRO[vt]}).`);
} else if (lenh === 'dat-mat-khau') {
  const u = can(ten); const mk = await matKhauMoi();
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bamMatKhau(mk), u.id);
  db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id);
  nhatKy(db, 'dong-lenh', 'users', u.username, 'dat_mat_khau', null, null);
  console.log('Đã đặt lại mật khẩu cho', u.username);
} else if (lenh === 'phan-cong') {
  const u = can(ten); const ds = String(du[0] || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  db.prepare('DELETE FROM assignments WHERE user_id=?').run(u.id);
  for (const p of ds) db.prepare('INSERT OR IGNORE INTO assignments(user_id,project_id) SELECT ?,id FROM projects WHERE id=?').run(u.id, p);
  nhatKy(db, 'dong-lenh', 'assignments', u.username, 'phan_cong', null, ds);
  console.log(`Đã phân công ${u.username}: ${ds.join(', ') || '(không dự án nào)'}`);
} else if (lenh === 'khoa' || lenh === 'mo') {
  const u = can(ten);
  db.prepare('UPDATE users SET active=? WHERE id=?').run(lenh === 'mo' ? 1 : 0, u.id);
  if (lenh === 'khoa') db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id);
  nhatKy(db, 'dong-lenh', 'users', u.username, lenh, null, null);
  console.log(`Đã ${lenh === 'mo' ? 'mở' : 'khóa'} tài khoản ${u.username}.`);
} else { console.log('Lệnh: liet-ke | them | dat-mat-khau | phan-cong | khoa | mo'); }
