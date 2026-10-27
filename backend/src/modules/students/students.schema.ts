import { z } from 'zod';

export const createStudentSchema = z.object({
  body: z.object({
    // Student fields
    external_id: z.string().optional(),
    full_name: z.string().min(1),
    gender: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional().or(z.literal('')),
    date_of_birth: z.string().optional(),
    occupation: z.string().optional(),
    zalo_uid: z.string().optional(),
    line_uid: z.string().optional(),
    note: z.string().optional(),

    // Enrollment & Course fields
    program_type: z.enum(['JLPT', 'KAIWA']).optional(),
    program_metadata: z.record(z.any()).optional().nullable(),
    cs_id: z.number().int().positive().optional(),
    package_code: z.string().optional(),
    paid_at: z.string().optional(),
    sale_name: z.string().optional(),
    student_source_status: z.string().optional(),
    course_content: z.string().optional(),
    payment_status: z.string().optional(),
    level: z.string().optional(),
    total_sessions: z.union([z.number(), z.string()]).optional(),
    external_remaining_sessions: z.union([z.number(), z.string()]).optional(),
    attended_previous_years: z.union([z.number(), z.string()]).optional().nullable(),
    class_model: z.string().optional(),
    sales_note: z.string().optional(),
    start_date: z.string().optional(),
    end_date: z.string().optional(),
    status: z.enum(['WAITING_CLASS', 'STUDYING', 'PAUSED', 'FINISHED', 'UPCOMING', 'NOT_STARTED', 'CANCELLED']).optional(),

    // Class & Schedule fields
    class_id: z.number().optional(),
    class_name: z.string().optional(),
    teacher_name: z.string().optional(),
    teacher_code: z.string().optional(),
    start_time: z.string().optional(),
    schedule_pattern: z.string().optional(),
    duration_minutes: z.union([z.number(), z.string()]).optional(),

    // Care & Reports fields
    study_report_url: z.string().optional(),
    exchange_info: z.string().optional(),
    callback_note: z.string().optional(),
    hot_issue_note: z.string().optional(),
    post_course_care: z.string().optional(),
    handed_over_at: z.string().optional(),
    account_created_at: z.string().optional(),
  })
});

export const updateStudentSchema = z.object({
  body: z.object({
    enrollment_id: z.number().int().positive(),
    // Student fields
    external_id: z.string().optional(),
    full_name: z.string().min(1).optional(),
    gender: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional().or(z.literal('')),
    date_of_birth: z.string().optional(),
    occupation: z.string().optional(),
    zalo_uid: z.string().optional(),
    line_uid: z.string().optional(),
    note: z.string().optional(),

    // Enrollment & Course fields
    program_type: z.enum(['JLPT', 'KAIWA']).optional(),
    program_metadata: z.record(z.any()).optional().nullable(),
    cs_id: z.number().int().positive().optional(),
    package_code: z.string().optional(),
    paid_at: z.string().optional(),
    sale_name: z.string().optional(),
    student_source_status: z.string().optional(),
    course_content: z.string().optional(),
    payment_status: z.string().optional(),
    level: z.string().optional(),
    total_sessions: z.union([z.number(), z.string()]).optional(),
    external_remaining_sessions: z.union([z.number(), z.string()]).optional(),
    attended_previous_years: z.union([z.number(), z.string()]).optional().nullable(),
    class_model: z.string().optional(),
    sales_note: z.string().optional(),
    start_date: z.string().optional(),
    end_date: z.string().optional(),
    status: z.enum(['WAITING_CLASS', 'STUDYING', 'PAUSED', 'FINISHED', 'UPCOMING', 'NOT_STARTED', 'CANCELLED']).optional(),

    // Class & Schedule fields
    class_id: z.number().optional(),
    class_name: z.string().optional(),
    teacher_name: z.string().optional(),
    teacher_code: z.string().optional(),
    start_time: z.string().optional(),
    schedule_pattern: z.string().optional(),
    duration_minutes: z.union([z.number(), z.string()]).optional(),

    // Care & Reports fields
    study_report_url: z.string().optional(),
    exchange_info: z.string().optional(),
    callback_note: z.string().optional(),
    hot_issue_note: z.string().optional(),
    post_course_care: z.string().optional(),
    handed_over_at: z.string().optional(),
    account_created_at: z.string().optional(),
  })
});
