import ExcelJS from 'exceljs';
import { AttendanceStatus } from '@prisma/client';
import {
  exportAttendanceValue,
  exportNoteValue,
  parseAttendanceValue,
  parseJlptWorkbook,
} from '../jlpt-workbook.parser';

describe('JLPT NKHT workbook parser', () => {
  it.each([
    ['O', null, AttendanceStatus.ATTENDED, false, null],
    ['0.5X', null, AttendanceStatus.ATTENDED, false, null],
    ['X', null, AttendanceStatus.ABSENT_UNAPPROVED_C, false, null],
    ['X', '[STATUS:LEAVE_B] Có phép', AttendanceStatus.LEAVE_B, false, 'Có phép'],
    ['X', 'Báo ốm', null, true, 'Báo ốm'],
  ])('maps legacy attendance %s without leaking it to web', (raw, note, status, ambiguous, cleanNote) => {
    expect(parseAttendanceValue(raw, note)).toMatchObject({ status, ambiguous, cleanNote });
  });

  it('exports exact round-trip marker and never exports 0.5X', () => {
    expect(exportAttendanceValue(AttendanceStatus.ATTENDED)).toBe('O');
    expect(exportAttendanceValue(AttendanceStatus.LEAVE_B)).toBe('X');
    expect(exportNoteValue(AttendanceStatus.LEAVE_B, 'Có phép')).toBe('[STATUS:LEAVE_B] Có phép');
    const roundTrip = parseAttendanceValue('X', '[STATUS:LEAVE_B] Có phép');
    expect(roundTrip).toMatchObject({ status: AttendanceStatus.LEAVE_B, cleanNote: 'Có phép', ambiguous: false });
  });

  it('parses six criteria and dynamic TEST metadata from a workbook fixture', async () => {
    const workbook = new ExcelJS.Workbook();
    const info = workbook.addWorksheet('Info');
    info.addRow(['Mã học viên', 'Họ và tên', 'Mã lớp']);
    info.addRow(['HV001', 'Nguyễn Văn A', 'N4_TEST']);
    const sheet = workbook.addWorksheet('NKHT N4');
    sheet.addRow(['Index', 'Mã giáo viên', 'Mã lớp', 'Họ và tên', 'Tiêu chí', 'Buổi 1', 'KT1']);
    sheet.addRow([null, 'GV01', 'N4_TEST', 'Nguyễn Văn A', 'Chuyên cần', 'O', 'X']);
    sheet.addRow([null, null, null, null, 'Chuẩn bị bài ở nhà', 'A', 'B']);
    sheet.addRow([null, null, null, null, 'Thái độ học tập trong lớp', 'B', 'C']);
    sheet.addRow([null, null, null, null, 'Điểm bài tập về nhà', 'Có', 'Không']);
    sheet.addRow([null, null, null, null, 'Điểm kiểm tra', '10', '12']);
    sheet.addRow([null, null, null, null, 'Ghi chú', null, '[STATUS:ABSENT_APPROVED_A] Báo ốm']);
    const parsed = await parseJlptWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()));
    expect(parsed.errors).toEqual([]);
    expect(parsed.externalIds.get('n4_test::nguyen van a')).toBe('HV001');
    expect(parsed.blocks).toHaveLength(1);
    expect(parsed.blocks[0].values[0]).toMatchObject({ teacherStatus: AttendanceStatus.ATTENDED, preparationRating: 'A', attitudeRating: 'B', homeworkCompleted: true, testCorrectAnswers: 10 });
    expect(parsed.blocks[0].values[1]).toMatchObject({ teacherStatus: AttendanceStatus.ABSENT_APPROVED_A, sourceNote: 'Báo ốm' });
    expect(parsed.blocks[0].values[1].session).toMatchObject({ sessionNumber: 2, proposedType: 'TEST', proposedTitle: 'KT1' });
  });
});
