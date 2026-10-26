// D8 owner ruling (2026-10-26) for Attendance Excel Import:
//   "Quyền theo phân công tại ngày dạy đã áp dụng cho nhập tay thì import
//    attendance lịch sử cũng cần tuân thủ... Lịch sử dạy/nhập điểm danh: theo
//    khoảng ngày đang xem hoặc ngày của từng ca. Thiếu bằng chứng phân công:
//    chuyển Admin xác minh."
// Pure unit tests (Prisma + lifecycle mocked): no DB, no server, no worker.

jest.mock('../../../prisma/client', () => ({
  prisma: {
    enrollmentClass: {
      findMany: jest.fn(),
    },
    classTeacher: {
      findMany: jest.fn(),
    },
    classSession: {
      findMany: jest.fn(),
    },
    attendance: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock('../attendance-lifecycle', () => ({
  deriveAttendanceReconciliationState: jest.fn((teacher: string | null, cs: string | null) => {
    if (!teacher) return 'PENDING_TEACHER';
    if (!cs) return 'PENDING_CS';
    return teacher === cs ? 'MATCHED' : 'CONFLICT';
  }),
  runAttendancePostCommit: jest.fn().mockResolvedValue(undefined),
}));

import ExcelJS from 'exceljs';
import { prisma } from '../../../prisma/client';
import { AttendanceImportService } from '../attendance-import.service';

const findEnrollmentClasses = prisma.enrollmentClass.findMany as jest.Mock;
const findClassTeachers = prisma.classTeacher.findMany as jest.Mock;
const findClassSessions = prisma.classSession.findMany as jest.Mock;
const findAttendance = prisma.attendance.findUnique as jest.Mock;
const transaction = prisma.$transaction as jest.Mock;

async function buildTeacherWorkbookBuffer(dates: string[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Lịch dạy');
  // Row 1: header with date columns starting at col 7 (G, H, ...)
  const headerRow = ws.getRow(1);
  headerRow.getCell(1).value = 'Model';
  headerRow.getCell(2).value = 'Mã HV';
  headerRow.getCell(6).value = 'Giờ học';
  dates.forEach((dateStr, idx) => {
    headerRow.getCell(7 + idx).value = dateStr;
  });

  // Row 2: one learner row with attendance "X" on each date column
  const dataRow = ws.getRow(2);
  dataRow.getCell(1).value = '1:1';
  dataRow.getCell(2).value = 'HV_D8_01';
  dataRow.getCell(6).value = '19:00 - 19:30';
  dates.forEach((_, idx) => {
    dataRow.getCell(7 + idx).value = 'X';
  });

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer as ArrayBuffer);
}

describe('AttendanceImportService D8 per-session-date teacher scope (owner ruling 2026-10-26)', () => {
  const teacherActor = { id: 42, roles: ['TEACHER'] };

  beforeEach(() => {
    jest.clearAllMocks();
    findEnrollmentClasses.mockResolvedValue([
      {
        id: 101,
        class_id: 202,
        enrollment: { id: 301, cs_id: 99 },
        class: { id: 202, class_name: 'Lớp N5 D8', class_code: 'CLS_D8_202', model_type: 'ONE_TO_ONE' },
      },
    ]);
    findClassSessions.mockResolvedValue([]);
    findAttendance.mockResolvedValue(null);
  });

  it('TEACHER importing 2 date columns on active=false assignment with explicit end_date: date inside [start_date, end_date] is CREATE/APPLY, date outside is OUT_OF_SCOPE/SKIP', async () => {
    findClassTeachers.mockResolvedValue([
      {
        active: false,
        start_date: new Date('2026-10-01T00:00:00.000Z'),
        end_date: new Date('2026-10-22T00:00:00.000Z'),
      },
    ]);

    const buffer = await buildTeacherWorkbookBuffer(['2026-10-15', '2026-10-25']);
    const service = new AttendanceImportService();
    const preview = await service.preview(buffer, 'TEACHER', 2026, teacherActor);

    expect(preview.items).toHaveLength(2);
    const inWindow = preview.items.find((i) => i.targetDate === '2026-10-15')!;
    const afterWindow = preview.items.find((i) => i.targetDate === '2026-10-25')!;

    expect(inWindow.classification).toBe('CREATE');
    expect(inWindow.defaultAction).toBe('APPLY');
    expect(inWindow.sessionPlans).toHaveLength(1);

    expect(afterWindow.classification).toBe('OUT_OF_SCOPE');
    expect(afterWindow.defaultAction).toBe('SKIP');
    expect(afterWindow.messages).toContain('Lớp hoặc học viên nằm ngoài data scope của tài khoản upload');

    // Query must NOT filter by active: true on classTeacher
    expect(findClassTeachers).toHaveBeenCalledWith({
      where: {
        class_id: 202,
        teacher: { user_id: 42, active: true },
      },
      select: { active: true, start_date: true, end_date: true },
    });

    // Even if caller passes actions override forcing APPLY on the OUT_OF_SCOPE item, commit skips it
    const tx = {
      classSession: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 501 }),
      },
      attendance: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 601 }),
        update: jest.fn(),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    transaction.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx));

    const commitRes = await service.commit(preview, teacherActor, {
      [inWindow.id]: 'APPLY',
      [afterWindow.id]: 'APPLY',
    });

    expect(commitRes.createdAttendances).toBe(1);
    expect(commitRes.skipped).toBe(1);
  });

  it('TEACHER importing 2 date columns on active=true assignment: date before start_date or after end_date is OUT_OF_SCOPE', async () => {
    findClassTeachers.mockResolvedValue([
      {
        active: true,
        start_date: new Date('2026-10-10T00:00:00.000Z'),
        end_date: new Date('2026-10-20T00:00:00.000Z'),
      },
    ]);

    const buffer = await buildTeacherWorkbookBuffer(['2026-10-15', '2026-10-25']);
    const preview = await new AttendanceImportService().preview(buffer, 'TEACHER', 2026, teacherActor);

    const inWindow = preview.items.find((i) => i.targetDate === '2026-10-15')!;
    const afterWindow = preview.items.find((i) => i.targetDate === '2026-10-25')!;

    expect(inWindow.classification).toBe('CREATE');
    expect(afterWindow.classification).toBe('OUT_OF_SCOPE');
  });

  it('TEACHER with active=false and end_date=null (ambiguous removal boundary) is rejected OUT_OF_SCOPE on all dates -> Admin verification path', async () => {
    findClassTeachers.mockResolvedValue([
      {
        active: false,
        start_date: new Date('2026-10-01T00:00:00.000Z'),
        end_date: null,
      },
    ]);

    const buffer = await buildTeacherWorkbookBuffer(['2026-10-15', '2026-10-25']);
    const preview = await new AttendanceImportService().preview(buffer, 'TEACHER', 2026, teacherActor);

    expect(preview.summary.OUT_OF_SCOPE).toBe(2);
    expect(preview.summary.CREATE).toBe(0);
    for (const item of preview.items) {
      expect(item.classification).toBe('OUT_OF_SCOPE');
      expect(item.defaultAction).toBe('SKIP');
    }
  });
});
