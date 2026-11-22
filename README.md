# Hệ thống quản lý giải ngân vốn đầu tư công — bản tối giản v1

UBND phường An Biên · chỉ chạy trong mạng nội bộ · Node.js 24, SQLite có sẵn, không thư viện ngoài.

Trả lời ba câu hỏi điều hành: **đã giải ngân bao nhiêu so với kịch bản**, **dự án nào đang kéo chậm**,
**tuần này cần làm gì**. Mọi phần khác (gói thầu, GPMB, nghiệm thu, hồ sơ…) để ngoài, có cổng mở rộng.

## Chạy

| Việc | Cách làm |
| --- | --- |
| Chạy cho cả mạng cơ quan | Bấm đúp `Chay.command` (lần đầu tự chuyển dữ liệu từ bản v0.3 và in bảng đối chiếu) |
| Mở trên máy này | Bấm đúp `Mo-trinh-duyet.command` → http://127.0.0.1:3090 |
| Máy khác cùng mạng | Mở địa chỉ `http://<IP máy chủ>:3090` in trong cửa sổ chạy |
| Kiểm thử tự động | Bấm đúp `Kiem-thu.command` (10 bài kiểm thử) |
| Tài khoản | `DB_PATH=… node src/cli/tai-khoan.mjs liet-ke \| them \| dat-mat-khau \| phan-cong \| khoa \| mo` |

Tài khoản và mật khẩu chuyển nguyên từ bản v0.3. Vai trò: `kinhte` (Phòng Kinh tế), `bql` (Ban QLDA),
`lanhdao` (Lãnh đạo), `admin`. Cơ sở dữ liệu đang chạy: `~/Library/Application Support/AnBienGiaiNganV1/`
(ngoài OneDrive); sao lưu hằng ngày ở `data/sao-luu/` (trong OneDrive, giữ 30 bản).

## Nhập từ Google Sheets (tự đồng bộ)

Nhập liệu → thẻ **Google Sheets**: dán đường liên kết (hoặc ghi vào `config/google-sheets.json`), bấm *Kết nối và đọc lần đầu*.
Máy chủ tự lấy số **lúc 18:00 hằng ngày** (máy tắt lúc đó thì lấy bù khi mở lại; đổi giờ ở `GIO_CAP_NHAT`
trong `src/core/hang-so.mjs`), và lấy ngay khi bấm nút **Cập nhật từ Google Sheets** ở màn hình Điều hành. Không mở cổng ra ngoài. Số mới tự ghi; số khác số đã có thì
giữ số cũ, hiện danh sách chờ để Phòng Kinh tế *Duyệt* (kèm lý do) hoặc *Bỏ qua*. Kỳ đã khóa sổ không bị đổi.
Bảng phải giữ bố cục tệp Excel bảng điều hành (sheet NHAP_LIEU + DU_AN) và bật chia sẻ
"Bất kỳ ai có đường liên kết – Người xem". Sau khi cập nhật phần mềm: bấm đúp `Khoi-dong-lai.command`.

## Cấu trúc

```
config/nguong.json        Ngưỡng cảnh báo có phiên bản (sửa số ở đây, không sửa mã)
src/core/                 Lõi: hằng số, lược đồ 16 bảng, kết nối CSDL, đăng nhập – phân quyền
src/nguon/                Bộ chuyển nguồn → GÓI DỮ LIỆU CHUẨN (excel, csv, tay); thêm nguồn = thêm 1 tệp
src/nghiep-vu/nhap.mjs    Một cửa nhập: xem trước → ghi; không ghi đè âm thầm; xác nhận
src/nghiep-vu/tong-hop.mjs  Đọc một lần, cộng ra mọi số của bảng điều hành, dự báo
src/nghiep-vu/de-xuat.mjs   Quy tắc cảnh báo – đề xuất giải pháp (chạy tại chỗ)
src/nghiep-vu/kich-ban.mjs  Kịch bản phường (theo dòng vốn) và thành phố (theo nguồn)
src/nghiep-vu/viec.mjs      Vướng mắc – giải pháp – đầu mối – hạn – kết quả
src/nghiep-vu/dong-bo.mjs   Tự đồng bộ định kỳ từ Google Sheets (src/nguon/google-sheets.mjs)
src/server.mjs            Định tuyến HTTP mỏng
src/cli/                  chuyen-du-lieu, tai-khoan, sao-luu
public/                   Giao diện: app.js (4 màn hình), bieu-do.js (SVG), dinh-dang.js, style.css
test/v1.test.mjs          Kiểm thử: khớp số T40, không ghi đè, phân quyền, kịch bản, đề xuất, HTTP
```

## Mở rộng

- **Nguồn nhập mới** (phần mềm kế toán, số liệu Kho bạc…): thêm `src/nguon/<ten>.mjs` có `moTa`, `nhanDang`,
  `doc()` trả về gói dữ liệu chuẩn (mô tả ở `src/nguon/goi.mjs`), đăng ký trong `src/nguon/index.mjs`.
- **Quy tắc đề xuất mới**: thêm một hàm vào mảng `QUY_TAC` trong `de-xuat.mjs`, ngưỡng đặt ở `config/nguong.json`.
- **Phân hệ mới** (ví dụ gói thầu): thêm bảng vào `schema.sql`, một tệp `src/nghiep-vu/<ten>.mjs`, vài tuyến trong
  `server.mjs`. Lõi và các phân hệ khác giữ nguyên.
- **Năm kế hoạch mới**: đặt `NAM_KE_HOACH=2027`; lịch tuần và bộ kịch bản của năm tự tạo.
