// MỘT CỬA NHẬP LIỆU: mọi gói dữ liệu chuẩn (Excel, CSV, nhập tay…) đều qua hai bước
//   1. xemTruoc(): đối chiếu với CSDL, KHÔNG ghi gì → báo cáo mới / trùng / lệch / không nhận ra.
//   2. ghi():      ghi phần mới; phần lệch chỉ ghi khi người có thẩm quyền chấp nhận kèm lý do.
// Không bao giờ ghi đè âm thầm. Mọi thay đổi vào nhật ký.
import { randomUUID } from 'node:crypto';
import { tx, nhatKy, bayGio, kyMocNen, damBaoKyMocNen } from '../core/db.mjs';
import { LAM_TRON } from '../core/hang-so.mjs';
import { loi, duAnDuocNhap } from '../core/quyen.mjs';
import { kiemTraHinhThuc } from '../nguon/goi.mjs';

const giong = (a, b) => Math.abs(a - b) < LAM_TRON;

export function xemTruoc(db, goi, u) {
  const bc = {
    kenh: goi.kenh, ten_tep: goi.ten_tep, mau: goi.mau,
    loi: kiemTraHinhThuc(goi), canh_bao: [...goi.canh_bao], ghi_chu: [...goi.ghi_chu],
    da_nap: null,
    giai_ngan: { moi: [], trung: 0, lam_tron: 0, lech: [], khong_nhan: [], ngoai_quyen: [], khoa: [] },
    moc_nen: { moi: [], trung: 0, lech: [] },
    dong_von: { moi: [], lech_khv: [] },
    kich_ban: { moi: [], trung: 0, lech: [] },
    doi_chieu: []
  };
  if (goi.loi_doc) return bc;
  if (goi.sha256) {
    const b = db.prepare('SELECT at,actor FROM batches WHERE sha256=?').get(goi.sha256);
    if (b) bc.da_nap = b;
  }
  const dongDb = new Map(db.prepare('SELECT * FROM funding_lines').all().map(l => [l.id, l]));
  const dongTep = new Map(goi.dong_von.map(l => [l.line_id, l]));
  const ky = new Map(db.prepare('SELECT * FROM periods').all().map(p => [p.id, p]));
  const cu = new Map(db.prepare('SELECT line_id,period_id,amount,state FROM disbursements').all().map(d => [d.line_id + '|' + d.period_id, d]));
  const phamVi = duAnDuocNhap(db, u);
  const duAnCua = id => dongDb.get(id)?.project_id || dongTep.get(id)?.project_id;

  // Danh mục dòng vốn và KHV
  for (const l of goi.dong_von) {
    const d = dongDb.get(l.line_id);
    if (!d) bc.dong_von.moi.push(l);
    else if (!giong(d.plan_amount, l.plan)) bc.dong_von.lech_khv.push({ line_id: l.line_id, cu: d.plan_amount, moi: l.plan, source_ref: l.source_ref });
  }

  // Giải ngân tuần
  for (const g of goi.giai_ngan) {
    if (!dongDb.has(g.line_id) && !dongTep.has(g.line_id)) { bc.giai_ngan.khong_nhan.push({ ...g, ly_do: 'Mã dòng vốn chưa có trong danh mục' }); continue; }
    const p = ky.get(g.period_id);
    if (!p) { bc.giai_ngan.khong_nhan.push({ ...g, ly_do: 'Kỳ không có trong lịch tuần của năm' }); continue; }
    if (p.locked) { bc.giai_ngan.khoa.push(g); continue; }
    if (phamVi && !phamVi.has(duAnCua(g.line_id))) { bc.giai_ngan.ngoai_quyen.push(g); continue; }
    const c = cu.get(g.line_id + '|' + g.period_id);
    if (!c) bc.giai_ngan.moi.push(g);
    else if (c.amount === g.amount) bc.giai_ngan.trung++;
    else if (giong(c.amount, g.amount)) bc.giai_ngan.lam_tron++;
    else bc.giai_ngan.lech.push({ ...g, cu: c.amount, trang_thai_cu: c.state });
  }

  // Mốc nền
  const nen = kyMocNen(goi.nam);
  for (const m of goi.moc_nen) {
    const c = cu.get(m.line_id + '|' + nen);
    if (!c) bc.moc_nen.moi.push(m);
    else if (giong(c.amount, m.amount)) bc.moc_nen.trung++;
    else bc.moc_nen.lech.push({ ...m, cu: c.amount });
  }
  const pNen = ky.get(nen);
  if (pNen && goi.moc_nen.length && goi.moc_nen[0].as_of !== pNen.end_date)
    bc.canh_bao.push(`Mốc nền trong tệp tính đến ${goi.moc_nen[0].as_of}, trong hệ thống là ${pNen.end_date}.`);

  // Kịch bản
  const diem = new Map(db.prepare('SELECT * FROM scenario_points').all().map(d => [`${d.set_id}|${d.scope_kind}|${d.scope_id}|${d.month}`, d]));
  for (const k of goi.kich_ban) {
    const c = diem.get(`${k.set_id}|${k.scope_kind}|${k.scope_id}|${k.month}`);
    if (!c) bc.kich_ban.moi.push(k);
    else if (giong(c.amount, k.amount)) bc.kich_ban.trung++;
    else bc.kich_ban.lech.push({ ...k, cu: c.amount });
  }

  // Ngày tuần theo tệp so với lịch hệ thống
  for (const t of goi.ky_tep) {
    const p = ky.get(t.period_id);
    if (p && t.start && (p.start_date !== t.start || p.end_date !== t.end))
      bc.canh_bao.push(`${t.source_ref}: tuần ${t.period_id} trong tệp là ${t.start}→${t.end}, lịch hệ thống là ${p.start_date}→${p.end_date}.`);
  }

  // Đối chiếu lũy kế tệp tự tính với lũy kế hệ thống sẽ có sau khi ghi
  if (goi.doi_chieu.length) {
    const sau = new Map();
    for (const [k, d] of cu) { const [l] = k.split('|'); sau.set(l, (sau.get(l) || 0) + d.amount); }
    for (const g of bc.giai_ngan.moi) sau.set(g.line_id, (sau.get(g.line_id) || 0) + g.amount);
    for (const g of bc.giai_ngan.lech) sau.set(g.line_id, (sau.get(g.line_id) || 0) + g.amount - g.cu);
    for (const m of bc.moc_nen.moi) sau.set(m.line_id, (sau.get(m.line_id) || 0) + m.amount);
    for (const x of goi.doi_chieu) {
      const he = sau.get(x.line_id) || 0;
      if (!giong(he, x.amount)) bc.doi_chieu.push({ line_id: x.line_id, tep: x.amount, he_thong: he, chenh: he - x.amount, source_ref: x.source_ref });
    }
  }
  return bc;
}

export function ghi(db, goi, u, { ly_do = '', chap_nhan_lech = false } = {}) {
  const bc = xemTruoc(db, goi, u);
  if (bc.loi.length) loi('Gói dữ liệu còn lỗi, chưa ghi: ' + bc.loi.slice(0, 3).join(' '));
  const coLech = bc.giai_ngan.lech.length + bc.moc_nen.lech.length + bc.kich_ban.lech.length + bc.dong_von.lech_khv.length;
  if (chap_nhan_lech) {
    if (u.role !== 'kinhte') loi('Chỉ Phòng Kinh tế được chấp nhận thay số đã có.', 403);
    if (String(ly_do).trim().length < 5) loi('Cần ghi lý do (ít nhất 5 ký tự) khi thay số đã có.');
  }
  const ai = u.username, luc = bayGio();
  // Phòng Kinh tế nạp số tổng hợp của chính mình → coi như đã xác nhận. Số do BQL nhập chờ Kinh tế xác nhận.
  const xacNhanNgay = u.role === 'kinhte';
  const state = xacNhanNgay ? 'da_xac_nhan' : 'cho_xac_nhan';

  return tx(db, () => {
    let batchId = goi.sha256 ? db.prepare('SELECT id FROM batches WHERE sha256=?').get(goi.sha256)?.id : null;
    if (!batchId) {
      batchId = randomUUID();
      db.prepare('INSERT INTO batches(id,channel,file_name,sha256,actor,at) VALUES(?,?,?,?,?,?)').run(batchId, goi.kenh, goi.ten_tep, goi.sha256, ai, luc);
    }
    const kq = { giai_ngan_moi: 0, giai_ngan_thay: 0, moc_nen_moi: 0, moc_nen_thay: 0, dong_von_moi: 0, khv_thay: 0, kich_ban_moi: 0, kich_ban_thay: 0, lech_chua_xu_ly: chap_nhan_lech ? 0 : coLech };

    // Danh mục: dự án / dòng vốn mới
    const insDa = db.prepare('INSERT OR IGNORE INTO projects(id,name,short_name) VALUES(?,?,?)');
    const insDong = db.prepare('INSERT INTO funding_lines(id,project_id,source_id,year,label,plan_amount,ord,source_ref) VALUES(?,?,?,?,?,?,?,?)');
    for (const l of bc.dong_von.moi) {
      const ten = l.label.split(' · ').slice(1).join(' · ').replace(/\s*\([^)]*\)$/, '') || l.project_id;
      insDa.run(l.project_id, ten, ten);
      insDong.run(l.line_id, l.project_id, l.source_id, goi.nam, l.label, l.plan, 0, l.source_ref);
      nhatKy(db, ai, 'funding_lines', l.line_id, 'them', null, l, `Nhập từ ${goi.ten_tep}`); kq.dong_von_moi++;
    }
    if (chap_nhan_lech) for (const l of bc.dong_von.lech_khv) {
      db.prepare('UPDATE funding_lines SET plan_amount=?,source_ref=? WHERE id=?').run(l.moi, l.source_ref, l.line_id);
      nhatKy(db, ai, 'funding_lines', l.line_id, 'sua_khv', { plan_amount: l.cu }, { plan_amount: l.moi }, ly_do); kq.khv_thay++;
    }

    // Giải ngân
    const ins = db.prepare(`INSERT INTO disbursements(line_id,period_id,amount,state,channel,source_ref,batch_id,note,created_by,created_at,confirmed_by,confirmed_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`);
    const upd = db.prepare(`UPDATE disbursements SET amount=?,state=?,channel=?,source_ref=?,batch_id=?,note=?,created_by=?,created_at=?,confirmed_by=?,confirmed_at=?
      WHERE line_id=? AND period_id=?`);
    const xn = xacNhanNgay ? [ai, luc] : [null, null];
    for (const g of bc.giai_ngan.moi) {
      ins.run(g.line_id, g.period_id, g.amount, state, goi.kenh, g.source_ref, batchId, g.note || '', ai, luc, ...xn); kq.giai_ngan_moi++;
    }
    if (chap_nhan_lech) for (const g of bc.giai_ngan.lech) {
      upd.run(g.amount, state, goi.kenh, g.source_ref, batchId, g.note || '', ai, luc, ...xn, g.line_id, g.period_id);
      nhatKy(db, ai, 'disbursements', `${g.line_id}|${g.period_id}`, 'thay_so', { amount: g.cu }, { amount: g.amount }, ly_do); kq.giai_ngan_thay++;
    }

    // Mốc nền
    if (bc.moc_nen.moi.length || (chap_nhan_lech && bc.moc_nen.lech.length)) {
      const nen = damBaoKyMocNen(db, goi.nam, goi.moc_nen[0].as_of);
      for (const m of bc.moc_nen.moi) { ins.run(m.line_id, nen, m.amount, 'da_xac_nhan', goi.kenh, m.source_ref, batchId, 'Mốc nền', ai, luc, ai, luc); kq.moc_nen_moi++; }
      if (chap_nhan_lech) for (const m of bc.moc_nen.lech) {
        upd.run(m.amount, 'da_xac_nhan', goi.kenh, m.source_ref, batchId, 'Mốc nền', ai, luc, ai, luc, m.line_id, nen);
        nhatKy(db, ai, 'disbursements', `${m.line_id}|${nen}`, 'thay_moc_nen', { amount: m.cu }, { amount: m.amount }, ly_do); kq.moc_nen_thay++;
      }
    }

    // Kịch bản
    const ghiDiem = (k, truoc) => {
      db.prepare(`INSERT INTO scenario_points(set_id,scope_kind,scope_id,month,amount,source_ref) VALUES(?,?,?,?,?,?)
        ON CONFLICT(set_id,scope_kind,scope_id,month) DO UPDATE SET amount=excluded.amount, source_ref=excluded.source_ref`)
        .run(k.set_id, k.scope_kind, k.scope_id, k.month, k.amount, k.source_ref);
      db.prepare('INSERT INTO scenario_changes(at,actor,set_id,scope_kind,scope_id,month,before_amount,after_amount,reason) VALUES(?,?,?,?,?,?,?,?,?)')
        .run(luc, ai, k.set_id, k.scope_kind, k.scope_id, k.month, truoc, k.amount, truoc == null ? `Nhập từ ${goi.ten_tep}` : ly_do);
    };
    for (const k of bc.kich_ban.moi) { ghiDiem(k, null); kq.kich_ban_moi++; }
    if (chap_nhan_lech) for (const k of bc.kich_ban.lech) { ghiDiem(k, k.cu); kq.kich_ban_thay++; }

    db.prepare('UPDATE batches SET summary_json=? WHERE id=?').run(JSON.stringify(kq), batchId);
    nhatKy(db, ai, 'batches', batchId, 'ghi', null, kq, ly_do || goi.ten_tep);
    return { ...kq, bao_cao: bc };
  });
}

/** Phòng Kinh tế xác nhận số do BQL nhập. */
export function xacNhan(db, u, ids) {
  const luc = bayGio();
  return tx(db, () => {
    let n = 0;
    for (const id of ids || []) {
      const r = db.prepare("UPDATE disbursements SET state='da_xac_nhan',confirmed_by=?,confirmed_at=? WHERE id=? AND state='cho_xac_nhan'").run(u.username, luc, Number(id));
      if (r.changes) { n++; nhatKy(db, u.username, 'disbursements', id, 'xac_nhan', null, null); }
    }
    return { da_xac_nhan: n };
  });
}
