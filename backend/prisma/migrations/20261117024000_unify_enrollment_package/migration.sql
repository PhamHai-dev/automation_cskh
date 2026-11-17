-- Standardize the package/product source of truth for both programs:
--   enrollments.package_id -> packages
-- JLPT previously used `level` for "Gói SP" while package_id pointed at
-- "Mã khóa học". Preserve that old course code before relinking package_id.
ALTER TABLE `enrollments`
  ADD COLUMN `course_code` VARCHAR(191) NULL;

UPDATE `enrollments` e
LEFT JOIN `packages` old_pkg ON old_pkg.id = e.package_id
SET e.course_code = NULLIF(TRIM(old_pkg.code), '')
WHERE UPPER(e.program_type) = 'JLPT'
  AND e.course_code IS NULL;

INSERT INTO `packages` (`code`, `name`, `default_total_sessions`, `description`, `active`, `created_at`, `updated_at`)
SELECT legacy.package_code,
       CONCAT('Gói ', legacy.package_code),
       legacy.default_total_sessions,
       'Chuẩn hóa từ Gói SP JLPT lưu tại enrollments.level',
       TRUE,
       NOW(3),
       NOW(3)
FROM (
  SELECT TRIM(e.level) AS package_code,
         MAX(e.total_sessions) AS default_total_sessions
  FROM `enrollments` e
  WHERE UPPER(e.program_type) = 'JLPT'
    AND NULLIF(TRIM(e.level), '') IS NOT NULL
  GROUP BY TRIM(e.level)
) legacy
LEFT JOIN `packages` p ON p.code = legacy.package_code
WHERE p.id IS NULL;

UPDATE `enrollments` e
JOIN `packages` p ON p.code = TRIM(e.level)
SET e.package_id = p.id
WHERE UPPER(e.program_type) = 'JLPT'
  AND NULLIF(TRIM(e.level), '') IS NOT NULL;
