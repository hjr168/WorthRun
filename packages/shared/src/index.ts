export type PublishStatus = 'draft' | 'published' | 'hidden' | 'offline' | 'archived';

export type InfoStatus =
  | 'ai_generated'
  | 'pending_verify'
  | 'verified'
  | 'user_flagged'
  | 'source_error';

export type RunJudgement = 'priority' | 'watch' | 'unverified';

export type SignupStatus =
  | 'signup_open'
  | 'closing_soon'
  | 'closed'
  | 'not_started'
  | 'unknown';

export type AdminRole = 'super_admin' | 'event_operator' | 'content_reviewer' | 'readonly';

export type FeedbackStatus = 'pending' | 'handling' | 'resolved' | 'rejected';

export type SourceLevel = 'official' | 'trusted' | 'secondary' | 'unknown';

export const publishStatusLabels: Record<PublishStatus, string> = {
  draft: '草稿',
  published: '已发布',
  hidden: '前端隐藏',
  offline: '临时下架',
  archived: '已归档',
};

export const infoStatusLabels: Record<InfoStatus, string> = {
  ai_generated: 'AI 整理',
  pending_verify: '待核实',
  verified: '已核实',
  user_flagged: '用户反馈异常',
  source_error: '来源异常',
};

export const runJudgementLabels: Record<RunJudgement, string> = {
  priority: '适合优先关注',
  watch: '可以观望',
  unverified: '信息待核实',
};

export const signupStatusLabels: Record<SignupStatus, string> = {
  signup_open: '报名中',
  closing_soon: '即将截止',
  closed: '已截止',
  not_started: '未开始',
  unknown: '待核实',
};

export const sourceLevelLabels: Record<SourceLevel, string> = {
  official: '官方来源',
  trusted: '可信来源',
  secondary: '二级来源',
  unknown: '待核实',
};

export interface EventChecklistItemInput {
  groupName: string;
  itemName: string;
  itemStatus: InfoStatus;
  description?: string;
  sortOrder?: number;
}

export interface EventTagInput {
  tagName: string;
  tagType?: string;
}

export interface EventInput {
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
  sourceUrl?: string;
  sourceLevel: SourceLevel;
  publishStatus?: PublishStatus;
  infoStatus: InfoStatus;
  runJudgement: RunJudgement;
  judgementSummary?: string;
  judgementReasons?: string[];
  suitableFor?: string[];
  notSuitableFor?: string[];
  tags?: string[];
  fieldConfidence?: Record<string, InfoStatus>;
  checklistItems?: EventChecklistItemInput[];
  eventTags?: EventTagInput[];
}

export interface EventListQuery {
  search?: string;
  city?: string;
  signupStatus?: SignupStatus;
  publishStatus?: PublishStatus;
  infoStatus?: InfoStatus;
  runJudgement?: RunJudgement;
  page?: number;
  pageSize?: number;
}
