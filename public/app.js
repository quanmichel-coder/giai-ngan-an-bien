// Giao diện bản tối giản v1 — bốn màn hình: Điều hành · Nhập liệu · Kịch bản · Giải pháp.
import { h, trieu, trieuDau, phanTram, ngayVN, ngayNgan, chipMuc, chip } from './dinh-dang.js';
import { bieuDoLuyKe, chuGiaiLuyKe, cotNho, thanhTienDo } from './bieu-do.js';

const app = document.getElementById('app');
const S = { toi: null, csrf: '', dm: null, man: 'dieu-hanh', loc: { tuan: 'moi-nhat', nguon: 'tat-ca' } };

async function api(method, path, body) {
  const r = await fetch(path, { method, headers: { 'Content-Type': 'application/json', 'X-CSRF': S.csrf }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== '/api/dang-nhap') { S.toi = null; veDangNhap(j.loi); throw new Error(j.loi); }
  if (!r.ok) throw new Error(j.loi || `Lỗi ${r.status}`);
  return j;
}
const thongBao = (chu, loi = false) => h('div', { class: `thong-bao${loi ? ' loi' : ''}`, role: loi ? 'alert' : 'status' }, chu);
const quyen = viec => ({
  nhap_tep: ['kinhte'], nhap_tay: ['kinhte', 'bql'], xac_nhan: ['kinhte'], sua_kich_ban: ['kinhte'],
  giao_viec: ['kinhte', 'lanhdao'], cap_nhat_viec: ['kinhte', 'bql', 'lanhdao']
}[viec] || []).includes(S.toi?.role);

// ------------------------------------------------------------------------- Đăng nhập & khung
function veDangNhap(loi) {
  const tb = h('div');
  if (loi) tb.append(thongBao(loi, true));
  const f = h('form', {
    onsubmit: async e => {
      e.preventDefault(); tb.replaceChildren();
      try {
        const r = await api('POST', '/api/dang-nhap', { username: f.username.value, password: f.password.value });
        S.toi = r.user; S.csrf = r.csrf; await batDau();
      } catch (er) { tb.replaceChildren(thongBao(er.message, true)); }
    }
  },
    h('label', {}, 'Tên đăng nhập', h('input', { type: 'text', name: 'username', autocomplete: 'username', required: true, autocapitalize: 'off' })),
    h('label', {}, 'Mật khẩu', h('input', { type: 'password', name: 'password', autocomplete: 'current-password', required: true })),
    h('label', { class: 'ghi-chu' }, h('input', { type: 'checkbox', onchange: e => { f.password.type = e.target.checked ? 'text' : 'password'; } }), ' Hiện mật khẩu (kiểm tra bộ gõ tiếng Việt đã tắt)'),
    h('button', { class: 'chinh', type: 'submit' }, 'Đăng nhập'), tb);
  app.replaceChildren(h('div', { class: 'the dang-nhap' }, h('h2', {}, 'Hệ thống quản lý giải ngân vốn đầu tư công'), h('p', { class: 'phu' }, 'UBND phường An Biên · chỉ dùng trong mạng nội bộ'), f));
}

const MAN = [['dieu-hanh', 'Điều hành'], ['nhap', 'Nhập liệu'], ['kich-ban', 'Kịch bản'], ['giai-phap', 'Giải pháp']];
let noiDung;
function veKhung() {
  noiDung = h('main');
  const menu = h('nav', { class: 'menu', 'aria-label': 'Chức năng' }, MAN.map(([id, ten]) =>
    h('button', { 'aria-current': S.man === id ? 'page' : null, onclick: () => { S.man = id; veKhung(); } }, ten)));
  app.replaceChildren(
    h('header', { class: 'dau' },
      h('div', { class: 'ten-app' }, 'Quản lý giải ngân vốn đầu tư công', h('small', {}, `UBND phường An Biên · năm ${S.dm.nam}`)),
      menu,
      h('div', { class: 'nguoi' }, `${S.toi.name} · ${S.toi.ten_vai_tro}`,
        h('button', { class: 'phu nho', onclick: async () => { await api('POST', '/api/dang-xuat'); S.toi = null; veDangNhap(); } }, 'Đăng xuất'))),
    noiDung);
  ({ 'dieu-hanh': veDieuHanh, nhap: veNhap, 'kich-ban': veKichBan, 'giai-phap': veGiaiPhap })[S.man]();
}

async function batDau() {
  try { const t = await api('GET', '/api/toi'); if (t.dang_nhap === false) return veDangNhap(); S.toi = t; S.csrf = t.csrf; } catch { return veDangNhap(); }
  S.dm = await api('GET', '/api/danh-muc');
  veKhung();
}

// ------------------------------------------------------------------------------ ĐIỀU HÀNH
async function veDieuHanh() {
  let d;
  try { d = await api('GET', `/api/dieu-hanh?tuan=${encodeURIComponent(S.loc.tuan)}&nguon=${encodeURIComponent(S.loc.nguon)}`); }
  catch (e) { return noiDung.replaceChildren(thongBao(e.message, true)); }
  if (d.trong) return noiDung.replaceChildren(thongBao(d.ly_do + ' Vào "Nhập liệu" để nạp số liệu.'));
  const cs = d.chi_so, k = d.ky;

  // Bộ lọc
  const chonTuan = h('select', { onchange: e => { S.loc.tuan = e.target.value; veDieuHanh(); } },
    d.danh_muc_loc.tuan.map(t => h('option', { value: t.id, selected: t.id === d.bo_loc.tuan }, t.nhan)));
  const loc = h('div', { class: 'loc' },
    h('label', {}, 'Kỳ báo cáo', chonTuan),
    h('div', { role: 'group', 'aria-label': 'Nguồn vốn' }, h('div', { class: 'ghi-chu' }, 'Nguồn vốn'),
      h('div', { class: 'phan-doan' }, d.danh_muc_loc.nguon.map(n => h('button', { 'aria-pressed': String(n.id === d.bo_loc.nguon), onclick: () => { S.loc.nguon = n.id; veDieuHanh(); } }, n.nhan.replace('Ngân sách', 'NS'))))),
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
  const theThang = h('section', { class: 'the' },
    h('h2', {}, khongDat.length ? `${khongDat.join(', ')} không đạt kế hoạch phường` : 'Các tháng đã qua đều đạt kế hoạch phường'),
    h('p', { class: 'phu' }, 'Kế hoạch phường và thực hiện, lũy kế cuối tháng, triệu đồng'),
    h('div', { class: 'cuon' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Tháng'), h('th', { class: 'so' }, 'KH phường'), h('th', { class: 'so' }, 'Thực hiện'), h('th', { class: 'so' }, 'Đạt KH'), h('th', {}, ''))),
      h('tbody', {}, d.bang_thang.map(t => h('tr', { class: t.trang_thai === 'dang_dien_ra' ? 'dang-xem' : null },
        h('td', {}, `T${t.thang}`), h('td', { class: 'so' }, trieu(t.kb_phuong)),
        h('td', { class: 'so' }, t.thuc_hien == null ? '' : trieu(t.thuc_hien)), h('td', { class: 'so' }, t.dat_phuong == null ? '' : phanTram(t.dat_phuong)),
        h('td', {}, tt[t.trang_thai][0] ? chip(tt[t.trang_thai][0], tt[t.trang_thai][1]) : h('span', { class: 'ghi-chu' }, tt[t.trang_thai][1]))))))),
    h('p', { class: 'ghi-chu' }, `Kế hoạch trong tháng ${k.thang}: ${trieu(d.bang_thang.find(t => t.thang === k.thang)?.kh_trong_thang)} triệu; đã thực hiện ${trieu(d.bang_thang.find(t => t.thang === k.thang)?.th_trong_thang)} triệu.`));

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

  // Đề xuất giải pháp
  const viec = await api('GET', '/api/viec').catch(() => []);
  const daGiao = new Map(viec.filter(v => v.suggestion_key).map(v => [v.suggestion_key, v]));
  // Gộp đề xuất theo dự án: mỗi dự án một thẻ, mức = mức nặng nhất; mức xanh để sau nút "xem thêm".
  const bac = { do: 2, vang: 1, xanh: 0 }, nhomDx = new Map();
  for (const x of d.de_xuat) {
    const k = x.project_id ?? '*';
    const g = nhomDx.get(k) || nhomDx.set(k, { ...x, ds: [] }).get(k);
    g.ds.push(x); if (bac[x.muc] > bac[g.muc]) g.muc = x.muc;
  }
  const dsNhom = [...nhomDx.values()].sort((a, b) => (a.project_id === null ? -1 : b.project_id === null ? 1 : 0) || bac[b.muc] - bac[a.muc]);
  const theNhom = g => {
    const chua = g.ds.filter(x => !daGiao.has(x.ma));
    const nut = !chua.length ? h('span', { class: 'ghi-chu' }, `Đã giao · ${g.ds.map(x => S.dm.trang_thai_viec[daGiao.get(x.ma).status]).filter((v, i, a) => a.indexOf(v) === i).join(', ')}`)
      : quyen('giao_viec') ? h('button', { class: 'phu nho', onclick: async e => {
        e.target.disabled = true;
        try {
          for (const x of chua) await api('POST', '/api/viec', { suggestion_key: x.ma, project_id: x.project_id, rule_id: x.quy_tac, problem: x.van_de, solution: x.giai_phap, owner: x.dau_moi, due: x.han });
          e.target.replaceWith(h('span', { class: 'ghi-chu' }, `Đã giao ${chua.length} việc`));
        } catch (er) { e.target.disabled = false; alert(er.message); }
      } }, chua.length > 1 ? `Giao ${chua.length} việc` : 'Giao việc') : null;
    return h('article', { class: `dx m-${g.muc}` },
      h('div', { class: 'dx-dau' }, chipMuc(g.muc), h('b', {}, g.project_id ? `${g.project_id} · ${g.ten_du_an}` : `Toàn phạm vi · ${g.ten_du_an}`)),
      g.ds.map(x => h('div', { class: 'dx-y' }, h('div', { class: 'dx-quy-tac' }, x.ten_quy_tac), h('p', {}, x.van_de), h('p', { class: 'gp' }, x.giai_phap))),
      h('div', { class: 'dx-chan' }, h('span', {}, `Đầu mối: ${g.dau_moi}`), h('span', {}, `Hạn đề xuất: ${ngayVN(g.han)}`), nut));
  };
  const canXl = dsNhom.filter(g => g.muc !== 'xanh'), conLai = dsNhom.filter(g => g.muc === 'xanh');
  const luoiDx = h('div', { class: 'de-xuat' }, canXl.map(theNhom));
  const theDx = h('section', { class: 'the' },
    h('h2', {}, canXl.length ? `${canXl.filter(g => g.project_id).length} dự án cần chỉ đạo xử lý trong tuần` : 'Không có dự án cần xử lý'),
    h('p', { class: 'phu' }, `Đề xuất sinh theo bộ quy tắc phiên bản ${d.nguong.phien_ban}, chạy trên máy chủ của phường. Mỗi đề xuất ghi rõ con số đã dùng; cán bộ quyết định có giao việc hay không.`),
    luoiDx,
    conLai.length ? h('button', { class: 'phu nho', onclick: e => { conLai.forEach(g => luoiDx.append(theNhom(g))); e.target.remove(); } }, `Xem ${conLai.length} gợi ý tích cực (dự án có thể nhận thêm vốn)`) : null);

  // Thanh "Cập nhật từ Google Sheets": một bấm là tải bảng về ngay, cho qua một cửa nhập, vẽ lại bảng điều hành.
  const nhac = quyen('nhap_tep') ? await api('GET', '/api/dong-bo').then(ds => {
    const n = ds.find(x => x.active) || ds[0];
    const tt = h('span', { class: 'ghi-chu' });
    const nut = h('button', { class: 'chinh nho' }, 'Cập nhật từ Google Sheets');
    if (!n) {
      nut.onclick = () => { S.man = 'nhap'; veKhung(); };
      tt.textContent = 'Chưa gắn bảng Google Sheets. Bấm để dán đường liên kết (chỉ cần làm một lần).';
    } else {
      const cho = n.cho_duyet?.so || 0;
      tt.textContent = [`Tự cập nhật lúc ${n.gio_cap_nhat} hằng ngày ·`, n.last_check_at ? `lần lấy số gần nhất: ${new Date(n.last_check_at).toLocaleString('vi-VN')}` : 'chưa lấy số lần nào',
        n.last_status === 'loi' ? `· Lỗi: ${n.last_message}` : '', cho ? `· ${cho} số trên Sheets khác số đã có, đang chờ duyệt` : ''].filter(Boolean).join(' ');
      nut.onclick = async () => {
        nut.disabled = true; nut.textContent = 'Đang lấy số từ Google Sheets…';
        try {
          const r = await api('POST', '/api/dong-bo/kiem-tra', { id: n.id });
          if (r.trang_thai === 'loi') { tt.textContent = `Lỗi: ${r.thong_bao}`; tt.classList.add('qua-han'); nut.disabled = false; nut.textContent = 'Thử lại'; return; }
          S.thongBaoDongBo = r.trang_thai === 'khong_doi' ? 'Google Sheets không có gì thay đổi so với lần trước.' : r.thong_bao;
          veDieuHanh();
        } catch (e) { tt.textContent = e.message; nut.disabled = false; nut.textContent = 'Thử lại'; }
      };
    }
    const them = [];
    if (n?.cho_duyet) them.push(h('button', { class: 'phu nho', onclick: () => { S.man = 'nhap'; veKhung(); } }, 'Duyệt số chờ'));
    const thanh = h('div', { class: 'thanh-dong-bo' }, nut, tt, ...them);
    if (S.thongBaoDongBo) { thanh.append(h('div', { class: 'ghi-chu dong-bo-kq', role: 'status' }, S.thongBaoDongBo)); S.thongBaoDongBo = ''; }
    return thanh;
  }).catch(() => null) : null;
  noiDung.replaceChildren(...[nhac, loc, hang, h('div', { class: 'luoi-2' }, theA, theThang), theDuAn, theDx].filter(Boolean));
  bieuDoLuyKe(khungA, d);
  let hen; window.onresize = () => { clearTimeout(hen); hen = setTimeout(() => khungA.isConnected && bieuDoLuyKe(khungA, d), 150); };
}

// ------------------------------------------------------------------------------ NHẬP LIỆU
function veNhap() {
  const tabs = [['gs', 'Google Sheets (tự đồng bộ)', 'nhap_tep'], ['tep', 'Tải tệp Excel / CSV', 'nhap_tep'], ['tay', 'Nhập tay theo tuần', 'nhap_tay'], ['xn', 'Chờ xác nhận', 'xac_nhan']].filter(t => quyen(t[2]));
  if (!tabs.length) return noiDung.replaceChildren(thongBao('Tài khoản của bạn chỉ có quyền xem.'));
  const vung = h('div');
  const nhom = h('div', { class: 'nhom-tab', role: 'tablist' });
  const chon = id => { nhom.querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.id === id))); ({ gs: tabGoogle, tep: tabTep, tay: tabTay, xn: tabXacNhan })[id](vung); };
  tabs.forEach(([id, ten]) => nhom.append(h('button', { role: 'tab', 'data-id': id, onclick: () => chon(id) }, ten)));
  noiDung.replaceChildren(h('section', { class: 'the' }, h('h2', {}, 'Nhập liệu — một cửa cho mọi nguồn'),
    h('p', { class: 'phu' }, 'Mọi nguồn đều qua hai bước: xem trước đối chiếu, rồi mới ghi. Số đã có không bị ghi đè nếu không chấp nhận kèm lý do.'), nhom, vung));
  chon(tabs[0][0]);
}

/** Hiển thị báo cáo xem trước + nút ghi. guiLai(extra) gửi lại cùng dữ liệu với tùy chọn ghi. */
function baoCaoXemTruoc(bc, guiLai) {
  const gn = bc.giai_ngan, coLech = gn.lech.length + bc.moc_nen.lech.length + bc.kich_ban.lech.length + bc.dong_von.lech_khv.length;
  const dong = (ten, so, chiTiet) => h('tr', {}, h('td', {}, ten), h('td', { class: 'so' }, so), h('td', { class: 'ghi-chu' }, chiTiet || ''));
  const bang = h('table', {}, h('tbody', {},
    dong('Số giải ngân tuần mới', gn.moi.length, gn.moi.length ? `Tổng ${trieu(gn.moi.reduce((s, x) => s + x.amount, 0))} triệu` : ''),
    dong('Trùng với số đã có', gn.trung + gn.lam_tron, gn.lam_tron ? `${gn.lam_tron} chênh dưới 1.000 đ (làm tròn)` : ''),
    dong('Khác số đã có (cần quyết định)', gn.lech.length, gn.lech.slice(0, 5).map(x => `${x.line_id} ${x.period_id}: ${trieu(x.cu)} → ${trieu(x.amount)}`).join('; ')),
    dong('Không nhận ra / ngoài quyền / kỳ đã khóa', gn.khong_nhan.length + gn.ngoai_quyen.length + gn.khoa.length, gn.khong_nhan.slice(0, 3).map(x => `${x.source_ref}: ${x.ly_do}`).join('; ')),
    dong('Mốc nền mới / khác', `${bc.moc_nen.moi.length} / ${bc.moc_nen.lech.length}`),
    dong('Dòng vốn mới / KHV khác', `${bc.dong_von.moi.length} / ${bc.dong_von.lech_khv.length}`, bc.dong_von.lech_khv.slice(0, 3).map(x => `${x.line_id}: ${trieu(x.cu)} → ${trieu(x.moi)}`).join('; ')),
    dong('Điểm kịch bản mới / khác', `${bc.kich_ban.moi.length} / ${bc.kich_ban.lech.length}`),
    dong('Lũy kế tệp tự tính lệch hệ thống', bc.doi_chieu.length, bc.doi_chieu.slice(0, 3).map(x => `${x.line_id}: ${trieuDau(x.chenh)}`).join('; '))));
  const lyDo = h('input', { type: 'text', placeholder: 'Lý do (bắt buộc khi thay số đã có)', size: 40 });
  const chap = h('input', { type: 'checkbox', disabled: !coLech || S.toi.role !== 'kinhte' });
  const kq = h('div');
  const nut = h('button', { class: 'chinh', disabled: !!bc.loi.length, onclick: async () => {
    nut.disabled = true;
    try {
      const r = await guiLai({ ly_do: lyDo.value, chap_nhan_lech: chap.checked });
      kq.replaceChildren(thongBao(`Đã ghi: ${r.giai_ngan_moi} số tuần mới, ${r.giai_ngan_thay} số thay, ${r.moc_nen_moi} mốc nền, ${r.dong_von_moi} dòng vốn mới, ${r.kich_ban_moi + r.kich_ban_thay} điểm kịch bản.${r.lech_chua_xu_ly ? ` Còn ${r.lech_chua_xu_ly} khác biệt giữ nguyên số cũ.` : ''}`));
    } catch (e) { kq.replaceChildren(thongBao(e.message, true)); nut.disabled = false; }
  } }, 'Ghi vào hệ thống');
  return h('div', {},
    bc.da_nap && thongBao(`Tệp này đã được nạp ngày ${ngayVN(bc.da_nap.at.slice(0, 10))} bởi ${bc.da_nap.actor}. Ghi lại chỉ thêm phần chưa có.`),
    ...bc.loi.map(x => thongBao(x, true)), ...bc.canh_bao.slice(0, 6).map(x => thongBao(x)),
    h('div', { class: 'cuon' }, bang),
    bc.ghi_chu.length ? h('details', {}, h('summary', { class: 'ghi-chu' }, 'Ghi chú khi đọc tệp'), h('ul', { class: 'ghi-chu' }, bc.ghi_chu.map(g => h('li', {}, g)))) : null,
    h('div', { class: 'form-hang' }, h('label', {}, h('span', {}, h('span', {}, chap), ' Chấp nhận thay số đã có bằng số mới')), h('label', {}, 'Lý do', lyDo), nut), kq);
}

const TT_DONG_BO = { chua_chay: 'Chưa chạy', khong_doi: 'Không thay đổi', da_cap_nhat: 'Đã cập nhật', cho_duyet: 'Có số chờ duyệt', da_bo_qua: 'Đã bỏ qua khác biệt', loi: 'Lỗi' };
async function tabGoogle(vung) {
  const ds = await api('GET', '/api/dong-bo');
  const n = ds.find(x => x.active) || ds[0];
  const kq = h('div');
  const link = h('input', { type: 'text', size: 60, value: n?.url || '', placeholder: 'https://docs.google.com/spreadsheets/d/…' });
  const bat = h('input', { type: 'checkbox', checked: n ? !!n.active : true });
  const luu = h('button', { class: 'chinh', onclick: async () => {
    try { luu.disabled = true; kq.replaceChildren(thongBao('Đang tải bảng từ Google…'));
      const sv = await api('POST', '/api/dong-bo', { id: n?.id, url: link.value, active: bat.checked });
      const r = await api('POST', '/api/dong-bo/kiem-tra', { id: sv.id });
      kq.replaceChildren(thongBao(r.thong_bao || TT_DONG_BO[r.trang_thai], r.trang_thai === 'loi')); setTimeout(() => tabGoogle(vung), 1200); }
    catch (e) { kq.replaceChildren(thongBao(e.message, true)); luu.disabled = false; }
  } }, n ? 'Lưu và kiểm tra ngay' : 'Kết nối và đọc lần đầu');
  const trangThai = n ? h('table', {}, h('tbody', {},
    h('tr', {}, h('td', {}, 'Trạng thái'), h('td', { class: n.last_status === 'loi' ? 'qua-han' : '' }, `${TT_DONG_BO[n.last_status] || n.last_status}${n.active ? '' : ' · đang tắt'}`)),
    h('tr', {}, h('td', {}, 'Tự cập nhật'), h('td', {}, `${n.gio_cap_nhat} hằng ngày · lần tới ${new Date(n.lan_tu_dong_tiep).toLocaleString('vi-VN')}`)),
    h('tr', {}, h('td', {}, 'Lần kiểm tra gần nhất'), h('td', {}, n.last_check_at ? new Date(n.last_check_at).toLocaleString('vi-VN') : '–')),
    h('tr', {}, h('td', {}, 'Lần bảng thay đổi gần nhất'), h('td', {}, n.last_change_at ? new Date(n.last_change_at).toLocaleString('vi-VN') : '–')),
    h('tr', {}, h('td', {}, 'Ghi chú'), h('td', { class: 'ghi-chu' }, n.last_message || '')))) : null;
  let cho = null;
  if (n?.cho_duyet) {
    const c = n.cho_duyet, lyDo = h('input', { type: 'text', size: 40, placeholder: 'Lý do (bắt buộc), ví dụ: BQL sửa theo chứng từ KBNN' });
    const dong = [...c.giai_ngan.map(x => [`${x.line_id} · ${x.period_id}`, x.cu, x.moi, x.source_ref]), ...c.moc_nen.map(x => [`${x.line_id} · mốc nền`, x.cu, x.moi, '']),
      ...c.khv.map(x => [`${x.line_id} · KHV`, x.cu, x.moi, '']), ...c.kich_ban.map(x => [`${x.scope_id} · kịch bản T${x.month}`, x.cu, x.moi, ''])];
    cho = h('section', { class: 'the' }, h('h2', {}, `${c.so} số trên Google Sheets khác số đã có — đang giữ số cũ`),
      h('p', { class: 'phu' }, 'Số mới đã tự ghi. Những số dưới đây chỉ thay khi Phòng Kinh tế duyệt. Đơn vị: triệu đồng.'),
      h('div', { class: 'cuon' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Ô số liệu'), h('th', { class: 'so' }, 'Đang dùng'), h('th', { class: 'so' }, 'Trên Sheets'), h('th', { class: 'so' }, 'Chênh'), h('th', {}, 'Ô gốc'))),
        h('tbody', {}, dong.map(([ten, cu, moi, ref]) => h('tr', {}, h('td', {}, ten), h('td', { class: 'so' }, trieu(cu)), h('td', { class: 'so' }, trieu(moi)), h('td', { class: 'so' }, trieuDau(moi - cu)), h('td', { class: 'ghi-chu' }, ref)))))),
      h('div', { class: 'form-hang' }, h('label', {}, 'Lý do', lyDo),
        h('button', { class: 'chinh', onclick: async () => { try { await api('POST', '/api/dong-bo/duyet', { id: n.id, ly_do: lyDo.value }); tabGoogle(vung); } catch (e) { kq.replaceChildren(thongBao(e.message, true)); } } }, 'Duyệt: dùng số trên Sheets'),
        h('button', { class: 'phu', onclick: async () => { try { await api('POST', '/api/dong-bo/bo-qua', { id: n.id, ly_do: lyDo.value }); tabGoogle(vung); } catch (e) { kq.replaceChildren(thongBao(e.message, true)); } } }, 'Bỏ qua: giữ số cũ')));
  }
  vung.replaceChildren(...[
    h('p', {}, 'Phần mềm tự lấy số từ bảng Google Sheets lúc 18:00 hằng ngày (máy tắt lúc đó thì lấy bù khi mở lại), và lấy ngay khi bấm nút "Cập nhật từ Google Sheets" ở màn hình Điều hành. Số mới tự ghi vào; số khác số đã có thì giữ số cũ và chờ Phòng Kinh tế duyệt. Bảng phải giữ đúng bố cục tệp Excel bảng điều hành (sheet NHAP_LIEU và DU_AN).'),
    h('p', { class: 'ghi-chu' }, 'Trên Google Sheets: Chia sẻ → Quyền truy cập chung → "Bất kỳ ai có đường liên kết" – Người xem. Ai có đường liên kết đều xem được số liệu, nên chỉ gửi link cho người cần.'),
    h('div', { class: 'form-hang' }, h('label', {}, 'Đường liên kết Google Sheets', link),
      h('label', {}, h('span', {}, bat, ' Đang bật')), luu, n ? h('button', { class: 'phu', onclick: async () => { const r = await api('POST', '/api/dong-bo/kiem-tra', { id: n.id }); kq.replaceChildren(thongBao(r.thong_bao || TT_DONG_BO[r.trang_thai], r.trang_thai === 'loi')); setTimeout(() => tabGoogle(vung), 1200); } }, 'Kiểm tra ngay') : null),
    kq, trangThai, cho].filter(Boolean));
}

function tabTep(vung) {
  const tep = h('input', { type: 'file', accept: '.xlsx,.csv' });
  const kq = h('div');
  const docTep = () => new Promise((ok, hong) => { const r = new FileReader(); r.onload = () => ok(r.result.split(',')[1]); r.onerror = hong; r.readAsDataURL(tep.files[0]); });
  const xem = h('button', { class: 'phu', onclick: async () => {
    if (!tep.files[0]) return kq.replaceChildren(thongBao('Chưa chọn tệp.', true));
    const goi = { kenh: 'tep', ten_tep: tep.files[0].name, du_lieu: await docTep() };
    try { const bc = await api('POST', '/api/nhap/xem-truoc', goi); kq.replaceChildren(baoCaoXemTruoc(bc, them => api('POST', '/api/nhap/ghi', { ...goi, ...them }))); }
    catch (e) { kq.replaceChildren(thongBao(e.message, true)); }
  } }, 'Xem trước');
  vung.replaceChildren(
    h('p', {}, 'Nhận: tệp Excel bảng điều hành (sheet NHAP_LIEU + DU_AN), tệp giải ngân theo tuần (sheet 02_NHAP_TUAN), hoặc tệp CSV theo mẫu chuẩn cho đơn vị khác. ',
      h('a', { href: '/api/nhap/mau-csv' }, 'Tải mẫu CSV')),
    h('div', { class: 'form-hang' }, tep, xem), kq);
}

async function tabTay(vung) {
  const coSo = S.dm.tuan.filter(t => t.end_date <= new Date().toISOString().slice(0, 10)).reverse();
  const chonKy = h('select', {}, coSo.map(t => h('option', { value: t.id }, `Tuần ${Number(t.id.slice(-2))} · ${ngayNgan(t.start_date)}–${ngayNgan(t.end_date)}${t.locked ? ' (đã khóa)' : ''}`)));
  const bang = h('div'), kq = h('div');
  const tai = async () => {
    const r = await api('GET', `/api/nhap/bieu-mau?ky=${chonKy.value}`);
    const than = h('tbody', {}, r.dong.map(l => h('tr', {}, h('td', {}, l.label),
      h('td', { class: 'so mo' }, l.amount == null ? 'chưa có' : `${trieu(l.amount)}${l.state === 'cho_xac_nhan' ? ' (chờ xác nhận)' : ''}`),
      h('td', { class: 'so' }, h('input', { class: 'o-nhap', type: 'text', inputmode: 'decimal', 'data-line': l.id, disabled: r.khoa, 'aria-label': `Phát sinh tuần, ${l.label}` })),
      h('td', {}, h('input', { type: 'text', 'data-gc': l.id, placeholder: 'Chứng từ, ghi chú', disabled: r.khoa })))));
    bang.replaceChildren(r.khoa ? thongBao('Kỳ đã khóa sổ, không nhập thêm được.') : '',
      h('div', { class: 'cuon' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Dòng vốn'), h('th', { class: 'so' }, 'Số đã có (triệu)'), h('th', { class: 'so' }, 'Phát sinh tuần (triệu)'), h('th', {}, 'Chứng từ'))), than)),
      h('div', { class: 'form-hang' }, h('button', { class: 'phu', disabled: r.khoa, onclick: async () => {
        const goi = { kenh: 'tay', period_id: chonKy.value, dong: [...than.querySelectorAll('input.o-nhap')].filter(i => i.value.trim() !== '').map(i => ({ line_id: i.dataset.line, trieu: i.value.trim(), ghi_chu: than.querySelector(`[data-gc="${i.dataset.line}"]`).value })) };
        try { const bc = await api('POST', '/api/nhap/xem-truoc', goi); kq.replaceChildren(baoCaoXemTruoc(bc, them => api('POST', '/api/nhap/ghi', { ...goi, ...them }).then(async x => { await tai(); return x; }))); }
        catch (e) { kq.replaceChildren(thongBao(e.message, true)); }
      } }, 'Xem trước')));
    kq.replaceChildren();
  };
  chonKy.onchange = tai;
  vung.replaceChildren(h('p', {}, 'Ô để trống = chưa báo cáo. Tuần không phát sinh thì nhập 0. Số do Ban QLDA nhập chờ Phòng Kinh tế xác nhận.'),
    h('div', { class: 'form-hang' }, h('label', {}, 'Kỳ báo cáo', chonKy)), bang, kq);
  await tai();
}

async function tabXacNhan(vung) {
  const ds = await api('GET', '/api/xac-nhan');
  const kq = h('div');
  if (!ds.length) return vung.replaceChildren(thongBao('Không có số liệu nào chờ xác nhận.'));
  const than = h('tbody', {}, ds.map(x => h('tr', {}, h('td', {}, h('input', { type: 'checkbox', value: x.id, checked: true, 'aria-label': `Chọn ${x.label} ${x.period_id}` })),
    h('td', {}, x.period_id), h('td', {}, x.label), h('td', { class: 'so' }, trieu(x.amount)), h('td', { class: 'ghi-chu' }, `${x.created_by} · ${x.channel}${x.note ? ' · ' + x.note : ''}`))));
  vung.replaceChildren(h('div', { class: 'cuon' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'Kỳ'), h('th', {}, 'Dòng vốn'), h('th', { class: 'so' }, 'Triệu đồng'), h('th', {}, 'Người nhập'))), than)),
    h('div', { class: 'form-hang' }, h('button', { class: 'chinh', onclick: async () => {
      const ids = [...than.querySelectorAll('input:checked')].map(i => i.value);
      try { const r = await api('POST', '/api/xac-nhan', { ids }); kq.replaceChildren(thongBao(`Đã xác nhận ${r.da_xac_nhan} số liệu.`)); setTimeout(() => tabXacNhan(vung), 800); }
      catch (e) { kq.replaceChildren(thongBao(e.message, true)); }
    } }, 'Xác nhận số đã chọn')), kq);
}

// ------------------------------------------------------------------------------- KỊCH BẢN
async function veKichBan() {
  const d = await api('GET', '/api/kich-ban');
  const sua = h('div');
  const coSua = quyen('sua_kich_ban');
  const bangKb = (ten, phu, set, rows) => h('section', { class: 'the' }, h('h2', {}, ten), h('p', { class: 'phu' }, phu),
    h('div', { class: 'cuon' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Phạm vi'), h('th', { class: 'so' }, 'KHV'), d.thang.map(m => h('th', { class: 'so' }, `Cuối T${m}`)))),
      h('tbody', {}, rows.map(r => h('tr', {}, h('td', {}, r.nhan), h('td', { class: 'so mo' }, trieu(r.khv)),
        r.gia_tri.map((v, i) => h('td', { class: `so${coSua ? ' o-sua' : ''}`, tabindex: coSua ? 0 : null, title: coSua ? 'Bấm để điều chỉnh' : null,
          onclick: coSua ? () => moSua(set, r, d.thang[i], v) : null, onkeydown: coSua ? e => { if (e.key === 'Enter') moSua(set, r, d.thang[i], v); } : null }, v == null ? '–' : trieu(v)))))),
      h('tfoot', {}, h('tr', {}, h('th', {}, 'Cộng'), h('th', { class: 'so' }, trieu(rows.reduce((s, r) => s + r.khv, 0))),
        d.thang.map((m, i) => h('th', { class: 'so' }, trieu(rows.reduce((s, r) => s + (r.gia_tri[i] || 0), 0)))))))));
  function moSua(set, r, m, v) {
    const o = h('input', { type: 'text', value: v == null ? '' : String(Math.round(v / 1e6)), inputmode: 'decimal' });
    const ly = h('input', { type: 'text', size: 40, placeholder: 'Lý do / số văn bản' });
    const kq = h('div');
    sua.replaceChildren(h('section', { class: 'the' }, h('h2', {}, `Điều chỉnh ${r.nhan} · lũy kế cuối T${m}`),
      h('div', { class: 'form-hang' }, h('label', {}, 'Triệu đồng', o), h('label', {}, 'Lý do', ly),
        h('button', { class: 'chinh', onclick: async () => {
          try { const x = await api('PUT', '/api/kich-ban/diem', { set_id: set, scope_id: r.scope_id, month: m, trieu: o.value, ly_do: ly.value }); kq.replaceChildren(thongBao(x.vuot_khv ? 'Đã lưu. Lưu ý: mục tiêu vượt KHV.' : 'Đã lưu.')); setTimeout(veKichBan, 700); }
          catch (e) { kq.replaceChildren(thongBao(e.message, true)); }
        } }, 'Lưu')), kq));
    sua.scrollIntoView({ behavior: 'smooth' });
  }
  const bp = d.bo.find(b => b.level === 'phuong'), bt = d.bo.find(b => b.level === 'thanh_pho');
  noiDung.replaceChildren(
    bangKb('Kế hoạch giải ngân của phường', `${bp?.note || ''} Lũy kế đến cuối tháng, triệu đồng.`, bp?.id, d.phuong),
    bangKb('Kịch bản thành phố giao', `${bt?.note || ''} Theo nguồn vốn, triệu đồng.`, bt?.id, d.thanh_pho), sua,
    h('section', { class: 'the' }, h('h2', {}, 'Lịch sử điều chỉnh gần nhất'), h('p', { class: 'phu' }, 'Không sửa, không xóa được.'),
      h('div', { class: 'cuon' }, h('table', {}, h('tbody', {}, d.lich_su.slice(0, 15).map(c => h('tr', {}, h('td', {}, ngayVN(c.at.slice(0, 10))), h('td', {}, c.actor), h('td', {}, `${c.scope_id} T${c.month}`),
        h('td', { class: 'so' }, `${c.before_amount == null ? 'mới' : trieu(c.before_amount)} → ${trieu(c.after_amount)}`), h('td', { class: 'ghi-chu' }, c.reason))))))));
}

// ------------------------------------------------------------------------------- GIẢI PHÁP
async function veGiaiPhap() {
  const ds = await api('GET', '/api/viec');
  const mo = ds.filter(v => ['mo', 'dang_xu_ly'].includes(v.status)), quaHan = mo.filter(v => v.qua_han);
  const than = h('tbody', {}, ds.map(v => {
    const st = h('select', { disabled: !quyen('cap_nhat_viec') }, Object.entries(S.dm.trang_thai_viec).map(([k, t]) => h('option', { value: k, selected: k === v.status }, t)));
    const kq = h('input', { type: 'text', value: v.result, placeholder: 'Kết quả xử lý', size: 28, disabled: !quyen('cap_nhat_viec') });
    const tb = h('span', { class: 'ghi-chu' });
    return h('tr', {},
      h('td', {}, h('div', { class: 'ten-da' }, v.project_id ? `${v.project_id} · ${v.ten_du_an}` : 'Toàn phạm vi'), h('small', { class: 'ghi-chu' }, v.rule_id ? 'Từ đề xuất tự động' : 'Nhập tay')),
      h('td', {}, h('div', {}, v.problem), h('div', { class: 'ghi-chu' }, v.solution)),
      h('td', {}, v.owner), h('td', { class: v.qua_han ? 'qua-han' : '' }, v.due ? ngayVN(v.due) : '', v.qua_han ? ' · quá hạn' : ''),
      h('td', {}, st), h('td', {}, kq, ' ', quyen('cap_nhat_viec') ? h('button', { class: 'phu nho', onclick: async () => {
        try { await api('PATCH', '/api/viec', { id: v.id, status: st.value, result: kq.value }); tb.textContent = 'Đã lưu'; } catch (e) { tb.textContent = e.message; }
      } }, 'Lưu') : null, ' ', tb));
  }));
  const f = h('form', { class: 'form-hang', onsubmit: async e => {
    e.preventDefault();
    try { await api('POST', '/api/viec', { project_id: f.da.value || null, problem: f.vd.value, solution: f.gp.value, owner: f.dm.value, due: f.han.value }); veGiaiPhap(); }
    catch (er) { alert(er.message); }
  } },
    h('label', {}, 'Dự án', h('select', { name: 'da' }, h('option', { value: '' }, 'Toàn phạm vi'), S.dm.du_an.map(p => h('option', { value: p.id }, `${p.id} · ${p.short_name}`)))),
    h('label', {}, 'Vướng mắc', h('input', { name: 'vd', type: 'text', size: 30, required: true })),
    h('label', {}, 'Giải pháp', h('input', { name: 'gp', type: 'text', size: 30, required: true })),
    h('label', {}, 'Đầu mối', h('input', { name: 'dm', type: 'text', required: true })),
    h('label', {}, 'Hạn', h('input', { name: 'han', type: 'date' })),
    h('button', { class: 'chinh', type: 'submit' }, 'Thêm việc'));
  noiDung.replaceChildren(h('section', { class: 'the' },
    h('h2', {}, `${mo.length} việc đang mở${quaHan.length ? `, ${quaHan.length} quá hạn` : ''}`),
    h('p', { class: 'phu' }, 'Vướng mắc – giải pháp – đầu mối – hạn – kết quả. Đóng việc phải ghi kết quả xử lý. Việc sinh từ đề xuất ở màn hình Điều hành.'),
    quyen('giao_viec') ? f : null,
    ds.length ? h('div', { class: 'cuon' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Dự án'), h('th', {}, 'Vướng mắc / giải pháp'), h('th', {}, 'Đầu mối'), h('th', {}, 'Hạn'), h('th', {}, 'Trạng thái'), h('th', {}, 'Kết quả'))), than))
      : thongBao('Chưa có việc nào. Giao việc từ các đề xuất ở màn hình Điều hành.')));
}

batDau();
