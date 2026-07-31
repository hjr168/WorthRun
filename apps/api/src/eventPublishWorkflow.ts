import { Prisma, prisma } from '@worth-running/database';
import { normalizeGreaterBayAreaCity, resolveSupportedRegion } from '@worth-running/shared';
import { publishBoundaryError } from './dataPolicy.js';
import { hasOfficialEvidence } from './sourceAuthority.js';

export const publishRiskKeywords = ['取消', '延期', '疑似', '网传', '非官方'];

export interface PublishWorkflowEvent {
  id?: string;
  eventName: string;
  city: string;
  provinceCode?: string | null;
  cityCode?: string | null;
  eventDate: Date | string;
  distanceItems: string[];
  signupStatus: string;
  officialUrl: string;
  sourceName: string;
  sourceUrl: string | null;
  sourceLevel: string;
  publishStatus?: string;
  infoStatus?: string;
  runJudgement: string;
  judgementSummary?: string | null;
  judgementReasons?: string[];
  updatedAt: Date;
  checklistItems?: unknown[];
}

type DuplicateComparableEvent = Pick<
  PublishWorkflowEvent,
  'id' | 'eventName' | 'city' | 'eventDate' | 'distanceItems' | 'officialUrl' | 'sourceUrl'
>;

const traditionalNameCharacters: Record<string, string> = {
  銀: '银',
  娛: '娱',
  樂: '乐',
  門: '门',
  國: '国',
  際: '际',
  馬: '马',
  賽: '赛',
  廣: '广',
  東: '东',
  灣: '湾',
};

function normalizedEventName(value: string) {
  return value
    .toLowerCase()
    .replace(
      /[銀娛樂門國際馬賽廣東灣]/g,
      (character) => traditionalNameCharacters[character] || character,
    )
    .replace(/\b20\d{2}\b/g, '')
    .replace(/[\s·•\-—_（）()]/g, '');
}

function normalizedDistance(value: string) {
  if (/半|half/i.test(value)) return 'half';
  if (/全|42|marathon|马拉松|馬拉松/i.test(value)) return 'marathon';
  if (/10/.test(value)) return '10k';
  if (/5/.test(value)) return '5k';
  return value.trim().toLowerCase();
}

function eventDateOnly(value: Date | string) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

function normalizedEvidenceUrl(value: string | null | undefined) {
  if (!value) return '';
  try {
    const url = new URL(value);
    return `${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    return value.trim().toLowerCase().replace(/\/+$/, '');
  }
}

function comparableCity(value: string) {
  return resolveSupportedRegion(value)?.cityCode || normalizeGreaterBayAreaCity(value) || value.replace(/\s|市$/g, '');
}

export function arePotentialDuplicateEvents(
  left: DuplicateComparableEvent,
  right: DuplicateComparableEvent,
) {
  if (left.id && right.id && left.id === right.id) return false;
  if (
    comparableCity(left.city) !== comparableCity(right.city) ||
    eventDateOnly(left.eventDate) !== eventDateOnly(right.eventDate)
  ) {
    return false;
  }
  const rightDistances = new Set(right.distanceItems.map(normalizedDistance));
  if (!left.distanceItems.some((item) => rightDistances.has(normalizedDistance(item))))
    return false;
  const sameName = normalizedEventName(left.eventName) === normalizedEventName(right.eventName);
  const leftUrls = new Set(
    [left.officialUrl, left.sourceUrl].map(normalizedEvidenceUrl).filter(Boolean),
  );
  const sameEvidence = [right.officialUrl, right.sourceUrl]
    .map(normalizedEvidenceUrl)
    .filter(Boolean)
    .some((url) => leftUrls.has(url));
  return sameName || sameEvidence;
}

export async function findPublishedEventDuplicates(
  event: DuplicateComparableEvent,
  store: typeof prisma | Prisma.TransactionClient = prisma,
) {
  const eventDate = new Date(`${eventDateOnly(event.eventDate)}T00:00:00.000Z`);
  const possible = await store.event.findMany({
    where: {
      publishStatus: 'published',
      eventDate,
      ...(event.id ? { id: { not: event.id } } : {}),
    },
    select: {
      id: true,
      eventName: true,
      city: true,
      eventDate: true,
      distanceItems: true,
      officialUrl: true,
      sourceUrl: true,
    },
  });
  return possible.filter((item) => arePotentialDuplicateEvents(event, item));
}

export function eventPublishIssues(event: PublishWorkflowEvent, now = new Date()) {
  const issues: string[] = [];
  if (!event.eventName) issues.push('missing_event_name');
  if (!event.city) issues.push('missing_city');
  if (!event.eventDate) issues.push('missing_event_date');
  if (!event.distanceItems.length) issues.push('missing_distance_items');
  if (!event.signupStatus) issues.push('missing_signup_status');
  if (!event.officialUrl) issues.push('missing_official_url');
  if (!event.sourceName) issues.push('missing_source_name');
  if (!event.sourceUrl) issues.push('missing_source_url');
  if (!event.sourceLevel) issues.push('missing_source_level');
  if (
    event.sourceLevel === 'community' &&
    !hasOfficialEvidence(event.sourceLevel, event.officialUrl, event.sourceUrl)
  ) {
    issues.push('community_without_official_evidence');
  }
  if (!event.runJudgement) issues.push('missing_run_judgement');
  if (!event.judgementReasons?.length) issues.push('missing_judgement_reasons');
  if (!event.checklistItems?.length) issues.push('missing_checklist');
  if (event.infoStatus === 'user_flagged') issues.push('user_flagged');
  const date =
    event.eventDate instanceof Date ? event.eventDate.toISOString().slice(0, 10) : event.eventDate;
  const boundary = publishBoundaryError(event.city, date, now, {
    provinceCode: event.provinceCode,
    cityCode: event.cityCode,
  });
  if (boundary) issues.push(boundary);
  const text = [
    event.eventName,
    event.judgementSummary,
    event.officialUrl,
    event.sourceName,
    event.sourceUrl,
  ]
    .filter(Boolean)
    .join(' ');
  const keyword = publishRiskKeywords.find((item) => text.includes(item));
  if (keyword) issues.push(`risk_keyword:${keyword}`);
  return [...new Set(issues)];
}

export async function previewBulkPublish(eventIds: string[], now = new Date()) {
  const ids = [...new Set(eventIds)].slice(0, 20);
  const events = await prisma.event.findMany({
    where: { id: { in: ids } },
    include: { checklistItems: { orderBy: { sortOrder: 'asc' } } },
  });
  const byId = new Map(events.map((event) => [event.id, event]));
  return Promise.all(
    ids.map(async (id) => {
      const event = byId.get(id);
      if (!event)
        return { id, eventName: '', ready: false, issues: ['event_not_found'], updatedAt: null };
      const issues = eventPublishIssues(event, now);
      if (event.publishStatus !== 'draft') issues.push('event_not_draft');
      if ((await findPublishedEventDuplicates(event)).length)
        issues.push('duplicate_published_event');
      return {
        id,
        eventName: event.eventName,
        ready: issues.length === 0,
        issues,
        updatedAt: event.updatedAt.toISOString(),
      };
    }),
  );
}

export async function runBulkPublish(input: {
  eventIds: string[];
  dryRun: boolean;
  expected?: Array<{ id: string; updatedAt: string }>;
  adminUserId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const preview = await previewBulkPublish(input.eventIds, now);
  if (input.dryRun) return { dryRun: true, items: preview, published: [], failed: [] };
  const expected = new Map((input.expected || []).map((item) => [item.id, item.updatedAt]));
  const published: Array<{ id: string; eventName: string }> = [];
  const failed: Array<{ id: string; eventName: string; issues: string[] }> = [];

  for (const item of preview) {
    const expectedUpdatedAt = expected.get(item.id);
    if (!expectedUpdatedAt || expectedUpdatedAt !== item.updatedAt) {
      failed.push({ id: item.id, eventName: item.eventName, issues: ['preview_snapshot_changed'] });
      continue;
    }
    if (!item.ready) {
      failed.push({ id: item.id, eventName: item.eventName, issues: item.issues });
      continue;
    }
    try {
      const event = await prisma.$transaction(async (tx) => {
        const before = await tx.event.findUnique({
          where: { id: item.id },
          include: { checklistItems: true },
        });
        if (!before || before.updatedAt.toISOString() !== expectedUpdatedAt) {
          throw new Error('preview_snapshot_changed');
        }
        const issues = eventPublishIssues(before, now);
        if (before.publishStatus !== 'draft') issues.push('event_not_draft');
        if ((await findPublishedEventDuplicates(before, tx)).length) {
          issues.push('duplicate_published_event');
        }
        if (issues.length) throw new Error(issues.join(','));
        const updated = await tx.event.update({
          where: { id: before.id },
          data: { publishStatus: 'published', publishedAt: now },
        });
        await tx.adminOperationLog.create({
          data: {
            adminUserId: input.adminUserId,
            action: 'event.bulk_publish',
            targetType: 'events',
            targetId: before.id,
            beforeValue: before as unknown as Prisma.InputJsonValue,
            afterValue: updated as unknown as Prisma.InputJsonValue,
            note: '批量预览确认后发布赛事',
          },
        });
        return updated;
      });
      published.push({ id: event.id, eventName: event.eventName });
    } catch (error) {
      failed.push({
        id: item.id,
        eventName: item.eventName,
        issues: [error instanceof Error ? error.message : 'publish_failed'],
      });
    }
  }
  return { dryRun: false, items: preview, published, failed };
}
