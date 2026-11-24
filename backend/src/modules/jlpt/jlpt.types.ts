import { ClassSessionType } from '@prisma/client';

export interface JlptTemplateItemInput {
  session_number: number;
  session_type: ClassSessionType;
  session_title?: string | null;
}

export interface JlptTemplateInput {
  name: string;
  total_sessions: number;
  active?: boolean;
  items: JlptTemplateItemInput[];
}

export interface JlptTemplateChangeRequestInput {
  class_id: number;
  proposed_items: JlptTemplateItemInput[];
  request_note?: string | null;
}

export interface JlptTemplateReviewInput {
  review_reason?: string | null;
}

export interface TemplateSessionDiff {
  session_number: number;
  class_session_id: number | null;
  expected: { session_type: ClassSessionType; session_title: string | null };
  actual: { session_type: ClassSessionType; session_title: string | null } | null;
  state: 'MATCHED' | 'MISMATCH' | 'MISSING';
}

export interface ClassTemplatePreview {
  class_id: number;
  class_code: string | null;
  class_name: string;
  diffs: TemplateSessionDiff[];
  extra_session_numbers: number[];
  can_apply: boolean;
}

export type JlptLearningRecordField =
  | 'preparation_rating'
  | 'attitude_rating'
  | 'homework_completed'
  | 'test_correct_answers';

export type JlptLearningRecordPatchInput =
  | { field: 'preparation_rating'; value: 'A' | 'B' | 'C' | null }
  | { field: 'attitude_rating'; value: 'A' | 'B' | 'C' | null }
  | { field: 'homework_completed'; value: boolean | null }
  | { field: 'test_correct_answers'; value: number | null };

export type JlptLearningRecordBulkInput = JlptLearningRecordPatchInput & {
  enrollment_class_ids: number[];
};
