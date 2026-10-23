const JSZip=require('E:/automation_cskh/backend/node_modules/jszip');
const fs=require('fs');
(async()=>{
 const buf=fs.readFileSync('E:/automation_cskh/.claude/worktrees/backend-dev/docs/data/hoc_vien/hoc_vien_jlpt.xlsx');
 const zip=await JSZip.loadAsync(buf);
 const xml=await zip.file('xl/worksheets/sheet21.xml').async('string');
 const r2=xml.match(/<row r="2"[^>]*>([\s\S]*?)<\/row>/)[1];
 const cells=[...r2.matchAll(/<c r="([A-Z]+)2"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)];
 let f=0; const withF=[];
 for(const c of cells){const inner=c[3]||''; if(/<f/.test(inner)){f++; if(withF.length<6)withF.push(c[1]+' '+inner.replace(/\s+/g,' ').slice(0,140));}}
 console.log('row2 cells',cells.length,'with formula',f);
 console.log(withF.join('\n'));
 const r1=xml.match(/<row r="1"[^>]*>([\s\S]*?)<\/row>/)[1];
 console.log('row1 cells',(r1.match(/<c /g)||[]).length,'formulas',(r1.match(/<f/g)||[]).length);
 console.log('hyperlink cells row2',(r2.match(/<hyperlink/g)||[]).length);
 // sheet-level elements we might want: dataValidations, mergeCells, conditionalFormatting
 const head=xml.slice(0,xml.indexOf('<sheetData'));
 console.log('has mergeCells in whole xml?', /<mergeCells/.test(xml), 'condFmt', /<conditionalFormatting/.test(xml));
 console.log('sheetPr..end:', head.slice(head.indexOf('</cols>')).slice(0,200));
})().catch(e=>console.error(e));
