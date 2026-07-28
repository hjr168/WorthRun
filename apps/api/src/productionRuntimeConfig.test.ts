import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

type EcosystemConfig = {
  apps: Array<{
    name: string;
    cwd?: string;
    script?: string;
    interpreter?: string;
    env_production?: Record<string, string>;
  }>;
};

const require = createRequire(import.meta.url);

describe('production runtime config', () => {
  it('starts the API through the clean environment wrapper', () => {
    const config = require('../../../ecosystem.config.cjs') as EcosystemConfig;
    const api = config.apps.find((app) => app.name === 'worth-running-api');

    expect(api?.cwd).toBeTruthy();
    expect(api?.script).toBe('ops/start-api-clean-env.sh');
    expect(api?.interpreter).toBe('none');
    expect(api?.env_production?.APP_RELEASE).toBeTruthy();
    const wrapper = readFileSync('ops/start-api-clean-env.sh', 'utf8');
    expect(wrapper).toContain('exec env -i');
    expect(wrapper).toContain('/usr/bin/node --env-file=.env');
  });
});
