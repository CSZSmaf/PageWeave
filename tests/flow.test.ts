import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Project} from '../core/project';
import {blockSource,serializeRich,parseRich,type RichNode} from '../core/writing';
import {canFlow,flowDocument,flowParts} from '../core/flow';
import {LiveSession} from '../src/writing/LiveSession';
import type {WorkbenchApi,CompileResult} from '../core/types';

const paragraph=(text:string):RichNode=>({type:'doc',content:[{type:'paragraph',content:[{type:'text',text}]}]});
async function fixture(){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'mogao-flow-'));
  const prefix='\\documentclass{article}\r\n% preserve preamble\r\n\\begin{document}\r\n';
  const suffix='\r\n% preserve ending\r\n\\end{document}\r\n';
  const source=prefix+blockSource('one',paragraph('第一段'))+'\r\n% between paragraphs\r\n'+blockSource('two',paragraph('第二段'))+suffix;
  await fs.writeFile(path.join(root,'main.tex'),source);
  return {project:await Project.open(root),source,prefix,suffix};
}
test('连续编辑跨区域合并、撤销恢复、存盘重开，保留外围源码和注释',async()=>{
  const {project:p,source,prefix,suffix}=await fixture();assert.ok(canFlow(p.state()));
  const initial=flowDocument(p.state().writing);
  p.writeFlow([{id:'one',content:paragraph('第一段第二段')}],0);
  assert.equal(p.state().writing.length,1);assert.ok(p.history.texts.get('main.tex')!.includes('% between paragraphs'));
  p.writeFlow(flowParts(initial,'one'),1);
  assert.equal(p.state().writing.length,2);
  const actual=p.history.texts.get('main.tex')!;assert.ok(actual.startsWith(prefix));assert.ok(actual.endsWith(suffix));
  p.undo(2);p.undo(3);assert.equal(p.history.texts.get('main.tex'),source);
  p.redo(4);await p.save();assert.equal((await Project.open(p.root)).state().writing[0].content.content?.[0].content?.[0].text,'第一段第二段');
  assert.throws(()=>p.writeFlow([{id:'one',content:paragraph('stale')}],0),/版本/);
});
test('不忽略区域之间的普通 LaTeX 内容；拒绝重复 ID 和区域重排',async()=>{
  const {project:p}=await fixture();
  assert.throws(()=>p.writeFlow([{id:'two',content:paragraph('B')},{id:'one',content:paragraph('A')}],0),/顺序/);
  assert.throws(()=>p.writeFlow([{id:'one',content:paragraph('B')},{id:'one',content:paragraph('A')}],0),/标识/);
  p.source('main.tex',p.history.texts.get('main.tex')!.replace('% between paragraphs','\\section{保留的结构}'),0);
  assert.equal(canFlow(p.state()),false);
  assert.throws(()=>p.writeFlow([{id:'one',content:paragraph('A')}],1),/源码视图/);
});
test('自动同步合并并发输入，旧编译结果不覆盖新版本，保存包含在途输入',async()=>{
  const {project:p}=await fixture();let releaseWrite:()=>void=()=>{},releaseBuild:()=>void=()=>{},writes=0,builds=0;
  const writeGate=new Promise<void>(resolve=>releaseWrite=resolve),buildGate=new Promise<void>(resolve=>releaseBuild=resolve);
  const published:number[]=[],errors:unknown[]=[];
  const api={
    async writeFlow(parts,version){writes++;if(writes===1)await writeGate;return p.writeFlow(parts,version);},
    async compile(){builds++;const state=p.state();if(builds===1)await buildGate;return {ok:true,projectId:state.id,version:state.version,token:String(state.version),regions:[],writingRegions:[],log:'',diagnostics:[],durationMs:1} as CompileResult;},
  } as WorkbenchApi;
  const session=new LiveSession(p.state(),api,{project:()=>{},pending:()=>{},busy:()=>{},error:e=>errors.push(e),preview:r=>published.push(r.version)});
  const initialBuild=session.build();
  session.change(paragraph('输入 A'));const flushing=session.flush();await new Promise(resolve=>setTimeout(resolve,0));
  session.change(paragraph('输入 AB'));session.change(paragraph('输入 ABC'));releaseWrite();await flushing;
  releaseBuild();await initialBuild;
  assert.equal(writes,2);assert.equal(builds,2);assert.deepEqual(published,[2]);assert.ok(p.history.texts.get('main.tex')!.includes('输入 ABC'));
  session.change(paragraph('保存最新输入'));await session.mutate(()=>p.save());
  assert.ok((await fs.readFile(path.join(p.root,'main.tex'),'utf8')).includes('保存最新输入'));
  assert.deepEqual(errors,[]);session.dispose();
});

test('颜色不重设字体字号，图片与表格可往返，资源保存后重开',async()=>{
  const {project:p}=await fixture();
  const png=await fs.readFile(path.resolve('examples/paper/figures/workflow.png'));
  const image=p.addImage(png,0);
  const cell=(text:string):RichNode=>({type:'tableCell',content:paragraph(text).content});
  const doc:RichNode={type:'doc',content:[
    {type:'heading',attrs:{level:1},content:[{type:'text',text:'颜色标题',marks:[{type:'textStyle',attrs:{color:'#1565C0'}}]}]},
    {type:'flowImage',attrs:{src:image.src,width:60,textAlign:'right',naturalWidth:800,naturalHeight:400}},
    {type:'table',content:[{type:'tableRow',content:[cell('中文 & 100%'),cell('第二格')]},{type:'tableRow',content:[cell('下一行'),cell('末格')]}]},
  ]};
  const serialized=serializeRich(doc),parsed=parseRich(serialized);
  assert.ok(serialized.includes('\\MogaoText{}{}{1565C0}'));
  assert.equal(parsed.content?.[1].attrs?.width,60);assert.equal(parsed.content?.[2].content?.[0].content?.[0].content?.[0].content?.[0].text,'中文 & 100%');
  p.writeFlow([{id:'one',content:doc}],p.version);
  assert.ok(p.history.texts.get('main.tex')!.includes('\\usepackage{mogao-tools}'));assert.ok(p.state().files.some(f=>f.path==='mogao-tools.sty'&&f.dirty));
  assert.ok(p.imageData(image.src).startsWith('data:image/png;base64,'));assert.throws(()=>p.imageData('../secret.png'));
  await p.save();const reopened=await Project.open(p.root);
  assert.equal(canFlow(reopened.state()),true);assert.deepEqual(reopened.files.get(image.src)?.bytes,png);assert.ok(reopened.state().files.every(f=>!f.dirty));
  assert.deepEqual(reopened.state().writing[0].content,parsed);
});

test('源码输入与正文共享串行版本，输入期间旧响应不覆盖草稿，切换和保存排空队列',async()=>{
  const {project:p}=await fixture();let release:()=>void=()=>{},calls=0;
  const gate=new Promise<void>(resolve=>release=resolve);
  const api={async source(file,text,version){if(++calls===1)await gate;return p.source(file,text,version);},async writeFlow(parts,version){return p.writeFlow(parts,version);}} as WorkbenchApi;
  const session=new LiveSession(p.state(),api,{project:()=>{},pending:()=>{},busy:()=>{},error:e=>{throw e;},preview:()=>{}});
  const first=p.history.texts.get('main.tex')!.replace('第一段','源码改写 A');
  const latest=first.replace('源码改写 A','源码改写 AB');
  session.changeSource('main.tex',first);const flushing=session.flush();await new Promise(resolve=>setTimeout(resolve,0));
  session.changeSource('main.tex',latest);assert.equal(session.sourceText('main.tex'),latest);
  release();await flushing;assert.equal(session.project.version,2);assert.equal(session.sourceText('main.tex'),latest);
  session.changeSource('main.tex',latest.replace('源码改写 AB','保存最新源码'));
  await session.mutate(()=>p.save());assert.match(await fs.readFile(path.join(p.root,'main.tex'),'utf8'),/保存最新源码/);
  assert.ok(canFlow(p.state()));session.dispose();
});
