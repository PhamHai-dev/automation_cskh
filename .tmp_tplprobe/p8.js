const JSZip=require('E:/automation_cskh/backend/node_modules/jszip');
const fs=require('fs');
(async()=>{
 const buf=fs.readFileSync('E:/automation_cskh/.claude/worktrees/backend-dev/docs/data/hoc_vien/hoc_vien_jlpt.xlsx');
 const zip=await JSZip.loadAsync(buf);
 const wb=await zip.file('xl/workbook.xml').async('string');
 console.log('top-level children of <workbook ...>:');
 // find tag starts at depth 1 by scanning
 const after = wb.indexOf('>',wb.indexOf('<workbook '))+1;
 const tags=[...wb.matchAll(/<(\/?)([A-Za-z0-9:_]+)([^>]*)>/g)];
 let depth=0; const top=[];
 for(const t of tags){
   const close=t[1]==='/', name=t[2], attrs=t[3];
   if(!close && !attrs.endsWith('/')) { if(depth===0) top.push(name); depth++; }
   else if(!close && attrs.endsWith('/')) { if(depth===0) top.push(name+'/'); }
   else depth--;
 }
 console.log(top.join('\n'));
 const calc=wb.match(/<calcPr[^>]*>/); console.log('calcPr',calc&&calc[0]);
 const cf=wb.match(/<definedNames>[\s\S]*?<\/definedNames>/);
 console.log('definedName count',(wb.match(/<definedName/g)||[]).length);
 console.log('localSheetId count',(wb.match(/localSheetId/g)||[]).length);
 console.log('sheet tags', (wb.match(/<sheet /g)||[]).length);
 console.log('--- workbook rels types ---');
 const rels=await zip.file('xl/_rels/workbook.xml.rels').async('string');
 console.log([...rels.matchAll(/<Relationship ([^>]*)\/>/g)].map(m=>{const s=m[1];const id=(s.match(/Id="([^"]+)"/)||[])[1];const ty=(s.match(/Type="[^"]*\/(\w+)"/)||[])[1];const tg=(s.match(/Target="([^"]+)"/)||[])[1];return `${id} ${ty} -> ${tg}`;}).join('\n'));
 console.log('--- _rels/.rels ---');
 console.log(await zip.file('_rels/.rels').async('string'));
})().catch(e=>console.error(e));
