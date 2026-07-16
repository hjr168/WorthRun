import {
  infoStatusValues,
  runJudgementValues,
  signupStatusValues,
  sourceLevelValues,
} from '@worth-running/shared';
import { z } from 'zod';

const nullableUrlSchema = z
  .union([
    z.string().trim().url(),
    z.string().trim().length(0).transform(() => null),
    z.null(),
    z.undefined().transform(() => null),
  ])
  .transform((value): string | null => value ?? null);

const nullableDatetimeSchema = z.preprocess(
  (value) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return `${trimmed}T15:59:59.999Z`;
    return trimmed;
  },
  z.string().datetime({ offset: true }).nullable(),
);

export const aiCandidateEvidenceSchema = z.object({
  field: z.string().trim().min(1),
  sourceUrl: z.string().trim().url(),
  quote: z.string().trim().min(1).max(300),
});

export const aiEventCandidateSchema = z.object({
  eventName: z.string().trim().min(1),
  city: z.string().trim().min(1),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  distanceItems: z.array(z.string().trim().min(1)).default([]),
  signupStatus: z.enum(signupStatusValues).default('unknown'),
  signupDeadline: nullableDatetimeSchema,
  officialUrl: nullableUrlSchema,
  sourceName: z.string().trim().min(1),
  sourceUrl: nullableUrlSchema,
  sourceLevel: z.enum(sourceLevelValues).default('unknown'),
  runJudgement: z.enum(runJudgementValues).default('unverified'),
  judgementSummary: z.string().trim().max(500).default(''),
  judgementReasons: z.array(z.string().trim().min(1)).default([]),
  suitableFor: z.array(z.string().trim().min(1)).default([]),
  notSuitableFor: z.array(z.string().trim().min(1)).default([]),
  tags: z.array(z.string().trim().min(1)).default([]),
  evidence: z.array(aiCandidateEvidenceSchema).min(1, 'AI 候选必须保留至少一条证据'),
  confidence: z.record(z.enum(infoStatusValues)).default({}),
});

export type AiEventCandidate = z.infer<typeof aiEventCandidateSchema>;

export function normalizeAiCandidate(input: unknown): AiEventCandidate {
  return aiEventCandidateSchema.parse(input);
}
