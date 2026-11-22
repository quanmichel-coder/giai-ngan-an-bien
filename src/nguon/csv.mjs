// Bộ chuyển nguồn: tệp CSV theo MẪU CHUẨN → gói dữ liệu chuẩn.
// Dùng cho mọi đơn vị không dùng mẫu Excel của phường: chỉ cần xuất được 3 cột bắt buộc.
//
//   ma_dong_von ; ky ; so_tien_dong        (bắt buộc; hoặc so_tien_trieu thay cho so_tien_dong)
//   chung_tu ; ghi_chu                     (tùy chọn)
//
// - ma_dong_von: DA01, DA15.1 … (dự án một nguồn thì mã dòng vốn = mã dự án)
// - ky: 2026-T41, T41 hoặc 41
// - Dấu phân cách: phẩy hoặc chấm phẩy. Mã hóa UTF-8.
// - so_tien_trieu: dấu phẩy là thập phân, dấu chấm là hàng nghìn (1.234,5 = 1.234,5 triệu).
import { createHash } from 'node:crypto';
import { taoGoi } from './goi.mjs';
import { NAM } from '../core/hang-so.mjs';

export const moTa = { id: 'csv', ten: 'Tệp CSV theo mẫu chuẩn (ma_dong_von; ky; so_tien_dong)', duoi: ['.csv'] };
export const MAU_CSV = 'ma_dong_von;ky;so_tien_dong;chung_tu;ghi_chu\nDA01;2026-T41;1250000000;UNC 123/KBNN;\nDA15.1;2026-T41;0;;Chưa phát sinh\n';

export function nhanDang(tenTep) { return /\.csv$/i.test(tenTep || ''); }

function tachDong(text) {
  const dong = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  if (!dong.length) return { cot: [], hang: [] };
  const sep = (dong[0].match(/;/g) || []).length >= (dong[0].match(/,/g) || []).length ? ';' : ',';
  const tach = l => {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (q) { if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true; else if (c === sep) { out.push(cur); cur = ''; } else cur += c;
    }
    out.push(cur); return out.map(s => s.trim());
  };
  return { cot: tach(dong[0]).map(s => s.toLowerCase()), hang: dong.slice(1).map(tach) };
}

const soDong = s => { const t = String(s).replace(/[^\d-]/g, ''); return t === '' ? null : Number(t); };
const soTrieu = s => {
  let t = String(s).trim().replace(/\s/g, '');
  if (t === '') return null;
  t = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : (/^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '') : t);
  const v = Number(t); return Number.isFinite(v) ? Math.round(v * 1e6) : NaN;
};

export function doc(buf, tenTep = 'tệp.csv', nam = NAM) {
  const goi = taoGoi({ kenh: 'csv', ten_tep: tenTep, sha256: createHash('sha256').update(buf).digest('hex'), nam, mau: 'csv-mau-chuan' });
  const { cot, hang } = tachDong(buf.toString('utf8'));
  const i = k => cot.indexOf(k);
  const cDong = i('ma_dong_von'), cKy = i('ky'), cD = i('so_tien_dong'), cT = i('so_tien_trieu'), cCt = i('chung_tu'), cGc = i('ghi_chu');
  if (cDong < 0 || cKy < 0 || (cD < 0 && cT < 0)) {
    goi.canh_bao.push('Tệp CSV thiếu cột bắt buộc. Dòng đầu phải có: ma_dong_von; ky; so_tien_dong (hoặc so_tien_trieu).');
    goi.loi_doc = true; return goi;
  }
  hang.forEach((h, n) => {
    const ref = `${tenTep}!dòng ${n + 2}`;
    const ma = (h[cDong] || '').toUpperCase();
    const kyRaw = (h[cKy] || '').toUpperCase().replace(/\s/g, '');
    const m = /^(?:(\d{4})-)?T?(\d{1,2})$/.exec(kyRaw);
    const raw = cD >= 0 ? h[cD] : h[cT];
    if (!ma && !kyRaw && !raw) return;
    if (raw == null || String(raw).trim() === '') { goi.canh_bao.push(`${ref}: ô số tiền trống — bỏ qua, không hiểu là 0.`); return; }
    const amount = cD >= 0 ? soDong(raw) : soTrieu(raw);
    goi.giai_ngan.push({
      line_id: ma, period_id: m ? `${m[1] || nam}-T${m[2].padStart(2, '0')}` : kyRaw, amount, source_ref: ref,
      note: [cCt >= 0 ? h[cCt] : '', cGc >= 0 ? h[cGc] : ''].filter(Boolean).join(' · ')
    });
  });
  return goi;
}
