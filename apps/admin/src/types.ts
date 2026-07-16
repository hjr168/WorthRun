import { InfoStatus, PublishStatus, RunJudgement, SignupStatus } from '@worth-running/shared';

export interface AdminEvent {
  id: string;
  eventName: string;
  city: string;
  eventDate: string;
  distanceItems: string[];
  startPoint?: string;
  endPoint?: string;
  signupStatus: SignupStatus;
  signupStartAt?: string | null;
  signupDeadline?: string | null;
  officialUrl: string;
  sourceName: string;
  sourceUrl?: string | null;
  sourceLevel: string;
  publishStatus: PublishStatus;
  infoStatus: InfoStatus;
  runJudgement: RunJudgement;
  judgementSummary?: string | null;
  judgementReasons: string[];
  suitableFor: string[];
  notSuitableFor: string[];
  tags: string[];
  fieldConfidence?: Record<string, InfoStatus>;
  updatedAt: string;
  checklistItems: Array<{
    id?: string;
    groupName: string;
    itemName: string;
    itemStatus: InfoStatus;
    description?: string;
    sortOrder?: number;
  }>;
  eventTags: Array<{ id?: string; tagName: string; tagType: string }>;
}

export interface OperationLog {
  id: string;
  action: string;
  targetType: string;
  targetId?: string;
  note?: string;
  createdAt: string;
  adminUserId?: string;
}

export interface AdminUser {
  id: string;
  username: string;
  displayName: string;
  role: string;
}

export interface FeedbackItem {
  id: string;
  eventId?: string | null;
  userKey?: string | null;
  feedbackType: string;
  content: string;
  status: 'pending' | 'handling' | 'resolved' | 'rejected';
  adminNote?: string | null;
  handledBy?: string | null;
  handledAt?: string | null;
  createdAt: string;
  event?: { id: string; eventName: string; city: string } | null;
}

export interface FeedbackDuplicateGroup {
  primary: FeedbackItem;
  duplicates: FeedbackItem[];
  count: number;
}

export interface AdminUserListItem {
  id: string;
  username: string;
  displayName: string;
  role: string;
  status: 'active' | 'disabled';
  createdAt: string;
  updatedAt: string;
}

export interface SystemConfigItem {
  id: string;
  configKey: string;
  configValue: unknown;
  description?: string | null;
}

export interface EventSourceItem {
  id: string;
  name: string;
  sourceType:
    | 'page_url'
    | 'chinaath_api'
    | 'world_athletics'
    | 'chinamarathon_sitemap'
    | 'search_query'
    | 'rss';
  entryUrl?: string | null;
  searchQuery?: string | null;
  allowedDomains: string[];
  cityHints: string[];
  status: 'active' | 'paused';
  scheduleEnabled: boolean;
  scheduleIntervalHours: number;
  pageSize: number;
  maxPagesPerRun: number;
  nextPage: number;
  nextRunAt?: string | null;
  lastRunAt?: string | null;
  lastRunStatus?: string | null;
  lastSuccessAt?: string | null;
  consecutiveFailures: number;
  runLockExpiresAt?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EventSourceRunSummary {
  runId: string;
  sourceId: string;
  trigger: 'manual' | 'scheduled';
  totalAvailable: number | null;
  startPage: number | null;
  endPage: number | null;
  pageCount: number;
  nextPage: number;
  fetched: number;
  created: number;
  updated: number;
  skippedReviewed: number;
  skippedExpired: number;
  skippedOutsideRegion: number;
  duplicateEvents: number;
  candidateIds: string[];
}

export interface EventSourceRunItem {
  id: string;
  sourceId: string;
  trigger: 'manual' | 'scheduled';
  status: 'running' | 'succeeded' | 'failed';
  startedAt: string;
  finishedAt?: string | null;
  startPage?: number | null;
  endPage?: number | null;
  pageCount: number;
  totalAvailable?: number | null;
  fetched: number;
  created: number;
  updated: number;
  skippedReviewed: number;
  skippedExpired: number;
  skippedOutsideRegion: number;
  duplicateEvents: number;
  errorMessage?: string | null;
  source?: Pick<EventSourceItem, 'id' | 'name' | 'sourceType'>;
}

export type CandidateReviewIssue =
  | 'missing_event_date'
  | 'missing_official_url'
  | 'missing_source_url'
  | 'duplicate_event'
  | 'source_date_conflict';

export interface EventCandidateStats {
  pending: number;
  urgent: number;
  missingOfficialUrl: number;
  duplicates: number;
}

export interface EventCandidateItem {
  id: string;
  status: 'new' | 'needs_review' | 'accepted' | 'rejected' | 'merged';
  eventName: string;
  city: string;
  eventDate?: string | null;
  sourceUrl?: string | null;
  officialUrl?: string | null;
  extractedData: Record<string, unknown>;
  evidence: Array<{ field: string; sourceUrl: string; quote: string }>;
  confidence?: Record<string, unknown> | null;
  duplicateEventId?: string | null;
  acceptedEventId?: string | null;
  aiModel?: string | null;
  aiPromptVersion?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  rejectReason?: string | null;
  priorityScore: number;
  reviewIssues: CandidateReviewIssue[];
  createdAt: string;
  updatedAt: string;
  source?: EventSourceItem | null;
}

export type DataCleanupAction =
  | 'reject_expired_candidates'
  | 'reject_outside_region_candidates'
  | 'archive_expired_events'
  | 'archive_outside_region_events'
  | 'reject_invalid_feedback'
  | 'reject_duplicate_feedback';

export interface DataQualitySummary {
  futureGreaterBayAreaPublished: number;
  reject_expired_candidates: number;
  reject_outside_region_candidates: number;
  archive_expired_events: number;
  archive_outside_region_events: number;
  reject_invalid_feedback: number;
  reject_duplicate_feedback: number;
}

export interface DataCleanupResult {
  dryRun: boolean;
  actions: DataCleanupAction[];
  counts: Partial<Record<DataCleanupAction, number>>;
  samples: Partial<Record<DataCleanupAction, string[]>>;
}

export interface InteractionStats {
  days: 7 | 30;
  detailViews: number;
  detailUsers: number;
  officialClicks: number;
  officialUsers: number;
  favoriteAdds: number;
  shares: number;
  preferenceUsers: number;
  officialClickRate: number;
  favoriteRate: number;
  shareRate: number;
}
