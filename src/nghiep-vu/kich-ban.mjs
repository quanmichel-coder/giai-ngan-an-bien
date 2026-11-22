// KỊCH BẢN GIẢI NGÂN: số lũy kế mục tiêu đến cuối mỗi tháng.
//   Phường: theo dòng vốn (phường tự lập, dùng để chấm cảnh báo).
//   Thành phố: theo nguồn vốn (thành phố giao, dùng để đối chiếu).
// Mọi lần sửa đều cần lý do và được ghi vào lịch sử không sửa, không xóa.
import { tx, bayGio } from '../core/db.mjs';
import { boPhuong, boThanhPho } from '../core/hang-so.mjs';
import { loi } from '../core/quyen.mjs';

const THANG = [7, 8, 9, 10, 11, 12];

export function bangKichBan(db, nam) {
  const bo = db.prepare('SELECT * FROM scenario_sets WHERE year=? ORDER BY level').all(nam);
  const diem = db.prepare('SELECT * FROM scenario_points WHERE set_id IN (?,?)').all(boPhuong(nam), boThanhPho(nam));
  const gt = (set, kind, id, m) => diem.find(d => d.set_id === set && d.scope_kind === kind && d.scope_id === id && d.month === m)?.amount ?? null;
  const dong = db.prepare('SELECT l.*, p.short_name FROM funding_lines l JOIN projects p ON p.id=l.project_id WHERE l.year=? ORDER BY l.project_id,l.ord,l.id').all(nam);
  const nguon = db.prepare('SELECT * FROM funding_sources ORDER BY ord').all();
  return {
    thang: THANG, bo,
    phuong: dong.map(l => ({ scope_id: l.id, nhan: l.label, source_id: l.source_id, khv: l.plan_amount, gia_tri: THANG.map(m => gt(boPhuong(nam), 'line', l.id, m)) })),
    thanh_pho: nguon.filter(n => n.city_assigned).map(n => ({
      scope_id: n.id, nhan: n.name, khv: dong.filter(l => l.source_id === n.id).reduce((s, l) => s + l.plan_amount, 0),
      gia_tri: THANG.map(m => gt(boThanhPho(nam), 'source', n.id, m))
    })),
    lich_su: db.prepare('SELECT * FROM scenario_changes ORDER BY id DESC LIMIT 30').all()
  };
}

export function suaDiem(db, u, b) {
  const bo = db.prepare('SELECT * FROM scenario_sets WHERE id=?').get(String(b.set_id || ''));
  if (!bo) loi('Không có bộ kịch bản này.', 404);
  const kind = bo.level === 'phuong' ? 'line' : 'source';
  const id = String(b.scope_id || ''), m = Number(b.month);
  if (!THANG.includes(m)) loi('Chỉ đặt mục tiêu cho tháng 7 đến tháng 12 (tháng 6 là mốc nền).');
  const ok = kind === 'line' ? db.prepare('SELECT plan_amount khv FROM funding_lines WHERE id=?').get(id)
    : db.prepare('SELECT SUM(l.plan_amount) khv FROM funding_lines l JOIN funding_sources s ON s.id=l.source_id WHERE s.id=? AND s.city_assigned=1').get(id);
  if (!ok || ok.khv == null) loi('Phạm vi không hợp lệ cho bộ kịch bản này.', 404);
  const v = Math.round(Number(String(b.trieu).replace(/\./g, '').replace(',', '.')) * 1e6);
  if (!Number.isFinite(v) || v < 0) loi('Số tiền không hợp lệ.');
  const ly = String(b.ly_do || '').trim();
  if (ly.length < 5) loi('Cần ghi lý do điều chỉnh (ít nhất 5 ký tự), ví dụ số văn bản giao.');
  // Lũy kế phải không giảm theo tháng.
  const ke = mm => db.prepare('SELECT amount FROM scenario_points WHERE set_id=? AND scope_kind=? AND scope_id=? AND month=?').get(bo.id, kind, id, mm)?.amount;
  const truoc = ke(m - 1), sau = ke(m + 1);
  if (truoc != null && v < truoc) loi(`Mục tiêu lũy kế T${m} không được thấp hơn T${m - 1} (${Math.round(truoc / 1e6).toLocaleString('vi-VN')} triệu).`);
  if (sau != null && v > sau) loi(`Mục tiêu lũy kế T${m} không được cao hơn T${m + 1} (${Math.round(sau / 1e6).toLocaleString('vi-VN')} triệu).`);
  const cu = ke(m) ?? null;
  tx(db, () => {
    db.prepare(`INSERT INTO scenario_points(set_id,scope_kind,scope_id,month,amount,source_ref) VALUES(?,?,?,?,?,?)
      ON CONFLICT(set_id,scope_kind,scope_id,month) DO UPDATE SET amount=excluded.amount, source_ref=excluded.source_ref`).run(bo.id, kind, id, m, v, `Sửa tay: ${ly}`);
    db.prepare('INSERT INTO scenario_changes(at,actor,set_id,scope_kind,scope_id,month,before_amount,after_amount,reason) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(bayGio(), u.username, bo.id, kind, id, m, cu, v, ly);
  });
  return { ok: true, vuot_khv: v > ok.khv };
}
