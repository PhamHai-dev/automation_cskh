import { ClassSessionType, JlptTemplateChangeRequestStatus, ProgramType } from '@prisma/client';
import { getAccessibleClassIds, assertClassAccess } from '../../classes/classes.scope';
import { getStudentCsScope } from '../../students/students.repository';
import { JlptService } from '../jlpt.service';

jest.mock('../../classes/classes.scope', () => ({
  getAccessibleClassIds: jest.fn(),
  assertClassAccess: jest.fn(),
}));
jest.mock('../../students/students.repository', () => ({
  getStudentCsScope: jest.fn(),
}));

const mockedGetAccessibleClassIds = getAccessibleClassIds as jest.MockedFunction<typeof getAccessibleClassIds>;
const mockedAssertClassAccess = assertClassAccess as jest.MockedFunction<typeof assertClassAccess>;
const mockedGetStudentCsScope = getStudentCsScope as jest.MockedFunction<typeof getStudentCsScope>;

const admin = { id: 1, roles: ['ADMIN'] };
const manager = { id: 2, roles: ['MANAGE'] };
const teacher = { id: 3, roles: ['TEACHER'] };
const cs = { id: 4, roles: ['CS'] };

const lesson = (session_number: number) => ({
  session_number,
  session_type: ClassSessionType.LESSON,
  session_title: null,
});
const test = (session_number: number, session_title = `KT ${session_number}`) => ({
  session_number,
  session_type: ClassSessionType.TEST,
  session_title,
});

function repository(overrides: Record<string, unknown> = {}) {
  return {
    listTemplates: jest.fn(),
    findTemplateById: jest.fn(),
    findGlobalTemplate: jest.fn(),
    createTemplate: jest.fn(),
    updateTemplate: jest.fn(),
    deleteTemplate: jest.fn(),
    countJlptDependencies: jest.fn(),
    findClassesForPreview: jest.fn(),
    applyTemplateToClasses: jest.fn(),
    findAllJlptClassIds: jest.fn().mockResolvedValue([]),
    findClassProgramState: jest.fn(),
    findClassById: jest.fn(),
    updateClassProgram: jest.fn(),
    createChangeRequest: jest.fn(),
    findChangeRequest: jest.fn(),
    reviewChangeRequest: jest.fn(),
    findLearningContext: jest.fn(),
    findTeacherAssignments: jest.fn(),
    listLearningRecordRows: jest.fn(),
    findEnrollmentClassIdentity: jest.fn(),
    findEnrollmentClassesForLearningWrite: jest.fn(),
    saveLearningRecord: jest.fn(),
    saveLearningRecordsBulk: jest.fn(),
    ...overrides,
  } as any;
}

describe('JlptService template validation', () => {
  const service = new JlptService(repository());

  it('accepts contiguous positions and dynamic TEST positions', () => {
    expect(() => service.validateTemplateItems([lesson(1), test(2), lesson(3)], 3)).not.toThrow();
    expect(() => service.validateTemplateItems([test(1), lesson(2), test(3, 'Thi cuối khóa')], 3)).not.toThrow();
  });

  it('rejects missing and duplicate positions', () => {
    expect(() => service.validateTemplateItems([lesson(1), lesson(3)], 3)).toThrow(
      expect.objectContaining({ status: 400 }),
    );
    expect(() => service.validateTemplateItems([lesson(1), lesson(1)], 2)).toThrow(
      expect.objectContaining({ status: 409 }),
    );
  });

  it('requires unique nonblank TEST titles', () => {
    expect(() => service.validateTemplateItems([test(1, '   ')], 1)).toThrow(
      expect.objectContaining({ status: 400 }),
    );
    expect(() => service.validateTemplateItems([test(1, 'KT 1'), test(2, 'kt 1')], 2)).toThrow(
      expect.objectContaining({ status: 409 }),
    );
  });
});

describe('JlptService singleton and RBAC', () => {
  beforeEach(() => {
    mockedGetAccessibleClassIds.mockReset();
    mockedAssertClassAccess.mockReset().mockResolvedValue();
  });

  it('maps a second global-template create to 409', async () => {
    const repo = repository({ createTemplate: jest.fn().mockResolvedValue(null) });
    const service = new JlptService(repo);
    await expect(service.createTemplate({ name: 'Global', total_sessions: 1, items: [lesson(1)] }, admin))
      .rejects.toMatchObject({ status: 409 });
  });

  it('allows only ADMIN to create and delete the singleton', async () => {
    const service = new JlptService(repository());
    await expect(service.createTemplate({ name: 'Global', total_sessions: 1, items: [lesson(1)] }, manager))
      .rejects.toMatchObject({ status: 403 });
    await expect(service.deleteTemplate(1, manager)).rejects.toMatchObject({ status: 403 });
  });

  it('denies MANAGE global update when any JLPT class is outside scope', async () => {
    mockedGetAccessibleClassIds.mockResolvedValue([10]);
    const repo = repository({ findAllJlptClassIds: jest.fn().mockResolvedValue([10, 11]) });
    const service = new JlptService(repo);
    await expect(service.updateTemplate(1, { name: 'Global', total_sessions: 1, items: [lesson(1)] }, manager))
      .rejects.toMatchObject({ status: 403 });
    expect(repo.updateTemplate).not.toHaveBeenCalled();
  });

  it('allows MANAGE global update only when all JLPT classes are in scope', async () => {
    mockedGetAccessibleClassIds.mockResolvedValue([10, 11]);
    const updated = { id: 1 };
    const repo = repository({
      findAllJlptClassIds: jest.fn().mockResolvedValue([10, 11]),
      updateTemplate: jest.fn().mockResolvedValue(updated),
    });
    const service = new JlptService(repo);
    await expect(service.updateTemplate(1, { name: ' Global ', total_sessions: 1, items: [lesson(1)] }, manager))
      .resolves.toBe(updated);
    expect(repo.updateTemplate).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ name: 'Global' }),
      manager.id,
    );
  });

  it.each([cs, manager, admin])('rejects a non-teacher change request actor %#', async (actor) => {
    const service = new JlptService(repository());
    await expect(service.submitChangeRequest(1, { class_id: 10, proposed_items: [lesson(1)] }, actor))
      .rejects.toMatchObject({ status: 403 });
  });

  it('allows an assigned teacher to submit from a JLPT class and normalizes titles', async () => {
    const created = { id: 5 };
    const repo = repository({
      findClassesForPreview: jest.fn().mockResolvedValue([{ id: 10, program_type: ProgramType.JLPT }]),
      createChangeRequest: jest.fn().mockResolvedValue(created),
    });
    const service = new JlptService(repo);
    await expect(service.submitChangeRequest(1, {
      class_id: 10,
      proposed_items: [test(1, '  KT giữa kỳ  ')],
      request_note: '  xin đổi  ',
    }, teacher)).resolves.toBe(created);
    expect(mockedAssertClassAccess).toHaveBeenCalledWith(teacher, 10, expect.any(String));
    expect(repo.createChangeRequest).toHaveBeenCalledWith(
      1,
      10,
      [{ session_number: 1, session_type: ClassSessionType.TEST, session_title: 'KT giữa kỳ' }],
      'xin đổi',
      teacher.id,
    );
  });
});

describe('JlptService preview, apply and program transitions', () => {
  beforeEach(() => {
    mockedGetAccessibleClassIds.mockReset().mockResolvedValue(null);
    mockedAssertClassAccess.mockReset().mockResolvedValue();
  });

  it('reports matched, mismatched, missing and extra sessions without writing', async () => {
    const template = { id: 1, items: [lesson(1), test(2, 'KT 1'), lesson(3)] };
    const repo = repository({
      findTemplateById: jest.fn().mockResolvedValue(template),
      findClassesForPreview: jest.fn().mockResolvedValue([{
        id: 10,
        class_code: 'JLPT-N4',
        class_name: 'N4',
        program_type: ProgramType.JLPT,
        class_sessions: [
          { id: 101, session_number: 1, session_type: ClassSessionType.LESSON, session_title: null },
          { id: 102, session_number: 2, session_type: ClassSessionType.LESSON, session_title: null },
          { id: 104, session_number: 4, session_type: ClassSessionType.LESSON, session_title: null },
        ],
      }]),
    });
    const service = new JlptService(repo);
    const result = await service.previewTemplate(1, [10], admin);
    expect(result.classes[0].diffs.map((item) => item.state)).toEqual(['MATCHED', 'MISMATCH', 'MISSING']);
    expect(result.classes[0].extra_session_numbers).toEqual([4]);
    expect(repo.applyTemplateToClasses).not.toHaveBeenCalled();
  });

  it('applies only through repository after a scoped class preview', async () => {
    const template = { id: 1, items: [lesson(1)] };
    const repo = repository({
      findGlobalTemplate: jest.fn().mockResolvedValue(template),
      findTemplateById: jest.fn().mockResolvedValue(template),
      findClassesForPreview: jest.fn().mockResolvedValue([{
        id: 10,
        class_code: 'N4',
        class_name: 'N4',
        program_type: ProgramType.JLPT,
        class_sessions: [],
      }]),
      applyTemplateToClasses: jest.fn().mockResolvedValue({}),
    });
    const service = new JlptService(repo);
    const result = await service.applyTemplateToClass(10, manager);
    expect(result.class.diffs[0].state).toBe('MISSING');
    expect(repo.applyTemplateToClasses).toHaveBeenCalledWith(1, [result.class], manager.id);
  });

  it('blocks KAIWA to JLPT when no active global template exists', async () => {
    const repo = repository({
      findClassProgramState: jest.fn().mockResolvedValue({
        id: 10,
        program_type: ProgramType.KAIWA,
        enrollment_classes: [],
        jlpt_template_change_requests: [],
      }),
      findGlobalTemplate: jest.fn().mockResolvedValue(null),
    });
    const service = new JlptService(repo);
    await expect(service.changeClassProgram(10, ProgramType.JLPT, manager))
      .rejects.toMatchObject({ status: 409 });
  });

  it('blocks JLPT to KAIWA when learning records or pending requests exist', async () => {
    const repo = repository({
      findClassProgramState: jest.fn().mockResolvedValue({
        id: 10,
        program_type: ProgramType.JLPT,
        enrollment_classes: [{ jlpt_learning_records: [{ id: 1 }] }],
        jlpt_template_change_requests: [],
      }),
    });
    const service = new JlptService(repo);
    await expect(service.changeClassProgram(10, ProgramType.KAIWA, admin))
      .rejects.toMatchObject({ status: 409 });
  });

  it('returns the Class record on a no-op program transition', async () => {
    const currentClass = { id: 10, class_name: 'N4', program_type: ProgramType.JLPT };
    const repo = repository({
      findClassProgramState: jest.fn().mockResolvedValue({
        id: 10,
        program_type: ProgramType.JLPT,
        enrollment_classes: [],
        jlpt_template_change_requests: [],
      }),
      findClassById: jest.fn().mockResolvedValue(currentClass),
    });
    const service = new JlptService(repo);
    await expect(service.changeClassProgram(10, ProgramType.JLPT, admin)).resolves.toBe(currentClass);
    expect(repo.updateClassProgram).not.toHaveBeenCalled();
  });

  it('rejects malformed approval snapshots before persistence', async () => {
    const repo = repository({
      findChangeRequest: jest.fn().mockResolvedValue({
        id: 9,
        status: JlptTemplateChangeRequestStatus.PENDING,
        proposed_snapshot: { invalid: true },
      }),
    });
    const service = new JlptService(repo);
    await expect(service.approveChangeRequest(9, null, admin)).rejects.toMatchObject({ status: 409 });
    expect(repo.reviewChangeRequest).not.toHaveBeenCalled();
  });
});

describe('JlptService learning records', () => {
  const context = {
    id: 100,
    class_id: 10,
    session_date: new Date('2026-11-20T00:00:00.000Z'),
    class: { id: 10, program_type: ProgramType.JLPT },
  };

  beforeEach(() => {
    mockedAssertClassAccess.mockReset().mockResolvedValue();
    mockedGetStudentCsScope.mockReset();
  });

  it('filters CS rows through owner/viewer scope and keeps attendance projection', async () => {
    mockedGetStudentCsScope.mockResolvedValue([4]);
    const repo = repository({
      findLearningContext: jest.fn().mockResolvedValue(context),
      listLearningRecordRows: jest.fn().mockResolvedValue([{
        id: 55,
        enrollment: { student: { id: 7, full_name: 'An' } },
        attendance: [{ id: 8, status: 'ATTENDED' }],
        jlpt_learning_records: [],
      }]),
    });
    const service = new JlptService(repo);

    await expect(service.listLearningRecords(10, 100, cs)).resolves.toEqual([{
      enrollment_class_id: 55,
      student: { id: 7, full_name: 'An' },
      attendance: { id: 8, status: 'ATTENDED' },
      learning_record: null,
    }]);
    expect(repo.listLearningRecordRows).toHaveBeenCalledWith(10, 100, [4]);
  });

  it('uses the pure-teacher attendance privacy presenter on list rows', async () => {
    const repo = repository({
      findLearningContext: jest.fn().mockResolvedValue(context),
      listLearningRecordRows: jest.fn().mockResolvedValue([{
        id: 55,
        enrollment: { student: { id: 7, full_name: 'An' } },
        attendance: [{
          id: 8,
          enrollment_class_id: 55,
          class_session_id: 100,
          status: 'ATTENDED',
          teacher_status: 'ATTENDED',
          cs_status: 'ABSENT_APPROVED_A',
          source: 'MANUAL',
        }],
        jlpt_learning_records: [],
      }]),
    });
    const service = new JlptService(repo);
    const rows = await service.listLearningRecords(10, 100, teacher);

    expect((rows[0].attendance as any).teacher_status).toBe('ATTENDED');
    expect((rows[0].attendance as any).cs_status).toBeUndefined();
    expect(repo.listLearningRecordRows).toHaveBeenCalledWith(10, 100, undefined);
  });

  it('keeps CS read-only even when the class is accessible', async () => {
    const service = new JlptService(repository());
    await expect(service.updateLearningRecord(
      10,
      100,
      55,
      { field: 'preparation_rating', value: 'A' },
      cs,
    )).rejects.toMatchObject({ status: 403 });
  });

  it('requires a teacher assignment effective on the session date', async () => {
    const repo = repository({
      findLearningContext: jest.fn().mockResolvedValue(context),
      findTeacherAssignments: jest.fn().mockResolvedValue([{
        active: true,
        start_date: new Date('2026-11-21T00:00:00.000Z'),
        end_date: null,
      }]),
    });
    const service = new JlptService(repo);
    await expect(service.updateLearningRecord(
      10,
      100,
      55,
      { field: 'attitude_rating', value: 'B' },
      teacher,
    )).rejects.toMatchObject({ status: 403 });
    expect(repo.saveLearningRecord).not.toHaveBeenCalled();
  });

  it('validates the complete selection before one all-or-nothing bulk write', async () => {
    const records = [{ id: 1 }, { id: 2 }];
    const repo = repository({
      findLearningContext: jest.fn().mockResolvedValue(context),
      findEnrollmentClassesForLearningWrite: jest.fn().mockResolvedValue([{ id: 55 }, { id: 56 }]),
      saveLearningRecordsBulk: jest.fn().mockResolvedValue(records),
    });
    const service = new JlptService(repo);
    await expect(service.updateLearningRecordsBulk(
      10,
      100,
      { enrollment_class_ids: [55, 56], field: 'homework_completed', value: true },
      admin,
    )).resolves.toBe(records);
    expect(repo.saveLearningRecordsBulk).toHaveBeenCalledTimes(1);
  });

  it('rejects a cross-class enrollment before persistence', async () => {
    const repo = repository({
      findLearningContext: jest.fn().mockResolvedValue(context),
      findEnrollmentClassesForLearningWrite: jest.fn().mockResolvedValue([]),
      findEnrollmentClassIdentity: jest.fn().mockResolvedValue({ id: 55, class_id: 99, status: 'ACTIVE' }),
    });
    const service = new JlptService(repo);
    await expect(service.updateLearningRecord(
      10,
      100,
      55,
      { field: 'test_correct_answers', value: 12 },
      admin,
    )).rejects.toMatchObject({ status: 409 });
    expect(repo.saveLearningRecord).not.toHaveBeenCalled();
  });

  it('writes an eligible historical transfer with the exact session and effective teacher assignment', async () => {
    const repo = repository({
      findLearningContext: jest.fn().mockResolvedValue(context),
      findTeacherAssignments: jest.fn().mockResolvedValue([{ active: true, start_date: null, end_date: null }]),
      findEnrollmentClassesForLearningWrite: jest.fn().mockResolvedValue([{ id: 55 }]),
      saveLearningRecord: jest.fn().mockResolvedValue({ id: 90, preparation_rating: 'A' }),
    });
    await expect(new JlptService(repo).updateLearningRecord(10, 100, 55,
      { field: 'preparation_rating', value: 'A' }, teacher)).resolves.toMatchObject({ preparation_rating: 'A' });
    expect(repo.findEnrollmentClassesForLearningWrite).toHaveBeenCalledWith(10, 100, [55], undefined);
    expect(repo.saveLearningRecord).toHaveBeenCalledWith(100, 55, { field: 'preparation_rating', value: 'A' }, teacher.id);
  });

  it('rejects a transfer without attendance in the requested session', async () => {
    const repo = repository({
      findLearningContext: jest.fn().mockResolvedValue(context),
      findEnrollmentClassesForLearningWrite: jest.fn().mockResolvedValue([]),
      findEnrollmentClassIdentity: jest.fn().mockResolvedValue({ id: 55, class_id: 10, status: 'TRANSFERRED' }),
    });
    await expect(new JlptService(repo).updateLearningRecord(10, 100, 55,
      { field: 'preparation_rating', value: 'A' }, admin)).rejects.toMatchObject({ status: 409 });
    expect(repo.findEnrollmentClassesForLearningWrite).toHaveBeenCalledWith(10, 100, [55], undefined);
    expect(repo.saveLearningRecord).not.toHaveBeenCalled();
  });
});
