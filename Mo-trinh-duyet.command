#!/bin/bash
# Mở bản v1 trên chính máy này.
if [ -f "$(dirname "$0")/../An-Bien-Mac-Hien-Tai/data/chung-chi/may-chu.crt" ]; then open "https://127.0.0.1:3090"; else open "http://127.0.0.1:3090"; fi
