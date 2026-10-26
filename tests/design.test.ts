import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {getSchema,type Editor} from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import {EditorState,NodeSelection} from '@tiptap/pm/state';
import {history,undo,redo} from '@tiptap/pm/history';
import {parseRich,serializeRich,type RichNode} from '../core/writing';
import {TABLE_PRESETS,tableDesign} from '../core/table-design';
import {defaultFurniture,furnitureSource,readFurniture,writeFurniture} from '../core/page-furniture';
import {emptyDiagram,validateDiagram,diagramTikz,edgePoints,type Diagram} from '../core/drawing';
import {Project} from '../core/project';
import {flowDocument,flowParts,paperLayout} from '../core/flow';
import {pagedBlocks} from '../core/page-plan';
import {nodeSize,reviewData} from '../core/review';
import {AdvancedTable,AdvancedRow,AdvancedCell,AdvancedHeader,moveTable,setColumnWidths} from '../src/writing/AdvancedTable';
import {Review,reviewPlugin,addComment} from '../src/writing/Review';

const para=(text:string):RichNode=>({type:'paragraph',content:[{type:'text',text}]});
const table=():RichNode=>({type:'table',attrs:{tableStyle:'blue',width:82,verticalAlign:'bottom',cellPadding:4},content:Array.from({length:3},(_,r)=>({type:'tableRow',attrs:{minHeight:r===1?45:0},content:[120,180].map((w,c)=>({type:r?'tableCell':'tableHeader',attrs:{colwidth:[w],backgroundColor:r===1&&c===0?'#fff3ce':null},content:[para(`行${r}列${c}`)]}))}))});
const diagram=():Diagram=>({...emptyDiagram(),nodes:[{id:'a',kind:'rounded',x:20,y:50,width:160,height:80,text:'输入 # & % <xml>',fill:'#eaf2ff',stroke:'#2463c7',color:'#203650',fontSize:18},{id:'b',kind:'diamond',x:400,y:70,width:200,height:100,text:'判断',fill:'#ffffff',stroke:'#2463c7',color:'#203650',fontSize:18}],edges:[{id:'ab',from:'a',to:'b',label:'步骤_1',route:'elbow',color:'#526178',dashed:true}]});

test('五种表格样式、独立底色、行高、列宽和段落间距往返保存',()=>{
  for(const style of Object.keys(TABLE_PRESETS)){
    const t=table();t.attrs={...t.attrs,tableStyle:style};
    const source=serializeRich({type:'doc',content:[t]}),parsed=parseRich(source);
    assert.equal(serializeRich(parsed),source);const saved=parsed.content![0];
    assert.equal(saved.attrs!.tableStyle,style);assert.equal(saved.attrs!.width,82);assert.equal(saved.attrs!.verticalAlign,'bottom');
    assert.deepEqual(saved.content![0].content![1].attrs!.colwidth,[180]);assert.equal(saved.content![1].attrs!.minHeight,45);assert.equal(saved.content![1].content![0].attrs!.backgroundColor,'#fff3ce');
  }
  for(const lineHeight of ['1.33','18.5pt'])for(const type of ['paragraph','heading']){
    const p={...para('格式与正文'),type,attrs:{level:2,lineHeight,spacingBefore:3,spacingAfter:9.5,textAlign:'center'}};
    const source=serializeRich({type:'doc',content:[p]});assert.equal(serializeRich(parseRich(source)),source);
  }
});

test('手动修改表格边框与绘图 TeX 时拒绝可视化覆盖；禁止合并及嵌套',()=>{
  const source=serializeRich({type:'doc',content:[table()]});
  assert.throws(()=>parseRich(source.replace('\\PageWeaveRow{0}{1}','\\PageWeaveRow{0}{0}')),/边框/);
  assert.throws(()=>parseRich(source.replace('cols=120:180','cols=120:-5')),/参数/);
  const merged=table();merged.content![0].content![0].attrs!.colspan=2;assert.throws(()=>serializeRich({type:'doc',content:[merged]}),/合并/);
  const drawing=serializeRich({type:'doc',content:[{type:'drawing',attrs:{drawing:diagram(),width:75,textAlign:'left'}}]});
  assert.equal(serializeRich(parseRich(drawing)),drawing);assert.throws(()=>parseRich(drawing.replace('line width=1.5bp','line width=3bp')),/绘图源码/);
  assert.ok(diagramTikz(diagram()).includes('步骤\\_1'));assert.ok(diagramTikz(diagram()).includes('\\&'));
});

test('图形验证约束范围，连线跟随端点移动，拒绝孤立引用与重复标识',()=>{
  const d=diagram(),points=edgePoints(d,d.edges[0]);d.nodes[1].x+=40;
  assert.notDeepEqual(edgePoints(d,d.edges[0]),points);
  d.nodes[0].x=-999;assert.equal(validateDiagram(d).nodes[0].x,0);
  assert.throws(()=>validateDiagram({...d,nodes:[d.nodes[0],d.nodes[0]]}),/标识/);
  assert.throws(()=>validateDiagram({...d,edges:[{...d.edges[0],to:'missing'}]}),/端点/);
  assert.throws(()=>validateDiagram({...d,nodes:Array(81).fill(d.nodes[0])}),/80/);
});

test('页眉页脚转义特殊字符、保留页码字段，并保护手工源码',()=>{
  const f={...defaultFurniture(),header:['研究 & 100%','标题_1','{page} / {pages}'] as [string,string,string],hideFirst:true};
  const source=furnitureSource(f);assert.deepEqual(readFurniture(source),f);assert.ok(source.includes('研究 \\& 100\\%'));assert.ok(source.includes('\\thepage / \\pageref{LastPage}'));
  assert.equal(readFurniture(source.replace('\\PageWeaveHeader','\\fancyhead')),null);
  assert.throws(()=>writeFurniture(source.replace('\\PageWeaveHeader','\\fancyhead'),f),/手动修改/);
});

test('跨页段落只保留首尾间距，跨页表格保持样式和行底色',()=>{
  const p={...para('abcdefghij'),attrs:{lineHeight:'18pt',spacingBefore:5,spacingAfter:9,sourceId:'start'}},t=table();t.attrs!.sourceId='start';
  const doc:RichNode={type:'doc',content:[p,t]},blocks=[{id:'start'}] as any;
  const at=nodeSize(p)+1+nodeSize(t.content![0]),source=pagedBlocks(doc,blocks,[6,at]).get('start')!.join('\n');
  assert.ok(source.includes('\\PageWeaveParagraph{justify}{exact}{18}{5}{0}{abcde}'));assert.ok(source.includes('\\PageWeaveParagraph{justify}{exact}{18}{0}{9}{fghij}'));
  assert.ok(source.includes('\\PageWeaveTableBreak\n\\PageWeaveRow{45}'));assert.ok(source.includes('{fff3ce}{fff3ce}'));
});

test('移动表格及行保留批注，列宽可撤销，并且输出不丢正文',()=>{
  const schema=getSchema([StarterKit,AdvancedTable,AdvancedRow,AdvancedCell,AdvancedHeader,Review]);
  let state=EditorState.create({schema,doc:schema.nodeFromJSON({type:'doc',content:[para('before'),table(),para('after')]}),plugins:[history(),reviewPlugin()]});
  const dispatch=(tr:typeof state.tr)=>{state=state.applyTransaction(tr).state;};
  const editor={get state(){return state;},schema,view:{dispatch},commands:{focus(){}}} as unknown as Editor;
  const pos=state.doc.child(0).nodeSize,from=pos+4;
  addComment(editor,'检查这一格',{from,to:from+4,quote:state.doc.textBetween(from,from+4)});
  dispatch(state.tr.setSelection(NodeSelection.create(state.doc,pos)));assert.ok(moveTable(editor,-1));
  assert.equal(state.doc.firstChild!.type.name,'table');let c=reviewData(state.doc.toJSON())!.comments[0];assert.equal(c.from,4);assert.equal(c.orphaned,false);assert.equal(state.doc.textBetween(c.from,c.to),c.quote);
  assert.ok(undo(state,dispatch));assert.equal(state.doc.child(1).type.name,'table');c=reviewData(state.doc.toJSON())!.comments[0];assert.equal(c.from,from);
  assert.ok(redo(state,dispatch));setColumnWidths(editor,0,[150,150]);assert.equal(state.doc.firstChild!.firstChild!.firstChild!.attrs.colwidth[0],150);assert.ok(undo(state,dispatch));assert.equal(state.doc.firstChild!.firstChild!.firstChild!.attrs.colwidth[0],120);
  dispatch(state.tr.setSelection(NodeSelection.create(state.doc,0)));assert.ok(moveTable(editor,1,true));c=reviewData(state.doc.toJSON())!.comments[0];assert.equal(c.orphaned,false);assert.equal(state.doc.textBetween(c.from,c.to),c.quote);
  assert.ok(serializeRich(flowParts(state.doc.toJSON(),'start')[0].content).includes('after'));
});

test('设计设置随保存、导出和重开保留，页眉操作可撤销',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'pageweave-design-'));
  try{
    const p=await Project.createDocument(path.join(root,'report.tex'),path.resolve('examples/writing'));
    p.writeFlow([{id:p.state().writing[0].id,content:{type:'doc',content:[table(),{type:'drawing',attrs:{drawing:diagram(),width:80,textAlign:'center'}}]}}],p.version);
    const before=p.history.texts.get(p.main),f={...defaultFurniture(),header:['Research','',''] as [string,string,string]};p.pageFurniture(f,p.version);assert.deepEqual(paperLayout(p.state()).furniture,f);
    p.undo(p.version);assert.equal(p.history.texts.get(p.main),before);p.redo(p.version);await p.save();const reopened=await Project.openFile(path.join(root,'report.tex'));
    assert.equal(serializeRich(flowDocument(reopened.state().writing)),serializeRich(flowDocument(p.state().writing)));assert.deepEqual(paperLayout(reopened.state()).furniture,f);
    const exported=path.join(root,'exported');await p.snapshot(exported);const copy=await Project.open(exported);assert.deepEqual(paperLayout(copy.state()).furniture,f);assert.ok(copy.files.has('pageweave-design.sty'));
  }finally{assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('pageweave-design-'));await fs.rm(root,{recursive:true,force:true});}
});
