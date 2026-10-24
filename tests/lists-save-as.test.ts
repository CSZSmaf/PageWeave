import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Project} from '../core/project';
import {parseRich,serializeRich,type RichNode} from '../core/writing';
import {flowDocument,flowParts} from '../core/flow';
import {LIST_STYLE_FILE} from '../core/lists';

const para=(text:string):RichNode=>({type:'paragraph',attrs:{textAlign:'left',lineHeight:'1.5'},content:[{type:'text',text,marks:[{type:'bold'}]}]});
const list:RichNode={type:'orderedList',attrs:{start:3},content:[{type:'listItem',content:[para('中文 & 50%'),{type:'bulletList',content:[{type:'listItem',content:[para('嵌套列表')]}]}]},{type:'listItem',content:[{...para('第二项'),content:[{type:'text',text:'公式 '},{type:'inlineMath',attrs:{latex:'x^2'}},{type:'hardBreak'},{type:'text',text:'换行'}]}]}]};
test('列表往返保留起始编号、嵌套、格式、行内公式与换行',()=>{
  const source=serializeRich({type:'doc',content:[list]});assert.equal(serializeRich(parseRich(source)),source);
  assert.equal(parseRich(source).content![0].attrs!.start,3);assert.ok(source.includes('\\& 50\\%'));
  assert.throws(()=>parseRich('\\PageWeaveList{unknown}{1}{x}'));
  assert.throws(()=>serializeRich({type:'doc',content:[{type:'bulletList',content:[{type:'listItem',content:[{type:'flowImage'}]}]}]}));
  let nested:RichNode=list;for(let i=0;i<4;i++)nested={type:'bulletList',content:[{type:'listItem',content:[para('层级'),nested]}]};
  assert.throws(()=>serializeRich({type:'doc',content:[nested]}),/四级/);
});
test('列表保存、重开与撤销保持正文，保留已有样式文件',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'pageweave-lists-'));
  try{
    await fs.cp(path.resolve('examples/writing'),root,{recursive:true});const p=await Project.open(root),original=p.history.texts.get('main.tex')!;
    p.writeFlow([{id:p.state().writing[0].id,content:{type:'doc',content:[list]}}],p.version);
    const serialized=serializeRich(flowDocument(p.state().writing));assert.ok(p.files.has(LIST_STYLE_FILE));await p.save();
    const reopened=await Project.open(root);assert.equal(serializeRich(flowDocument(reopened.state().writing)),serialized);
    p.undo(p.version);assert.equal(p.history.texts.get('main.tex'),original);p.redo(p.version);assert.equal(serializeRich(flowDocument(p.state().writing)),serialized);
    const before=p.history.texts.get('main.tex');p.source(LIST_STYLE_FILE,'custom style',p.version);
    assert.throws(()=>p.writeFlow(flowParts(flowDocument(p.state().writing),p.state().writing[0].id),p.version),/不同的列表样式/);assert.equal(p.history.texts.get('main.tex'),before);
  }finally{assert.ok(path.basename(root).startsWith('pageweave-lists-'));await fs.rm(root,{recursive:true,force:true});}
});
test('另存为冻结当前文稿、保留资源与入口，不覆盖原件或已有目录',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'pageweave-copy-')),original=path.join(root,'original'),copy=path.join(root,'copy');
  try{
    await fs.cp(path.resolve('examples/paper'),original,{recursive:true});const p=await Project.open(original),before=await fs.readFile(path.join(original,'main.tex'),'utf8');
    p.source('main.tex',before+'\n% saved copy',p.version);p.configure('main.tex','lualatex');
    const task=p.saveAs(copy);p.source('main.tex',before+'\n% later editing',p.version);const next=await task;
    assert.equal(await fs.readFile(path.join(original,'main.tex'),'utf8'),before);
    assert.equal(next.history.texts.get('main.tex'),before+'\n% saved copy');assert.equal(next.engine,'lualatex');assert.ok(next.files.has('figures/workflow.png'));assert.ok(next.state().files.every(f=>!f.dirty));
    assert.equal(p.history.texts.get('main.tex'),before+'\n% later editing');
    await assert.rejects(p.saveAs(copy),/已存在/);await assert.rejects(p.saveAs(path.join(original,'nested')),/以外/);
    assert.equal(next.history.texts.get('main.tex'),before+'\n% saved copy');
  }finally{assert.ok(path.basename(root).startsWith('pageweave-copy-'));await fs.rm(root,{recursive:true,force:true});}
});
