import {
  greaterBayAreaCities,
  isGreaterBayAreaCity,
  normalizeGreaterBayAreaCity,
} from '@worth-running/shared';
import { z } from 'zod';

export const CHINAATH_PUBLIC_LIST_URL = 'https://www.runchina.org.cn/#/race/v/list';
export const CHINAATH_ALLOWED_DOMAINS = [
  'www.runchina.org.cn',
  'runchina.org.cn',
  'api-changzheng.chinaath.com',
];
export const WORLD_ATHLETICS_CALENDAR_URL =
  'https://worldathletics.org/competition/calendar-results';
export const CHINAMARATHON_SITEMAP_URL = 'https://chinamarathon.com/sitemap.xml';
export const CHINAATH_MAINLAND_CITIES = greaterBayAreaCities.filter(
  (city) => city !== '香港' && city !== '澳门',
);

const optionalUrlSchema = z
  .union([
    z.string().trim().url('入口 URL 必须是有效 URL'),
    z
      .string()
      .trim()
      .length(0)
      .transform(() => null),
    z.null(),
    z.undefined().transform(() => null),
  ])
  .transform((value): string | null => value ?? null);

const baseEventSourceSchema = z.object({
  name: z.string().trim().min(1, '赛事源名称不能为空'),
  sourceType: z
    .enum([
      'page_url',
      'chinaath_api',
      'world_athletics',
      'chinamarathon_sitemap',
      'search_query',
      'rss',
    ])
    .default('page_url'),
  entryUrl: optionalUrlSchema,
  searchQuery: z.string().trim().optional().nullable().default(null),
  allowedDomains: z.array(z.string().trim().min(1)).default([]),
  cityHints: z.array(z.string().trim().min(1)).default([]),
  sourceLevel: z
    .enum(['official', 'trusted', 'community', 'secondary', 'unknown'])
    .default('unknown'),
  status: z.enum(['active', 'paused']).default('active'),
  scheduleEnabled: z.boolean().default(false),
  scheduleIntervalHours: z.number().int().min(1).max(168).default(24),
  pageSize: z.number().int().min(1).max(20).default(20),
  maxPagesPerRun: z.number().int().min(1).max(2).default(1),
  notes: z.string().trim().optional().nullable().default(null),
});

export const eventSourceSchema = baseEventSourceSchema
  .superRefine((input, context) => {
    if (input.sourceType === 'page_url' && !input.entryUrl) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['entryUrl'],
        message: '页面 URL 赛事源缺少入口 URL',
      });
    }
    input.cityHints.forEach((city, index) => {
      if (!isGreaterBayAreaCity(city)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['cityHints', index],
          message: '目标城市必须属于粤港澳大湾区',
        });
      }
    });
    if (input.sourceType === 'chinaath_api') {
      const normalizedCities = input.cityHints.map(normalizeGreaterBayAreaCity).filter(Boolean);
      if (
        normalizedCities.length !== 1 ||
        !CHINAATH_MAINLAND_CITIES.includes(
          normalizedCities[0] as (typeof CHINAATH_MAINLAND_CITIES)[number],
        )
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['cityHints'],
          message: '中国田协来源必须且只能选择一个大湾区内地城市',
        });
      }
    }
  })
  .transform((input) => {
    const normalized = {
      ...input,
      cityHints: input.cityHints.map((city) => normalizeGreaterBayAreaCity(city) as string),
    };
    if (normalized.sourceType === 'page_url') {
      return { ...normalized, pageSize: 1, maxPagesPerRun: 1 };
    }
    if (normalized.sourceType === 'world_athletics') {
      return {
        ...normalized,
        sourceLevel: 'official' as const,
        entryUrl: WORLD_ATHLETICS_CALENDAR_URL,
        searchQuery: null,
        allowedDomains: ['worldathletics.org'],
        cityHints: ['香港'],
        maxPagesPerRun: 1,
      };
    }
    if (normalized.sourceType === 'chinamarathon_sitemap') {
      return {
        ...normalized,
        sourceLevel: 'community' as const,
        entryUrl: CHINAMARATHON_SITEMAP_URL,
        searchQuery: null,
        allowedDomains: ['chinamarathon.com', 'heilianapp.com'],
        cityHints: [...greaterBayAreaCities],
        pageSize: Math.min(normalized.pageSize, 10),
        maxPagesPerRun: 1,
      };
    }
    if (normalized.sourceType !== 'chinaath_api') return normalized;

    return {
      ...normalized,
      sourceLevel: 'official' as const,
      entryUrl: CHINAATH_PUBLIC_LIST_URL,
      searchQuery: null,
      allowedDomains: [...CHINAATH_ALLOWED_DOMAINS],
    };
  });
