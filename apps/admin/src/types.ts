import {
  InfoStatus,
  PublishStatus,
  RunJudgement,
  SignupStatus,
} from '@worth-running/shared';

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
}
