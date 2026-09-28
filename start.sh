#!/usr/bin/env bash
# ============================================================
# start.sh — 启动 NovelFish
#   ./start.sh         起本地服务并打开浏览器（推荐）
#   ./start.sh 9000    指定端口
# 也可以直接双击 index.html —— file:// 下全部功能可用
# （皮肤脚本与样式由 JS 动态注入，不受 file:// 跨域限制）
# ============================================================
set -euo pipefail
cd "$(dirname "$0")"

PORT="${1:-8931}"
PY="$(command -v python3 || true)"

if [ -z "${PY}" ]; then
  echo "未找到 python3，直接双击 index.html 亦可使用" >&2
  exit 1
fi

URL="http://127.0.0.1:${PORT}/"
echo "NovelFish 已启动：${URL}"
echo "按 Ctrl+C 停止。"

"${PY}" -m http.server "${PORT}" --bind 127.0.0.1 >/dev/null 2>&1 &
SRV=$!
trap 'kill ${SRV} 2>/dev/null || true' INT TERM EXIT

sleep 0.8
if command -v open >/dev/null 2>&1; then
  open "${URL}"
fi

wait "${SRV}"
