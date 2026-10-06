import path from 'path';
import ExcelJS from 'exceljs';
import { ImportsService } from '../imports.service';

describe('cham_soc_hoc_vien.xlsx Month Blocks & Formulas Detection', () => {
  const service = new ImportsService();
  const filePath = path.resolve(__dirname, '../../../../../docs/data/cham_soc_hoc_vien.xlsx');

  it('correctly detects all 12 month blocks from 3.Chấm buổi with formula dates', async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const ws3 = workbook.getWorksheet('3.Chấm buổi');
    expect(ws3).toBeDefined();

    const blocks = service.detectAttendanceMonthBlocks(ws3!);
    expect(blocks.length).toBe(12);

    // Verify all 12 months are in sequential order
    for (let m = 1; m <= 12; m++) {
      expect(blocks[m - 1].month).toBe(m);
      expect(blocks[m - 1].year).toBe(2026);
      expect(blocks[m - 1].totalDays).toBeGreaterThanOrEqual(28);
      expect(blocks[m - 1].totalDays).toBeLessThanOrEqual(31);
      expect(blocks[m - 1].summaryCols.attendedCol).toBeDefined();
    }

    // Verify September has 30 days and includes formula dates
    const sepBlock = blocks[8]; // Month 9
    expect(sepBlock.month).toBe(9);
    expect(sepBlock.totalDays).toBe(30);
    expect(sepBlock.dailyCols[0].date.slice(0, 10)).toBe('2026-09-01');
    expect(sepBlock.dailyCols[29].date.slice(0, 10)).toBe('2026-09-30');

    // Verify formula dates in month 10, 11, 12 are properly parsed
    const novBlock = blocks[10]; // Month 11
    expect(novBlock.month).toBe(11);
    expect(novBlock.totalDays).toBe(30);
    expect(novBlock.dailyCols[0].date.slice(0, 10)).toBe('2026-11-01');
    expect(novBlock.dailyCols[29].date.slice(0, 10)).toBe('2026-11-30');
  });

  it('properly unwraps cell.result for formula dates and values', () => {
    // Formula date object
    const formulaCellVal = {
      formula: 'OI2+1',
      result: '2026-11-02T00:00:00.000Z',
      ref: 'OJ2:PL2',
      shareType: 'shared',
    };
    const parsedDate = service.parseExcelDate(formulaCellVal);
    expect(parsedDate).not.toBeNull();
    expect(parsedDate?.toISOString().slice(0, 10)).toBe('2026-11-02');
  });
});
