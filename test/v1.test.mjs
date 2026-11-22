// Kiểm thử bản tối giản v1:  node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { moCsdl, cacTuan } from '../src/core/db.mjs';
import { bamMatKhau } from '../src/core/quyen.mjs';
import { docTep, tay } from '../src/nguon/index.mjs';
import { xemTruoc, ghi, xacNhan } from '../src/nghiep-vu/nhap.mjs';
import { dieuHanh } from '../src/nghiep-vu/tong-hop.mjs';
import { suaDiem } from '../src/nghiep-vu/kich-ban.mjs';
import { taoUngDung } from '../src/server.mjs';

const TEP = fileURLToPath(new URL('../data/nguon-ban-chinh-thuc-02.10.2026.xlsx', import.meta.url));
const coTep = existsSync(TEP);
const KT = { id: 1, username: 'kt', role: 'kinhte' };

function csdl({ napTep = true } = {}) {
  const db = moCsdl(':memory:');
  db.prepare("INSERT INTO users(id,username,name,role,password_hash) VALUES(1,'kt','Kinh tế','kinhte',?),(2,'bq','BQL','bql',?),(3,'ld','Lãnh đạo','lanhdao',?)")
    .run(bamMatKhau('mat-khau-thu-1'), bamMatKhau('mat-khau-thu-2'), bamMatKhau('mat-khau-thu-3'));
  if (napTep && coTep) ghi(db, docTep(readFileSync(TEP), 'nguon.xlsx'), KT);
  return db;
}

test('lịch tuần ISO 2026: T26 = 22/06–26/06, có tuần 53 vắt năm', () => {
  const t = cacTuan(2026);
  assert.equal(t.length, 53);
  assert.deepEqual(t.find(x => x.id === '2026-T26'), { id: '2026-T26', start: '2026-06-22', end: '2026-06-26' });
  assert.equal(t.at(-1).end, '2027-01-01');
});

test('nạp tệp chính thức T40: số khớp bảng Excel và bản v0.3', { skip: !coTep && 'thiếu tệp nguồn' }, () => {
  const db = csdl();
  const ns = dieuHanh(db, { nguon: 'NSTP' });
  assert.equal(ns.ky.id, '2026-T40');
  assert.equal(ns.chi_so.luy_ke, 102638667625);
  assert.equal(ns.chi_so.khv, 150835848000);
  assert.equal(ns.chi_so.kb_phuong_thang, 125617041895);
  assert.equal(ns.chi_so.chenh_phuong, -22978374270);
  assert.equal(ns.chi_so.tuan_con_lai_thang, 4);
  const all = dieuHanh(db, {});
  assert.equal(all.chi_so.luy_ke, 160460225625);
  assert.equal(all.duong_luy_ke[0].thuc_hien, all.duong_luy_ke[0].kb_phuong, 'cuối T6 là mốc nền');
  assert.ok(all.chi_so.du_bao_cuoi_nam <= all.chi_so.khv, 'dự báo không vượt KHV');
});

test('nạp lại đúng tệp: toàn bộ trùng, không thêm dòng nào', { skip: !coTep && 'thiếu tệp nguồn' }, () => {
  const db = csdl();
  const truoc = db.prepare('SELECT COUNT(*) n FROM disbursements').get().n;
  const bc = xemTruoc(db, docTep(readFileSync(TEP), 'nguon.xlsx'), KT);
  assert.ok(bc.da_nap);
  assert.equal(bc.giai_ngan.moi.length, 0);
  assert.equal(bc.giai_ngan.trung, 300);
  ghi(db, docTep(readFileSync(TEP), 'nguon.xlsx'), KT);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM disbursements').get().n, truoc);
});

test('CSV khác số đã có: không ghi đè nếu chưa chấp nhận; chấp nhận cần lý do và để lại nhật ký', { skip: !coTep && 'thiếu tệp nguồn' }, () => {
  const db = csdl();
  const csv = Buffer.from('ma_dong_von;ky;so_tien_trieu\nDA01;T40;999\nDA02;2026-T40;\n');
  const goi = docTep(csv, 'bql.csv');
  assert.ok(goi.canh_bao.some(c => c.includes('ô số tiền trống')), 'ô trống không hiểu là 0');
  const bc = xemTruoc(db, goi, KT);
  assert.equal(bc.giai_ngan.lech.length, 1);
  const cu = db.prepare("SELECT amount FROM disbursements WHERE line_id='DA01' AND period_id='2026-T40'").get().amount;
  ghi(db, docTep(csv, 'bql.csv'), KT);
  assert.equal(db.prepare("SELECT amount FROM disbursements WHERE line_id='DA01' AND period_id='2026-T40'").get().amount, cu);
  assert.throws(() => ghi(db, docTep(csv, 'bql.csv'), KT, { chap_nhan_lech: true, ly_do: '' }), /lý do/);
  ghi(db, docTep(csv, 'bql.csv'), KT, { chap_nhan_lech: true, ly_do: 'Theo chứng từ Kho bạc ngày 05/10' });
  assert.equal(db.prepare("SELECT amount FROM disbursements WHERE line_id='DA01' AND period_id='2026-T40'").get().amount, 999e6);
  assert.ok(db.prepare("SELECT 1 FROM audit_log WHERE action='thay_so' AND reason LIKE 'Theo chứng từ%'").get());
  assert.throws(() => db.exec('DELETE FROM audit_log'), /không được xóa/);
});

test('Ban QLDA nhập tay: chỉ dự án được phân công, số chờ Kinh tế xác nhận; kỳ khóa thì từ chối', { skip: !coTep && 'thiếu tệp nguồn' }, () => {
  const db = csdl();
  db.prepare("INSERT INTO assignments(user_id,project_id) VALUES(2,'DA01')").run();
  const bq = { id: 2, username: 'bq', role: 'bql' };
  const goi = tay.doc({ period_id: '2026-T41', dong: [{ line_id: 'DA01', trieu: '1.250,5' }, { line_id: 'DA02', trieu: '10' }] }, 'bq');
  const bc = xemTruoc(db, goi, bq);
  assert.equal(bc.giai_ngan.moi.length, 1);
  assert.equal(bc.giai_ngan.ngoai_quyen.length, 1);
  ghi(db, goi, bq);
  const r = db.prepare("SELECT id,amount,state FROM disbursements WHERE line_id='DA01' AND period_id='2026-T41'").get();
  assert.equal(r.amount, 1250500000); assert.equal(r.state, 'cho_xac_nhan');
  xacNhan(db, KT, [r.id]);
  assert.equal(db.prepare('SELECT state FROM disbursements WHERE id=?').get(r.id).state, 'da_xac_nhan');
  db.prepare("UPDATE periods SET locked=1 WHERE id='2026-T42'").run();
  const k = xemTruoc(db, tay.doc({ period_id: '2026-T42', dong: [{ line_id: 'DA01', trieu: '5' }] }, 'kt'), KT);
  assert.equal(k.giai_ngan.khoa.length, 1);
});

test('kịch bản: lũy kế không giảm theo tháng, bắt buộc lý do, lịch sử không sửa được', { skip: !coTep && 'thiếu tệp nguồn' }, () => {
  const db = csdl();
  const p = { set_id: 'PHUONG-2026', scope_id: 'DA01', month: 10 };
  assert.throws(() => suaDiem(db, KT, { ...p, trieu: '1', ly_do: 'Điều chỉnh thử' }), /không được thấp hơn/);
  assert.throws(() => suaDiem(db, KT, { ...p, trieu: '19000', ly_do: '' }), /lý do/);
  suaDiem(db, KT, { ...p, trieu: '19000', ly_do: 'Văn bản điều chỉnh số 12' });
  assert.throws(() => db.exec('UPDATE scenario_changes SET reason=1'), /không được sửa/);
});

test('đề xuất: DA08 chậm nhiều và có nguy cơ dư vốn; mỗi đề xuất nêu quy tắc và con số', { skip: !coTep && 'thiếu tệp nguồn' }, () => {
  const d = dieuHanh(csdl(), { nguon: 'NSTP' });
  const da08 = d.de_xuat.filter(x => x.project_id === 'DA08').map(x => x.quy_tac);
  assert.ok(da08.includes('CHAM_KH_THANG') && da08.includes('NGUY_CO_DU_VON'));
  assert.equal(d.du_an[0].project_id, 'DA08', 'dự án nặng nhất đứng đầu');
  for (const x of d.de_xuat) assert.ok(x.ten_quy_tac && x.van_de && x.giai_phap && x.dau_moi && x.han);
  assert.ok(!d.de_xuat.some(x => x.project_id === 'DA09'), 'dự án đã giải ngân hết không bị cảnh báo vì chênh làm tròn');
});

test('lớp đề xuất chạy tại chỗ, không gọi ra ngoài', () => {
  for (const f of ['../src/nghiep-vu/de-xuat.mjs', '../src/nghiep-vu/tong-hop.mjs']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    for (const cam of ['fetch(', 'https://', 'http://', 'node:http', 'axios', 'openai']) assert.ok(!src.includes(cam), `${f} chứa ${cam}`);
  }
});

test('HTTP: đăng nhập, CSRF, phân quyền, tiêu đề bảo mật', async () => {
  const db = csdl({ napTep: false });
  const sv = createServer(taoUngDung(db)); await new Promise(r => sv.listen(0, '127.0.0.1', r));
  const B = `http://127.0.0.1:${sv.address().port}`;
  try {
    const sai = await fetch(B + '/api/dang-nhap', { method: 'POST', body: JSON.stringify({ username: 'ld', password: 'sai' }) });
    assert.equal(sai.status, 401);
    const r = await fetch(B + '/api/dang-nhap', { method: 'POST', body: JSON.stringify({ username: 'ld', password: 'mat-khau-thu-3' }) });
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
    const ck = r.headers.get('set-cookie').split(';')[0], { csrf } = await r.json();
    assert.match(r.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
    const khongCsrf = await fetch(B + '/api/viec', { method: 'POST', headers: { Cookie: ck }, body: '{}' });
    assert.equal(khongCsrf.status, 403);
    const nhap = await fetch(B + '/api/nhap/xem-truoc', { method: 'POST', headers: { Cookie: ck, 'X-CSRF': csrf }, body: JSON.stringify({ kenh: 'tep', ten_tep: 'a.csv', du_lieu: '' }) });
    assert.equal(nhap.status, 403, 'lãnh đạo không nạp tệp');
    const dh = await fetch(B + '/api/dieu-hanh', { headers: { Cookie: ck } });
    assert.equal(dh.status, 200);
    const tinh = await fetch(B + '/../src/core/schema.sql');
    assert.equal(tinh.status, 404);
  } finally { sv.close(); }
});

test('Google Sheets: tự đồng bộ, số mới tự ghi, số bị sửa chờ duyệt, link chưa chia sẻ thì báo rõ', { skip: !coTep && 'thiếu tệp nguồn' }, async () => {
  const gs = await import('../src/nguon/google-sheets.mjs');
  const dongBo = await import('../src/nghiep-vu/dong-bo.mjs');
  assert.equal(gs.diaChiTai('https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/edit#gid=0'),
    'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/export?format=xlsx');
  assert.equal(gs.diaChiTai('https://example.com/abc'), null);
  const tep = readFileSync(TEP);
  const giaGoogle = (body, type) => async () => new Response(body, { status: 200, headers: { 'content-type': type } });
  const xlsx = { layFetch: giaGoogle(tep, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') };
  const db = csdl({ napTep: false });
  const { id } = dongBo.luuNguon(db, KT, { url: 'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/edit' });
  let r = await dongBo.kiemTra(db, id, xlsx);
  assert.equal(r.trang_thai, 'da_cap_nhat'); assert.equal(r.giai_ngan_moi, 300);
  assert.equal(dieuHanh(db, { nguon: 'NSTP' }).chi_so.luy_ke, 102638667625);
  r = await dongBo.kiemTra(db, id, xlsx);
  assert.equal(r.trang_thai, 'khong_doi');
  // Có người sửa số trong phần mềm khác với bảng → lần đọc sau bảng "khác" số đang dùng: giữ số cũ, chờ duyệt
  db.prepare("UPDATE disbursements SET amount=amount+5000000000 WHERE line_id='DA01' AND period_id='2026-T40'").run();
  db.prepare('UPDATE sync_sources SET last_hash=NULL WHERE id=?').run(id);
  r = await dongBo.kiemTra(db, id, xlsx);
  assert.equal(r.trang_thai, 'cho_duyet');
  const n = dongBo.danhSach(db)[0];
  assert.equal(n.cho_duyet.so, 1); assert.equal(n.cho_duyet.giai_ngan[0].line_id, 'DA01');
  assert.throws(() => dongBo.duyet(db, KT, { id, ly_do: '' }), /lý do/);
  dongBo.duyet(db, KT, { id, ly_do: 'Theo bảng Google Sheets đã đối chiếu' });
  assert.equal(dieuHanh(db, { nguon: 'NSTP' }).chi_so.luy_ke, 102638667625);
  assert.equal(dongBo.danhSach(db)[0].cho_duyet, null);
  // Bảng chưa bật chia sẻ: Google trả trang đăng nhập HTML
  r = await dongBo.kiemTra(db, id, { layFetch: giaGoogle('<html>Sign in</html>', 'text/html; charset=utf-8') });
  assert.equal(r.trang_thai, 'loi'); assert.match(r.thong_bao, /Bất kỳ ai có đường liên kết/);
});

test('Google Sheets: gắn sẵn link từ tệp cấu hình, chạy lại không nhân đôi', async () => {
  const { writeFileSync, mkdtempSync } = await import('node:fs');
  const { join } = await import('node:path'); const { tmpdir } = await import('node:os');
  const dongBo = await import('../src/nghiep-vu/dong-bo.mjs');
  const db = csdl({ napTep: false });
  const tep = join(mkdtempSync(join(tmpdir(), 'gs-')), 'google-sheets.json');
  writeFileSync(tep, JSON.stringify({ url: 'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/edit' }));
  const id = dongBo.napCauHinh(db, tep);
  assert.ok(id); assert.equal(dongBo.napCauHinh(db, tep), id);
  const ds = dongBo.danhSach(db);
  assert.equal(ds.length, 1); assert.equal(ds[0].active, 1); assert.equal(ds[0].gio_cap_nhat, '18:00');
  assert.equal(dongBo.napCauHinh(db, join(tmpdir(), 'khong-co.json')), null);
});

test('Google Sheets: tự cập nhật đúng một lần mỗi ngày lúc 18:00, máy tắt thì lấy bù', async () => {
  const { denHan, mocGanNhat } = await import('../src/nghiep-vu/dong-bo.mjs');
  const luc = (d, h, m = 0) => new Date(2026, 10, d, h, m);       // giờ máy chủ
  assert.equal(denHan(null, luc(5, 9)), true, 'chưa lấy lần nào thì lấy ngay');
  assert.equal(denHan(luc(5, 9).toISOString(), luc(5, 17, 59)), false, 'trước 18:00 không lấy lại');
  assert.equal(denHan(luc(5, 9).toISOString(), luc(5, 18, 0)), true, 'đúng 18:00 thì lấy');
  assert.equal(denHan(luc(5, 18, 1).toISOString(), luc(5, 23)), false, 'đã lấy sau 18:00 thì thôi đến hôm sau');
  assert.equal(denHan(luc(5, 18, 1).toISOString(), luc(6, 17)), false);
  assert.equal(denHan(luc(4, 10).toISOString(), luc(5, 8)), true, 'hôm qua tắt máy lúc 18:00 → sáng nay mở máy lấy bù');
  assert.equal(mocGanNhat(luc(5, 8)).getDate(), 4);
});

test('Đăng nhập: báo rõ sai tên / sai mật khẩu / bộ gõ / tài khoản khóa, gợi ý tên gần đúng, cho biết địa chỉ máy chủ', async () => {
  const db = csdl({ napTep: false });
  db.prepare("INSERT INTO users(username,name,role,password_hash,active) VALUES('bqlda','Ban QLDA','bql',?,1),('kiemtra','Kiểm tra','lanhdao',?,0)")
    .run(bamMatKhau('mat-khau-thu-4'), bamMatKhau('mat-khau-thu-5'));
  const sv = createServer(taoUngDung(db)); await new Promise(r => sv.listen(0, '127.0.0.1', r));
  const B = `http://127.0.0.1:${sv.address().port}`;
  const dn = async (username, password) => { const r = await fetch(B + '/api/dang-nhap', { method: 'POST', body: JSON.stringify({ username, password }) }); return { st: r.status, j: await r.json() }; };
  try {
    const toi = await (await fetch(B + '/api/toi')).json();
    assert.equal(toi.dang_nhap, false);
    assert.equal(toi.may_chu.cong, sv.address().port);
    assert.equal(toi.may_chu.giao_thuc, 'http');

    let r = await dn('bqld', 'x');
    assert.equal(r.st, 401); assert.equal(r.j.ly_do, 'sai_ten'); assert.equal(r.j.goi_y, 'bqlda');
    r = await dn('qlda', 'x');
    assert.equal(r.j.goi_y, 'bqlda', 'gõ thiếu chữ đầu vẫn gợi ý được');
    r = await dn('xyzuvw', 'x');
    assert.equal(r.j.ly_do, 'sai_ten'); assert.equal(r.j.goi_y, null, 'tên quá xa thì không gợi ý');
    r = await dn('kinhtế', 'x');
    assert.equal(r.j.ly_do, 'bo_go'); assert.match(r.j.loi, /bộ gõ tiếng Việt/);
    assert.ok(!db.prepare("SELECT 1 FROM users WHERE username='kiemtra' AND active=1").get());
    r = await dn('kiemtra', 'mat-khau-thu-5');
    assert.equal(r.st, 403); assert.equal(r.j.ly_do, 'khoa');
    r = await dn('bqlda', 'mật-khẩu');
    assert.equal(r.st, 401); assert.equal(r.j.ly_do, 'sai_mat_khau'); assert.match(r.j.loi, /bộ gõ tiếng Việt/); assert.match(r.j.loi, /Còn 4 lần/);
    r = await dn('  BQLDA​ ', 'mat-khau-thu-4');
    assert.equal(r.st, 200, 'tên có khoảng trắng, chữ hoa, ký tự vô hình khi dán vẫn đăng nhập được');
    assert.equal(r.j.user.username, 'bqlda');
    r = await dn('', '');
    assert.equal(r.st, 400);
  } finally { sv.close(); }
});

test('Trang công khai: xuất đủ kỳ × nguồn, số khớp app nội bộ, không lộ link bảng, không có chức năng ghi', async () => {
  const { xuatCongKhai, TEP_GIAO_DIEN } = await import('../src/cli/xuat-cong-khai.mjs');
  const { taoGoi } = await import('../src/nguon/goi.mjs');
  const { mkdtempSync, readdirSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const tr = v => Math.round(v * 1e6);
  // Dữ liệu giả: 2 dự án, 2 nguồn, mốc nền + 4 tuần, kế hoạch phường T7–T12.
  const goi = taoGoi({ kenh: 'gsheets', ten_tep: 'Google Sheets (https://docs.google.com/spreadsheets/d/BI-MAT-KHONG-DUOC-LO)', sha256: 'x'.repeat(64), nam: 2026 });
  goi.dong_von = [
    { line_id: 'DA01', project_id: 'DA01', source_id: 'NSTP', label: 'DA01 · Trường học', plan: tr(1000), source_ref: 'DU_AN!H5' },
    { line_id: 'DA02', project_id: 'DA02', source_id: 'PHANCAP', label: 'DA02 · Đường phố', plan: tr(500), source_ref: 'DU_AN!H6' }];
  goi.moc_nen = goi.dong_von.map(l => ({ line_id: l.line_id, amount: tr(100), as_of: '2026-06-19', source_ref: 'NHAP_LIEU!D8' }));
  for (const [ky, a, b] of [['2026-T26', 10, 5], ['2026-T27', 20, 0], ['2026-T28', 30, 10], ['2026-T29', 0, 0]])
    goi.giai_ngan.push({ line_id: 'DA01', period_id: ky, amount: tr(a), source_ref: 'x' }, { line_id: 'DA02', period_id: ky, amount: tr(b), source_ref: 'x' });
  for (let m = 7; m <= 12; m++) for (const [id, khv] of [['DA01', 1000], ['DA02', 500]])
    goi.kich_ban.push({ set_id: 'PHUONG-2026', scope_kind: 'line', scope_id: id, month: m, amount: tr(100 + (khv - 100) * (m - 6) / 6), source_ref: 'x' });

  const ra = join(mkdtempSync(join(tmpdir(), 'cong-khai-')), 'trang');
  try {
    const m = xuatCongKhai(goi, ra, { luc: new Date('2026-07-20T11:00:00Z') });
    assert.deepEqual(m.tuan, ['2026-T29', '2026-T28', '2026-T27', '2026-T26']);
    assert.deepEqual(m.nguon, ['tat-ca', 'NSTP', 'PHANCAP', 'TANGTHU']);
    assert.equal(readdirSync(join(ra, 'du-lieu')).length, 1 + 4 * 4);
    for (const [, ten] of TEP_GIAO_DIEN) assert.ok(existsSync(join(ra, ten)), `thiếu ${ten}`);

    const d = JSON.parse(readFileSync(join(ra, 'du-lieu', '2026-T29_tat-ca.json'), 'utf8'));
    const db = csdl({ napTep: false }); ghi(db, goi, KT);
    assert.deepEqual(d, JSON.parse(JSON.stringify(dieuHanh(db, { tuan: '2026-T29' }))), 'số trên trang công khai = số của app nội bộ');
    assert.equal(d.chi_so.luy_ke, tr(275));

    for (const f of readdirSync(join(ra, 'du-lieu')))
      assert.ok(!readFileSync(join(ra, 'du-lieu', f), 'utf8').includes('docs.google.com'), `${f} lộ link bảng`);
    for (const f of ['index.html', 'cong-khai.js', 'man-dieu-hanh.js']) {
      const src = readFileSync(join(ra, f), 'utf8');
      assert.ok(!src.includes('/api/') && !src.includes('docs.google.com'), `${f} không được gọi máy chủ nội bộ hay Google`);
    }
    // Xuất lại vào đúng thư mục cũ được; thư mục lạ có tệp khác thì từ chối, không xóa.
    xuatCongKhai(goi, ra);
    assert.throws(() => xuatCongKhai(goi, join(ra, 'du-lieu', '..', '..')), /không phải trang công khai/);
  } finally { rmSync(join(ra, '..'), { recursive: true, force: true }); }
});
