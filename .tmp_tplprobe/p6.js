const JSZip=require('E:/automation_cskh/backend/node_modules/jszip');
const fs=require('fs');
(async()=>{
 for(const f of ['hoc_vien_kaiwa.xlsx']){
  const buf=fs.readFileSync('E:/automation_cskh/.claude/worktrees/backend-dev/docs/data/hoc_vien/'+f);
  const zip=await JSZip.loadAsync(buf);
  const wb=await zip.file('xl/workbook.xml').async('string');
  console.log('===',f);
  console.log([...wb.matchAll(/<sheet[^>]*\/>/g)].map(x=>x[0]).join('\n'));
  console.log('--- rels ---');
  console.log((await zip.file('xl/_rels/workbook.xml.rels').async('string')).match(/<Relationship [^>]*worksheet[^>]*\/>/g).join('\n'));
  console.log('--- parts ---');
  console.log(Object.keys(zip.files).filter(k=>!k.startsWith('xl/worksheets/sheet')).join('\n'));
 }
})().catch(e=>console.error(e));
