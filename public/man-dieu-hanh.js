// Màn hình ĐIỀU HÀNH — dùng chung cho app nội bộ (public/app.js) và trang công khai (cong-khai/).
// Chỉ vẽ từ dữ liệu `d` (kết quả dieuHanh() ở src/nghiep-vu/tong-hop.mjs), không gọi máy chủ.
//
// Trình tự đọc: ① số liệu đến ngày nào → ② bốn câu hỏi chính (đạt bao nhiêu, so với mục tiêu, nhịp cần/đang,
// cuối năm về đâu) → ③ xu hướng lũy kế + từng tháng → ④ nhịp từng tuần + từng nguồn vốn → ⑤ từng dự án
// → ⑥ việc cần làm → ⑦ giải thích thuật ngữ.
import { h, trieu, trieuDau, phanTram, ngayVN, ngayNgan, chipMuc, chip } from './dinh-dang.js';
import { bieuDoLuyKe, chuGiaiLuyKe, bieuDoTuan, chuGiaiTuan, thanhTienDo } from './bieu-do.js';

const diem = v => v == null ? '–' : `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1).replace('.', ',')} điểm`;
const lan = v => v.toFixed(1).replace('.', ',');

/**
 * Vẽ bảng điều hành vào `noiDung`.
 * tuyChon:
 *   chonLoc(loai, id)  gọi khi người xem đổi kỳ ('tuan') hoặc nguồn vốn ('nguon'); id 'moi-nhat' = kỳ mới nhất
 *   phanTren           phần tử đặt trên cùng (thanh đồng bộ ở app nội bộ)
 *   nutGiaoViec(nhom)  trả về nút/nhãn giao việc cho một nhóm đề xuất, hoặc null (trang công khai)
 *   noiChay            nơi chạy bộ quy tắc, ghi ở chú thích phần đề xuất
 */
export function veDieuHanhVao(noiDung, d, { chonLoc, phanTren = null, nutGiaoViec = () => null, noiChay = 'máy chủ của phường' } = {}) {
  const cs = d.chi_so, k = d.ky;

  // ① Độ tươi số liệu ------------------------------------------------------------------------
  const dt = d.do_tuoi;
  const doTuoi = dt && h('div', { class: `do-tuoi${dt.tuan_thieu.length || dt.dang_xem_ky_cu ? ' tre' : ''}`, role: 'status' },
    h('b', {}, `Số liệu đến ${ngayVN(dt.so_lieu_den)} (${dt.tuan_moi_nhat}).`),
    dt.tuan_thieu.length
      ? ` Đã qua nhưng chưa có số: ${dt.tuan_thieu.length <= 2
        ? dt.tuan_thieu.map(t => `${t.nhan} (${ngayNgan(t.tu)}–${ngayNgan(t.den)})`).join(', ')
        : `${dt.tuan_thieu.length} tuần, từ ${dt.tuan_thieu[0].nhan} đến ${dt.tuan_thieu.at(-1).nhan} (${ngayNgan(dt.tuan_thieu[0].tu)}–${ngayNgan(dt.tuan_thieu.at(-1).den)})`}. Mọi chỉ tiêu dưới đây tính đến ${ngayVN(dt.so_lieu_den)}.`
      : ' Đã có số đến tuần gần nhất.',
    dt.dang_xem_ky_cu ? h('span', {}, ` Đang xem kỳ cũ: ${k.nhan} (đến ${ngayVN(k.den)}). `,
      h('button', { class: 'phu nho', onclick: () => chonLoc?.('tuan', 'moi-nhat') }, 'Xem kỳ mới nhất')) : null);

  // Bộ lọc
  const chonTuan = h('select', { onchange: e => chonLoc?.('tuan', e.target.value), 'aria-label': 'Kỳ báo cáo' },
    d.danh_muc_loc.tuan.map(t => h('option', { value: t.id, selected: t.id === d.bo_loc.tuan }, t.nhan)));
  const loc = h('div', { class: 'loc' },
    h('label', {}, 'Kỳ báo cáo', chonTuan),
    h('div', { role: 'group', 'aria-label': 'Nguồn vốn' }, h('div', { class: 'ghi-chu' }, 'Nguồn vốn'),
      h('div', { class: 'phan-doan' }, d.danh_muc_loc.nguon.map(n => h('button', { 'aria-pressed': String(n.id === d.bo_loc.nguon), onclick: () => chonLoc?.('nguon', n.id) }, n.nhan.replace('Ngân sách', 'NS'))))),
    h('div', { class: 'pham-vi' }, `${d.pham_vi.so_du_an} dự án · ${d.pham_vi.so_dong_von} dòng vốn · đơn vị: triệu đồng`));

  // ② Hàng chỉ số -------------------------------------------------------------------------
  const oSo = (nhan, so, moTa, lop = '', ...them) => h('div', { class: `o-so ${lop}` }, h('div', { class: 'nhan' }, nhan), so, moTa && h('div', { class: 'mo-ta' }, moTa), ...them);
  const soCo = (v, donVi = 'triệu') => h('div', { class: `so ${v < 0 ? 'so-am' : v > 0 ? 'so-duong' : ''}` }, trieuDau(v), h('small', {}, donVi));
  const meter = h('div', { class: 'meter', 'aria-hidden': 'true' }, h('span'));
  meter.firstChild.style.width = `${Math.min(100, (cs.ty_le || 0) * 100)}%`;
  const bienDong = cs.tang_ty_le != null
    ? h('div', { class: 'bien-dong' }, h('b', { class: cs.tang_ty_le > 0 ? 'so-duong' : '' }, diem(cs.tang_ty_le)),
      ` so với ${cs.ky_truoc} · ${k.nhan.toLowerCase()} phát sinh ${trieu(cs.phat_sinh)} triệu`)
    : h('div', { class: 'bien-dong' }, `${k.nhan} phát sinh ${trieu(cs.phat_sinh)} triệu`);

  // Nhịp: đặt cạnh nhau "đang" và "cần" — thông điệp điều hành chính.
  const dongNhip = [['Đang (bình quân 4 tuần)', cs.nhip_gan_day, 'dang'],
    [`Cần để đạt KH phường cuối T${k.thang}`, cs.can_moi_tuan_thang, 'can'],
    ['Cần để hết KHV đến 31/12', cs.can_moi_tuan_nam, 'can']].filter(x => x[1] != null);
  const maxNhip = Math.max(1, ...dongNhip.map(x => x[1]));
  const bangNhip = h('div', { class: 'so-nhip' }, dongNhip.map(([ten, v, lop]) => {
    const thanh = h('span', { class: `vach-nhip ${lop}` }); thanh.style.width = `${Math.max(2, v / maxNhip * 100)}%`;
    return h('div', { class: 'dong-nhip' }, h('span', { class: 'ten' }, ten), h('span', { class: 'khung-vach' }, thanh), h('b', {}, trieu(v)));
  }));
  const ketLuanNhip = cs.can_gap_nhip == null ? 'Chưa đủ số liệu tính nhịp.'
    : cs.can_gap_nhip > 1.05 ? `Phải nâng nhịp lên gấp ${lan(cs.can_gap_nhip)} lần hiện tại mới hết KHV.`
      : 'Giữ nhịp hiện tại là đủ để hết KHV về tổng — xem từng dự án bên dưới.';

  const coHaiDuBao = cs.du_bao_du_ky && cs.du_bao_tu_dau_ty_le != null;
  const [dbThap, dbCao] = coHaiDuBao ? [Math.min(cs.du_bao_ty_le, cs.du_bao_tu_dau_ty_le), Math.max(cs.du_bao_ty_le, cs.du_bao_tu_dau_ty_le)] : [cs.du_bao_ty_le, cs.du_bao_ty_le];
  const soDuBao = !cs.du_bao_du_ky ? '–' : Math.abs(dbCao - dbThap) < 0.005 ? phanTram(dbThap) : `${phanTram(dbThap, 0).replace('%', '')}–${phanTram(dbCao, 0)}`;

  const hang = h('div', { class: 'hang-chi-so' },
    oSo('Tỷ lệ giải ngân so với kế hoạch vốn năm (KHV)', h('div', { class: 'so' }, phanTram(cs.ty_le)),
      `Đã giải ngân ${trieu(cs.luy_ke)} / ${trieu(cs.khv)} triệu · còn phải giải ngân ${trieu(cs.con_lai)} triệu`, 'chinh', meter, bienDong),
    oSo(`So với kế hoạch phường cuối T${k.thang}`, cs.chenh_phuong == null ? h('div', { class: 'so mo' }, '–') : soCo(cs.chenh_phuong),
      cs.dat_phuong == null ? 'Chưa có kế hoạch tháng' : `Đạt ${phanTram(cs.dat_phuong)} mục tiêu ${trieu(cs.kb_phuong_thang)} triệu · còn ${cs.tuan_con_lai_thang} tuần`),
    oSo(`So với kịch bản thành phố cuối T${k.thang}`, cs.chenh_tp == null ? h('div', { class: 'so mo' }, '–') : soCo(cs.chenh_tp),
      cs.dat_tp == null ? 'Thành phố không giao cho phạm vi này' : `Đạt ${phanTram(cs.dat_tp)} mục tiêu ${trieu(cs.kb_tp_thang)} triệu`,
      '', d.pham_vi.canh_bao_kb ? h('div', { class: 'mo-ta canh' }, `⚠ Kịch bản TP cao hơn KHV ${trieu(d.pham_vi.canh_bao_kb.chenh)} triệu — xem ghi chú dưới biểu đồ`) : null),
    oSo('Nhịp giải ngân, triệu/tuần', null, null, 'nhip', bangNhip, h('div', { class: 'mo-ta ket-luan' }, ketLuanNhip)),
    oSo('Dự báo đến 31/12', h('div', { class: 'so' }, soDuBao, h('small', {}, 'KHV')), null, '',
      cs.du_bao_du_ky ? h('ul', { class: 'pa-du-bao' },
        h('li', {}, `Theo nhịp 4 tuần gần nhất: `, h('b', {}, phanTram(cs.du_bao_ty_le)), ` (${trieu(cs.du_bao_cuoi_nam)} triệu)`),
        cs.du_bao_tu_dau_ty_le != null ? h('li', {}, `Theo nhịp bình quân từ T${Number(cs.tuan_dau.slice(-2))} (${cs.so_tuan_tu_dau} tuần): `, h('b', {}, phanTram(cs.du_bao_tu_dau_ty_le)), ` (${trieu(cs.du_bao_tu_dau)} triệu)`) : null)
        : h('div', { class: 'mo-ta' }, 'Chưa đủ 3 kỳ số liệu để dự báo')));

  // ③ Biểu đồ lũy kế + bảng tháng ----------------------------------------------------------
  const thieuThang = cs.chenh_phuong != null && cs.chenh_phuong < 0;
  const tieuDeA = thieuThang
    ? `Còn thiếu ${trieu(-cs.chenh_phuong)} triệu để đạt kế hoạch phường cuối T${k.thang}; theo nhịp 4 tuần gần nhất, cuối năm đạt ${phanTram(cs.du_bao_ty_le)} KHV`
    : `Đang vượt kế hoạch phường cuối T${k.thang}; theo nhịp 4 tuần gần nhất, cuối năm đạt ${phanTram(cs.du_bao_ty_le)} KHV`;
  const khungA = h('div', { class: 'khung-bd' });
  const theA = h('section', { class: 'the' }, h('h2', {}, tieuDeA),
    h('p', { class: 'phu' }, `Lũy kế giải ngân, triệu đồng. Cuối tháng 6 là mốc nền (số đã giải ngân), không phải chỉ tiêu. ${d.pham_vi.ghi_chu_tp}`),
    chuGiaiLuyKe(d.duong_luy_ke.some(p => p.kb_tp != null)), khungA,
    d.pham_vi.canh_bao_kb ? h('p', { class: 'ghi-chu-canh' }, h('b', {}, 'Lưu ý về kịch bản thành phố: '), d.pham_vi.canh_bao_kb.chu) : null);

  const khongDat = d.bang_thang.filter(t => t.trang_thai === 'khong_dat').map(t => `T${t.thang}`);
  const oTrangThai = t => t.trang_thai === 'dat' ? chip('xanh', phanTram(t.dat_phuong))
    : t.trang_thai === 'khong_dat' ? chip('do', phanTram(t.dat_phuong))
      : t.trang_thai === 'dang_dien_ra' ? h('span', { class: 'ghi-chu' }, `${phanTram(t.dat_phuong)} · đang thực hiện`)
        : h('span', { class: 'ghi-chu' }, 'Chưa đến');
  const thangNay = d.bang_thang.find(t => t.thang === k.thang);
  const theThang = h('section', { class: 'the' },
    h('h2', {}, khongDat.length ? `${khongDat.join(', ')} không đạt kế hoạch phường` : 'Các tháng đã qua đều đạt kế hoạch phường'),
    h('p', { class: 'phu' }, 'Lũy kế cuối tháng: kế hoạch phường và thực hiện, triệu đồng'),
    h('div', { class: 'cuon' }, h('table', { class: 'bang-thang' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Tháng'), h('th', { class: 'so' }, 'KH phường'), h('th', { class: 'so' }, 'Thực hiện'), h('th', {}, 'Đạt KH'))),
      h('tbody', {}, d.bang_thang.map(t => h('tr', { class: t.trang_thai === 'dang_dien_ra' ? 'dang-xem' : null },
        h('td', {}, `T${t.thang}`), h('td', { class: 'so' }, trieu(t.kb_phuong)),
        h('td', { class: 'so' }, t.thuc_hien == null ? '' : trieu(t.thuc_hien)), h('td', {}, oTrangThai(t))))))),
    thangNay ? h('p', { class: 'ghi-chu' }, `Kế hoạch riêng tháng ${k.thang}: ${trieu(thangNay.kh_trong_thang)} triệu; đã thực hiện ${trieu(thangNay.th_trong_thang)} triệu.`) : null);

  // ④ Nhịp từng tuần + theo nguồn vốn -------------------------------------------------------
  const khungT = h('div', { class: 'khung-bd' });
  const dsTuan = d.phat_sinh_tuan || d.nhip_tuan || [];
  const tuanCao = dsTuan.reduce((a, x) => (x.phat_sinh > (a?.phat_sinh ?? -1) ? x : a), null);
  const theTuan = h('section', { class: 'the' },
    h('h2', {}, cs.can_gap_nhip != null && cs.can_gap_nhip > 1.05
      ? `Nhịp 4 tuần gần nhất ${trieu(cs.nhip_gan_day)} triệu/tuần, mới bằng ${phanTram(1 / cs.can_gap_nhip, 0)} mức cần để hết KHV`
      : `Nhịp 4 tuần gần nhất ${trieu(cs.nhip_gan_day)} triệu/tuần`),
    h('p', { class: 'phu' }, `Giải ngân phát sinh từng tuần, triệu đồng${tuanCao ? ` · tuần cao nhất: ${tuanCao.nhan} (${trieu(tuanCao.phat_sinh)})` : ''}`),
    chuGiaiTuan(cs, k), khungT);

  const tn = d.theo_nguon || [];
  const tong = tn.reduce((a, n) => ({ khv: a.khv + n.khv, luy_ke: a.luy_ke + n.luy_ke, con_lai: a.con_lai + n.con_lai, phat_sinh: a.phat_sinh + n.phat_sinh }), { khv: 0, luy_ke: 0, con_lai: 0, phat_sinh: 0 });
  const oTyLe = tl => { const v = h('span', { class: 'vach-tl' }, h('span')); v.firstChild.style.width = `${Math.min(100, (tl || 0) * 100)}%`; return h('td', { class: 'so' }, h('span', { class: 'tl' }, phanTram(tl), v)); };
  const theNguon = tn.length ? h('section', { class: 'the' },
    h('h2', {}, (() => { const thap = [...tn].sort((a, b) => (a.ty_le ?? 1) - (b.ty_le ?? 1))[0]; return `${thap.ten.replace('Ngân sách', 'NS')} thấp nhất, đạt ${phanTram(thap.ty_le)} KHV`; })()),
    h('p', { class: 'phu' }, 'Theo nguồn vốn, triệu đồng. Bấm một dòng để xem riêng nguồn đó.'),
    h('div', { class: 'cuon' }, h('table', { class: 'bang-nguon' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Nguồn vốn'), h('th', { class: 'so' }, 'KHV'), h('th', { class: 'so' }, 'Đã GN'), h('th', { class: 'so' }, 'Tỷ lệ'), h('th', { class: 'so' }, 'Còn lại'), h('th', { class: 'so' }, k.nhan))),
      h('tbody', {}, tn.map(n => h('tr', { class: `chon-duoc${n.id === d.bo_loc.nguon ? ' dang-xem' : ''}`, tabindex: 0, onclick: () => chonLoc?.('nguon', n.id), onkeydown: e => { if (e.key === 'Enter') chonLoc?.('nguon', n.id); } },
        h('td', { class: 'ten-nguon' }, n.ten.replace('Ngân sách', 'NS').replace(' dự toán phường', ' dự toán'), !n.tp_giao ? h('small', { class: 'ghi-chu khoi' }, 'TP không giao') : null),
        h('td', { class: 'so' }, trieu(n.khv)), h('td', { class: 'so' }, trieu(n.luy_ke)), oTyLe(n.ty_le),
        h('td', { class: 'so' }, trieu(n.con_lai)), h('td', { class: 'so' }, trieu(n.phat_sinh))))),
      h('tfoot', {}, h('tr', {}, h('td', {}, 'Tổng cộng'), h('td', { class: 'so' }, trieu(tong.khv)), h('td', { class: 'so' }, trieu(tong.luy_ke)),
        oTyLe(tong.khv ? tong.luy_ke / tong.khv : null), h('td', { class: 'so' }, trieu(tong.con_lai)), h('td', { class: 'so' }, trieu(tong.phat_sinh))))))) : null;

  // ⑤ Bảng dự án ---------------------------------------------------------------------------
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
    h('td', { class: 'cot-muc' }, chipMuc(x.muc), x.ly_do?.length ? h('small', { class: 'ly-do' }, x.ly_do.join(' · ')) : null))));
  veHang();
  const nutMo = h('button', { class: 'phu nho', onclick: () => { moRong = !moRong; veHang(); nutMo.textContent = moRong ? 'Thu gọn' : `Xem cả ${d.du_an.length - cham.length} dự án đạt tiến độ`; } },
    `Xem cả ${d.du_an.length - cham.length} dự án đạt tiến độ`);
  const theDuAn = h('section', { class: 'the' },
    h('h2', {}, cham.length ? `${cham.length}/${d.du_an.length} dự án cần chú ý, tổng thiếu ${trieu(tongThieu)} triệu so với kế hoạch phường T${k.thang}` : 'Mọi dự án đạt kế hoạch tháng'),
    h('p', { class: 'phu' }, `Thanh: phần tô = đã giải ngân so với KHV; vạch đứng = mục tiêu lũy kế cuối T${k.thang}. Cột "Mức" ghi lý do cảnh báo. Sắp theo mức cảnh báo, rồi theo số thiếu. Đơn vị: triệu đồng.`),
    h('div', { class: 'cuon' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Dự án'), h('th', {}, 'Tiến độ so với KHV'), h('th', { class: 'so' }, 'Đã GN'), h('th', { class: 'so' }, `Thiếu so với T${k.thang}`),
        h('th', { class: 'so' }, 'Cần/tuần'), h('th', { class: 'so' }, 'Nhịp 4 tuần'), h('th', { class: 'so' }, 'Dự báo 31/12'), h('th', {}, 'Mức và lý do'))),
      than)),
    d.du_an.length > cham.length ? nutMo : null);

  // ⑥ Việc cần làm — mỗi dự án một dòng; bấm để xem căn cứ và giải pháp đầy đủ ----------------
  const bac = { do: 2, vang: 1, xanh: 0 }, nhomDx = new Map();
  for (const x of d.de_xuat) {
    const ma = x.project_id ?? '*';
    const g = nhomDx.get(ma) || nhomDx.set(ma, { ...x, ds: [] }).get(ma);
    g.ds.push(x); if (bac[x.muc] > bac[g.muc]) g.muc = x.muc;
  }
  for (const g of nhomDx.values()) g.ds.sort((a, b) => bac[b.muc] - bac[a.muc]);
  const dsNhom = [...nhomDx.values()].sort((a, b) => (a.project_id === null ? -1 : b.project_id === null ? 1 : 0) || bac[b.muc] - bac[a.muc]);
  const dongViec = g => {
    const nut = nutGiaoViec(g);
    return h('details', { class: `viec m-${g.muc}` },
      h('summary', {},
        h('span', { class: 'v-muc' }, chipMuc(g.muc)),
        h('span', { class: 'v-da' }, g.project_id ? `${g.project_id} · ${g.ten_du_an}` : `Toàn phạm vi · ${g.ten_du_an}`),
        h('span', { class: 'v-van-de' }, g.ds.map(x => x.tom_tat || x.ten_quy_tac).join(' · ')),
        h('span', { class: 'v-viec' }, g.ds[0].viec_ngan || g.ds[0].giai_phap),
        h('span', { class: 'v-dau-moi' }, g.dau_moi),
        h('span', { class: 'v-han' }, ngayVN(g.han)),
        nut ? h('span', { class: 'v-nut', onclick: e => e.preventDefault() }, nut) : null),
      h('div', { class: 'viec-chi-tiet' }, g.ds.map(x => h('div', { class: 'dx-y' },
        h('div', { class: 'dx-quy-tac' }, x.ten_quy_tac), h('p', {}, x.van_de), h('p', { class: 'gp' }, x.giai_phap)))));
  };
  const canXl = dsNhom.filter(g => g.muc !== 'xanh'), conLai = dsNhom.filter(g => g.muc === 'xanh');
  const dsViec = h('div', { class: 'ds-viec' },
    h('div', { class: 'viec-tieu-de', 'aria-hidden': 'true' }, h('span', {}, 'Mức'), h('span', {}, 'Dự án'), h('span', {}, 'Vấn đề'), h('span', {}, 'Việc cần làm'), h('span', {}, 'Đầu mối'), h('span', {}, 'Hạn')),
    canXl.map(dongViec));
  const theDx = h('section', { class: 'the' },
    h('h2', {}, canXl.length ? `${canXl.filter(g => g.project_id).length} dự án cần chỉ đạo xử lý` : 'Không có dự án cần xử lý'),
    h('p', { class: 'phu' }, `Bấm từng dòng để xem căn cứ (con số, ngưỡng) và giải pháp đầy đủ. Đề xuất sinh theo bộ quy tắc phiên bản ${d.nguong.phien_ban}, chạy trên ${noiChay}; cán bộ quyết định có giao việc hay không.`),
    dsViec,
    conLai.length ? h('button', { class: 'phu nho', onclick: e => { conLai.forEach(g => dsViec.append(dongViec(g))); e.target.remove(); } }, `Xem ${conLai.length} gợi ý tích cực (dự án có thể nhận thêm vốn)`) : null);

  // ⑦ Thuật ngữ ----------------------------------------------------------------------------
  const N = d.nguong, pt = v => v == null ? '…' : phanTram(v, 0);
  const thuatNgu = h('details', { class: 'the thuat-ngu' }, h('summary', {}, h('h2', {}, 'Giải thích thuật ngữ và cách tính')),
    h('dl', {}, [
      ['KHV', 'Kế hoạch vốn năm được giao cho dự án (tổng các dòng vốn).'],
      ['Đã GN (giải ngân)', 'Lũy kế số đã giải ngân từ đầu năm đến hết kỳ đang xem.'],
      ['KH phường', 'Mục tiêu lũy kế đến cuối mỗi tháng do phường tự lập; là mốc dùng để chấm cảnh báo.'],
      ['Kịch bản TP', 'Mục tiêu lũy kế thành phố giao theo nguồn vốn; nguồn tăng thu do phường tự cân đối nên lấy theo KH phường.'],
      ['Mốc nền', 'Số đã giải ngân đến hết tháng 6 — điểm xuất phát, không phải chỉ tiêu.'],
      [`Nhịp ${N.so_tuan_tinh_nhip ?? 4} tuần`, `Bình quân giải ngân mỗi tuần của ${N.so_tuan_tinh_nhip ?? 4} tuần có số liệu gần nhất.`],
      ['Dự báo 31/12', 'Lũy kế hiện tại cộng nhịp × số tuần còn lại, không vượt KHV. Hai phương án: nhịp 4 tuần gần nhất (nhạy với diễn biến mới) và nhịp bình quân từ đầu kỳ theo dõi (ổn định hơn).'],
      ['Chậm nhiều (đỏ)', `Đạt dưới ${pt(N.dat_ke_hoach_thang_do)} mục tiêu tháng; hoặc ${N.so_tuan_dung_im ?? 3} tuần liền không giải ngân; hoặc dự báo cuối năm dưới ${pt(N.du_bao_het_von_do)} KHV.`],
      ['Cần theo dõi (vàng)', `Đạt dưới ${pt(N.dat_ke_hoach_thang_vang)} mục tiêu tháng; hoặc dự báo cuối năm dưới ${pt(N.du_bao_het_von_vang)} KHV; hoặc chưa có số kỳ đang xem.`],
      ['Tháng của một tuần', 'Tính theo ngày kết thúc tuần; tuần vắt sang năm sau tính cho tháng 12.']
    ].map(([t, m]) => [h('dt', {}, t), h('dd', {}, m)])));

  noiDung.replaceChildren(...[phanTren, doTuoi, loc, hang, h('div', { class: 'luoi-2' }, theA, theThang),
    h('div', { class: 'luoi-2' }, theTuan, theNguon), theDuAn, theDx, thuatNgu].filter(Boolean));
  const ve = () => { if (khungA.isConnected) bieuDoLuyKe(khungA, d); if (khungT.isConnected) bieuDoTuan(khungT, dsTuan, cs, k); };
  ve();
  let hen; window.onresize = () => { clearTimeout(hen); hen = setTimeout(ve, 150); };
}
