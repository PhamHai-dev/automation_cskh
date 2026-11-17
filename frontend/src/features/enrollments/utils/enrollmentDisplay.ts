type EnrollmentPackageDisplayInput = {
  package?: { name?: string | null; code?: string | null } | null;
  level?: string | null;
  course_content?: string | null;
};

/**
 * Chuẩn hóa tên gói hiển thị trên Web.
 * `Enrollment.package` là source of truth chung cho Kaiwa "Gói học" và
 * JLPT "Gói SP". `level`/`course_content` chỉ còn là fallback dữ liệu cũ.
 */
export const getEnrollmentPackageLabel = (enrollment?: EnrollmentPackageDisplayInput | null): string => {
  if (!enrollment) return '—';

  const candidates = [
    enrollment.package?.name,
    enrollment.package?.code,
    enrollment.level,
    enrollment.course_content,
  ];

  return candidates.find((value) => {
    const normalized = String(value ?? '').trim();
    return normalized !== '' && normalized !== '-' && normalized !== '—';
  })?.toString().trim() || '—';
};
