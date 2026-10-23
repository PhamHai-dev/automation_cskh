import fs from 'fs';
import path from 'path';
import { loadOptimizedWorkbook } from '../backend/src/modules/imports/sheet-sync.parser';
import { detectJlptMonthBlocks, extractAttendanceTemplate, normalizeCellComparable } from '../backend/src/modules/imports/attendance-sheet.util';

(async () => {
  const t0 = Date.now();
  const buf = fs.readFileSync(path.resolve(__dirname, '../backend/../docs/data/hoc_vien/hoc_vien_jlpt.xlsx'));
  const wb = await loadOptimizedWorkbook(buf, ['Chấm buổi']);
  const ws = wb.getWorksheet('Chấm buổi')!;
  console.log('load ms', Date.now() - t0, 'rowCount', ws.rowCount, 'columnCount', ws.columnCount);
  const blocks = detectJlptMonthBlocks(ws);
  console.log('blocks', blocks.length);
  console.log('years', [...new Set(blocks.map(b=>b.year))].sort());
  for (const b of blocks) {
    console.log(b.label, 'cols', b.startCol, b.endCol, 'days', b.totalDays, 'first', b.dailyCols[0].date, 'last', b.dailyCols[b.totalDays-1].date, JSON.stringify(b.summaryCols));
  }
  const r2 = ws.getRow(2);
  const hdr: string[] = [];
  for (let c = 1; c <= 18; c++) hdr.push(`${c}=${JSON.stringify(normalizeCellComparable(r2.getCell(c).value)).slice(0,30)}`);
  console.log('ROW2 1..18', hdr.join(' | '));
  const r1 = ws.getRow(1);
  console.log('ROW1 col1..12', Array.from({length:12},(_,i)=>`${i+1}=${JSON.stringify(normalizeCellComparable(r1.getCell(i+1).value))}`).join(' | '));
  for (const rr of [3,4,5]) {
    const row = ws.getRow(rr);
    const cells: string[] = [];
    for (let c = 1; c <= 18; c++) {
      const v: any = row.getCell(c).value;
      cells.push(`${c}[${v && typeof v==='object' ? (v.formula? 'F:'+String(v.formula).slice(0,25): JSON.stringify(v).slice(0,20)) : JSON.stringify(v)}]`);
    }
    console.log('ROW', rr, cells.join(' '));
  }
})().catch((e) => { console.error('ERR', e); process.exit(1); });
