module.exports = {
  apps: [
    {
      name: 'rsastore-main',
      script: 'server.js',
      cwd: '/root/newprod/RSAStore',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 33415
      },
      error_file: 'logs/main-error.log',
      out_file: 'logs/main-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    },
    {
      name: 'rsastore-qris',
      script: 'qris-service.py',
      interpreter: 'python3',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      error_file: 'logs/qris-error.log',
      out_file: 'logs/qris-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    },
    {
      name: 'rsastore-whatsapp-bot',
      script: 'bot-whatsapp.js',
      cwd: '/root/newprod/RSAStore',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production'
      },
      error_file: 'logs/whatsapp-bot-error.log',
      out_file: 'logs/whatsapp-bot-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    },
    {
      name: 'rsastore-telegram-bot',
      script: 'bot-telegram.js',
      cwd: '/root/newprod/RSAStore',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production'
      },
      error_file: 'logs/telegram-bot-error.log',
      out_file: 'logs/telegram-bot-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    }
  ]
};
