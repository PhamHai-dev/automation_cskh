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
 const xml=await zip.file('xl/worksheets/sheet21.xml').async('string');
 const sdStart=xml.indexOf('<sheetData>');
 const head=xml.slice(0,sdStart);
 // row1 labels
 const r1=xml.match(/<row r="1"[^>]*>([\s\S]*?)<\/row>/)[1];
 const cre=/<c r="([A-Z]+)1"([^>]*)\/>|<c r="([A-Z]+)1"([^>]*)>([\s\S]*?)<\/c>/g;
 while((m=cre.exec(r1))){
  const col=m[1]||m[3]; const attrs=m[2]!==undefined?m[2]:m[4]; const inner=m[5]||'';
  const t=(attrs.match(/t="([^"]+)"/)||[])[1];
  const v=(inner.match(/<v>([\s\S]*?)<\/v>/)||[])[1];
  if(v===undefined) continue;
  const disp = t==='s'?items[Number(v)]:v;
  if(/TH/i.test(String(disp))) console.log('LBL col',colToNum(col),numToCol(colToNum(col)),JSON.stringify(disp));
 }
 console.log('--- mergeCells in row1 ---');
 const mg=xml.match(/<mergeCells[^>]*>([\s\S]*?)<\/mergeCells>/);
 if(mg){const refs=[...mg[1].matchAll(/ref="([A-Z]+\d+:[A-Z]+\d+)"/g)].map(x=>x[1]).filter(r=>/1:/.test(r)&&r.endsWith('1'));
  console.log(refs.filter(r=>/^A\d+$|1$/.test(r)).slice(0,40).join('\n'));
  console.log('total merges', mg[1].match(/ref=/g).length);
  console.log('sample all merges containing row1:', [...mg[1].matchAll(/ref="([A-Z]+1:[A-Z]+\d+)"/g)].map(x=>x[1]).slice(0,30).join(', '));
 }
 console.log('--- tail after sheetData ---');
 const sdEnd=xml.lastIndexOf('</sheetData>');
 console.log(xml.slice(sdEnd+12).slice(0,3000));
 console.log('--- dimension ---');
 console.log((head.match(/<dimension[^>]*>/)||['none'])[0]);
 console.log('--- last row num ---');
 const rowsAll=[...xml.matchAll(/<row r="(\d+)"/g)].map(x=>Number(x[1]));
 console.log('rows',rowsAll.length, 'max',Math.max(...rowsAll));
})().catch(e=>console.error(e));
