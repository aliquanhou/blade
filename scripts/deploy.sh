#!/bin/bash
# ⚔️ Blade — 自动化部署脚本
#
# 用法:
#   ./scripts/deploy.sh                        # 默认部署
#   ./scripts/deploy.sh /path/to/blade         # 指定部署路径
#
# 前置条件:
#   - 服务器已安装 Node.js >= 18, bun, pm2, nginx
#   - 域名 DNS 已指向服务器
#   - 已配置 ssh 免密登录

set -e

DEPLOY_DIR="${1:-/opt/blade}"
REPO_URL="https://github.com/yuqiuhong/blade.git"
BRANCH="main"

echo "⚔️ Blade Deployment"
echo "────────────────────"
echo "  Target: $DEPLOY_DIR"
echo "  Branch: $BRANCH"
echo ""

# 1. Clone / Pull
if [ -d "$DEPLOY_DIR/.git" ]; then
    echo "📦 Pulling latest code..."
    cd "$DEPLOY_DIR"
    git fetch origin
    git reset --hard "origin/$BRANCH"
else
    echo "📦 Cloning repository..."
    git clone --depth 1 -b "$BRANCH" "$REPO_URL" "$DEPLOY_DIR"
    cd "$DEPLOY_DIR"
fi

# 2. Build backend
echo ""
echo "🔨 Building engine..."
bun install --frozen-lockfile 2>/dev/null || true
bun run build 2>/dev/null || echo "  (build skipped, bun run works directly)"

# 3. Build frontend
echo ""
echo "🔨 Building frontend..."
cd web/frontend
bun install --frozen-lockfile 2>/dev/null || npm install --frozen-lockfile 2>/dev/null || true
bun run build 2>/dev/null || npm run build
cd "$DEPLOY_DIR"

# 4. Configure Nginx
echo ""
echo "🔧 Configuring Nginx..."
if [ -f "/etc/nginx/sites-enabled/default" ]; then
    sudo rm -f /etc/nginx/sites-enabled/default
fi

sudo cp "$DEPLOY_DIR/nginx.conf" /etc/nginx/sites-enabled/blade
echo "  ⚠️  Edit /etc/nginx/sites-enabled/blade to set your domain name and SSL cert paths"
echo "  Then run: sudo certbot --nginx -d your-domain.com"
echo "  Then run: sudo nginx -s reload"

# 5. Start with PM2
echo ""
echo "🚀 Starting with PM2..."
pm2 delete blade 2>/dev/null || true
pm2 start "$DEPLOY_DIR/ecosystem.config.js" --env production
pm2 save

echo ""
echo "✅ Deployment complete!"
echo ""
echo "  Server:  http://localhost:3001"
echo "  PM2:     pm2 status"
echo "  Logs:    pm2 logs blade"
echo ""
echo "  Next steps:"
echo "    1. Configure DNS for your domain"
echo "    2. Set up SSL with certbot"
echo "    3. Update nginx.conf with your domain"
echo "    4. sudo nginx -s reload"
