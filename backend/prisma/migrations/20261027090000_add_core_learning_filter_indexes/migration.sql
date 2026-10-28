-- Migration: add_core_learning_filter_indexes
-- Created: 2026-10-27
-- Non-destructive index additions for server-side filtering, search, and pagination
-- on students, enrollments, classes, class_teachers, and teachers.

-- 1. students
CREATE INDEX `students_full_name_idx` ON `students`(`full_name`);
CREATE INDEX `students_phone_idx` ON `students`(`phone`);
CREATE INDEX `students_email_idx` ON `students`(`email`);
CREATE INDEX `students_gender_idx` ON `students`(`gender`);

-- 2. enrollments
CREATE INDEX `enrollments_cs_id_status_program_type_created_at_idx` ON `enrollments`(`cs_id`, `status`, `program_type`, `created_at`);
CREATE INDEX `enrollments_student_id_idx` ON `enrollments`(`student_id`);
CREATE INDEX `enrollments_status_idx` ON `enrollments`(`status`);

-- 3. teachers
CREATE INDEX `teachers_name_idx` ON `teachers`(`name`);
CREATE INDEX `teachers_teacher_type_active_idx` ON `teachers`(`teacher_type`, `active`);

-- 4. classes
CREATE INDEX `classes_class_code_idx` ON `classes`(`class_code`);
CREATE INDEX `classes_class_name_idx` ON `classes`(`class_name`);
CREATE INDEX `classes_model_type_active_idx` ON `classes`(`model_type`, `active`);

-- 5. class_teachers
CREATE INDEX `class_teachers_class_id_active_idx` ON `class_teachers`(`class_id`, `active`);
CREATE INDEX `class_teachers_teacher_id_active_idx` ON `class_teachers`(`teacher_id`, `active`);
