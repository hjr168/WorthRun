import { describe, expect, it } from 'vitest';
import { buildPublicEventWhere, publishBoundaryError } from './dataPolicy.js';

describe('data policy', () => {
  const now = new Date('2026-07-13T16:30:00.000Z');

  it('accepts only future Greater Bay Area events for publishing', () => {
    expect(publishBoundaryError('广州市', '2026-07-15', now)).toBeNull();
    expect(publishBoundaryError('北京市', '2026-07-15', now)).toBe(
      '当前仅允许发布粤港澳大湾区赛事',
    );
    expect(publishBoundaryError('广州市', '2026-07-14', now)).toBe(
      '只能发布北京时间未来日期的赛事',
    );
  });

  it('builds the public future-region database boundary', () => {
    expect(buildPublicEventWhere(now)).toMatchObject({
      publishStatus: 'published',
      city: { in: expect.arrayContaining(['广州', '广州市', '香港特别行政区']) },
      eventDate: { gt: new Date('2026-07-14T00:00:00.000Z') },
    });
  });
});
