import ExcelJS from 'exceljs';
import {
  parseKaiwaSheetRows,
  parseJlptAttendedSessions,
  parseJlptSheetRows,
} from '../sheet-sync.parser';

describe('approved workbook column mappings', () => {
  it('maps Kaiwa Tổng attendance and end/renewal fields without secondary schedule or Tháng', () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Tổng');
    ws.getRow(2).values = Array.from({ length: 77 }, (_, i) => i + 1);
    ws.getCell('A2').value = 'ID';
    ws.getCell('E2').value = 'Họ tên HV';
    ws.getRow(3).values = Array.from({ length: 77 }, () => null);
    ws.getCell('A3').value = 'K001';
    ws.getCell('E3').value = 'Test Student';
    ws.getCell('I3').value = 'Thường';
    ws.getCell('N3').value = 20;
    ws.getCell('U3').value = new Date('2026-01-01');
    ws.getCell('W3').value = new Date('2026-02-01');
    ws.getCell('AE3').value = 'T2-T4';
    ws.getCell('AA3').value = '20:00';
    ws.getCell('AI3').value = 'LÂM QUỐC HÙNG - Kaiwa 5 (24/06/2024) - 001';
    ws.getCell('AJ3').value = 7;
    ws.getCell('BF3').value = 5;
    ws.getCell('BG3').value = 2026;
    ws.getCell('BJ3').value = new Date('2026-03-01');
    ws.getCell('BU3').value = 99;
    ws.getCell('BY3').value = 4;

    const [row] = parseKaiwaSheetRows(wb, 'Tổng', 2);
    expect(row.totalAttended).toBe(7);
    expect(row.courseContent).toBe('Thường');
    expect(row.programMetadata.tuition_fee).toBeUndefined();
    expect(row.attendedPreviousYears).toBe(0);
    expect(row.programMetadata.attended_previous_years_raw).toBe('LÂM QUỐC HÙNG - Kaiwa 5 (24/06/2024) - 001');
    expect(row.endHoldWeek).toBe(5);
    expect(row.endHoldYear).toBe(2026);
    expect(row.renewalDeadline).toBe('2026-03-01');
    expect(row.handoverMonth).toBe(4);
    expect(row.schedulePattern).toBe('24');
    expect(row.programMetadata.second_schedule).toBeUndefined();
    expect(row.programMetadata.paid_month).toBeUndefined();
  });

  it('lets JLPT Chấm buổi override Điểm học tập attendance', () => {
    const wb = new ExcelJS.Workbook();
    const dht = wb.addWorksheet('Điểm học tập');
    dht.getCell('A3').value = 'J001';
    dht.getCell('I3').value = 2;
    const cb = wb.addWorksheet('Chấm buổi');
    cb.getCell('B3').value = 'J001';
    cb.getCell('L3').value = 6;
    expect(parseJlptAttendedSessions(wb).get('J001')).toBe(6);

    const master = wb.addWorksheet('Data JLPT_Inhouse');
    master.getCell('A2').value = 'ID';
    master.getCell('E2').value = 'Họ tên HV';
    master.getCell('A3').value = 'J001';
    master.getCell('E3').value = 'JLPT Student';
    master.getRow(3).getCell(9).value = '1-n';
    master.getRow(3).getCell(10).value = 'N4CB';
    master.getRow(3).getCell(11).value = 4000000;
    master.getRow(3).getCell(17).value = 'N4VIP16';
    const [row] = parseJlptSheetRows(wb, 'Data JLPT_Inhouse', 'Setting', 2);
    expect(row.totalAttended).toBe(6);
    expect(row.attendedPreviousYears).toBe(0);
    expect(row.classModel).toBe('1-n');
    expect(row.level).toBe('N4CB');
    expect(row.packageCode).toBe('N4VIP16');
    expect(row.courseContent).toBeNull();
    expect(row.programMetadata.tuition_fee).toBe(4000000);
    expect(row.endHoldWeek).toBeNull();
    expect(row.endHoldYear).toBeNull();
    expect(row.handoverMonth).toBeNull();
    expect(row.renewalDeadline).toBeNull();
  });
});
