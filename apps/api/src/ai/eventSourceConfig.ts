import { z } from 'zod';

export const CHINAATH_PUBLIC_LIST_URL = 'https://www.runchina.org.cn/#/race/v/list';
export const CHINAATH_ALLOWED_DOMAINS = [
  'www.runchina.org.cn',
  'runchina.org.cn',
  'api-changzheng.chinaath.com',
];

const optionalUrlSchema = z
  .union([
    z.string().trim().url('入口 URL 必须是有效 URL'),
    z.string().trim().length(0).transform(() => null),
    z.null(),
    z.undefined().transform(() => null),
  ])
  .transform((value): string | null => value ?? null);

const baseEventSourceSchema = z.object({
  name: z.string().trim().min(1, '赛事源名称不能为空'),
  sourceType: z
    .enum(['page_url', 'chinaath_api', 'search_query', 'rss'])
    .default('page_url'),
  entryUrl: optionalUrlSchema,
  searchQuery: z.string().trim().optional().nullable().default(null),
  allowedDomains: z.array(z.string().trim().min(1)).default([]),
  cityHints: z.array(z.string().trim().min(1)).default([]),
  status: z.enum(['active', 'paused']).default('active'),
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
  })
  .transform((input) => {
    if (input.sourceType !== 'chinaath_api') return input;

    return {
      ...input,
      entryUrl: CHINAATH_PUBLIC_LIST_URL,
      searchQuery: null,
      allowedDomains: [...CHINAATH_ALLOWED_DOMAINS],
    };
  });
