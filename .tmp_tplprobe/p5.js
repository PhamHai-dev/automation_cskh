const JSZip=require('E:/automation_cskh/backend/node_modules/jszip');
const fs=require('fs');
function colToNum(c){let n=0;for(const ch of c)n=n*26+ch.charCodeAt(0)-64;return n;}
function numToCol(n){let s='';while(n>0){const r=(n-1)%26;s=String.fromCharCode(65+r)+s;n=Math.floor((n-1)/26);}return s;}
(async()=>{
 const buf=fs.readFileSync('E:/automation_cskh/.claude/worktrees/backend-dev/docs/data/hoc_vien/hoc_vien_jlpt.xlsx');
 const zip=await JSZip.loadAsync(buf);
 const ss=await zip.file('xl/sharedStrings.xml').async('string');
 const items=[];let m;const re=/<si>([\s\S]*?)<\/si>/g;
 while((m=re.exec(ss))){items.push(m[1].replace(/<[^>]+>/g,''));}
 console.log('items[101]=',JSON.stringify(items[101]),'items[2651]=',JSON.stringify(items[2651]));
 const xml=await zip.file('xl/worksheets/sheet21.xml').async('string');
 for(const rn of ['3','5','10','12']){
  const rr=xml.match(new RegExp(`<row r="${rn}"[^>]*>([\s\S]*?)<\/row>`));
  if(!rr){console.log('row',rn,'absent');continue;}
  const cre=/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  const out=[];let c;
  while((c=cre.exec(rr[1]))){
    const col=c[1];const n=colToNum(col); if(n>25) continue;
    const attrs=c[2];const inner=c[3]||'';
    const t=(attrs.match(/t="([^"]+)"/)||[])[1];
    const v=(inner.match(/<v>([\s\S]*?)<\/v>/)||[])[1];
    const f=(inner.match(/<f[^>]*>([\s\S]*?)<\/f>/)||[])[1];
    let disp = t==='s'&&v!==undefined?items[Number(v)]:v;
    out.push(`${col}(${n}) [${t||'n'}] ${JSON.stringify(disp)}${f?'  F='+f.slice(0,60):''}`);
  }
  console.log('=== ROW',rn); console.log(out.join('\n'));
 }
 console.log('=== sheet21 rels ===');
 console.log(await zip.file('xl/worksheets/_rels/sheet21.xml.rels').async('string'));
 console.log('=== Content_Types head ===');
 const ct=await zip.file('[Content_Types].xml').async('string');
 console.log(ct.slice(0,1500));
 console.log('...overrides count', (ct.match(/Override/g)||[]).length);
 console.log('worksheets overrides:', (ct.match(/<Override[^>]*sheet\d+\.xml[^>]*\/>/g)||[]).length);
})().catch(e=>console.error(e));
