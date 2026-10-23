import path from 'path';
import ExcelJS from 'exceljs';
import { loadOptimizedWorkbook } from '../backend/src/modules/imports/sheet-sync.parser';
import { ImportsService } from '../backend/src/modules/imports/imports.service';
import fs from 'fs';

(async () => {
  const f = path.resolve(__dirname, '../docs/data/hoc_vien/hoc_vien_jlpt.xlsx');
  const buf = fs.readFileSync(f);
  const t0 = Date.now();
  const wb = await loadOptimizedWorkbook(buf, ['Chấm buổi']);
  console.log('load ms', Date.now() - t0, 'sheets', wb.worksheets.map(w => `${w.name} rows=${w.rowCount} cols=${w.columnCount}`));
  const ws = wb.getWorksheet('Chấm buổi')!;
  const r1 = ws.getRow(1);
  const svc = new ImportsService();
  const blocks = svc.detectAttendanceMonthBlocks(ws);
  console.log('blocks detected:', blocks.length);
  for (const b of blocks.slice(0, 3)) {
    console.log(JSON.stringify({ m: b.month, y: b.year, startCol: b.startCol, endCol: b.endCol, days: b.totalDays, summary: b.summaryCols, first: b.dailyCols[0], last: b.dailyCols[b.dailyCols.length-1] }));
  }
  // dump raw row1 block labels
  const labels: any[] = [];
  for (let c = 1; c <= ws.columnCount; c++) {
    const cell = r1.getCell(c);
    const txt = String(cell.text || '').trim();
    if (/Tháng/i.test(txt)) labels.push({ c, txt, type: typeof cell.value, val: cell.value instanceof Date ? cell.value.toString() : String(cell.value) });
  }
  console.log('row1 labels count', labels.length);
  console.log(JSON.stringify(labels.slice(0, 6), null, 1));
  console.log(JSON.stringify(labels.slice(-3), null, 1));
  // dump row2 header for cols 1..60
  const r2 = ws.getRow(2);
  const hdr: any[] = [];
  for (let c = 1; c <= 60; c++) {
    const cell = r2.getCell(c);
    hdr.push({ c, letter: ws.getColumn(c).letter, text: String(cell.text||'').slice(0,40), type: typeof cell.value, isDate: cell.value instanceof Date, formula: (cell.value as any)?.formula });
  }
  console.log(JSON.stringify(hdr, null, 1));
})().catch(e => { console.error(e); process.exit(1); });
