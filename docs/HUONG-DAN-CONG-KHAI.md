# Trang báo cáo công khai trên GitHub Pages — hướng dẫn cài đặt

Trang công khai là bản **chỉ đọc** của màn hình Điều hành, mở được ở mọi nơi bằng điện thoại hay máy tính,
không cần đăng nhập. App nội bộ (cổng 3090, nhập liệu, duyệt số, giao việc) vẫn chạy trên Mac mini như cũ.

```
Google Sheets (anh và chuyên viên nhập)
      │  GitHub tự tải bảng mỗi 30 phút (7:00–22:30) — link cất trong "secret", không công khai
      ▼
GitHub Actions: chạy kiểm thử → tính số bằng đúng mã của app nội bộ → xuất trang tĩnh
      ▼
https://<tên-tài-khoản>.github.io/<tên-kho>/   ← ai có địa chỉ đều xem được
```

- Số trên trang lấy **thẳng từ Google Sheets**, không qua bước duyệt của app nội bộ: sửa sheet xong,
  tối đa 30 phút sau trang cập nhật (hoặc bấm chạy ngay, xem mục 4).
- Tải bảng lỗi (mất chia sẻ, sai bố cục) hay kiểm thử không đạt → **trang cũ giữ nguyên**, GitHub gửi thư báo lỗi.
- Kho mã phải để **công khai (Public)** thì GitHub Pages mới miễn phí. Kho mã không chứa CSDL, tệp `.xlsx`,
  sao lưu hay link bảng (đã chặn bằng `.gitignore` và kiểm thử). Tài liệu `AGENTS.md`, `docs/` có tên cơ quan,
  tên chủ dự án và số liệu tổng hợp — xem lại trước khi đưa lên.

## 1. Chuẩn bị bảng Google Sheets (một lần)

Bảng phải tải được mà không cần đăng nhập. Chọn **một** trong hai cách:

- **Nên dùng — "Xuất bản lên web":** Tệp → Chia sẻ → Xuất bản lên web → Toàn bộ tài liệu → Xuất bản.
  Google cho một link dạng `docs.google.com/spreadsheets/d/e/2PACX-…/pubhtml`. Link này **chỉ xem**, khác hẳn link
  nhập liệu, lộ ra cũng không sửa được bảng. Quyền chia sẻ chỉnh sửa của bảng vẫn giữ nguyên (chỉ anh và chuyên viên).
- Hoặc để chế độ chia sẻ hiện tại "Bất kỳ ai có đường liên kết – Người xem" và dùng link thường của bảng.

## 2. Tạo tài khoản và kho mã GitHub (một lần)

1. Vào github.com, tạo tài khoản (nên dùng email công vụ). Anh tự đặt mật khẩu và bật xác thực hai bước.
2. Cài **GitHub Desktop** (desktop.github.com), đăng nhập tài khoản vừa tạo.
3. GitHub Desktop → File → Add Local Repository → chọn thư mục mã nguồn này → Publish repository:
   đặt tên kho (ví dụ `giai-ngan-an-bien`), **bỏ chọn** "Keep this code private" → Publish.

## 3. Gắn link bảng và bật trang (một lần, trên github.com)

1. Mở kho vừa tạo → **Settings → Secrets and variables → Actions → New repository secret**:
   Name: `GSHEETS_URL`, Secret: dán link ở mục 1 → Add secret.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Thẻ **Actions** → chọn "Trang công khai" → **Run workflow**. Chờ khoảng 1–2 phút, dấu xanh là xong.
   Địa chỉ trang hiện ở Settings → Pages (dạng `https://<tên-tài-khoản>.github.io/giai-ngan-an-bien/`).

## 4. Dùng hằng ngày

- Không phải làm gì: trang tự cập nhật mỗi 30 phút từ 7:00 đến 22:30.
- Cần cập nhật ngay (trước cuộc họp): Actions → Trang công khai → Run workflow.
- Gửi đúng góc nhìn cho người khác: chọn kỳ và nguồn vốn trên trang rồi sao chép địa chỉ
  (dạng `…/#tuan=2026-T46&nguon=NSTP`).
- GitHub tự tắt lịch chạy nếu kho mã **60 ngày** không có thay đổi nào; khi đó vào Actions bấm "Enable workflow".

## 5. Cập nhật mã

Sửa mã trong thư mục này → GitHub Desktop → Commit → Push origin. GitHub chạy kiểm thử và đăng lại trang.
App nội bộ trên Mac mini cập nhật riêng như trước (chép tệp, bấm đúp `Khoi-dong-lai.command`).

## Chạy thử trên máy

```
node src/cli/xuat-cong-khai.mjs /tmp/trang --tep data/nguon-ban-chinh-thuc-02.10.2026.xlsx
python3 -m http.server 3092 --directory /tmp/trang      # mở http://127.0.0.1:3092
```
