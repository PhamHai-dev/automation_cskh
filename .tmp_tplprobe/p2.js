const JSZip=require('E:/automation_cskh/backend/node_modules/jszip');
const fs=require('fs');
function parseRow(xml){
  // split cells
  const cells=[];
  const re=/<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g;let m;
  while((m=re.exec(xml))){
    const attrs=m[1]!==undefined?m[1]:m[3];
    const inner=m[2]||'';
    const r=(attrs.match(/\br="([A-Z]+\d+)"/)||[])[1];
    const t=(attrs.match(/\bt="([^"]+)"/)||[])[1];
    const s=(attrs.match(/\ss="(\d+)"/)||[])[1]||(attrs.match(/\bs="(\d+)"/)||[])[1];
    const f=(inner.match(/<f[^>]*>([\s\S]*?)<\/f>|<f[^>]*\/>/)||[])[1];
    const v=(inner.match(/<v>([\s\S]*?)<\/v>/)||[])[1];
    cells.push({r,t,f:(f||'').slice(0,120),v:(v||'').slice(0,40)});
  }
  return cells;
}
(async()=>{
 const buf=fs.readFileSync('E:/automation_cskh/.claude/worktrees/backend-dev/docs/data/hoc_vien/hoc_vien_jlpt.xlsx');
 const zip=await JSZip.loadAsync(buf);
 const xml=await zip.file('xl/worksheets/sheet21.xml').async('string');
 const rows={};
 const re=/<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;let m;let n=0;
 while((m=re.exec(xml))&&n<4){rows[m[1]]=m[2];n++;
  if(n>=4)break;}
 for(const k of ['1','2','3','4']){
  if(!rows[k]){console.log('ROW',k,'missing');continue;}
  const cells=parseRow(rows[k]);
  console.log('=== ROW',k,'cells',cells.length);
  console.log(cells.slice(0,50).map(c=>`${c.r}[t=${c.t||''}] v=${c.v}${c.f?' F='+c.f:''}`).join('\n'));
 }
})().catch(e=>console.error(e));
