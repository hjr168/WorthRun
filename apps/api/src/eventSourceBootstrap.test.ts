import { describe, expect, it } from 'vitest';
import { v042EventSourceDefinitions } from './eventSourceBootstrap.js';

describe('V0.4.2 event source definitions', () => {
  it('creates nine city sources and four supplemental sources within memory limits', () => {
    const definitions = v042EventSourceDefinitions();
    expect(definitions).toHaveLength(13);
    expect(definitions.filter((item) => item.sourceType === 'chinaath_api')).toHaveLength(9);
    expect(definitions.filter((item) => item.sourceType === 'page_url')).toHaveLength(2);
    expect(definitions.every((item) => item.pageSize <= 20)).toBe(true);
    expect(definitions.every((item) => item.maxPagesPerRun <= 2)).toBe(true);
    expect(
      definitions
        .filter((item) => item.sourceType === 'chinaath_api')
        .every((item) => item.cityHints.length === 1),
    ).toBe(true);
  });
});
