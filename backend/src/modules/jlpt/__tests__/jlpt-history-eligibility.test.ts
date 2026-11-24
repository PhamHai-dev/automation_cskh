import { JlptRepository, jlptLearningEnrollmentEligibility } from '../jlpt.repository';
import { prisma } from '../../../prisma/client';

jest.mock('../../../prisma/client', () => ({ prisma: { enrollmentClass: { findMany: jest.fn() } } }));

describe('JLPT historical transfer eligibility', () => {
  it('includes only active or transferred enrollment with undeleted attendance in this exact session', () => {
    expect(jlptLearningEnrollmentEligibility(147)).toEqual({ OR: [
      { status: 'ACTIVE' },
      { status: 'TRANSFERRED', attendance: { some: { class_session_id: 147, deleted_at: null } } },
    ] });
    expect(jlptLearningEnrollmentEligibility(148)).not.toEqual(jlptLearningEnrollmentEligibility(147));
  });
  it('uses identical eligibility for read and write while preserving class, deleted-student and CS scope', () => {
    const find = prisma.enrollmentClass.findMany as jest.Mock;
    find.mockReturnValue([]);
    const repo = new JlptRepository();
    repo.listLearningRecordRows(15, 147, [4]);
    repo.findEnrollmentClassesForLearningWrite(15, 147, [16], [4]);
    const read = find.mock.calls[0][0].where;
    const write = find.mock.calls[1][0].where;
    for (const where of [read, write]) {
      expect(where.class_id).toBe(15);
      expect(where.OR).toEqual(jlptLearningEnrollmentEligibility(147).OR);
      expect(where.enrollment.student).toEqual({ deleted_at: null });
      expect(where.enrollment.OR).toEqual([{ cs_id: { in: [4] } }, { cs_viewers: { some: { cs_id: { in: [4] } } } }]);
    }
    expect(write.id).toEqual({ in: [16] });
  });
});
