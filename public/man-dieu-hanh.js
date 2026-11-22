// Màn hình ĐIỀU HÀNH — dùng chung cho app nội bộ (public/app.js) và trang công khai (cong-khai/).
// Chỉ vẽ từ dữ liệu `d` (kết quả dieuHanh() ở src/nghiep-vu/tong-hop.mjs), không gọi máy chủ.
import { h, trieu, trieuDau, phanTram, ngayVN, chipMuc, chip } from './dinh-dang.js';
import { bieuDoLuyKe, chuGiaiLuyKe, cotNho, thanhTienDo } from './bieu-do.js';

/**
 * Vẽ bảng điều hành vào `noiDung`.
 * tuyChon:
 *   chonLoc(loai, id)  gọi khi người xem đổi kỳ ('tuan') hoặc nguồn vốn ('nguon')
 *   phanTren           phần tử đặt trên cùng (thanh đồng bộ ở app nội bộ; dòng "cập nhật lúc" ở trang công khai)
 *   nutGiaoViec(nhom)  trả về nút/nhãn giao việc cho một nhóm đề xuất, hoặc null (trang công khai)
 *   noiChay            nơi chạy bộ quy tắc, ghi ở chú thích phần đề xuất
 */
export function veDieuHanhVao(noiDung, d, { chonLoc, phanTren = null, nutGiaoViec = () => null, noiChay = 'máy chủ của phường' } = {}) {
  const cs = d.chi_so, k = d.ky;

  // Bộ lọc
  const chonTuan = h('select', { onchange: e => chonLoc?.('tuan', e.target.value) },
    d.danh_muc_loc.tuan.map(t => h('option', { value: t.id, selected: t.id === d.bo_loc.tuan }, t.nhan)));
  const loc = h('div', { class: 'loc' },
    h('label', {}, 'Kỳ báo cáo', chonTuan),
    h('div', { role: 'group', 'aria-label': 'Nguồn vốn' }, h('div', { class: 'ghi-chu' }, 'Nguồn vốn'),
      h('div', { class: 'phan-doan' }, d.danh_muc_loc.nguon.map(n => h('button', { 'aria-pressed': String(n.id === d.bo_loc.nguon), onclick: () => chonLoc?.('nguon', n.id) }, n.nhan.replace('Ngân sách', 'NS'))))),
    h('div', { class: 'pham-vi' }, `${d.pham_vi.so_du_an} dự án · ${d.pham_vi.so_dong_von} dòng vốn · số liệu đến ${ngayVN(k.den)}`));

  // Hàng chỉ số: một số chính + bốn ô so sánh
  const oSo = (nhan, so, moTa, lop = '', them) => h('div', { class: `o-so ${lop}` }, h('div', { class: 'nhan' }, nhan), so, moTa && h('div', { class: 'mo-ta' }, moTa), them);
  const soCo = (v, donVi = 'triệu') => h('div', { class: `so ${v < 0 ? 'so-am' : v > 0 ? 'so-duong' : ''}` }, trieuDau(v), h('small', {}, donVi));
  const meter = h('div', { class: 'meter', 'aria-hidden': 'true' }, h('span'));
  meter.firstChild.style.width = `${Math.min(100, (cs.ty_le || 0) * 100)}%`;
  const hang = h('div', { class: 'hang-chi-so' },
    oSo('Tỷ lệ giải ngân so với kế hoạch vốn năm', h('div', { class: 'so' }, phanTram(cs.ty_le)), `${trieu(cs.luy_ke)} / ${trieu(cs.khv)} triệu · ${k.nhan.toLowerCase()} phát sinh ${trieu(cs.phat_sinh)} triệu`, 'chinh', meter),
    oSo(`So với kế hoạch phường cuối T${k.thang}`, cs.chenh_phuong == null ? h('div', { class: 'so mo' }, '–') : soCo(cs.chenh_phuong),
      cs.dat_phuong == null ? 'Chưa có kế hoạch tháng' : `Đạt ${phanTram(cs.dat_phuong)} mục tiêu ${trieu(cs.kb_phuong_thang)} triệu`),
    oSo(`So với kịch bản thành phố cuối T${k.thang}`, cs.chenh_tp == null ? h('div', { class: 'so mo' }, '–') : soCo(cs.chenh_tp),
      cs.dat_tp == null ? 'Thành phố không giao cho phạm vi này' : `Đạt ${phanTram(cs.dat_tp)} mục tiêu ${trieu(cs.kb_tp_thang)} triệu`),
    oSo(`Cần mỗi tuần đến hết T${k.thang}`, h('div', { class: 'so' }, trieu(cs.can_moi_tuan_thang), h('small', {}, 'triệu/tuần')),
      `${cs.tuan_con_lai_thang} tuần còn lại · nhịp 4 tuần gần nhất ${trieu(cs.nhip_gan_day)}`, '', cotNho(d.nhip_tuan, cs.can_moi_tuan_thang)),
    oSo('Dự báo 31/12 theo nhịp hiện tại', h('div', { class: 'so' }, cs.du_bao_du_ky ? phanTram(cs.du_bao_ty_le) : '–', h('small', {}, 'KHV')),
      cs.du_bao_du_ky ? `${trieu(cs.du_bao_cuoi_nam)} triệu · khoảng ${trieu(cs.du_bao_thap)}–${trieu(cs.du_bao_cao)}` : 'Chưa đủ 3 kỳ số liệu để dự báo'));

  // Biểu đồ lũy kế + bảng tháng
  const thieuThang = cs.chenh_phuong != null && cs.chenh_phuong < 0;
  const tieuDeA = thieuThang
    ? `Còn thiếu ${trieu(-cs.chenh_phuong)} triệu để đạt kế hoạch phường cuối T${k.thang}; theo nhịp hiện tại cuối năm đạt ${phanTram(cs.du_bao_ty_le)} KHV`
    : `Đang vượt kế hoạch phường cuối T${k.thang}; theo nhịp hiện tại cuối năm đạt ${phanTram(cs.du_bao_ty_le)} KHV`;
  const khungA = h('div', { class: 'khung-bd' });
  const theA = h('section', { class: 'the' }, h('h2', {}, tieuDeA),
    h('p', { class: 'phu' }, `Lũy kế giải ngân, triệu đồng. Cuối tháng 6 là mốc nền. ${d.pham_vi.ghi_chu_tp}`),
    chuGiaiLuyKe(d.duong_luy_ke.some(p => p.kb_tp != null)), khungA);

  const khongDat = d.bang_thang.filter(t => t.trang_thai === 'khong_dat').map(t => `T${t.thang}`);
  const tt = { dat: ['xanh', 'Đạt'], khong_dat: ['do', 'Không đạt'], dang_dien_ra: [null, 'Đang thực hiện'], chua_den: [null, 'Chưa đến'] };
  const thangNay = d.bang_thang.find(t => t.thang === k.thang);
  const theThang = h('section', { class: 'the' },
    h('h2', {}, khongDat.length ? `${khongDat.join(', ')} không đạt kế hoạch phường` : 'Các tháng đã qua đều đạt kế hoạch phường'),
    h('p', { class: 'phu' }, 'Kế hoạch phường và thực hiện, lũy kế cuối tháng, triệu đồng'),
    h('div', { class: 'cuon' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Tháng'), h('th', { class: 'so' }, 'KH phường'), h('th', { class: 'so' }, 'Thực hiện'), h('th', { class: 'so' }, 'Đạt KH'), h('th', {}, ''))),
      h('tbody', {}, d.bang_thang.map(t => h('tr', { class: t.trang_thai === 'dang_dien_ra' ? 'dang-xem' : null },
        h('td', {}, `T${t.thang}`), h('td', { class: 'so' }, trieu(t.kb_phuong)),
        h('td', { class: 'so' }, t.thuc_hien == null ? '' : trieu(t.thuc_hien)), h('td', { class: 'so' }, t.dat_phuong == null ? '' : phanTram(t.dat_phuong)),
        h('td', {}, tt[t.trang_thai][0] ? chip(tt[t.trang_thai][0], tt[t.trang_thai][1]) : h('span', { class: 'ghi-chu' }, tt[t.trang_thai][1]))))))),
    h('p', { class: 'ghi-chu' }, `Kế hoạch trong tháng ${k.thang}: ${trieu(thangNay?.kh_trong_thang)} triệu; đã thực hiện ${trieu(thangNay?.th_trong_thang)} triệu.`));

  // Bảng dự án có thanh tiến độ
  const cham = d.du_an.filter(x => x.muc !== 'xanh'), tongThieu = cham.reduce((s, x) => s + x.thieu, 0);
  let moRong = false;
  const than = h('tbody');
  const veHang = () => than.replaceChildren(...d.du_an.filter(x => moRong || x.muc !== 'xanh').map(x => h('tr', {},
    h('td', {}, h('div', { class: 'ten-da' }, `${x.project_id} · ${x.ten}`, h('small', {}, x.so_dong_von > 1 ? `${x.so_dong_von} dòng vốn · KHV ${trieu(x.khv)}` : `KHV ${trieu(x.khv)}`))),
    h('td', { class: 'cot-thanh' }, thanhTienDo(x)),
    h('td', { class: 'so' }, phanTram(x.ty_le)),
    h('td', { class: 'so' }, x.thieu ? trieu(x.thieu) : h('span', { class: 'mo' }, '0')),
    h('td', { class: 'so' }, x.can_moi_tuan ? trieu(x.can_moi_tuan) : ''),
    h('td', { class: 'so mo' }, trieu(x.nhip_gan_day)),
    h('td', { class: 'so' }, phanTram(x.du_bao_ty_le, 0)),
    h('td', {}, chipMuc(x.muc)))));
  veHang();
  const nutMo = h('button', { class: 'phu nho', onclick: () => { moRong = !moRong; veHang(); nutMo.textContent = moRong ? 'Thu gọn' : `Xem cả ${d.du_an.length - cham.length} dự án đạt tiến độ`; } },
    `Xem cả ${d.du_an.length - cham.length} dự án đạt tiến độ`);
  const theDuAn = h('section', { class: 'the' },
    h('h2', {}, cham.length ? `${cham.length}/${d.du_an.length} dự án chậm so với kế hoạch phường T${k.thang}, tổng thiếu ${trieu(tongThieu)} triệu` : 'Mọi dự án đạt kế hoạch tháng'),
    h('p', { class: 'phu' }, `Thanh: phần tô = đã giải ngân so với KHV; vạch đứng = mục tiêu lũy kế cuối T${k.thang}. Sắp theo mức cảnh báo, rồi theo số thiếu. Đơn vị: triệu đồng.`),
    h('div', { class: 'cuon' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Dự án'), h('th', {}, 'Tiến độ so với KHV'), h('th', { class: 'so' }, 'Đã GN'), h('th', { class: 'so' }, `Thiếu so với T${k.thang}`),
        h('th', { class: 'so' }, 'Cần/tuần'), h('th', { class: 'so' }, 'Nhịp 4 tuần'), h('th', { class: 'so' }, 'Dự báo 31/12'), h('th', {}, 'Mức'))),
      than)),
    d.du_an.length > cham.length ? nutMo : null);

  // Đề xuất giải pháp — gộp theo dự án: mỗi dự án một thẻ, mức = mức nặng nhất; mức xanh để sau nút "xem thêm".
  const bac = { do: 2, vang: 1, xanh: 0 }, nhomDx = new Map();
  for (const x of d.de_xuat) {
    const ma = x.project_id ?? '*';
    const g = nhomDx.get(ma) || nhomDx.set(ma, { ...x, ds: [] }).get(ma);
    g.ds.push(x); if (bac[x.muc] > bac[g.muc]) g.muc = x.muc;
  }
  const dsNhom = [...nhomDx.values()].sort((a, b) => (a.project_id === null ? -1 : b.project_id === null ? 1 : 0) || bac[b.muc] - bac[a.muc]);
  const theNhom = g => h('article', { class: `dx m-${g.muc}` },
    h('div', { class: 'dx-dau' }, chipMuc(g.muc), h('b', {}, g.project_id ? `${g.project_id} · ${g.ten_du_an}` : `Toàn phạm vi · ${g.ten_du_an}`)),
    g.ds.map(x => h('div', { class: 'dx-y' }, h('div', { class: 'dx-quy-tac' }, x.ten_quy_tac), h('p', {}, x.van_de), h('p', { class: 'gp' }, x.giai_phap))),
    h('div', { class: 'dx-chan' }, h('span', {}, `Đầu mối: ${g.dau_moi}`), h('span', {}, `Hạn đề xuất: ${ngayVN(g.han)}`), nutGiaoViec(g)));
  const canXl = dsNhom.filter(g => g.muc !== 'xanh'), conLai = dsNhom.filter(g => g.muc === 'xanh');
  const luoiDx = h('div', { class: 'de-xuat' }, canXl.map(theNhom));
  const theDx = h('section', { class: 'the' },
    h('h2', {}, canXl.length ? `${canXl.filter(g => g.project_id).length} dự án cần chỉ đạo xử lý trong tuần` : 'Không có dự án cần xử lý'),
    h('p', { class: 'phu' }, `Đề xuất sinh theo bộ quy tắc phiên bản ${d.nguong.phien_ban}, chạy trên ${noiChay}. Mỗi đề xuất ghi rõ con số đã dùng; cán bộ quyết định có giao việc hay không.`),
    luoiDx,
    conLai.length ? h('button', { class: 'phu nho', onclick: e => { conLai.forEach(g => luoiDx.append(theNhom(g))); e.target.remove(); } }, `Xem ${conLai.length} gợi ý tích cực (dự án có thể nhận thêm vốn)`) : null);

  noiDung.replaceChildren(...[phanTren, loc, hang, h('div', { class: 'luoi-2' }, theA, theThang), theDuAn, theDx].filter(Boolean));
  bieuDoLuyKe(khungA, d);
  let hen; window.onresize = () => { clearTimeout(hen); hen = setTimeout(() => khungA.isConnected && bieuDoLuyKe(khungA, d), 150); };
}
