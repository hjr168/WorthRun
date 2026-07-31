import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime } from './format';

describe('display date formatting', () => {
  it('removes ISO time and timezone from event dates', () => {
    expect(formatDate('2026-10-04T00:00:00.000Z')).toBe('2026-10-04');
    expect(formatDate('2026-10-04')).toBe('2026-10-04');
  });

  it('returns a safe placeholder for missing or invalid values', () => {
    expect(formatDate()).toBe('待确认');
    expect(formatDate('not-a-date')).toBe('待确认');
    expect(formatDateTime('not-a-date')).toBe('待确认');
  });
});
