const JSZip=require('E:/automation_cskh/backend/node_modules/jszip');
const fs=require('fs');
function colToNum(c){let n=0;for(const ch of c)n=n*26+ch.charCodeAt(0)-64;return n;}
function numToCol(n){let s='';while(n>0){const r=(n-1)%26;s=String.fromCharCode(65+r)+s;n=Math.floor((n-1)/26);}return s;}
function excelSerialToUTC(v){return new Date(Math.round((v-25569)*86400*1000));}
(async()=>{
 const buf=fs.readFileSync('E:/automation_cskh/.claude/worktrees/backend-dev/docs/data/hoc_vien/hoc_vien_jlpt.xlsx');
 const zip=await JSZip.loadAsync(buf);
 const ss=await zip.file('xl/sharedStrings.xml').async('string');
 const items=[];let m;const re=/<si>([\s\S]*?)<\/si>/g;
 while((m=re.exec(ss))){items.push(m[1].replace(/<[^>]+>/g,''));}
 const xml=await zip.file('xl/worksheets/sheet21.xml').async('string');
 const r2=xml.match(/<row r="2"[^>]*>([\s\S]*?)<\/row>/)[1];
 const cells=new Map();
 const cre=/<c r="([A-Z]+)2"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;let c;
 while((c=cre.exec(r2))){
   const n=colToNum(c[1]);const attrs=c[2];const inner=c[3]||'';
   const t=(attrs.match(/t="([^"]+)"/)||[])[1];
   const s=(attrs.match(/s="(\d+)"/)||[])[1];
   const f=(inner.match(/<f[^>]*>([\s\S]*?)<\/f>/)||[])[1];
   const v=(inner.match(/<v>([\s\S]*?)<\/v>/)||[])[1];
   cells.set(n,{t,s,f,v,col:c[1]});
 }
 console.log('row2 max col',Math.max(...cells.keys()), 'count',cells.size);
 const blocks=[[13,'T1/2025'],[50,'T2/2025'],[704,'T8/2026'],[741,'T9/2026'],[777,'T10/2026'],[813,'T11/2026'],[848,'T12/2026']];
 for(const [start,label] of blocks){
   const rows=[];
   for(let n=start;n<start+12;n++){const e=cells.get(n);rows.push(`${numToCol(n)}(${n}) ${e? `[t=${e.t||'n'} s=${e.s}] v=${(e.t==='s'&&e.v!==undefined)?JSON.stringify(items[+e.v]).slice(0,30):e.v} ${e.f?'F':''}`:'ABSENT'}`);}
   console.log('---',label); console.log(rows.join('\n'));
 }
 // day dates of T10/2026 block (start 777)
 const d=[];for(let n=777+6;n<=812;n++){const e=cells.get(n);d.push(`${numToCol(n)}:${e?(e.v!==undefined? excelSerialToUTC(+e.v).toISOString().slice(0,10):'noV'):'ABSENT'}${e&&e.f?'F='+e.f.slice(0,20):''}`);}
 console.log('T10/2026 daycols:',d.join(' '));
 // how many cells row2 has beyond 883?
 console.log('any col>883?', [...cells.keys()].filter(n=>n>883).length);
})().catch(e=>console.error(e));
