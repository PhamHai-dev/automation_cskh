jest.mock('../../../prisma/client', () => ({ prisma: {
  student: { findMany: jest.fn() },
  classTeacher: { findMany: jest.fn() },
  manageAssignment: { findMany: jest.fn() },
} }));
import ExcelJS from 'exceljs';
import { prisma } from '../../../prisma/client';
import { ImportsService } from '../imports.service';

const db = prisma as any;
const fixtures = [
  { id: 1, external_id: 'A', full_name: 'Student A', enrollments: [{ cs_id: 10, total_sessions: 30, enrollment_classes: [{ class_id: 7, class: { class_name: 'Class A' } }] }] },
  { id: 2, external_id: 'B', full_name: 'Student B', enrollments: [{ cs_id: 11, total_sessions: 30, enrollment_classes: [{ class_id: 8, class: { class_name: 'Class B' } }] }] },
];

describe('student workbook export scope (mock DB)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.classTeacher.findMany.mockResolvedValue([{ class_id: 7 }]);
    db.manageAssignment.findMany.mockResolvedValue([{ cs_group: { members: [{ user_id: 11 }] } }]);
    db.student.findMany.mockImplementation(async ({ where }: any) => {
      const scope = where?.enrollments.some;
      if (!scope) return fixtures;
      return fixtures.filter(s => s.enrollments.some(e => {
        if (scope.cs_id !== undefined) return typeof scope.cs_id === 'number' ? e.cs_id === scope.cs_id : scope.cs_id.in.includes(e.cs_id);
        return e.enrollment_classes.some(ec => scope.enrollment_classes.some.class_id.in.includes(ec.class_id));
      }));
    });
  });

  it.each([
    ['ADMIN', 1, ['Student A', 'Student B']],
    ['MANAGE', 20, ['Student B']],
    ['CS', 10, ['Student A']],
    ['TEACHER', 30, ['Student A']],
  ])('%s workbook contains only scoped students', async (role, id, expected) => {
    const buffer = await new ImportsService().exportStudents({ id, roles: [role] });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const names: string[] = [];
    workbook.worksheets[0].eachRow((row, number) => {
      if (number > 1) names.push(String(row.getCell(2).value));
    });
    expect(names).toEqual(expected);
  });

  it('teacher with no assignments gets a header-only workbook, never full export', async () => {
    db.classTeacher.findMany.mockResolvedValue([]);
    const buffer = await new ImportsService().exportStudents({ id: 30, roles: ['TEACHER'] });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    expect(workbook.worksheets[0].rowCount).toBe(1);
  });
});
