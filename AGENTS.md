# AGENTS.md — Hệ thống quản lý giải ngân vốn đầu tư công (bản v1)

UBND phường An Biên · Phòng Kinh tế. Chủ dự án: Vũ Minh Quân (Phó Trưởng phòng Kinh tế).
Phần mềm nội bộ trả lời ba câu hỏi điều hành: **đã giải ngân bao nhiêu so với kịch bản**,
**dự án nào đang kéo chậm**, **tuần này cần làm gì**. Trạng thái hiện tại và việc còn dở: `docs/BAN-GIAO.md`.

Trả lời người dùng bằng tiếng Việt, văn phong hành chính, ngắn gọn. Số tiền hiển thị theo
triệu đồng, dấu chấm phân cách nghìn, dấu phẩy thập phân (171.392,971).

## Chạy và kiểm thử

- Node.js ≥ 22.5, không có thư viện ngoài (không `npm install`). Máy chủ thật: Mac mini, Node 24.
  Với Node 22 phải thêm `--experimental-sqlite`.
- Kiểm thử: `node --experimental-sqlite --test test/*.test.mjs` (14 bài). Thiếu tệp
  `data/nguon-ban-chinh-thuc-02.10.2026.xlsx` thì 7 bài tự bỏ qua — tệp này có trên máy chủ,
  không đưa vào kho mã.
- Chạy thử trên máy phát triển: `DB_PATH=/tmp/thu.sqlite PORT=3090 node --experimental-sqlite src/server.mjs`
  rồi mở http://127.0.0.1:3090. Tạo tài khoản thử: `DB_PATH=/tmp/thu.sqlite node src/cli/tai-khoan.mjs them thu "Thử" kinhte`.
- Trên máy chủ: `Chay.command` (chạy), `Khoi-dong-lai.command` (sau khi cập nhật mã),
  `Kiem-thu.command`, `Dat-lai-mat-khau.command`. CSDL đang chạy:
  `~/Library/Application Support/AnBienGiaiNganV1/giai-ngan.sqlite`.
  Nếu có chứng chỉ `../An-Bien-Mac-Hien-Tai/data/chung-chi/` thì máy chủ chạy **HTTPS** (địa chỉ `https://…:3090`).

## Cấu trúc

```
config/nguong.json           Ngưỡng cảnh báo có phiên bản (sửa số ở đây, không sửa mã)
config/google-sheets.json    Link bảng Google Sheets để tự đồng bộ (gói bàn giao để trống)
src/core/                    hang-so (năm, nguồn vốn, GIO_CAP_NHAT=18:00), schema.sql (16 bảng), db, quyen
src/nguon/                   Bộ chuyển nguồn → "gói dữ liệu chuẩn" (goi.mjs): excel, xlsx (tự viết), csv, tay, google-sheets
src/nghiep-vu/nhap.mjs       MỘT CỬA nhập: xem trước → ghi → xác nhận; đối chiếu mới/trùng/làm tròn/lệch
src/nghiep-vu/tong-hop.mjs   Đọc một lần, cộng ra mọi số của màn hình Điều hành; dự báo theo dự án
src/nghiep-vu/de-xuat.mjs    Quy tắc cảnh báo – đề xuất (chạy tại chỗ)
src/nghiep-vu/kich-ban.mjs   Kịch bản phường (theo dòng vốn) và thành phố (theo nguồn)
src/nghiep-vu/viec.mjs       Vướng mắc – giải pháp – đầu mối – hạn – kết quả
src/nghiep-vu/dong-bo.mjs    Tự đồng bộ Google Sheets 18:00 hằng ngày + nút bấm; số khác số cũ → chờ duyệt
src/server.mjs               Định tuyến HTTP mỏng (/api/...), CSP chặt, cookie phiên + CSRF
src/cli/                     chuyen-du-lieu (từ bản v0.3), tai-khoan, sao-luu, xuat-cong-khai (trang công khai)
public/                      SPA thuần: app.js (4 màn hình), man-dieu-hanh.js (màn hình Điều hành dùng chung),
                             bieu-do.js (SVG), dinh-dang.js, style.css
cong-khai/                   Trang báo cáo công khai chỉ đọc (index.html, cong-khai.js) — vẽ bằng man-dieu-hanh.js
.github/workflows/           cong-khai.yml: mỗi 30 phút tải Google Sheets → kiểm thử → xuất → đăng GitHub Pages
test/v1.test.mjs             Kiểm thử nghiệp vụ, phân quyền, HTTP, đồng bộ
```

Mở rộng: nguồn nhập mới = thêm `src/nguon/<ten>.mjs` + đăng ký trong `index.mjs`; quy tắc mới =
thêm hàm vào `QUY_TAC` trong `de-xuat.mjs`; phân hệ mới = bảng trong `schema.sql` + một tệp nghiệp vụ + vài tuyến.

## Quy ước mã

- ES modules `.mjs`, tên hàm/biến tiếng Việt không dấu (`tongHop`, `xemTruoc`, `dongBo`).
- Tiền lưu bằng **đồng** (số nguyên); tệp nguồn ghi triệu đồng → nhân 1.000.000 khi đọc (`DONG()`).
  Chênh lệch < 1.000 đ là làm tròn, không phải sai lệch (`LAM_TRON`).
- Tháng của một tuần = tháng của **ngày kết thúc** tuần (tuần vắt năm tính tháng 12).
- Cột "Cuối T6" của kế hoạch phường là **mốc nền** (số thực tế), không phải chỉ tiêu.
- Giao diện: CSP không cho `style` inline hay script inline — đặt kích thước bằng JS (CSSOM) hoặc class; màu SVG bằng class.
- Đường dẫn có dấu tiếng Việt: dùng `fileURLToPath`, không dùng `new URL().pathname`; khối chạy chính so
  `realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))`.
- Tệp `.command` phải giữ quyền thực thi (`chmod +x`).

## Ràng buộc bắt buộc — không được vi phạm

1. **Không gọi dịch vụ ngoài khi phân tích.** `de-xuat.mjs`, `tong-hop.mjs` không được chứa `fetch(`,
   `http://`, `https://`, `node:http`, `axios`, `openai` (có kiểm thử chặn). Nơi duy nhất được ra mạng:
   `src/nguon/google-sheets.mjs` tải bảng Google Sheets của cơ quan.
2. **Không ghi đè âm thầm.** Số khác số đã có → giữ số cũ, chờ Phòng Kinh tế duyệt kèm lý do; kỳ đã khóa
   sổ không đổi; nhật ký chỉ ghi thêm, không sửa/xóa.
3. **App nội bộ chỉ chạy trong mạng nội bộ.** Không mở cổng 3090 ra Internet, không ngrok / Cloudflare Tunnel.
   Số liệu giải ngân là thông tin công khai (chủ dự án quyết định 22/11/2026): được đăng **trang chỉ đọc** lên
   GitHub Pages qua `src/cli/xuat-cong-khai.mjs` + `.github/workflows/cong-khai.yml` (`docs/HUONG-DAN-CONG-KHAI.md`).
   Trang công khai không có đăng nhập, nhập liệu hay link bảng; link bảng chỉ nằm trong secret `GSHEETS_URL`.
4. **Tài khoản:** mỗi người một tài khoản; chuyển công tác thì khóa, không xóa. Không in, không ghi mật khẩu
   vào mã, log, tài liệu, kiểm thử hay câu trả lời.
5. **CSDL đang chạy để ngoài OneDrive.** Khi thay tệp CSDL luôn xóa kèm `-wal` và `-shm`.
6. **Không đưa dữ liệu thật vào kho mã hay lên dịch vụ AI:** `*.sqlite*`, `data/sao-luu/`, tệp nguồn `.xlsx`,
   link Google Sheets thật, số liệu tài khoản. Dùng dữ liệu giả trong kiểm thử.
7. **Không động vào bản v0.3** (`../An-Bien-Mac-Hien-Tai/`, cổng 3086): kết quả kiểm định đã in trong hồ sơ
   sáng kiến phải giữ nguyên.
8. Mọi thay đổi nghiệp vụ kèm kiểm thử; toàn bộ kiểm thử phải đạt trước khi bàn giao.

## Bố cục bảng Google Sheets mà bộ đọc dựa vào

Bảng "Giải ngân 2026 - bản chính thức" (6 sheet: DASHBOARD, NHAP_LIEU, DU_AN, KIEM_TRA, HUONG_DAN, TINH_TOAN).
Phần mềm chỉ đọc **DU_AN** và **NHAP_LIEU** (`src/nguon/excel.mjs`, nhận diện theo tiêu đề, không theo vị trí cố định):

- **DU_AN:** hàng tiêu đề có ô "Mã dòng" ở cột A; mỗi dòng vốn một hàng cho đến hàng bắt đầu bằng "TỔNG".
  A mã dòng (DA01, DA14.2, DA15.1…), B mã dự án, C tên rút gọn, D nguồn vốn ("NS thành phố" / "NS phân cấp phường" /
  "Tăng thu dự toán"), E nhãn, F nhóm, G tên dự án đầy đủ, H KHV 2026, I…O "Cuối T6"…"Cuối T12" (lũy kế kế hoạch phường),
  P đơn vị, Q vướng mắc, R đề xuất. Bên dưới: khối kịch bản thành phố theo nguồn (hàng tiêu đề "Nguồn vốn").
- **NHAP_LIEU:** hàng tiêu đề "Tuần"; từ cột D mỗi cột một dòng vốn (mã dạng `DA\d+(\.\d+)?`); các hàng
  "KHV 2026", "Mốc nền" (đến 19/6), "Tuần 26"…"Tuần 53", "LŨY KẾ". Ô trống = chưa có số; tuần đã chốt nhập 0.
- Hiện có **22 dòng vốn / 18 dự án** (KHV 214.172,442878 triệu đồng). Bảng có động cơ công thức riêng
  (TINH_TOAN, KIEM_TRA phải "MODEL STATUS: PASS"); thêm dòng vốn phải chèn hàng/cột *bên trong* các vùng để công thức tự giãn.
