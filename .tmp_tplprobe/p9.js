const JSZip=require('E:/automation_cskh/backend/node_modules/jszip');
const fs=require('fs');
(async()=>{
 const buf=fs.readFileSync('E:/automation_cskh/.claude/worktrees/backend-dev/docs/data/hoc_vien/hoc_vien_jlpt.xlsx');
 const zip=await JSZip.loadAsync(buf);
 const xml=await zip.file('xl/worksheets/sheet21.xml').async('string');
 for(const rn of ['3','4','5']){
  const rr=xml.match(new RegExp(`<row r="${rn}"[^>]*>([\s\S]*?)<\/row>`));
  if(!rr){console.log(rn,'absent');continue;}
  const cells=[...rr[1].matchAll(/<c r="([A-Z]+\d+)"[^>]*>([\s\S]*?)<\/c>/g)].filter(x=>/<f/.test(x[2]));
  console.log('ROW',rn,'formula cells',cells.length);
  console.log(cells.slice(0,8).map(c=>c[1]+' '+c[2].replace(/\s+/g,' ').slice(0,160)).join('\n'));
 }
 // check shared formula presence
 console.log('shared f count', (xml.match(/t="shared"/g)||[]).length);
 console.log('total <f ', (xml.match(/<f/g)||[]).length);
 console.log('row3 exists?', /<row r="3"/.test(xml));
 const r1=xml.match(/<row r="1"[^>]*>[\s\S]*?<\/row>/)[0];
 console.log('ROW1 first 800:', r1.slice(0,800));
 console.log('sheetData end index check: rows total', (xml.match(/<row /g)||[]).length);
})().catch(e=>console.error(e));
