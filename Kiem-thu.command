#!/bin/bash
# Chạy bộ kiểm thử tự động của bản v1 (không chạm vào dữ liệu đang dùng).
cd "$(dirname "$0")"
node --test test/*.test.mjs
read -r -p "Nhấn Enter để đóng." _
