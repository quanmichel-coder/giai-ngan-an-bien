// Chuyển dữ liệu từ bản v0.3 sang bản tối giản v1. Chỉ ĐỌC cơ sở dữ liệu cũ, không sửa gì ở đó.
//   DB_PATH=<csdl-moi> node src/cli/chuyen-du-lieu.mjs <đường-dẫn-csdl-cũ>
// Chạy lại nhiều lần được: chỉ chép những gì chưa có. Kết thúc bằng bảng đối chiếu tổng số.
import { DatabaseSync } from 'node:sqlite';
import { existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { moCsdl, tx, bayGio, kyMocNen, damBaoKyMocNen } from '../core/db.mjs';
import { NAM } from '../core/hang-so.mjs';

const ROLE = { admin: 'admin', economy: 'kinhte', manager: 'bql', partner: 'bql', leader: 'lanhdao' };
const NGUOI = 'chuyen-tu-v0.3';

export function chuyen(cu, moi, nam = NAM) {
  const q = (sql, ...a) => cu.prepare(sql).all(...a);
  const bang = new Set(q("SELECT name FROM sqlite_master WHERE type='table'").map(r => r.name));
  for (const b of ['projects', 'funding_lines', 'weekly_lines', 'opening_lines', 'periods', 'users'])
    if (!bang.has(b)) throw new Error(`CSDL cũ thiếu bảng ${b} — không phải bản v0.3 có dòng vốn.`);
  const luc = bayGio(), kq = {};
  tx(moi, () => {
    const da = moi.prepare('INSERT OR IGNORE INTO projects(id,name,short_name,owner,total_investment) VALUES(?,?,?,?,?)');
    kq.du_an = q('SELECT * FROM projects').reduce((n, p) => n + da.run(p.id, p.name, p.short_name, p.owner || '', p.total_investment).changes, 0);

    const dv = moi.prepare('INSERT OR IGNORE INTO funding_lines(id,project_id,source_id,year,label,plan_amount,ord,source_ref) VALUES(?,?,?,?,?,?,?,?)');
    kq.dong_von = q('SELECT * FROM funding_lines').reduce((n, l) => n + dv.run(l.id, l.project_id, l.source_id, nam, l.label, l.plan_amount, l.ord, l.source_ref).changes, 0);

    // Khóa sổ các kỳ đã khóa ở bản cũ
    for (const p of q('SELECT id FROM periods WHERE locked=1')) moi.prepare('UPDATE periods SET locked=1 WHERE id=?').run(p.id);

    // Số liệu bản cũ do Phòng Kinh tế nạp từ tệp Excel chính thức → chuyển ở trạng thái đã xác nhận.
    const gn = moi.prepare(`INSERT OR IGNORE INTO disbursements(line_id,period_id,amount,state,channel,source_ref,note,created_by,created_at,confirmed_by,confirmed_at)
      VALUES(?,?,?,'da_xac_nhan','chuyen',?,?,?,?,?,?)`);
    const nen = q('SELECT * FROM opening_lines');
    if (nen.length) {
      const ky = damBaoKyMocNen(moi, nam, nen[0].as_of);
      kq.moc_nen = nen.reduce((n, o) => n + gn.run(o.line_id, ky, o.amount, o.source_ref, 'Mốc nền', NGUOI, luc, NGUOI, luc).changes, 0);
    }
    const coKy = new Set(moi.prepare('SELECT id FROM periods').all().map(p => p.id));
    const tuan = q('SELECT * FROM weekly_lines');
    const ngoai = tuan.filter(w => !coKy.has(w.period_id));
    if (ngoai.length) throw new Error(`Có ${ngoai.length} số liệu thuộc kỳ không có trong lịch tuần năm ${nam} (ví dụ ${ngoai[0].period_id}).`);
    kq.giai_ngan_tuan = tuan.reduce((n, w) => n + gn.run(w.line_id, w.period_id, w.amount, w.source_ref, '', NGUOI, w.created_at, NGUOI, luc).changes, 0);

    if (bang.has('scenario_sets')) {
      for (const s of q('SELECT * FROM scenario_sets'))
        moi.prepare('UPDATE scenario_sets SET basis=?, note=? WHERE id=?').run(s.basis || '', s.note || '', s.id);
      const sp = moi.prepare('INSERT OR IGNORE INTO scenario_points(set_id,scope_kind,scope_id,month,amount,source_ref) VALUES(?,?,?,?,?,?)');
      // Kế hoạch phường ở mức dự án là tổng các dòng vốn → không chép, tự cộng ra khi đọc.
      kq.diem_kich_ban = q("SELECT * FROM scenario_points WHERE scope_kind IN ('line','source')")
        .reduce((n, p) => n + sp.run(p.set_id, p.scope_kind, p.scope_id, Number(p.target_date.slice(5, 7)), p.amount, p.source_ref).changes, 0);
      const daCo = moi.prepare('SELECT COUNT(*) n FROM scenario_changes').get().n;
      if (!daCo) {
        const sc = moi.prepare('INSERT INTO scenario_changes(at,actor,set_id,scope_kind,scope_id,month,before_amount,after_amount,reason) VALUES(?,?,?,?,?,?,?,?,?)');
        kq.lich_su_kich_ban = 0;
        for (const c of q("SELECT * FROM scenario_changes WHERE scope_kind IN ('line','source')")) {
          sc.run(c.at, c.actor, c.set_id, c.scope_kind, c.scope_id, Number(c.target_date.slice(5, 7)), c.before_amount, c.after_amount, c.reason || ''); kq.lich_su_kich_ban++;
        }
      }
    }

    const us = moi.prepare('INSERT OR IGNORE INTO users(id,username,name,role,password_hash,active) VALUES(?,?,?,?,?,?)');
    kq.tai_khoan = q('SELECT * FROM users').reduce((n, u) => n + us.run(u.id, u.username, u.name, ROLE[u.role] || 'lanhdao', u.password_hash, u.active).changes, 0);
    if (bang.has('assignments')) {
      const as = moi.prepare('INSERT OR IGNORE INTO assignments(user_id,project_id) VALUES(?,?)');
      kq.phan_cong = q('SELECT * FROM assignments').reduce((n, a) => n + as.run(a.user_id, a.project_id).changes, 0);
    }
    if (bang.has('import_batches')) {
      const b = moi.prepare("INSERT OR IGNORE INTO batches(id,channel,file_name,sha256,actor,at,summary_json) VALUES(?,'excel',?,?,?,?,'{}')");
      kq.lan_nhap = q('SELECT * FROM import_batches').reduce((n, x) => n + b.run(x.id, x.file_name, x.sha256, 'v0.3', x.imported_at).changes, 0);
    }
    if (bang.has('audit_logs') && !moi.prepare("SELECT 1 FROM audit_log WHERE actor LIKE 'v0.3:%' LIMIT 1").get()) {
      const al = moi.prepare('INSERT INTO audit_log(at,actor,entity,entity_id,action,before_json,after_json,reason) VALUES(?,?,?,?,?,?,?,?)');
      kq.nhat_ky = q('SELECT * FROM audit_logs ORDER BY id').reduce((n, a) => n + al.run(a.at, 'v0.3:' + a.actor, a.entity, a.entity_id, a.action, a.before_json, a.after_json, a.reason || '').changes, 0);
    }
    moi.prepare('INSERT INTO audit_log(at,actor,entity,entity_id,action,after_json,reason) VALUES(?,?,?,?,?,?,?)')
      .run(luc, NGUOI, 'he_thong', 'chuyen_du_lieu', 'chuyen', JSON.stringify(kq), 'Chuyển dữ liệu từ bản v0.3');
  });

  // Đối chiếu: tổng KHV, tổng mốc nền, tổng giải ngân tuần phải khớp tuyệt đối.
  const mot = (db, sql) => Number(db.prepare(sql).get().t || 0);
  const doi = [
    ['Tổng KHV các dòng vốn', mot(cu, 'SELECT SUM(plan_amount) t FROM funding_lines'), mot(moi, `SELECT SUM(plan_amount) t FROM funding_lines WHERE year=${nam}`)],
    ['Tổng mốc nền', mot(cu, 'SELECT SUM(amount) t FROM opening_lines'), mot(moi, `SELECT SUM(amount) t FROM disbursements WHERE period_id='${kyMocNen(nam)}'`)],
    ['Tổng giải ngân tuần', mot(cu, 'SELECT SUM(amount) t FROM weekly_lines'), mot(moi, `SELECT SUM(d.amount) t FROM disbursements d JOIN periods p ON p.id=d.period_id WHERE p.kind='tuan'`)],
    ['Số điểm kịch bản (dòng vốn + nguồn)', mot(cu, "SELECT COUNT(*) t FROM scenario_points WHERE scope_kind IN ('line','source')"), mot(moi, 'SELECT COUNT(*) t FROM scenario_points')]
  ].map(([ten, a, b]) => ({ ten, ban_cu: a, ban_moi: b, khop: a === b }));
  return { da_chep: kq, doi_chieu: doi };
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const nguon = process.argv[2];
  if (!nguon || !existsSync(nguon)) { console.error('Cách dùng: DB_PATH=<csdl-moi> node src/cli/chuyen-du-lieu.mjs <csdl-cu.sqlite>'); process.exit(2); }
  const cu = new DatabaseSync(nguon, { readOnly: true });
  const moi = moCsdl();
  const r = chuyen(cu, moi);
  console.log('Đã chép:', r.da_chep);
  console.table(r.doi_chieu);
  if (r.doi_chieu.some(x => !x.khop)) { console.error('CẢNH BÁO: có tổng số không khớp, kiểm tra trước khi dùng.'); process.exit(1); }
  console.log('Đối chiếu khớp toàn bộ.');
}
