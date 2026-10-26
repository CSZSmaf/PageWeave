import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {Project} from '../../core/project';
import {Compiler} from '../../core/compiler';
import {flowDocument,flowParts,paperLayout} from '../../core/flow';
import {serializeRich,type RichNode} from '../../core/writing';
import {defaultFurniture} from '../../core/page-furniture';
import {TABLE_PRESETS} from '../../core/table-design';
import {emptyDiagram} from '../../core/drawing';
import {nodeSize} from '../../core/review';

const para=(text:string):RichNode=>({type:'paragraph',attrs:{textAlign:'left',lineHeight:'18pt',spacingBefore:0,spacingAfter:0},content:[{type:'text',text}]});
const table=(style:string,rows=4):RichNode=>({type:'table',attrs:{tableStyle:style,width:90,cellPadding:4,borderWidth:1,verticalAlign:'bottom'},content:Array.from({length:rows},(_,r)=>({type:'tableRow',attrs:{minHeight:r===1?50:0},content:[120,180,120].map((w,c)=>({type:r?'tableCell':'tableHeader',attrs:{colwidth:[w],backgroundColor:r===1&&c===0?'#fff3ce':null},content:[para(r===0?['项目','参数','说明'][c]:`ROW${r} COL${c} 测试`)]}))}))});
async function pdfText(bytes:Uint8Array){const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs'),task=getDocument({data:new Uint8Array(bytes),disableFontFace:true,useSystemFonts:true}),pdf=await task.promise;try{const pages=[];for(let i=1;i<=pdf.numPages;i++)pages.push((await (await pdf.getPage(i)).getTextContent()).items.map((item:any)=>item.str??'').join(''));return pages;}finally{await task.destroy();}}

test('真实 PDF：五种表格、固定行距、页眉页脚和可编辑矢量绘图',{timeout:120000},async()=>{
  const root=path.resolve('output/design-integration-'+Date.now());await fs.mkdir(root,{recursive:true});const p=await Project.createDocument(path.join(root,'design.tex'),path.resolve('examples/writing'));
  const content:RichNode[]=[];
  for(const [style,preset] of Object.entries(TABLE_PRESETS)){if(content.length)content.push({type:'pageBreak'});content.push({...para(preset.label),type:'heading',attrs:{level:1,lineHeight:'1.2',spacingBefore:0,spacingAfter:8}},table(style));}
  content.push({type:'pageBreak'},{...para('Fixed first line'),content:[{type:'text',text:'Fixed first line'},{type:'hardBreak'},{type:'text',text:'Fixed second line'}]},
    {type:'drawing',attrs:{width:90,textAlign:'center',drawing:{...emptyDiagram(),nodes:[{id:'input',kind:'rounded',x:40,y:170,width:200,height:80,text:'输入数据',fill:'#eaf2ff',stroke:'#2463c7',color:'#203650',fontSize:20},{id:'output',kind:'diamond',x:500,y:150,width:200,height:120,text:'输出结果',fill:'#ffffff',stroke:'#2463c7',color:'#203650',fontSize:20}],edges:[{id:'edge',from:'input',to:'output',route:'elbow',label:'实验步骤',color:'#526178',dashed:true}]}}});
  p.writeFlow(flowParts({type:'doc',content},p.state().writing[0].id),p.version);p.pageFurniture({...defaultFurniture(),header:['Research & results','','PageWeave'],footer:['','{page}/{pages}',''],hideFirst:true,headerLine:true},p.version);await p.save();
  const c=new Compiler(path.join(root,'builds')),r=await c.compile(p);assert.ok(r.ok,r.log.slice(-6000));await fs.writeFile(path.join(root,'design.pdf'),r.pdf!);const pages=(await pdfText(r.pdf!)).map(text=>text.replace(/\s/g,''));
  assert.equal(pages.length,6);assert.ok(!pages[0].includes('Research'));assert.ok(pages[1].includes('Research&results'));assert.ok(pages[1].includes('2/6'));assert.ok(pages[5].includes('Fixedsecondline'));assert.ok(pages[5].includes('输出结果'));
  const reopened=await Project.openFile(path.join(root,'design.tex'));assert.equal(serializeRich(flowDocument(reopened.state().writing)),serializeRich(flowDocument(p.state().writing)));assert.ok(!/Overfull \\vbox|Misplaced \\noalign|fancyhdr Warning/.test(r.log));
  console.log('Design PDF: '+path.join(root,'design.pdf'));
});

test('真实 PDF：长表格按共享分页计划分页，保存后重编译保留分页与样式',{timeout:120000},async()=>{
  const root=path.resolve('output/design-pages-'+Date.now());await fs.mkdir(root,{recursive:true});const p=await Project.createDocument(path.join(root,'pages.tex'),path.resolve('examples/writing'));
  p.writeFlow([{id:p.state().writing[0].id,content:{type:'doc',content:[table('blue',35)]}}],p.version);p.pageFurniture({...defaultFurniture(),footer:['','{page}/{pages}','']},p.version);
  const doc=flowDocument(p.state().writing),rows=doc.content![0].content!,breaks:number[]=[];let offset=1;rows.forEach((row,i)=>{if(i===12||i===24)breaks.push(offset);offset+=nodeSize(row);});
  p.pagePlan({source:serializeRich(doc),breaks,layout:paperLayout(p.state())},p.version);await p.save();const c=new Compiler(path.join(root,'builds')),r=await c.compile(p);assert.ok(r.ok,r.log.slice(-6000));const pages=await pdfText(r.pdf!);assert.equal(pages.length,3);assert.ok(pages[0].includes('ROW11'));assert.ok(!pages[0].includes('ROW12'));assert.ok(pages[1].includes('ROW12'));assert.ok(pages[2].includes('ROW34'));assert.ok(pages[2].includes('3/3'));
  await fs.writeFile(path.join(root,'pages.pdf'),r.pdf!);const reopened=await Project.openFile(path.join(root,'pages.tex')),again=await c.compile(reopened);assert.ok(again.ok,again.log.slice(-3000));assert.deepEqual(await pdfText(again.pdf!),pages);console.log('Table pages PDF: '+path.join(root,'pages.pdf'));
});

test('真实 PDF：接近页底的 50 行表格不产生额外单行页',{timeout:120000},async()=>{
  const root=path.resolve('output/design-tight-pages-'+Date.now());await fs.mkdir(root,{recursive:true});const p=await Project.createDocument(path.join(root,'tight.tex'),path.resolve('examples/writing'));
  const t=table('blue',50);t.attrs={tableStyle:'blue',width:85,textAlign:'left',cellPadding:6};
  t.content!.forEach((row,r)=>{row.attrs={minHeight:30};row.content!.forEach((cell,c)=>{cell.attrs={colwidth:[c===0?180:120]};cell.content=[{...para(r?`第 ${r} 行 ${['参数','取值','说明'][c]}`:['参数','取值','说明'][c]),attrs:{lineHeight:'18pt',spacingBefore:3,spacingAfter:5}}];});});
  const content:RichNode[]=[{type:'heading',attrs:{level:1,lineHeight:'1.2',spacingBefore:0,spacingAfter:12},content:[{type:'text',text:'文稿设计'}]},
    {...para('这段文字使用固定 18 磅行距，并设置段前与段后距离。'.repeat(3)),attrs:{lineHeight:'1.35',spacingBefore:6,spacingAfter:9}},t,para('After table')];
  p.writeFlow(flowParts({type:'doc',content},p.state().writing[0].id),p.version);p.pageFurniture({...defaultFurniture(),header:['研究报告','','PageWeave']},p.version);
  const doc=flowDocument(p.state().writing),tablePos=nodeSize(doc.content![0])+nodeSize(doc.content![1]),breaks=[15,33].map(row=>tablePos+1+doc.content![2].content!.slice(0,row).reduce((sum,n)=>sum+nodeSize(n),0));breaks.push(tablePos+nodeSize(doc.content![2]));
  p.pagePlan({source:serializeRich(doc),layout:paperLayout(p.state()),breaks},p.version);const c=new Compiler(path.join(root,'builds')),r=await c.compile(p);assert.ok(r.ok,r.log.slice(-3000));const pages=await pdfText(r.pdf!);assert.equal(pages.length,4);assert.ok(pages[1].replace(/\s/g,'').includes('第15行'));assert.ok(pages[2].replace(/\s/g,'').includes('第33行'));assert.ok(pages[3].includes('After table'));
});
