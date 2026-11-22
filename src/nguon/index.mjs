// Danh bạ bộ chuyển nguồn. Thêm nguồn mới = thêm một tệp có { moTa, nhanDang, doc } và đăng ký ở đây.
import * as excel from './excel.mjs';
import * as csv from './csv.mjs';
import * as tay from './tay.mjs';
import { LoiNghiepVu } from '../core/quyen.mjs';

export const BO_DOC_TEP = [excel, csv];
export { tay };

export function docTep(buf, tenTep, nam) {
  const bo = BO_DOC_TEP.find(b => b.nhanDang(tenTep));
  if (!bo) throw new LoiNghiepVu(`Chưa hỗ trợ loại tệp này. Nhận: ${BO_DOC_TEP.flatMap(b => b.moTa.duoi).join(', ')}.`);
  try { return bo.doc(buf, tenTep, nam); }
  catch (e) { throw new LoiNghiepVu(e.message || 'Không đọc được tệp.'); }
}
