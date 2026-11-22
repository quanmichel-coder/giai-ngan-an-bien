// Máy chủ HTTP tối giản: định tuyến mỏng → gọi nghiệp vụ → trả JSON. Không thư viện ngoài.
//   HOST=0.0.0.0 PORT=3090 DB_PATH=... node src/server.mjs
import { createServer } from 'node:http';
import { createServer as createHttps } from 'node:https';
import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { extname, join, normalize } from 'node:path';
import { networkInterfaces } from 'node:os';
import { moCsdl, tx, nhatKy, bayGio } from './core/db.mjs';
import { NAM, VAI_TRO, TRANG_THAI_VIEC, boPhuong, boThanhPho } from './core/hang-so.mjs';
import { LoiNghiepVu, loi, dangNhap, dangXuat, phienCua, canQuyen, duAnDuocNhap } from './core/quyen.mjs';
import { docTep, tay } from './nguon/index.mjs';
import { MAU_CSV } from './nguon/csv.mjs';
import { xemTruoc, ghi, xacNhan } from './nghiep-vu/nhap.mjs';
import { dieuHanh } from './nghiep-vu/tong-hop.mjs';
import { danhSachViec, taoViec, capNhatViec } from './nghiep-vu/viec.mjs';
import { bangKichBan, suaDiem } from './nghiep-vu/kich-ban.mjs';
import * as dongBo from './nghiep-vu/dong-bo.mjs';

const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const BAO_MAT = {
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'Cache-Control': 'no-store'
};

const cookie = req => Object.fromEntries((req.headers.cookie || '').split(';').map(s => s.trim().split('=')).filter(p => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
function docThan(req, gioiHan = 15 * 1024 * 1024) {
  return new Promise((ok, hong) => {
    let n = 0; const ch = [];
    req.on('data', c => { n += c.length; if (n > gioiHan) { hong(new LoiNghiepVu('Dữ liệu gửi lên quá lớn.', 413)); req.destroy(); } else ch.push(c); });
    req.on('end', () => { try { ok(ch.length ? JSON.parse(Buffer.concat(ch).toString('utf8')) : {}); } catch { hong(new LoiNghiepVu('Dữ liệu gửi lên không đúng định dạng.')); } });
    req.on('error', hong);
  });
}

export function taoUngDung(db, { https = false } = {}) {
  const tenCookie = 'gn_phien';
  const datCookie = (res, v, tuoi) => res.setHeader('Set-Cookie', `${tenCookie}=${v}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${tuoi}${https || process.env.COOKIE_SECURE === '1' ? '; Secure' : ''}`);

  /** Đọc gói từ yêu cầu nhập: tệp (base64) hoặc biểu mẫu nhập tay. */
  const goiTu = (body, u) => body.kenh === 'tay' ? tay.doc(body, u.username)
    : docTep(Buffer.from(String(body.du_lieu || ''), 'base64'), String(body.ten_tep || ''), NAM);
  const quyenNhap = (body, u) => canQuyen(u, body.kenh === 'tay' ? 'nhap_tay' : 'nhap_tep');

  const tuyen = {
    'GET /api/toi': ({ u }) => ({ ...u, ten_vai_tro: VAI_TRO[u.role] }),
    'POST /api/dang-xuat': ({ res, token }) => { dangXuat(db, token); datCookie(res, '', 0); return { ok: true }; },

    'GET /api/danh-muc': () => ({
      nam: NAM, vai_tro: VAI_TRO, trang_thai_viec: TRANG_THAI_VIEC,
      nguon: db.prepare('SELECT * FROM funding_sources ORDER BY ord').all(),
      du_an: db.prepare('SELECT id,name,short_name,owner FROM projects WHERE active=1 ORDER BY id').all(),
      dong_von: db.prepare('SELECT id,project_id,source_id,label,plan_amount FROM funding_lines WHERE year=? ORDER BY project_id,ord,id').all(NAM),
      tuan: db.prepare("SELECT id,start_date,end_date,locked FROM periods WHERE year=? AND kind='tuan' ORDER BY start_date").all(NAM)
    }),

    'GET /api/dieu-hanh': ({ q }) => dieuHanh(db, { tuan: q.get('tuan') || 'moi-nhat', nguon: q.get('nguon') || 'tat-ca' }),

    // ---- Nhập liệu: một cửa cho mọi nguồn
    'POST /api/nhap/xem-truoc': ({ u, body }) => { quyenNhap(body, u); return xemTruoc(db, goiTu(body, u), u); },
    'POST /api/nhap/ghi': ({ u, body }) => { quyenNhap(body, u); return ghi(db, goiTu(body, u), u, { ly_do: body.ly_do, chap_nhan_lech: !!body.chap_nhan_lech }); },
    'GET /api/nhap/mau-csv': ({ res }) => { res.writeHead(200, { ...BAO_MAT, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="mau-giai-ngan-tuan.csv"' }); res.end('﻿' + MAU_CSV); return null; },
    'GET /api/nhap/bieu-mau': ({ u, q }) => {
      canQuyen(u, 'nhap_tay');
      const ky = q.get('ky'), pham = duAnDuocNhap(db, u);
      const dong = db.prepare(`SELECT l.id,l.project_id,l.label,l.source_id,d.amount,d.state,d.channel FROM funding_lines l
        LEFT JOIN disbursements d ON d.line_id=l.id AND d.period_id=? WHERE l.year=? ORDER BY l.project_id,l.ord,l.id`).all(ky, NAM)
        .filter(l => !pham || pham.has(l.project_id));
      return { ky, khoa: !!db.prepare('SELECT locked FROM periods WHERE id=?').get(ky)?.locked, dong };
    },
    'GET /api/xac-nhan': ({ u }) => { canQuyen(u, 'xac_nhan'); return db.prepare(`SELECT d.id,d.line_id,l.label,d.period_id,d.amount,d.channel,d.created_by,d.created_at,d.note
        FROM disbursements d JOIN funding_lines l ON l.id=d.line_id WHERE d.state='cho_xac_nhan' ORDER BY d.period_id DESC,d.line_id`).all(); },
    'POST /api/xac-nhan': ({ u, body }) => { canQuyen(u, 'xac_nhan'); return xacNhan(db, u, body.ids); },
    'POST /api/khoa-ky': ({ u, body }) => {
      canQuyen(u, 'khoa_ky');
      const k = db.prepare("SELECT * FROM periods WHERE id=? AND kind='tuan'").get(String(body.ky || ''));
      if (!k) loi('Không có kỳ này.', 404);
      const cho = db.prepare("SELECT COUNT(*) n FROM disbursements WHERE period_id=? AND state='cho_xac_nhan'").get(k.id).n;
      if (body.khoa && cho) loi(`Còn ${cho} số liệu chờ xác nhận trong kỳ, chưa khóa được.`);
      tx(db, () => { db.prepare('UPDATE periods SET locked=? WHERE id=?').run(body.khoa ? 1 : 0, k.id); nhatKy(db, u.username, 'periods', k.id, body.khoa ? 'khoa' : 'mo_khoa', null, null, String(body.ly_do || '')); });
      return { ok: true };
    },

    // ---- Kịch bản
    'GET /api/kich-ban': () => bangKichBan(db, NAM),
    'PUT /api/kich-ban/diem': ({ u, body }) => { canQuyen(u, 'sua_kich_ban'); return suaDiem(db, u, body); },

    // ---- Vướng mắc – giải pháp
    'GET /api/viec': ({ u }) => danhSachViec(db, u),
    'POST /api/viec': ({ u, body }) => { canQuyen(u, 'giao_viec'); return taoViec(db, u, body); },
    'PATCH /api/viec': ({ u, body }) => { canQuyen(u, 'cap_nhat_viec'); return capNhatViec(db, u, body); },

    // ---- Đồng bộ tự động từ Google Sheets (máy chủ tự đi lấy, không mở cổng ra ngoài)
    'GET /api/dong-bo': ({ u }) => { canQuyen(u, 'nhap_tep'); return dongBo.danhSach(db); },
    'POST /api/dong-bo': ({ u, body }) => { canQuyen(u, 'nhap_tep'); return dongBo.luuNguon(db, u, body); },
    'POST /api/dong-bo/kiem-tra': ({ u, body }) => { canQuyen(u, 'nhap_tep'); return dongBo.kiemTra(db, body.id); },
    'POST /api/dong-bo/duyet': ({ u, body }) => { canQuyen(u, 'xac_nhan'); return dongBo.duyet(db, u, body); },
    'POST /api/dong-bo/bo-qua': ({ u, body }) => { canQuyen(u, 'xac_nhan'); return dongBo.boQua(db, u, body); },

    'GET /api/nhat-ky': ({ u }) => { canQuyen(u, 'xac_nhan'); return db.prepare('SELECT at,actor,entity,entity_id,action,reason FROM audit_log ORDER BY id DESC LIMIT 100').all(); }
  };

  /** Thông tin công khai cho màn hình đăng nhập: đúng phần mềm, đúng cổng, đúng giao thức. */
  const thongTinMayChu = req => {
    const proto = https ? 'https' : 'http', cong = req.socket.localPort;
    return { ban: 'v1', giao_thuc: proto, cong, dia_chi: [`${proto}://127.0.0.1:${cong}`, ...diaChiTrongMang(cong, proto)] };
  };

  return async function xuLy(req, res) {
    const url = new URL(req.url, 'http://x');
    try {
      if (!url.pathname.startsWith('/api/')) return tinh(url.pathname, res);
      if (req.method === 'POST' && url.pathname === '/api/dang-nhap') {
        const body = await docThan(req, 10 * 1024);
        const r = dangNhap(db, body.username, body.password);
        datCookie(res, r.token, 8 * 3600);
        return guiJson(res, 200, { user: { ...r.user, ten_vai_tro: VAI_TRO[r.user.role] }, csrf: r.csrf });
      }
      const token = cookie(req)[tenCookie];
      const u = phienCua(db, token);
      if (!u && url.pathname === '/api/toi') return guiJson(res, 200, { dang_nhap: false, may_chu: thongTinMayChu(req) });
      if (!u) loi('Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.', 401);
      if (req.method !== 'GET' && req.headers['x-csrf'] !== u.csrf) loi('Yêu cầu không hợp lệ (CSRF). Tải lại trang.', 403);
      const fn = tuyen[`${req.method} ${url.pathname}`];
      if (!fn) loi('Không có chức năng này.', 404);
      const body = req.method === 'GET' ? {} : await docThan(req);
      const kq = await fn({ req, res, u, body, q: url.searchParams, token });
      if (kq !== null) guiJson(res, 200, url.pathname === '/api/toi' ? { ...kq, csrf: u.csrf } : kq);
    } catch (e) {
      const st = e instanceof LoiNghiepVu ? e.status : /Kỳ đã khóa|không được/.test(e.message) ? 409 : 500;
      if (st === 500) console.error(e);
      guiJson(res, st, { ...(st !== 500 && e.them ? e.them : {}), loi: st === 500 ? 'Lỗi hệ thống. Chi tiết đã ghi ở cửa sổ máy chủ.' : e.message });
    }
  };
}

function guiJson(res, st, v) { res.writeHead(st, { ...BAO_MAT, 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(v)); }
function tinh(path, res) {
  const p = normalize(join(PUBLIC, path === '/' ? 'index.html' : path));
  if (!p.startsWith(PUBLIC) || !existsSync(p) || !MIME[extname(p)]) { res.writeHead(404, BAO_MAT); return res.end('Không tìm thấy'); }
  res.writeHead(200, { ...BAO_MAT, 'Content-Type': MIME[extname(p)] }); res.end(readFileSync(p));
}

export function diaChiTrongMang(port, proto = 'http') {
  return Object.values(networkInterfaces()).flat().filter(n => n && n.family === 'IPv4' && !n.internal && !n.address.startsWith('169.254.')).map(n => `${proto}://${n.address}:${port}`);
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const db = moCsdl();
  const PORT = Number(process.env.PORT || 3090), HOST = process.env.HOST || '127.0.0.1';
  const tls = process.env.TLS_CERT && process.env.TLS_KEY ? { cert: readFileSync(process.env.TLS_CERT), key: readFileSync(process.env.TLS_KEY) } : null;
  const app = taoUngDung(db, { https: !!tls });
  dongBo.napCauHinh(db);
  dongBo.batDauHenGio(db);
  const sv = tls ? createHttps(tls, app) : createServer(app);
  sv.on('error', e => { console.error(e.code === 'EADDRINUSE' ? `Cổng ${PORT} đang bận — ứng dụng có thể đã chạy rồi.` : e.message); process.exit(1); });
  sv.listen(PORT, HOST, () => {
    const proto = tls ? 'https' : 'http';
    console.log(`Hệ thống quản lý giải ngân v1 đang chạy: ${proto}://127.0.0.1:${PORT}`);
    if (HOST === '0.0.0.0') for (const a of diaChiTrongMang(PORT, proto)) console.log(`  Máy khác cùng mạng cơ quan mở: ${a}`);
    console.log(`  Cơ sở dữ liệu: ${process.env.DB_PATH || 'data/giai-ngan.sqlite'} · ${bayGio()}`);
  });
}
