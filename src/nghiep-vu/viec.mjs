// VƯỚNG MẮC – GIẢI PHÁP: biến đề xuất của hệ thống thành việc có đầu mối, hạn, kết quả.
// Vòng khép kín: cảnh báo → giao việc → cập nhật xử lý → kỳ sau đối chiếu số giải ngân.
import { tx, nhatKy, bayGio } from '../core/db.mjs';
import { TRANG_THAI_VIEC } from '../core/hang-so.mjs';
import { loi, duAnDuocNhap } from '../core/quyen.mjs';

const homNay = () => new Date().toISOString().slice(0, 10);

export function danhSachViec(db, u) {
  const pham = u.role === 'bql' ? duAnDuocNhap(db, u) : null;
  const h = homNay();
  return db.prepare(`SELECT a.*, p.short_name ten_du_an FROM actions a LEFT JOIN projects p ON p.id=a.project_id
    ORDER BY CASE a.status WHEN 'mo' THEN 0 WHEN 'dang_xu_ly' THEN 1 ELSE 2 END, a.due IS NULL, a.due, a.id DESC`).all()
    .filter(a => !pham || (a.project_id && pham.has(a.project_id)))
    .map(a => ({ ...a, qua_han: ['mo', 'dang_xu_ly'].includes(a.status) && a.due && a.due < h }));
}

const sach = (s, n = 1000) => String(s ?? '').trim().slice(0, n);

export function taoViec(db, u, b) {
  const v = { project_id: sach(b.project_id, 20) || null, suggestion_key: sach(b.suggestion_key, 200) || null, rule_id: sach(b.rule_id, 40) || null,
    problem: sach(b.problem), solution: sach(b.solution), owner: sach(b.owner, 200), due: sach(b.due, 10) || null };
  if (!v.problem || !v.solution || !v.owner) loi('Cần ghi đủ vấn đề, giải pháp và đầu mối thực hiện.');
  if (v.due && !/^\d{4}-\d{2}-\d{2}$/.test(v.due)) loi('Hạn xử lý phải có dạng năm-tháng-ngày.');
  if (v.project_id && !db.prepare('SELECT 1 FROM projects WHERE id=?').get(v.project_id)) loi('Không có dự án này.', 404);
  if (v.suggestion_key) {
    const co = db.prepare('SELECT id FROM actions WHERE suggestion_key=?').get(v.suggestion_key);
    if (co) return { id: co.id, da_co: true };
  }
  const luc = bayGio();
  return tx(db, () => {
    const r = db.prepare(`INSERT INTO actions(project_id,suggestion_key,rule_id,problem,solution,owner,due,created_by,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?)`).run(v.project_id, v.suggestion_key, v.rule_id, v.problem, v.solution, v.owner, v.due, u.username, luc, luc);
    nhatKy(db, u.username, 'actions', r.lastInsertRowid, 'giao', null, v);
    return { id: Number(r.lastInsertRowid) };
  });
}

export function capNhatViec(db, u, b) {
  const cu = db.prepare('SELECT * FROM actions WHERE id=?').get(Number(b.id));
  if (!cu) loi('Không có việc này.', 404);
  if (u.role === 'bql') {
    const pham = duAnDuocNhap(db, u);
    if (!cu.project_id || !pham.has(cu.project_id)) loi('Việc này không thuộc dự án được phân công.', 403);
  }
  const moi = { status: b.status ?? cu.status, result: b.result != null ? sach(b.result, 2000) : cu.result,
    due: b.due != null ? sach(b.due, 10) || null : cu.due, owner: b.owner != null ? sach(b.owner, 200) : cu.owner };
  if (!TRANG_THAI_VIEC[moi.status]) loi('Trạng thái không hợp lệ.');
  if (u.role === 'bql' && (moi.due !== cu.due || moi.owner !== cu.owner || moi.status === 'huy')) loi('Ban QLDA chỉ cập nhật tiến độ và kết quả xử lý.', 403);
  if (['xong', 'huy'].includes(moi.status) && !moi.result) loi('Cần ghi kết quả xử lý (hoặc lý do không thực hiện) trước khi đóng việc.');
  tx(db, () => {
    db.prepare('UPDATE actions SET status=?,result=?,due=?,owner=?,updated_at=? WHERE id=?').run(moi.status, moi.result, moi.due, moi.owner, bayGio(), cu.id);
    nhatKy(db, u.username, 'actions', cu.id, 'cap_nhat', { status: cu.status, result: cu.result, due: cu.due, owner: cu.owner }, moi);
  });
  return { ok: true };
}
