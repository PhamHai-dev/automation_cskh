import { z } from 'zod';

export const uploadImportSchema = z.object({
  body: z.object({
    import_type: z.enum(['STUDENT_ENROLLMENT', 'ATTENDANCE', 'TEACHER_ATTENDANCE']),
  }),
});

export const saveMappingSchema = z.object({
  body: z.object({
    sheetName: z.string().optional(),
    headerRowIndex: z.number().int().positive().optional(),
    columnMapping: z.record(z.string()),
  }),
});

export const confirmImportSchema = z.object({
  body: z.object({
    skipErrors: z.boolean().optional().default(true),
    createMissingStudents: z.boolean().optional().default(false),
  }).optional(),
});
