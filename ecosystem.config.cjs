const fs = require('node:fs');
const path = require('node:path');

function readDotEnvValue(name) {
  try {
    const content = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
    const line = content.split(/\r?\n/).find((item) => item.startsWith(`${name}=`));
    return (
      line
        ?.slice(name.length + 1)
        .trim()
        .replace(/^['"]|['"]$/g, '') || ''
    );
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
      script: 'ops/start-api-clean-env.sh',
      interpreter: 'none',
      max_memory_restart: '320M',
      env_production: {
        APP_RELEASE: appRelease,
      },
    },
  ],
};
