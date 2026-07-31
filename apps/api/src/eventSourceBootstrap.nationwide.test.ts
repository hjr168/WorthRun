import { describe, expect, it } from 'vitest';
import {
  nationwideChinaAthSourceDefinitions,
  v042EventSourceDefinitions,
} from './eventSourceBootstrap.js';

describe('全国中国田协分省来源', () => {
  it('creates one paginated, staggered source per mainland first-phase province', () => {
    const sources = nationwideChinaAthSourceDefinitions();
    expect(sources).toHaveLength(9);
    expect(new Set(sources.flatMap((item) => item.provinceCodes || [])).size).toBe(9);
    expect(sources.every((item) => item.cityHints.length === 0 && item.maxPagesPerRun === 2)).toBe(
      true,
    );
    expect(sources.map((item) => item.notes).join('')).toContain('错峰');
  });

  it('switches the bootstrap target from city sources to nationwide province sources', () => {
    const previous = process.env.NATIONWIDE_DISCOVERY_ENABLED;
    process.env.NATIONWIDE_DISCOVERY_ENABLED = 'true';
    try {
      const sources = v042EventSourceDefinitions();
      expect(sources.filter((item) => item.sourceType === 'chinaath_api')).toHaveLength(9);
      expect(
        sources
          .filter((item) => item.sourceType === 'chinaath_api')
          .every((item) => item.provinceCodes?.length === 1),
      ).toBe(true);
      expect(
        sources
          .filter((item) => item.sourceType === 'chinaath_api')
          .every((item) => item.cityHints.length === 0),
      ).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.NATIONWIDE_DISCOVERY_ENABLED;
      else process.env.NATIONWIDE_DISCOVERY_ENABLED = previous;
    }
  });
});
