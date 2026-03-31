module.exports = {
  apps: [
    {
      name: 'nexus-whatsapp',
      cwd: __dirname,
      script: 'npm',
      args: 'run start',
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
      },
      autorestart: true,
      max_restarts: 10,
      time: true,
    },
  ],
};
