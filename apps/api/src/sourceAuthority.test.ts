import { describe, expect, it } from 'vitest';
import { hasOfficialEvidence } from './sourceAuthority.js';

describe('source authority', () => {
  it('requires an independent official domain for community discoveries', () => {
    expect(
      hasOfficialEvidence(
        'community',
        'https://chinamarathon.com/events/123',
        'https://chinamarathon.com/events/123',
      ),
    ).toBe(false);
    expect(
      hasOfficialEvidence(
        'community',
        'https://race-organizer.example/notice',
        'https://chinamarathon.com/events/123',
      ),
    ).toBe(true);
  });

  it('accepts the configured link for official sources', () => {
    expect(hasOfficialEvidence('official', 'https://worldathletics.org/calendar', null)).toBe(true);
  });
});
