// ĐỒNG BỘ TỰ ĐỘNG từ Google Sheets.
// Tự lấy số một lần mỗi ngày lúc GIO_CAP_NHAT (18:00, giờ máy chủ), cộng nút bấm "Cập nhật từ Google Sheets".
// Mỗi lần lấy: tải bảng → so nội dung với lần trước → nếu khác thì cho qua đúng một cửa nhập:
//   - số MỚI: ghi ngay (người ghi = "dong-bo:<id>", coi như Phòng Kinh tế đã xác nhận);
//   - số KHÁC số đã có: KHÔNG ghi, giữ trong danh sách chờ để Phòng Kinh tế bấm duyệt hoặc bỏ qua;
//   - kỳ đã khóa sổ: không bao giờ bị đổi.
import { readFileSync } from 'node:fs';
import { tx, nhatKy, bayGio } from '../core/db.mjs';
import { loi } from '../core/quyen.mjs';
import { GIO_CAP_NHAT } from '../core/hang-so.mjs';
import * as gsheets from '../nguon/google-sheets.mjs';
import { xemTruoc, ghi } from './nhap.mjs';

const nguoiMay = n => ({ id: 0, username: `dong-bo:${n.id}`, role: 'kinhte' });

function demLech(bc) {
  return bc.giai_ngan.lech.length + bc.moc_nen.lech.length + bc.kich_ban.lech.length + bc.dong_von.lech_khv.length;
}

/** Danh sách nguồn kèm phần đang chờ duyệt (tính lại từ gói đọc lần cuối so với CSDL hiện tại). */
export function danhSach(db) {
  return db.prepare('SELECT * FROM sync_sources ORDER BY id').all().map(n => {
    const { last_goi_json, ...r } = n;
    let cho = null;
    if (last_goi_json && n.last_hash !== n.skipped_hash) {
      const bc = xemTruoc(db, JSON.parse(last_goi_json), nguoiMay(n));
      if (demLech(bc)) cho = {
        so: demLech(bc),
        giai_ngan: bc.giai_ngan.lech.map(x => ({ line_id: x.line_id, period_id: x.period_id, cu: x.cu, moi: x.amount, source_ref: x.source_ref })),
        moc_nen: bc.moc_nen.lech.map(x => ({ line_id: x.line_id, cu: x.cu, moi: x.amount })),
        kich_ban: bc.kich_ban.lech.map(x => ({ set_id: x.set_id, scope_id: x.scope_id, month: x.month, cu: x.cu, moi: x.amount })),
        khv: bc.dong_von.lech_khv.map(x => ({ line_id: x.line_id, cu: x.cu, moi: x.moi }))
      };
    }
    return { ...r, gio_cap_nhat: GIO_CAP_NHAT, lan_tu_dong_tiep: new Date(mocGanNhat(new Date()).getTime() + 864e5).toISOString(), cho_duyet: cho };
  });
}

export function luuNguon(db, u, { id, url, label = '', active = 1 }) {
  if (!gsheets.diaChiTai(url)) loi('Đường liên kết không phải bảng Google Sheets (cần dạng docs.google.com/spreadsheets/d/…).');
  return tx(db, () => {
    if (id) {
      const cu = db.prepare('SELECT * FROM sync_sources WHERE id=?').get(Number(id));
      if (!cu) loi('Không có nguồn này.', 404);
      db.prepare('UPDATE sync_sources SET url=?,label=?,active=? WHERE id=?').run(String(url).trim(), String(label).slice(0, 100), active ? 1 : 0, cu.id);
      nhatKy(db, u.username, 'sync_sources', cu.id, 'sua', { url: cu.url, active: cu.active }, { url, active });
      return { id: cu.id };
    }
    const r = db.prepare('INSERT INTO sync_sources(kind,url,label,created_by,created_at) VALUES(?,?,?,?,?)')
      .run('gsheets', String(url).trim(), String(label).slice(0, 100), u.username, bayGio());
    nhatKy(db, u.username, 'sync_sources', r.lastInsertRowid, 'them', null, { url });
    return { id: Number(r.lastInsertRowid) };
  });
}

/** Kiểm tra một nguồn ngay. Không ném lỗi ra ngoài: lỗi được ghi vào trạng thái của nguồn. */
export async function kiemTra(db, id, tuyChon = {}) {
  const n = db.prepare('SELECT * FROM sync_sources WHERE id=?').get(Number(id));
  if (!n) loi('Không có nguồn này.', 404);
  const luc = bayGio();
  const datTT = (st, msg, them = {}) => db.prepare(`UPDATE sync_sources SET last_check_at=?, last_status=?, last_message=?
    ${them.hash ? ', last_hash=?, last_change_at=?, last_goi_json=?' : ''} WHERE id=?`)
    .run(luc, st, msg, ...(them.hash ? [them.hash, luc, them.goi] : []), n.id);
  let goi;
  try { goi = await gsheets.doc(n.url, undefined, tuyChon); }
  catch (e) { datTT('loi', e.message || 'Không đọc được bảng.'); return { trang_thai: 'loi', thong_bao: e.message }; }
  if (goi.sha256 === n.last_hash) { datTT('khong_doi', 'Bảng không thay đổi so với lần trước.'); return { trang_thai: 'khong_doi' }; }
  try {
    const kq = ghi(db, goi, nguoiMay(n));
    const lech = kq.lech_chua_xu_ly;
    const msg = `Có thay đổi: ghi ${kq.giai_ngan_moi} số tuần mới, ${kq.moc_nen_moi} mốc nền, ${kq.dong_von_moi} dòng vốn, ${kq.kich_ban_moi} điểm kịch bản` +
      (lech ? `; ${lech} số khác số đã có đang chờ duyệt.` : '.');
    datTT(lech ? 'cho_duyet' : 'da_cap_nhat', msg, { hash: goi.sha256, goi: JSON.stringify(goi) });
    return { trang_thai: lech ? 'cho_duyet' : 'da_cap_nhat', thong_bao: msg, ...kq, bao_cao: undefined };
  } catch (e) {
    datTT('loi', e.message || 'Không ghi được số liệu.');
    return { trang_thai: 'loi', thong_bao: e.message };
  }
}

/** Phòng Kinh tế chấp nhận toàn bộ phần khác biệt của lần đọc gần nhất. */
export function duyet(db, u, { id, ly_do }) {
  const n = db.prepare('SELECT * FROM sync_sources WHERE id=?').get(Number(id));
  if (!n?.last_goi_json) loi('Chưa có gì để duyệt.', 404);
  const kq = ghi(db, JSON.parse(n.last_goi_json), u, { chap_nhan_lech: true, ly_do: ly_do || '' });
  db.prepare("UPDATE sync_sources SET last_status='da_cap_nhat', last_message=? WHERE id=?")
    .run(`Đã duyệt ${kq.giai_ngan_thay + kq.moc_nen_thay + kq.kich_ban_thay + kq.khv_thay} thay đổi (${u.username}).`, n.id);
  return { ...kq, bao_cao: undefined };
}

/** Giữ số cũ, không nhắc lại phần khác biệt này cho tới khi bảng thay đổi lần nữa. */
export function boQua(db, u, { id, ly_do = '' }) {
  const n = db.prepare('SELECT * FROM sync_sources WHERE id=?').get(Number(id));
  if (!n) loi('Không có nguồn này.', 404);
  db.prepare("UPDATE sync_sources SET skipped_hash=last_hash, last_status='da_bo_qua', last_message=? WHERE id=?")
    .run(`Giữ số cũ, bỏ qua các khác biệt (${u.username}).`, n.id);
  nhatKy(db, u.username, 'sync_sources', n.id, 'bo_qua', null, null, String(ly_do));
  return { ok: true };
}

/**
 * Mốc tự cập nhật gần nhất đã qua tính đến `bayGio` (giờ máy chủ): hôm nay lúc GIO_CAP_NHAT nếu đã
 * qua giờ đó, nếu chưa thì hôm qua. Máy tắt/ngủ đúng 18:00 thì lần mở lại sẽ lấy bù một lần.
 */
export function mocGanNhat(bayGio = new Date(), gio = GIO_CAP_NHAT) {
  const [hh, mm] = gio.split(':').map(Number);
  const m = new Date(bayGio); m.setHours(hh, mm, 0, 0);
  if (m > bayGio) m.setDate(m.getDate() - 1);
  return m;
}

/** Đến hạn tự cập nhật khi lần lấy số gần nhất (tự động hay bấm nút) còn trước mốc gần nhất. */
export const denHan = (lastCheckAt, bayGio = new Date(), gio = GIO_CAP_NHAT) =>
  !lastCheckAt || Date.parse(lastCheckAt) < mocGanNhat(bayGio, gio).getTime();

/** Bộ hẹn giờ: mỗi phút xem đã tới mốc 18:00 chưa; tới thì lấy số một lần trong ngày. Trả về hàm dừng. */
export function batDauHenGio(db, { moiPhut = 60000 } = {}) {
  let dangChay = false;
  const chay = async () => {
    if (dangChay) return; dangChay = true;
    try {
      for (const n of db.prepare('SELECT id,last_check_at FROM sync_sources WHERE active=1').all()) {
        if (!denHan(n.last_check_at)) continue;
        const kq = await kiemTra(db, n.id);
        console.log(`[Tự cập nhật Google Sheets ${GIO_CAP_NHAT}] ${new Date().toLocaleString('vi-VN')} ${kq.trang_thai}: ${kq.thong_bao || ''}`);
      }
    } catch (e) { console.error('[Đồng bộ]', e.message); } finally { dangChay = false; }
  };
  const t = setInterval(chay, moiPhut); t.unref?.();
  setTimeout(chay, 3000).unref?.();
  return () => clearInterval(t);
}

/**
 * Gắn sẵn bảng Google Sheets từ tệp cấu hình config/google-sheets.json ({"url": "..."}),
 * để không phải dán link trên giao diện. Chỉ thêm khi chưa có nguồn nào cùng đường liên kết.
 */
export function napCauHinh(db, tep = new URL('../../config/google-sheets.json', import.meta.url)) {
  let cfg;
  try { cfg = JSON.parse(readFileSync(tep, 'utf8')); } catch { return null; }
  const url = String(cfg?.url || '').trim();
  if (!gsheets.diaChiTai(url)) { if (url) console.error('[Đồng bộ] config/google-sheets.json: đường liên kết không hợp lệ.'); return null; }
  const co = db.prepare('SELECT id FROM sync_sources WHERE url=?').get(url);
  if (co) return co.id;
  db.prepare('UPDATE sync_sources SET active=0').run();   // một bảng chính: tắt nguồn cũ nếu đổi link trong tệp cấu hình
  return luuNguon(db, { username: 'cau-hinh' }, { url, label: 'Từ tệp cấu hình' }).id;
}
