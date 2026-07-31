import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { supportedRegions } from './region.js';

describe('地区目录与迁移回填一致', () => {
  it('contains every supported city code in event, candidate and preference backfill data', () => {
    const migration = readFileSync(resolve(process.cwd(), 'packages/database/prisma/migrations/20260730090000_nationwide_regions_media_editorial/migration.sql'), 'utf8');
    for (const region of supportedRegions) {
      const row = `('${region.cityName}','${region.provinceCode}','${region.cityCode}')`;
      expect(migration.split(row).length - 1, `${region.cityName} ${region.cityCode}`).toBeGreaterThanOrEqual(3);
    }
  });
});
