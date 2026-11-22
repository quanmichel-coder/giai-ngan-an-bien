// Bộ đọc tệp bảng tính .xlsx chạy hoàn toàn trong máy chủ của cơ quan.
//
// Vì sao tự viết: toàn bộ ứng dụng không dùng thư viện bên ngoài, nên tệp Excel do cán bộ
// tải lên cũng phải được đọc bằng đúng những gì Node.js có sẵn. Tệp .xlsx thực chất là một
// gói nén ZIP chứa các tệp XML; Node có sẵn bộ giải nén (zlib) nên chỉ cần đọc cấu trúc ZIP
// rồi bóc nội dung XML. Nhờ vậy không có dữ liệu nào rời khỏi máy chủ và không phụ thuộc
// bất kỳ gói phần mềm nào phải tải về từ Internet.
//
// Phạm vi hỗ trợ: tệp .xlsx thông thường do Microsoft Excel, LibreOffice hoặc Google Sheets
// xuất ra. Không hỗ trợ tệp .xls cũ (định dạng nhị phân), tệp có mật khẩu và tệp ZIP64.

import { inflateRawSync } from 'node:zlib';

const SIG_EOCD = 0x06054b50, SIG_CEN = 0x02014b50, SIG_LOC = 0x04034b50;

export class LoiTepExcel extends Error {
  constructor(msg) { super(msg); this.name = 'LoiTepExcel'; this.status = 400 }
}

// ---------------------------------------------------------------- Giải nén ZIP

function docGoiNen(buf) {
  if (buf.length < 22) throw new LoiTepExcel('Tệp quá nhỏ, không phải tệp Excel hợp lệ.');
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--)
    if (buf.readUInt32LE(i) === SIG_EOCD) { eocd = i; break }
  if (eocd < 0) throw new LoiTepExcel('Không đọc được cấu trúc tệp. Hãy lưu lại bằng định dạng .xlsx rồi tải lên.');

  const soMuc = buf.readUInt16LE(eocd + 10);
  let viTri = buf.readUInt32LE(eocd + 16);
  if (viTri === 0xffffffff || soMuc === 0xffff)
    throw new LoiTepExcel('Tệp dùng định dạng ZIP64 chưa được hỗ trợ. Hãy lưu lại tệp bằng Excel.');

  const muc = new Map();
  for (let i = 0; i < soMuc; i++) {
    if (buf.readUInt32LE(viTri) !== SIG_CEN) throw new LoiTepExcel('Cấu trúc tệp Excel bị hỏng.');
    const nen = buf.readUInt16LE(viTri + 10);
    const coSize = buf.readUInt32LE(viTri + 20);
    const nSize = buf.readUInt32LE(viTri + 24);
    const nTen = buf.readUInt16LE(viTri + 28), nExtra = buf.readUInt16LE(viTri + 30), nCmt = buf.readUInt16LE(viTri + 32);
    const offset = buf.readUInt32LE(viTri + 42);
    const ten = buf.toString('utf8', viTri + 46, viTri + 46 + nTen);
    muc.set(ten, { nen, coSize, nSize, offset });
    viTri += 46 + nTen + nExtra + nCmt;
  }

  return {
    co: ten => muc.has(ten),
    ten: () => [...muc.keys()],
    doc(ten) {
      const e = muc.get(ten);
      if (!e) return null;
      if (buf.readUInt32LE(e.offset) !== SIG_LOC) throw new LoiTepExcel('Cấu trúc tệp Excel bị hỏng.');
      const nTen = buf.readUInt16LE(e.offset + 26), nExtra = buf.readUInt16LE(e.offset + 28);
      const dau = e.offset + 30 + nTen + nExtra;
      const raw = buf.subarray(dau, dau + e.coSize);
      if (e.nen === 0) return raw;
      if (e.nen === 8) return inflateRawSync(raw);
      throw new LoiTepExcel('Tệp dùng cách nén chưa được hỗ trợ. Hãy lưu lại tệp bằng Excel.');
    }
  };
}

// ---------------------------------------------------------------- Tiện ích XML

const THUC_THE = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
export function goMa(s) {
  if (s.indexOf('&') < 0) return s;
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (cả, m) => {
    if (m[0] === '#') { const n = m[1] === 'x' ? parseInt(m.slice(2), 16) : parseInt(m.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : cả }
    return THUC_THE[m] ?? cả;
  });
}

const thuocTinh = (the, ten) => the.match(new RegExp(`\\s${ten}="([^"]*)"`))?.[1] ?? null;

// Tách địa chỉ ô "BC12" thành {cot:'BC', dong:12, soCot:55}
export function tachO(ref) {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) return null;
  let n = 0; for (const c of m[1]) n = n * 26 + (c.charCodeAt(0) - 64);
  return { cot: m[1], dong: Number(m[2]), soCot: n };
}
export function tenCot(n) { let s = ''; while (n > 0) { const d = (n - 1) % 26; s = String.fromCharCode(65 + d) + s; n = (n - 1 - d) / 26 } return s }

// ---------------------------------------------------------------- Đọc workbook

function docChuoiDungChung(zip) {
  const xml = zip.doc('xl/sharedStrings.xml');
  if (!xml) return [];
  const s = xml.toString('utf8');
  const out = [];
  for (const m of s.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>|<si(?:\s[^>]*)?\/>/g)) {
    const than = m[1] || '';
    let t = '';
    for (const x of than.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)) t += goMa(x[1] || '');
    out.push(t);
  }
  return out;
}

function docDanhSachSheet(zip) {
  const wb = zip.doc('xl/workbook.xml');
  if (!wb) throw new LoiTepExcel('Tệp không có bảng tính nào. Đây có thể không phải tệp Excel.');
  const rels = (zip.doc('xl/_rels/workbook.xml.rels') || Buffer.from('')).toString('utf8');
  const duong = new Map();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = thuocTinh(m[0], 'Id'), target = thuocTinh(m[0], 'Target');
    if (!id || !target) continue;
    duong.set(id, target.startsWith('/') ? target.slice(1) : target.startsWith('xl/') ? target : 'xl/' + target.replace(/^\.\//, ''));
  }
  const ds = [];
  for (const m of wb.toString('utf8').matchAll(/<sheet\b[^>]*\/?>/g)) {
    const ten = goMa(thuocTinh(m[0], 'name') || '');
    const rid = thuocTinh(m[0], 'r:id') || thuocTinh(m[0], 'id');
    const path = duong.get(rid);
    if (ten && path && zip.co(path)) ds.push({ ten, path });
  }
  if (!ds.length) throw new LoiTepExcel('Không tìm thấy bảng tính nào trong tệp.');
  return ds;
}

function docSheet(zip, path, chuoi) {
  const xml = zip.doc(path).toString('utf8');
  const o = new Map();
  let soDong = 0, soCot = 0;
  for (const mc of xml.matchAll(/<c\b([^>]*?)(\/>|>([\s\S]*?)<\/c>)/g)) {
    const the = mc[1], than = mc[3] || '';
    const ref = thuocTinh('<c' + the + '>', 'r');
    if (!ref) continue;
    const dc = tachO(ref); if (!dc) continue;
    const kieu = thuocTinh('<c' + the + '>', 't') || 'n';
    let gt = null;
    if (kieu === 'inlineStr') {
      let t = ''; for (const x of than.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) t += goMa(x[1]);
      gt = t;
    } else {
      const v = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(than)?.[1];
      if (v === undefined) gt = null;
      else if (kieu === 's') gt = chuoi[Number(v)] ?? '';
      else if (kieu === 'str') gt = goMa(v);
      else if (kieu === 'b') gt = v === '1';
      else if (kieu === 'e') gt = null;                       // ô lỗi trong Excel
      else { const n = Number(v); gt = Number.isFinite(n) ? n : goMa(v) }
    }
    if (gt === null || gt === '') continue;
    o.set(ref, gt);
    if (dc.dong > soDong) soDong = dc.dong;
    if (dc.soCot > soCot) soCot = dc.soCot;
  }
  return { o, soDong, soCot };
}

/**
 * Đọc toàn bộ tệp Excel.
 * @param {Buffer} buf nội dung tệp
 * @returns {{ten:string[], sheet:Object<string,Sheet>}} với Sheet có các hàm tra cứu ô.
 */
export function docExcel(buf) {
  const zip = docGoiNen(buf);
  const chuoi = docChuoiDungChung(zip);
  const ds = docDanhSachSheet(zip);
  const sheet = {}, ten = [];
  for (const s of ds) {
    const { o, soDong, soCot } = docSheet(zip, s.path, chuoi);
    sheet[s.ten] = taoSheet(s.ten, o, soDong, soCot);
    ten.push(s.ten);
  }
  return { ten, sheet, co: t => Object.hasOwn(sheet, t) };
}

function taoSheet(ten, o, soDong, soCot) {
  const giaTri = ref => o.has(ref) ? o.get(ref) : null;
  return {
    ten, soDong, soCot,
    /** Giá trị thô của ô, null nếu ô trống. */
    o: giaTri,
    /** Giá trị ô theo chỉ số dòng/cột bắt đầu từ 1. */
    oTai: (dong, cot) => giaTri(tenCot(cot) + dong),
    /** Chuỗi đã cắt khoảng trắng, '' nếu ô trống. */
    chuoi: ref => { const v = giaTri(ref); return v === null ? '' : String(v).trim() },
    chuoiTai: (dong, cot) => { const v = giaTri(tenCot(cot) + dong); return v === null ? '' : String(v).trim() },
    /**
     * Số của ô. Trả về null nếu ô TRỐNG (khác hẳn số 0) để bên gọi phân biệt
     * "kỳ chưa có số liệu" với "kỳ phát sinh bằng 0".
     */
    so: ref => chuyenSo(giaTri(ref)),
    soTai: (dong, cot) => chuyenSo(giaTri(tenCot(cot) + dong)),
    /** Toàn bộ địa chỉ ô có dữ liệu. */
    danhSachO: () => [...o.keys()]
  };
}

export function chuyenSo(v) {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  // Chấp nhận cách viết số của người dùng: "1.234,5" hoặc "1,234.5" hoặc có khoảng trắng.
  let s = String(v).trim().replace(/\s| /g, '');
  if (!s || /^[-–—]$/.test(s)) return null;
  if (/^\(.*\)$/.test(s)) s = '-' + s.slice(1, -1);
  const phay = s.lastIndexOf(','), cham = s.lastIndexOf('.');
  if (phay >= 0 && cham >= 0) s = phay > cham ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (phay >= 0) s = /,\d{3}(\D|$)/.test(s) && !/,\d{1,2}$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
