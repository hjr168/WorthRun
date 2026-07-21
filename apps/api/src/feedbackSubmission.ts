import { z } from 'zod';
import {
  eventCorrectionTypes,
  isLowInformationFeedback,
  productFeedbackTypes,
} from './feedbackAbuse.js';

const baseFeedbackSchema = z.object({
  userKey: z.string().trim().min(1, 'userKey 不能为空').max(100, 'userKey 无效'),
  requestId: z
    .string()
    .trim()
    .min(16, 'requestId 无效')
    .max(128, 'requestId 无效')
    .regex(/^[A-Za-z0-9_-]+$/, 'requestId 无效'),
  content: z.string().trim().min(6, '补充说明至少需要 6 个字').max(500, '反馈内容不能超过 500 个字'),
});

const eventCorrectionSchema = baseFeedbackSchema.extend({
  scope: z.literal('event_correction'),
  eventId: z.string().trim().min(1, 'eventId 不能为空'),
  feedbackType: z.enum(eventCorrectionTypes, { required_error: '反馈类型无效' }),
  contextPage: z.undefined().optional(),
  appVersion: z.undefined().optional(),
  relatedRequestId: z.undefined().optional(),
});

const productFeedbackContextPageSchema = z
  .string()
  .trim()
  .min(1, '反馈页面不能为空')
  .max(40, '反馈页面不能超过 40 个字')
  .refine(
    (value) => !/https?:\/\/|www\.|[<>]|[\u0000-\u001f]/i.test(value),
    '反馈页面无效',
  );

const productFeedbackSchema = baseFeedbackSchema.extend({
  scope: z.literal('product_feedback'),
  eventId: z.undefined().optional(),
  feedbackType: z.enum(productFeedbackTypes, { required_error: '反馈类型无效' }),
  contextPage: productFeedbackContextPageSchema.optional(),
  appVersion: z
    .string()
    .trim()
    .min(1)
    .max(32, '小程序版本无效')
    .regex(/^[A-Za-z0-9._-]+$/, '小程序版本无效')
    .optional(),
  relatedRequestId: z.string().uuid('问题编号无效').optional(),
});

const scopedFeedbackSchema = z
  .discriminatedUnion('scope', [eventCorrectionSchema, productFeedbackSchema])
  .superRefine((input, context) => {
    if (isLowInformationFeedback(input.feedbackType, input.content)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['content'],
        message: '请补充具体问题或信息出处',
      });
    }
  });

export const publicFeedbackSchema = z.preprocess((value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const input = value as Record<string, unknown>;
  return input.scope ? input : { ...input, scope: 'event_correction' };
}, scopedFeedbackSchema);

export type PublicFeedbackInput = z.infer<typeof scopedFeedbackSchema>;
