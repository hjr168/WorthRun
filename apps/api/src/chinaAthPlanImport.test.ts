import { describe, expect, it } from 'vitest';
import { buildChinaAthPlan2026Candidates, chinaAthPlan2026Records } from './chinaAthPlan2026.js';
import { runChinaAthPlanImport } from './chinaAthPlanImport.js';
import { parseChinaAthPlanImportArgs } from './chinaAthPlanImportCli.js';

describe('China Athletics annual plan import', () => {
  it('contains the reviewed 14 records with 8 complete and 6 missing dates', () => {
    expect(chinaAthPlan2026Records).toHaveLength(14);
    expect(chinaAthPlan2026Records.filter((item) => item.eventDate)).toHaveLength(8);
    expect(chinaAthPlan2026Records.filter((item) => !item.eventDate)).toHaveLength(6);
    expect(
      new Set(buildChinaAthPlan2026Candidates().map((item) => item.sourceExternalId)).size,
    ).toBe(14);
  });

  it('dry-runs without touching the database and protects the expected count', async () => {
    await expect(runChinaAthPlanImport({ year: 2026, dryRun: true })).resolves.toMatchObject({
      expected: 14,
      completeDates: 8,
      missingDates: 6,
    });
    await expect(
      runChinaAthPlanImport({ year: 2026, dryRun: false, expected: 13 }),
    ).rejects.toThrow('预期数量不一致');
  });

  it('requires an expected count for apply', () => {
    expect(parseChinaAthPlanImportArgs(['--year', '2026'])).toEqual({
      year: 2026,
      dryRun: true,
      expected: undefined,
    });
    expect(() => parseChinaAthPlanImportArgs(['--apply'])).toThrow('--expected');
    expect(parseChinaAthPlanImportArgs(['--year=2026', '--apply', '--expected=14'])).toEqual({
      year: 2026,
      dryRun: false,
      expected: 14,
    });
  });
});
