const JSZip=require('E:/automation_cskh/backend/node_modules/jszip');
const fs=require('fs');
(async()=>{
 const buf=fs.readFileSync('E:/automation_cskh/.claude/worktrees/backend-dev/docs/data/hoc_vien/hoc_vien_jlpt.xlsx');
 const zip=await JSZip.loadAsync(buf);
 const xml=await zip.file('xl/worksheets/sheet21.xml').async('string');
 console.log('LEN',xml.length);
 // print everything before <sheetData
 const sd=xml.indexOf('<sheetData');
 console.log('HEAD:',xml.slice(0,sd).slice(0,6000));
 console.log('...TAIL OF HEAD:',xml.slice(Math.max(0,sd-1500),sd));
 // find first 3 rows
 const rowRe=/<row[^>]*>/g; let m; let idx=[];
 while((m=rowRe.exec(xml))&&idx.length<6){idx.push([m.index,m[0]]);}
 idx.forEach(([i,tag])=>console.log('ROWTAG@',i,tag));
})().catch(e=>console.error(e));
