import {
  classifyPrograms,
  inferJlptLevel,
  normalizeProgramType,
  summarizeRows,
  type JlptClassificationAuditRow,
} from '../jlpt-classification-audit';

describe('jlpt-classification-audit pure helpers', () => {
  it('normalizes legacy JNPT and canonical values', () => {
    expect(normalizeProgramType(' jlpt ')).toBe('JLPT');
    expect(normalizeProgramType('JNPT')).toBe('JLPT');
    expect(normalizeProgramType('KAIWA')).toBe('KAIWA');
    expect(normalizeProgramType('unknown')).toBeNull();
  });

  it('classifies mixed and unknown enrollment programs without guessing', () => {
    expect(classifyPrograms(['KAIWA'])).toBe('KAIWA');
    expect(classifyPrograms(['JLPT', 'JNPT'])).toBe('JLPT');
    expect(classifyPrograms(['KAIWA', 'JLPT'])).toBe('MIXED');
    expect(classifyPrograms([])).toBe('UNKNOWN');
  });

  it('infers a level only when class code and every active course code agree', () => {
    expect(inferJlptLevel('JLPT-N4-01', ['N4-2026'])).toBe('N4');
    expect(inferJlptLevel('JLPT-N4-01', ['N4-A', 'N4-B'])).toBe('N4');
    expect(inferJlptLevel('JLPT-N4-01', ['N3-2026'])).toBeNull();
    expect(inferJlptLevel('JLPT-Combo-N3-N4', ['N4-2026'])).toBeNull();
    expect(inferJlptLevel('JLPT-N4-01', [])).toBeNull();
  });

  it('summarizes export-level and active-course review separately from the global template', () => {
    const base = {
      classCode: null,
      className: 'Class',
      proposedLevel: null,
      activeEnrollmentClassCount: 1,
      rawProgramTypes: ['JLPT'],
      historicalCourseCodes: [],
      reasons: [],
    };
    const rows: JlptClassificationAuditRow[] = [
      { ...base, classId: 1, classification: 'KAIWA', level: null, activeCourseCodes: [] },
      { ...base, classId: 2, classification: 'JLPT', level: 'N4', activeCourseCodes: ['COURSE'] },
      { ...base, classId: 3, classification: 'JLPT', level: null, proposedLevel: 'N5', activeCourseCodes: [] },
      { ...base, classId: 4, classification: 'JLPT', level: 'legacy', activeCourseCodes: ['A', 'B'] },
      { ...base, classId: 5, classification: 'MIXED', level: 'N4', activeCourseCodes: ['C'] },
      { ...base, classId: 6, classification: 'UNKNOWN', level: null, activeCourseCodes: [] },
    ];

    expect(summarizeRows(rows)).toEqual({
      totalClasses: 6,
      kaiwa: 1,
      jlpt: 3,
      jlptValidExportLevel: 1,
      jlptSafeInferredLevel: 1,
      jlptManualLevelReview: 1,
      jlptUniqueActiveCourseCode: 1,
      jlptMissingActiveCourseCode: 1,
      jlptMultipleActiveCourseCodes: 1,
      mixed: 1,
      unknown: 1,
    });
  });
});
