#!/bin/bash
# Dừng bản v1 đang chạy (cổng 3090) rồi chạy lại với mã mới. Bản v0.3 (cổng 3086) không bị ảnh hưởng.
cd "$(dirname "$0")"
PORT="${PORT:-3090}"
cu="$(lsof -ti tcp:"$PORT" -sTCP:LISTEN 2>/dev/null)"
if [ -n "$cu" ]; then echo "Dừng bản đang chạy (tiến trình $cu)…"; kill $cu; sleep 2; fi
exec ./Chay.command
