import type { AiEventCandidate } from '../eventCandidateSchema.js';
import type { CandidateReviewIssue } from '../eventSourceOperations.js';

export interface SourceCandidate {
  candidate: AiEventCandidate;
  sourceExternalId: string | null;
  rawPayload: Record<string, unknown> | null;
  extractorVersion: string;
  aiModel: string | null;
  aiPromptVersion: string | null;
  reviewIssues?: CandidateReviewIssue[];
}

export interface SourceCandidateBatch {
  candidates: SourceCandidate[];
  totalAvailable: number | null;
  pageNo: number | null;
  pageSize: number | null;
  pageCount: number | null;
}
