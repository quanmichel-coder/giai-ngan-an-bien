// Trang báo cáo CÔNG KHAI, chỉ đọc: tải số đã tính sẵn (du-lieu/*.json) và vẽ bằng đúng màn hình Điều hành
// của app nội bộ. Không có đăng nhập, không có nhập liệu, không gọi tới Google Sheets.
import { h } from './dinh-dang.js';
import { veDieuHanhVao } from './man-dieu-hanh.js';

const app = document.getElementById('app');
const layJson = async ten => {
  const r = await fetch(`du-lieu/${ten}`, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`Không tải được số liệu (${r.status}).`);
  return r.json();
};
const thoiDiem = iso => new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });

// Bộ lọc nằm trên địa chỉ trang (…#tuan=2026-T46&nguon=NSTP) để gửi đường liên kết cho người khác.
const docDiaChi = () => Object.fromEntries(new URLSearchParams(location.hash.slice(1)));

async function ve(mucLuc) {
  const q = docDiaChi();
  const loc = {
    tuan: mucLuc.tuan.includes(q.tuan) ? q.tuan : mucLuc.mac_dinh.tuan,
    nguon: mucLuc.nguon.includes(q.nguon) ? q.nguon : mucLuc.mac_dinh.nguon
  };
  const d = await layJson(`${loc.tuan}_${loc.nguon}.json`);
  const noiDung = h('main');
  const dau = h('header', { class: 'dau' },
    h('div', { class: 'ten-app' }, 'Tình hình giải ngân vốn đầu tư công', h('small', {}, `UBND phường An Biên · năm ${mucLuc.nam}`)),
    h('div', { class: 'nguoi' }, `Cập nhật lúc ${thoiDiem(mucLuc.cap_nhat_luc)}`));
  const chan = h('footer', { class: 'chan-cong-khai ghi-chu' },
    'Trang chỉ đọc, số liệu tự lấy từ bảng theo dõi giải ngân của Phòng Kinh tế, UBND phường An Biên. Đơn vị tiền: triệu đồng.');
  app.replaceChildren(dau, noiDung, chan);
  veDieuHanhVao(noiDung, d, {
    noiChay: 'bảng theo dõi của Phòng Kinh tế',
    chonLoc: (loai, id) => { const m = { ...loc, [loai]: id }; location.hash = new URLSearchParams(m).toString(); }
  });
  document.title = `Giải ngân ĐTC ${d.ky.nhan.toLowerCase()} · ${d.pham_vi.ten} · Phường An Biên`;
}

async function batDau() {
  try {
    const mucLuc = await layJson('muc-luc.json');
    await ve(mucLuc);
    window.onhashchange = () => ve(mucLuc).catch(loi);
  } catch (e) { loi(e); }
}
const loi = e => app.replaceChildren(h('div', { class: 'thong-bao loi', role: 'alert' }, e.message || 'Không tải được trang.'));
batDau();
