#!/bin/bash
# ⚔️ Blade — 生产环境启动脚本
# 用法: ./scripts/start.sh [prod|dev]

set -e

MODE="${1:-prod}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

cd "$ROOT_DIR"

echo "⚔️ Blade Server — $MODE mode"
echo "──────────────────────────────"

case "$MODE" in
  prod)
    # 确保前端已构建
    if [ ! -d "web/frontend/dist" ]; then
        echo "Building frontend..."
        cd web/frontend && npm run build && cd "$ROOT_DIR"
    fi

    # 使用 PM2 启动
    echo "Starting with PM2..."
    pm2 start ecosystem.config.js --env production
    pm2 save
    echo ""
    echo "  PM2 status: pm2 status"
    echo "  Logs:       pm2 logs blade"
    echo "  Stop:       pm2 stop blade"
    ;;

  dev)
    echo "Starting dev server on :3001..."
    echo "Frontend proxy: /api -> localhost:3001"
    echo ""
    bun run web/server/src/index.ts &
    SERVER_PID=$!

    cd web/frontend
    bun run dev &
    FRONTEND_PID=$!

    cd "$ROOT_DIR"
    echo "Server PID: $SERVER_PID"
    echo "Frontend PID: $FRONTEND_PID"
    echo "Press Ctrl+C to stop both"

    wait
    ;;

  *)
    echo "Usage: $0 [prod|dev]"
    exit 1
    ;;
esac
