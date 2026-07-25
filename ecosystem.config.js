/**
 * ⚔️ Blade PM2 集群配置
 *
 * 用法：
 *   pm2 start ecosystem.config.js          # 启动
 *   pm2 restart ecosystem.config.js        # 重启
 *   pm2 stop ecosystem.config.js           # 停止
 *   pm2 logs blade                         # 查看日志
 *
 * 环境变量：
 *   PORT         服务端口（默认 3001）
 *   BLADE_PROVIDER  AI 提供商
 *   BLADE_MODEL    模型名称
 *   BLADE_API_KEY  API 密钥
 */

module.exports = {
  apps: [
    {
      name: 'blade',
      script: 'web/server/src/index.ts',
      interpreter: 'bun',
      instances: 2,
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '1G',
      env: {
        PORT: 3001,
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
      },
      env_production: {
        PORT: 3001,
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
      },
      error_file: 'logs/blade-error.log',
      out_file: 'logs/blade-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      // 健康检查
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 5000,
    },
  ],
};
