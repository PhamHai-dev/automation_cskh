const JSZip=require('E:/automation_cskh/backend/node_modules/jszip');
const fs=require('fs');
function colToNum(c){let n=0;for(const ch of c)n=n*26+ch.charCodeAt(0)-64;return n;}
(async()=>{
 const buf=fs.readFileSync('E:/automation_cskh/.claude/worktrees/backend-dev/docs/data/hoc_vien/hoc_vien_jlpt.xlsx');
 const zip=await JSZip.loadAsync(buf);
 const ss=await zip.file('xl/sharedStrings.xml').async('string');
 const items=[];
 const re=/<si>([\s\S]*?)<\/si>/g;let m;
 while((m=re.exec(ss))){items.push(m[1].replace(/<[^>]+>/g,''));}
 console.log('SS count',items.length);
 for(const i of [2619,2620,2621,2622,2639,2640,2641,2642,2521,2643,2644,2645,2646,2647,2648,2649,2650,31,2036,2037,27,28]) console.log(i, JSON.stringify(items[i]));
 // row2 headers by col num
 const xml=await zip.file('xl/worksheets/sheet21.xml').async('string');
 const r2=xml.match(/<row r="2"[^>]*>([\s\S]*?)<\/row>/)[1];
 const cre=/<c r="([A-Z]+)2"([^>]*)>([\s\S]*?)<\/c>/g;let c;
 const out=[];
 while((c=cre.exec(r2))){
   const col=c[1], attrs=c[2], inner=c[3];
   const t=(attrs.match(/t="([^"]+)"/)||[])[1];
   const v=(inner.match(/<v>([\s\S]*?)<\/v>/)||[])[1];
   const f=(inner.match(/<f[^>]*>([\s\S]*?)<\/f>/)||[])[1];
   let disp = t==='s' && v!==undefined ? items[Number(v)] : (v||'');
   out.push(`${colToNum(col)}(${col}) ${t||'n'} => ${JSON.stringify(disp).slice(0,50)}${f?' F='+f.slice(0,40):''}`);
 }
 console.log('ROW2 total',out.length);
 console.log(out.slice(0,80).join('\n'));
})().catch(e=>console.error(e));
