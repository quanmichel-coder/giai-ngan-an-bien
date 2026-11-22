# Bàn giao sang Codex — trạng thái đến 22/11/2026

## 1. Đang có gì

| Hạng mục | Trạng thái |
| --- | --- |
| Bản v1 (thư mục `Giai-Ngan-v1`, cổng 3090) | Hoàn thành, 12/12 kiểm thử đạt (nay 13 bài, thêm bài đăng nhập). Chạy song song bản v0.3 (cổng 3086). |
| Nhập liệu | Tệp Excel bảng điều hành, CSV mẫu chuẩn, nhập tay theo dự án, **Google Sheets tự đồng bộ 18:00 hằng ngày** + nút "Cập nhật từ Google Sheets" ở màn hình Điều hành. |
| Bảng Google Sheets | Đã cập nhật theo QĐ 4800/QĐ-UBND ngày 11/11/2026 (thành phố điều chỉnh vốn 6 dự án NSTP) và QĐ 2232/QĐ-UBND ngày 30/10/2026 (phường điều chỉnh lần 4): 22 dòng vốn / 18 dự án, KIEM_TRA PASS. Số liệu đến hết **Tuần 46 (13/11/2026)**. |
| Báo cáo Phòng Kinh tế | Làm thủ công (Word, thể thức NĐ 30/2020): `Bao-cao-giai-ngan-DTC-2026-tuan-46-ten-day-du.docx`. |

Số liệu mốc Tuần 46 (đối chiếu khi kiểm thử): lũy kế 171.392,971 triệu đồng = 80,0% KHV 214.172,443;
còn 42.779,472. NSTP 111.217,205/150.836,179 (73,7%); phân cấp 44.599,150 (100%); tăng thu 15.576,616/18.737,114 (83,1%).

## 2. Việc đang dở (ưu tiên)

1. **Đăng nhập không được.** Tên đăng nhập chuyển từ v0.3: `kinhte` (Phòng Kinh tế), `quantri`, `lanhdao`,
   `bqlda`, `phoihop` (`kiemtra` đã khóa). Người dùng báo "sai mật khẩu". Nguyên nhân có thể:
   (a) phần mềm chưa chạy / vào nhầm cổng 3086 hoặc http thay vì https (Chay.command bật HTTPS nếu có chứng chỉ);
   (b) bộ gõ tiếng Việt biến ký tự; (c) sai tên đăng nhập.
   Việc cần làm: màn hình đăng nhập hiện rõ địa chỉ đúng và gợi ý tên đăng nhập hợp lệ khi sai tên;
   `Dat-lai-mat-khau.command` (bản trong gói này) đã liệt kê tài khoản trước khi hỏi và gõ mật khẩu ẩn hai lần.
2. **Duyệt thay đổi sau đồng bộ.** Lần đồng bộ đầu sau QĐ 4800 và QĐ 2232 sẽ tự thêm DA14.2, DA18 và để KHV +
   kế hoạch T11/T12 các dòng bị điều chỉnh ở trạng thái "chờ duyệt". Duyệt với lý do
   "Theo QĐ 4800/QĐ-UBND ngày 11/11/2026 và QĐ 2232/QĐ-UBND ngày 30/10/2026". Kiểm tra màn hình chờ duyệt hiển thị rõ.
3. **Xuất báo cáo Word ngay trong phần mềm** (thay làm tay). Mẫu theo báo cáo tuần 46:
   tiêu đề NĐ 30/2020 (UBND phường An Biên / Phòng Kinh tế, Số …/BC-KT); I. Kế hoạch vốn; II. Kết quả
   (chung, Bảng 1 theo nguồn, Bảng 2 theo 18 dự án); III. Đánh giá; IV. Đề xuất, kiến nghị; Nơi nhận; TRƯỞNG PHÒNG.
   Yêu cầu của người dùng: **tên dự án viết đầy đủ, không viết tắt** (THCS → Trung học cơ sở, PCCC → phòng cháy,
   chữa cháy); chỗ liệt kê nhiều dự án đưa xuống **chú thích cuối trang**; trong bảng ghi đủ tên.
   Cần bổ sung trường "tên đầy đủ" (DU_AN cột G) vào bộ đọc và bảng `projects`. Không thêm thư viện ngoài:
   tự sinh `.docx` (zip + XML) hoặc xuất HTML in được.
4. **Vướng mắc, đề xuất** (DU_AN cột Q, R) đang trống → báo cáo chưa nêu được nguyên nhân chậm. Đọc hai cột này vào
   phân hệ Việc (`viec.mjs`) và hiện trên màn hình Giải pháp.
5. **Dự báo cuối năm:** hiển thị thêm phương án ngoại suy theo nhịp 4 tuần gần nhất (T43–T46 bình quân 2.733 triệu/tuần
   → ≈187.792 triệu, 87,7%) và nhịp bình quân từ T26 (4.659 triệu/tuần → ≈199.346, 93,1%); cần 7.130 triệu/tuần.
6. Chênh lệch KHV NSTP của danh mục phường so với số thành phố giao: 16.361,821 triệu đồng — giữ cảnh báo KB1.
7. Năm 2027: đặt `NAM_KE_HOACH=2027`; lịch tuần và bộ kịch bản tự tạo — kiểm thử trước khi sang năm.

## 3. Lưu ý môi trường

- Máy chủ là Mac mini của tác giả; thư mục làm việc trong OneDrive
  (`…/Phòng Kinh tế/Sáng kiến sáng tạo 2026/Sáng kiến 2026 - Quân/Giai-Ngan-v1`). CSDL ngoài OneDrive.
- Gói bàn giao này **không** chứa CSDL, tệp nguồn `.xlsx`, sao lưu, link Google Sheets thật. Bản đầy đủ nằm trên máy chủ.
- Tên dự án đầy đủ (theo DU_AN cột G và phụ lục QĐ 2232) xem trong báo cáo Word tuần 46, Bảng 2.
