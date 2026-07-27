import { describe, expect, it } from 'vitest';
import { beijingDateTimeToIso } from './form';

describe('beijingDateTimeToIso', () => {
  it('treats datetime-local values as Beijing time', () => {
    expect(beijingDateTimeToIso('2026-11-08T07:30')).toBe('2026-11-07T23:30:00.000Z');
  });

  it('keeps missing values empty and normalizes offset values', () => {
    expect(beijingDateTimeToIso('')).toBeNull();
    expect(beijingDateTimeToIso('2026-11-08T07:30:00+08:00')).toBe('2026-11-07T23:30:00.000Z');
  });
});
