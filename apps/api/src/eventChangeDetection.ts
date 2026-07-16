import { createHash } from 'node:crypto';

export interface EventChangeDiff {
  changedFields: string[];
  beforeValue: Record<string, unknown>;
  afterValue: Record<string, unknown>;
  severity: 'normal' | 'important' | 'critical';
  fingerprint: string;
}

export interface ComparableEventValues {
  eventDate?: Date | string | null;
  distanceItems?: string[] | null;
  signupStatus?: string | null;
  signupDeadline?: Date | string | null;
  officialUrl?: string | null;
}

const FIELD_ORDER = [
  'eventDate',
  'distanceItems',
  'signupStatus',
  'signupDeadline',
  'officialUrl',
  'cancellationSignal',
  'postponementSignal',
] as const;

type ChangeField = (typeof FIELD_ORDER)[number];

function normalizeEventDate(value: Date | string | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.valueOf()) ? null : value.toISOString().slice(0, 10);
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString().slice(0, 10);
}

function normalizeDateTime(value: Date | string | null | undefined) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
}

function normalizeDistances(value: string[] | null | undefined) {
  if (!value?.length) return null;
  const normalized = [...new Set(value.map((item) => item.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'zh-CN'),
  );
  return normalized.length ? normalized : null;
}

function normalizeOfficialUrl(value: string | null | undefined) {
  const input = value?.trim();
  if (!input) return null;
  try {
    const url = new URL(input);
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith('utm_') || key.toLowerCase() === 'from') {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();
    url.hash = '';
    url.pathname = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '');
    return url.toString().replace(/\?$/, '').replace(/\/$/, '');
  } catch {
    return input.replace(/\/+$/, '');
  }
}

function normalizeSignupStatus(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized && normalized !== 'unknown' ? normalized : null;
}

function detectSignals(text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const cancellationSignal =
    !/取消参赛(?:资格|名额|报名)/.test(normalized) &&
    /(?:赛事|比赛|活动|本届|组委会)[^。！？\n]{0,20}(?:取消|停办)|(?:取消|停办)[^。！？\n]{0,12}(?:赛事|比赛|活动)/.test(
      normalized,
    );
  const postponementSignal =
    /(?:赛事|比赛|活动|本届|组委会)[^。！？\n]{0,20}(?:延期|改期)|(?:延期|改期)[^。！？\n]{0,12}(?:举行|赛事|比赛|活动)/.test(
      normalized,
    );
  return { cancellationSignal, postponementSignal };
}

function sameValue(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function detectEventChanges(
  sourceId: string,
  current: ComparableEventValues,
  incoming: ComparableEventValues,
  sourceText = '',
): EventChangeDiff | null {
  const currentValues: Record<ChangeField, unknown> = {
    eventDate: normalizeEventDate(current.eventDate),
    distanceItems: normalizeDistances(current.distanceItems),
    signupStatus: normalizeSignupStatus(current.signupStatus),
    signupDeadline: normalizeDateTime(current.signupDeadline),
    officialUrl: normalizeOfficialUrl(current.officialUrl),
    cancellationSignal: false,
    postponementSignal: false,
  };
  const signals = detectSignals(sourceText);
  const incomingValues: Record<ChangeField, unknown> = {
    eventDate: normalizeEventDate(incoming.eventDate),
    distanceItems: normalizeDistances(incoming.distanceItems),
    signupStatus: normalizeSignupStatus(incoming.signupStatus),
    signupDeadline: normalizeDateTime(incoming.signupDeadline),
    officialUrl: normalizeOfficialUrl(incoming.officialUrl),
    cancellationSignal: signals.cancellationSignal || null,
    postponementSignal: signals.postponementSignal || null,
  };

  const changedFields = FIELD_ORDER.filter((field) => {
    const next = incomingValues[field];
    return next !== null && !sameValue(currentValues[field], next);
  });
  if (!changedFields.length) return null;

  const beforeValue = Object.fromEntries(changedFields.map((field) => [field, currentValues[field]]));
  const afterValue = Object.fromEntries(changedFields.map((field) => [field, incomingValues[field]]));
  const hasCritical = changedFields.some((field) =>
    ['eventDate', 'cancellationSignal', 'postponementSignal'].includes(field),
  );
  const hasImportant = changedFields.some((field) =>
    ['signupStatus', 'signupDeadline', 'officialUrl'].includes(field),
  );
  const severity = hasCritical ? 'critical' : hasImportant ? 'important' : 'normal';
  const fingerprint = createHash('sha256')
    .update(JSON.stringify({ sourceId, changedFields, afterValue }))
    .digest('hex');

  return { changedFields: [...changedFields], beforeValue, afterValue, severity, fingerprint };
}
