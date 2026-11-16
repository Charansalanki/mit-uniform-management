module.exports = {
  apps: [
    {
      name: 'mit-uniform-backend',
      script: 'index.js',
      cwd: __dirname,
      instances: 1, // Single instance required for SQLite WAL concurrency safety
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 4000
      }
    }
  ]
};
