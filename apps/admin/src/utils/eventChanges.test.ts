import { describe, expect, it } from 'vitest';
import {
  buildEventChangeQuery,
  eventChangeFieldLabel,
  eventChangeSeverityLabel,
  eventChangeStatusLabel,
} from './eventChanges.js';

describe('event change admin utilities', () => {
  it('builds compact query parameters and caps pages at 50 rows', () => {
    expect(
      buildEventChangeQuery({
        page: 2,
        pageSize: 100,
        status: 'open',
        severity: 'critical',
        changedField: 'eventDate',
        search: ' 广州 ',
      }),
    ).toBe(
      'page=2&pageSize=50&status=open&severity=critical&changedField=eventDate&search=%E5%B9%BF%E5%B7%9E',
    );
  });

  it('uses Chinese field, status and severity labels', () => {
    expect(eventChangeFieldLabel('eventDate')).toBe('比赛日期');
    expect(eventChangeFieldLabel('postponementSignal')).toBe('延期信号');
    expect(eventChangeStatusLabel('archived_event')).toBe('赛事已归档');
    expect(eventChangeSeverityLabel('important')).toBe('重要');
  });
});
