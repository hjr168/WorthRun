import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

type EcosystemConfig = {
  apps: Array<{
    name: string;
    cwd?: string;
    node_args?: string;
    env_production?: Record<string, string>;
  }>;
};

const require = createRequire(import.meta.url);

describe('production runtime config', () => {
  it('loads the server-managed .env file on every PM2 start or reload', () => {
    const config = require('../../../ecosystem.config.cjs') as EcosystemConfig;
    const api = config.apps.find((app) => app.name === 'worth-running-api');

    expect(api?.cwd).toBeTruthy();
    expect(api?.node_args?.split(/\s+/)).toContain('--env-file=.env');
    expect(api?.env_production?.APP_RELEASE).toBeUndefined();
  });
});
