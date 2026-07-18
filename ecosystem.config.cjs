module.exports = {
  apps: [
    {
      name: 'worth-running-api',
      script: 'apps/api/dist/apps/api/src/server.js',
      node_args: '--max-old-space-size=256',
      max_memory_restart: '320M',
      env_production: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
      },
    },
  ],
};
