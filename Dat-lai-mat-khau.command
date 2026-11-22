#!/bin/bash
# Đặt lại mật khẩu một tài khoản của bản v1 (chạy trên máy chủ, không qua mạng).
# Mật khẩu gõ ẩn, không hiện trên màn hình, không lưu lại ở đâu ngoài CSDL (dạng băm).
cd "$(dirname "$0")"
if command -v node >/dev/null 2>&1; then nut="$(command -v node)"
elif [ -x /Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node ]; then nut=/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node
else echo 'Cần cài Node.js 24 trở lên: https://nodejs.org'; read -r -p "Nhấn Enter để đóng." _; exit 1; fi
export DB_PATH="$HOME/Library/Application Support/AnBienGiaiNganV1/giai-ngan.sqlite"
if [ ! -f "$DB_PATH" ]; then echo "Chưa có CSDL bản v1 ($DB_PATH). Bấm đúp Chay.command một lần trước."; read -r -p "Nhấn Enter để đóng." _; exit 1; fi
echo "Các tài khoản hiện có:"
"$nut" src/cli/tai-khoan.mjs liet-ke
echo
read -r -p "Tên đăng nhập cần đặt lại mật khẩu: " ten
echo "Tắt bộ gõ tiếng Việt trước khi gõ mật khẩu (ít nhất 8 ký tự, không dấu)."
read -r -s -p "Mật khẩu mới: " mk1; echo
read -r -s -p "Gõ lại mật khẩu mới: " mk2; echo
if [ "$mk1" != "$mk2" ]; then echo "Hai lần gõ không khớp. Chưa đổi gì."; read -r -p "Nhấn Enter để đóng." _; exit 1; fi
printf '%s\n' "$mk1" | "$nut" src/cli/tai-khoan.mjs dat-mat-khau "$ten" | sed 's/^Mật khẩu mới[^:]*: //'
unset mk1 mk2
read -r -p "Nhấn Enter để đóng." _
