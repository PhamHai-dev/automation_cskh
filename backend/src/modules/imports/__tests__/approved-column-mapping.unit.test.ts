import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import {
  loadOptimizedWorkbook,
  parseKaiwaSheetRows,
  parseJlptAttendedSessions,
  parseJlptSheetRows,
  parseJlptStudyReportWorkbook,
} from '../sheet-sync.parser';

describe('approved workbook column mappings', () => {
  it('maps Kaiwa Tổng (isKaiwaMasterOnly) cols A..AH and BF, BG, BJ, BY without reading AI..BD', () => {
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
    expect(row.isKaiwaMasterOnly).toBe(true);
    expect(row.isKaiwaCareOnly).toBe(false);
    expect(row.totalAttended).toBeNull();
    expect(row.courseContent).toBe('Thường');
    expect(row.programMetadata.tuition_fee).toBeUndefined();
    expect(row.attendedPreviousYears).toBe(0);
    expect(row.programMetadata.attended_previous_years_raw).toBeUndefined();
    expect(row.endHoldWeek).toBe(5);
    expect(row.endHoldYear).toBe(2026);
    expect(row.renewalDeadline).toBe('2026-03-01');
    expect(row.handoverMonth).toBe(4);
    expect(row.schedulePattern).toBe('24');
    expect(row.careLogs).toEqual([]);
    expect(row.programMetadata.second_schedule).toBeUndefined();
    expect(row.programMetadata.paid_month).toBeUndefined();
  });

  it('maps Kaiwa 1.Chăm sóc (isKaiwaCareOnly) cols AI..BH and preserves raw text in AI', () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('1.Chăm sóc');
    ws.getCell('A3').value = 'ID';
    ws.getCell('E3').value = 'Họ tên HV';
    ws.getCell('K3').value = 'Gói học';
    ws.getCell('AK3').value = 'Báo cáo học tập';

    ws.getCell('A4').value = '420267559';
    ws.getCell('E4').value = 'LÂM QUỐC HÙNG';
    ws.getCell('K4').value = 'CKAI451030JP';
    ws.getCell('AI4').value = 'LÂM QUỐC HÙNG - Kaiwa 5 (24/06/2024) - 001';
    ws.getCell('AJ4').value = 54;
    ws.getCell('AK4').value = {
      text: 'LÂM QUỐC HÙNG',
      hyperlink: 'https://docs.google.com/spreadsheets/d/1x1kTestSheetId/edit',
    } as any;
    ws.getCell('AL4').value = 'Trao đổi tiến độ tốt';
    ws.getCell('AM4').value = 'Gọi lại thứ 6';
    ws.getCell('AN4').value = 'Cần lưu ý lịch thi';
    ws.getCell('AO4').value = 'Buổi 1 phản hồi tích cực';
    ws.getCell('BC4').value = 'Buổi 90 hoàn thành xuất sắc';
    ws.getCell('BD4').value = 'Đã chăm sóc sau kết thúc';
    ws.getCell('BF4').value = new Date('2024-03-26');
    ws.getCell('BH4').value = new Date('2024-03-27');

    const [row] = parseKaiwaSheetRows(wb, '1.Chăm sóc', 3);
    expect(row.isKaiwaCareOnly).toBe(true);
    expect(row.isKaiwaMasterOnly).toBe(false);
    expect(row.externalId).toBe('420267559');
    expect(row.fullName).toBe('LÂM QUỐC HÙNG');
    expect(row.packageCode).toBe('CKAI451030JP');
    expect(row.programMetadata.attended_previous_years_raw).toBe('LÂM QUỐC HÙNG - Kaiwa 5 (24/06/2024) - 001');
    expect(row.attendedPreviousYears).toBe(0);
    expect(row.totalAttended).toBe(54);
    expect(row.studyReportUrl).toBe('https://docs.google.com/spreadsheets/d/1x1kTestSheetId/edit');
    expect(row.exchangeInfo).toBe('Trao đổi tiến độ tốt');
    expect(row.callbackNote).toBe('Gọi lại thứ 6');
    expect(row.hotIssueNote).toBe('Cần lưu ý lịch thi');
    expect(row.postCourseCare).toBe('Đã chăm sóc sau kết thúc');
    expect(row.handedOverAt).toBe('2024-03-26');
    expect(row.accountCreatedAt).toBe('2024-03-27');
    expect(row.endHoldWeek).toBeNull();
    expect(row.endHoldYear).toBeNull();
    expect(row.careLogs).toHaveLength(2);
    expect(row.careLogs[0].after_session_number).toBe(1);
    expect(row.careLogs[1].after_session_number).toBe(90);
  });

  it('parses real sample files Sheet3_cham_buoi.xlsx (1.Chăm sóc) and Format báo cáo học tập JLPT.xlsx (Chuyên cần HV)', async () => {
    const chamBuoiPath = path.resolve(__dirname, '../../../../../docs/data/import_data/Sheet3_cham_buoi.xlsx');
    if (fs.existsSync(chamBuoiPath)) {
      const wbChamSoc = await loadOptimizedWorkbook(fs.readFileSync(chamBuoiPath), ['1.Chăm sóc']);
      const careRows = parseKaiwaSheetRows(wbChamSoc, '1.Chăm sóc', 3, 10);
      expect(careRows.length).toBeGreaterThan(0);
      expect(careRows[0].isKaiwaCareOnly).toBe(true);
      expect(careRows[0].externalId).toBe('420267559');
      expect(careRows[0].programMetadata.attended_previous_years_raw).toContain('LÂM QUỐC HÙNG');
      expect(careRows[0].totalAttended).toBe(54);
      expect(careRows[0].studyReportUrl).toContain('https://docs.google.com/spreadsheets/d/');
    }

    const jlptReportPath = path.resolve(__dirname, '../../../../../docs/data/import_data/Format báo cáo học tập JLPT.xlsx');
    if (fs.existsSync(jlptReportPath)) {
      const wbJlptReport = await loadOptimizedWorkbook(fs.readFileSync(jlptReportPath), ['Chuyên cần HV']);
      const parsedReport = parseJlptStudyReportWorkbook(wbJlptReport, 'Chuyên cần HV');
      expect(parsedReport.sheetName).toBe('Chuyên cần HV');
      expect(parsedReport.jlptChuyenCanRows).toBeDefined();
      expect(parsedReport.jlptChuyenCanRows!.length).toBeGreaterThan(10);
      const firstRow = parsedReport.jlptChuyenCanRows![0];
      expect(firstRow.classCode).toBe('N2AVIP11001');
      expect(firstRow.studentName).toBe('Lý Nhật Minh');
      expect(firstRow.attendedSessions).toBe(14);
      expect(firstRow.totalMarkedSessions).toBe(14);
      expect(firstRow.attendanceRate).toBe(1);
    }
  }, 30000);

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
