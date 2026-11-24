import { z } from 'zod';
import { ClassSessionType } from '@prisma/client';

export const jlptTemplateItemSchema = z.object({
  id: z.number().int().positive().optional(),
  session_number: z.number().int().positive(),
  session_type: z.nativeEnum(ClassSessionType),
  session_title: z.string().trim().max(120).nullable().optional(),
}).strict();

export const jlptTemplateInputSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1).max(150),
    total_sessions: z.number().int().min(1).max(500),
    active: z.boolean().optional().default(true),
    items: z.array(jlptTemplateItemSchema).min(1),
  }).strict(),
});

export const jlptTemplateActiveQuerySchema = z.object({
  query: z.object({
    active: z.enum(['true', 'false']).optional(),
  }).strict(),
});

export const jlptApplyPreviewSchema = z.object({
  body: z.object({
    class_ids: z.array(z.number().int().positive()).min(1).refine(
      (ids) => new Set(ids).size === ids.length,
      'class_ids không được trùng',
    ),
  }).strict(),
});

export const jlptTemplateChangeRequestSchema = z.object({
  body: z.object({
    class_id: z.number().int().positive(),
    proposed_items: z.array(jlptTemplateItemSchema).min(1),
    request_note: z.string().trim().max(1000).nullable().optional(),
  }).strict(),
});

export const jlptTemplateReviewSchema = z.object({
  body: z.object({
    review_reason: z.string().trim().min(1).max(1000).nullable().optional(),
  }).strict(),
});

export const jlptTemplateRejectSchema = z.object({
  body: z.object({
    review_reason: z.string().trim().min(1).max(1000),
  }).strict(),
});

const jlptRatingValueSchema = z.enum(['A', 'B', 'C']).nullable();

export const jlptLearningRecordPatchBodySchema = z.discriminatedUnion('field', [
  z.object({
    field: z.literal('preparation_rating'),
    value: jlptRatingValueSchema,
  }).strict(),
  z.object({
    field: z.literal('attitude_rating'),
    value: jlptRatingValueSchema,
  }).strict(),
  z.object({
    field: z.literal('homework_completed'),
    value: z.boolean().nullable(),
  }).strict(),
  z.object({
    field: z.literal('test_correct_answers'),
    value: z.number().int().nonnegative().nullable(),
  }).strict(),
]);

export const jlptLearningRecordPatchSchema = z.object({
  body: jlptLearningRecordPatchBodySchema,
});

const uniqueEnrollmentClassIdsSchema = z.array(z.number().int().positive()).min(1).refine(
  (ids) => new Set(ids).size === ids.length,
  'enrollment_class_ids không được trùng',
);

export const jlptLearningRecordBulkSchema = z.object({
  body: z.discriminatedUnion('field', [
    z.object({
      field: z.literal('preparation_rating'),
      value: jlptRatingValueSchema,
      enrollment_class_ids: uniqueEnrollmentClassIdsSchema,
    }).strict(),
    z.object({
      field: z.literal('attitude_rating'),
      value: jlptRatingValueSchema,
      enrollment_class_ids: uniqueEnrollmentClassIdsSchema,
    }).strict(),
    z.object({
      field: z.literal('homework_completed'),
      value: z.boolean().nullable(),
      enrollment_class_ids: uniqueEnrollmentClassIdsSchema,
    }).strict(),
    z.object({
      field: z.literal('test_correct_answers'),
      value: z.number().int().nonnegative().nullable(),
      enrollment_class_ids: uniqueEnrollmentClassIdsSchema,
    }).strict(),
  ]),
});
