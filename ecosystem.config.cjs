const fs = require('node:fs');
const path = require('node:path');

function readDotEnvValue(name) {
  try {
    const content = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
    const line = content.split(/\r?\n/).find((item) => item.startsWith(`${name}=`));
    return line?.slice(name.length + 1).trim().replace(/^['"]|['"]$/g, '') || '';
  } catch {
    return '';
  }
}

const appRelease = process.env.APP_RELEASE || readDotEnvValue('APP_RELEASE') || 'unknown';

module.exports = {
  apps: [
    {
      name: 'worth-running-api',
      cwd: __dirname,
      script: 'apps/api/dist/apps/api/src/server.js',
      // Keep runtime-only secrets in the server-managed .env file. Loading it
      // here makes PM2 reloads deterministic instead of depending on whichever
      // variables happened to be exported in the operator shell.
      node_args: '--env-file=.env --max-old-space-size=256',
      max_memory_restart: '320M',
      env_production: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        APP_RELEASE: appRelease,
      },
    },
  ],
};
