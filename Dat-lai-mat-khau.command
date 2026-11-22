#!/bin/bash
# Đặt lại mật khẩu một tài khoản của bản v1 (chạy trên máy chủ, không qua mạng).
cd "$(dirname "$0")"
if command -v node >/dev/null 2>&1; then nut="$(command -v node)"
elif [ -x /Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node ]; then nut=/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node
else echo 'Cần cài Node.js 24 trở lên.'; read -r -p "Nhấn Enter để đóng." _; exit 1; fi
export DB_PATH="$HOME/Library/Application Support/AnBienGiaiNganV1/giai-ngan.sqlite"
if [ ! -f "$DB_PATH" ]; then
  echo "Chưa có dữ liệu bản v1. Hãy bấm đúp Chay.command trước (lần đầu nó chuyển tài khoản từ bản cũ)."
  read -r -p "Nhấn Enter để đóng." _; exit 1
fi
echo "Các tài khoản hiện có:"
"$nut" src/cli/tai-khoan.mjs liet-ke 2>/dev/null
echo
read -r -p "Tên đăng nhập cần đặt lại [kinhte]: " ten; ten="${ten:-kinhte}"
echo "TẮT bộ gõ tiếng Việt (chuyển sang ABC) trước khi gõ mật khẩu."
read -r -s -p "Mật khẩu mới (ít nhất 8 ký tự, chữ không dấu): " mk; echo
read -r -s -p "Gõ lại mật khẩu mới: " mk2; echo
if [ "$mk" != "$mk2" ]; then echo "Hai lần gõ không khớp. Chưa đổi gì."; read -r -p "Nhấn Enter để đóng." _; exit 1; fi
printf '%s\n' "$mk" | "$nut" src/cli/tai-khoan.mjs dat-mat-khau "$ten" 2>/dev/null | sed 's/^Mật khẩu mới.*: //'
read -r -p "Nhấn Enter để đóng." _
