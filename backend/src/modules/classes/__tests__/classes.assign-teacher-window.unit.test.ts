// D8 owner ruling (B1) 2026-10-26 — assignment termination must carry an
// EXPLICIT end_date, never a script-inferred one. classes.routes POST
// /:id/teachers is the only API surface that can write `active` on a
// ClassTeacher row (there is NO PATCH/DELETE unassign endpoint); the service
// now refuses active=false without end_date with 422 before touching the DB.
// Pure unit tests on the validator — no DB, no app boot.

import { ClassesService } from '../classes.service';
import { AppError } from '../../../middlewares/error.middleware';

// CustomError is module-private in classes.service; it carries .status like
// AppError. Assert on status + message structurally.
const CUSTOM_422 = 'Vui lòng nhập ngày kết thúc phân công khi cho GV ngừng phụ trách lớp';

describe('ClassesService.assertValidTeacherAssignmentWindow (ruling B1, 2026-10-26)', () => {
  const service = new ClassesService();

  it('active=false WITHOUT end_date -> 422 (explicit termination date required, never defaulted to today)', () => {
    const err = catchErr(() =>
      service.assertValidTeacherAssignmentWindow({ active: false, start_date: '2026-01-01', end_date: null })
    );
    expect(err.status).toBe(422);
    expect(err.message).toBe(CUSTOM_422);

    const err2 = catchErr(() => service.assertValidTeacherAssignmentWindow({ active: false }));
    expect(err2.status).toBe(422);
    expect(err2.message).toBe(CUSTOM_422);

    const err3 = catchErr(() =>
      service.assertValidTeacherAssignmentWindow({ active: false, start_date: '2026-01-01', end_date: '   ' })
    );
    expect(err3.status).toBe(422);
    expect(err3.message).toBe(CUSTOM_422);

    const err4 = catchErr(() =>
      service.assertValidTeacherAssignmentWindow({ active: false, end_date: 'not-a-date' })
    );
    expect(err4.status).toBe(422);
    expect(err4.message).toBe(CUSTOM_422);
  });

  it('active=false WITH explicit end_date passes (the ops path for recording a bounded termination)', () => {
    expect(() =>
      service.assertValidTeacherAssignmentWindow({
        active: false,
        start_date: '2026-01-01',
        end_date: '2026-06-30',
      })
    ).not.toThrow();
    // end_date alone (half-open historical window) is also acceptable —
    // B1 only requires the termination date, not a start.
    expect(() =>
      service.assertValidTeacherAssignmentWindow({ active: false, end_date: '2026-06-30' })
    ).not.toThrow();
  });

  it('active omitted / true passes unchanged (assignment creation is not termination)', () => {
    expect(() => service.assertValidTeacherAssignmentWindow({ start_date: '2026-01-01' })).not.toThrow();
    expect(() => service.assertValidTeacherAssignmentWindow({ active: true })).not.toThrow();
  });

  it('inverted window rejected when both bounds present (do-not-silently-accept nonsense dates)', () => {
    const err = catchErr(() =>
      service.assertValidTeacherAssignmentWindow({
        active: true,
        start_date: '2026-06-30',
        end_date: '2026-06-01',
      })
    );
    expect(err.status).toBe(422);
    expect(err.message).toBe('Ngày kết thúc phân công phải lớn hơn hoặc bằng ngày bắt đầu');
  });

  it('Date objects accepted alongside strings (DTO type is string | Date)', () => {
    expect(() =>
      service.assertValidTeacherAssignmentWindow({
        active: false,
        start_date: new Date('2026-01-01'),
        end_date: new Date('2026-06-30'),
      })
    ).not.toThrow();
  });
});

function catchErr(fn: () => void): { status: number; message: string } {
  try {
    fn();
  } catch (e: any) {
    return e;
  }
  throw new Error('expected assertValidTeacherAssignmentWindow to throw');
}

// Also pin the AppError-compat shape used by errorMiddleware mapping.
describe('AppError sanity', () => {
  it('AppError keeps status', () => {
    expect(new AppError(422, 'x').status).toBe(422);
  });
});
