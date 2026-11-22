#!/bin/bash
# Chạy HỆ THỐNG QUẢN LÝ GIẢI NGÂN — BẢN TỐI GIẢN v1 cho cả mạng nội bộ cơ quan.
# Giữ cửa sổ này mở suốt giờ làm việc. Đóng cửa sổ là ứng dụng dừng.
# Bản v0.3 cũ (cổng 3086) vẫn chạy song song được; bản v1 dùng cổng 3090.
set -e
cd "$(dirname "$0")"

if command -v node >/dev/null 2>&1; then nut="$(command -v node)"
elif [ -x /Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node ]; then nut=/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node
else echo 'Cần cài Node.js 24 trở lên: https://nodejs.org'; exit 1; fi

# Cơ sở dữ liệu đang chạy đặt NGOÀI OneDrive (OneDrive đồng bộ lệch tệp -wal làm hỏng CSDL).
export DB_PATH="$HOME/Library/Application Support/AnBienGiaiNganV1/giai-ngan.sqlite"
CU="$HOME/Library/Application Support/AnBienDauTuCong/anbien.sqlite"
mkdir -p "$(dirname "$DB_PATH")" data/sao-luu

# Lần đầu: chép dữ liệu từ bản v0.3 (chỉ đọc bản cũ, không sửa gì) và in bảng đối chiếu tổng số.
if [ ! -f "$DB_PATH" ]; then
  if [ -f "$CU" ]; then
    echo "Lần đầu chạy: chuyển dữ liệu từ bản v0.3…"
    if ! "$nut" src/cli/chuyen-du-lieu.mjs "$CU"; then
      echo "Chuyển dữ liệu có chênh lệch. Đã dừng để kiểm tra; bản v0.3 không bị ảnh hưởng."
      mv "$DB_PATH" "$DB_PATH.chua-khop-$(date +%H%M%S)" 2>/dev/null || true
      read -r -p "Nhấn Enter để đóng." _; exit 1
    fi
  else
    echo "Không thấy dữ liệu bản v0.3. Tạo cơ sở dữ liệu trống; nạp số liệu ở màn hình Nhập liệu."
  fi
fi

# Sao lưu mỗi ngày một bản vào thư mục trong OneDrive, giữ 30 bản.
"$nut" src/cli/sao-luu.mjs data/sao-luu || echo "CẢNH BÁO: không sao lưu được, cần kiểm tra."

# Dùng lại chứng chỉ bảo mật của bản cũ nếu đã tạo.
CC="../An-Bien-Mac-Hien-Tai/data/chung-chi"
if [ -f "$CC/may-chu.crt" ] && [ -f "$CC/may-chu.key" ]; then
  export TLS_CERT="$CC/may-chu.crt" TLS_KEY="$CC/may-chu.key" COOKIE_SECURE=1
fi

export HOST=0.0.0.0 PORT="${PORT:-3090}"
echo
echo "  Lần đầu, máy Mac có thể hỏi cho phép node nhận kết nối mạng — chọn Allow (Cho phép)."
echo
exec caffeinate -i "$nut" src/server.mjs
