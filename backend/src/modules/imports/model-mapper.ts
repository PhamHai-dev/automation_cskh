import { ClassModelType } from '@prisma/client';

/**
 * E.1 — single canonical mapper for class model (1-1 / 1-2 / nhóm), shared by
 * ALL ingestion paths (workbook bulk import, single-student import, approval
 * queue, sheet sync). Previously only sheet-sync parsed the raw hint while the
 * other three hard-coded ONE_TO_ONE, so the same row could classify
 * differently depending on the path.
 *
 * Owner-confirmed basis ([PC-USER A.1]): 1-1 classes are FLEXIBLE — they may
 * carry an underlying schedule; "flexible" does NOT mean MANUAL_ONLY and does
 * not imply any model other than what the data says. Group classes are the
 * fixed-model side. The model therefore comes from the recorded class-model
 * hint, never inferred from schedule presence.
 *
 * Decision rule (case-insensitive, on the raw cell text):
 *   - contains "1-2" or "1:2"              → ONE_TO_TWO
 *   - contains "1-n", "1:n", or "nhóm"     → ONE_TO_N
 *   - missing/empty/unrecognized hint      → ONE_TO_ONE (documented fallback;
 *     preserves the historical default of the three hard-coded sites, and a
 *     blank model cell must never fabricate a group class)
 */
export function classifyClassModel(rawModel: string | null | undefined): ClassModelType {
  const m = (rawModel || '').toLowerCase();
  if (m.includes('1-2') || m.includes('1:2')) return ClassModelType.ONE_TO_TWO;
  if (
    m.includes('1-n') ||
    m.includes('1:n') ||
    m.includes('1-10') ||
    m.includes('1:10') ||
    m.includes('nhóm') ||
    m.includes('nhom')
  ) {
    return ClassModelType.ONE_TO_N;
  }
  return ClassModelType.ONE_TO_ONE;
}

/**
 * True when classifyClassModel would FALL BACK (empty/unrecognized hint — i.e.
 * the result is not actually supported by the cell). Approved owner policy
 * (2026-10-25): the 1-1 fallback is kept for compatibility, but a NEW class
 * about to be created from a fallback must be surfaced as a preview warning —
 * a blank cell must never silently classify a group class as 1-1.
 */
export function classModelFallbackUsed(rawModel: string | null | undefined): boolean {
  const m = (rawModel || '').toLowerCase().trim();
  if (!m) return true;
  if (m.includes('1-2') || m.includes('1:2')) return false;
  if (
    m.includes('1-n') ||
    m.includes('1:n') ||
    m.includes('1-10') ||
    m.includes('1:10') ||
    m.includes('nhóm') ||
    m.includes('nhom')
  ) {
    return false;
  }
  // An explicit 1-1 spelling is a supported answer, not a fallback.
  if (m.includes('1-1') || m.includes('1:1')) return false;
  return true;
}

/**
 * Pure preview-warning derivation (D-approval follow-up, 2026-10-25): when a
 * row references a class that does not exist yet AND the class_model cell
 * would fall back, return the warning text; otherwise null. Extracted so it is
 * unit-testable without ExcelJS file I/O.
 */
export function deriveModelFallbackWarning(
  className: string | null | undefined,
  rawModel: string | null | undefined,
  classExists: boolean,
): string | null {
  if (classExists) return null;
  const name = (className || '').trim();
  if (!name) return null;
  if (!classModelFallbackUsed(rawModel)) return null;
  return `Lớp mới "${name}" sẽ được tạo với mô hình 1-1 do ô class_model trống/không nhận diện được — kiểm tra lại nếu đây là lớp nhóm`;
}
