import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Project} from '../core/project';
import {RecoveryStore} from '../core/recovery';
import {blockSource,type RichNode} from '../core/writing';
import {flowParts} from '../core/flow';
import {identify,REVIEW_FILE,reviewData} from '../core/review';
import {LiveSession,type SaveStatus} from '../src/writing/LiveSession';
import type {WorkbenchApi,CompileResult} from '../core/types';

const doc=(text:string):RichNode=>({type:'doc',content:[{type:'paragraph',content:[{type:'text',text}]}]});
async function fixture(t:TestContext){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'pageweave-recovery-')),projectRoot=path.join(root,'document'),cache=path.join(root,'journal');
  await fs.mkdir(projectRoot);await fs.writeFile(path.join(projectRoot,'main.tex'),'\\documentclass{article}\n\\begin{document}\n'+blockSource('start',doc('初始正文'))+'\n\\end{document}');
  const p=await Project.open(projectRoot),store=new RecoveryStore(cache);
  t.after(async()=>{assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith('pageweave-recovery-'));await fs.rm(root,{recursive:true,force:true});});
  return {root,projectRoot,cache,p,store};
}

test('恢复正文、公式、图片和批注；保存中断后恢复同一完整版本',async t=>{
  const {p,store,projectRoot,cache}=await fixture(t);
  const image=await fs.readFile(path.resolve('examples/paper/figures/workflow.png')),asset=p.addImage(image,p.version);
  const content=identify([...doc('待恢复正文').content!,{type:'displayMath',attrs:{latex:'a^2+b^2=c^2'}},{type:'flowImage',attrs:{src:asset.src,width:50,naturalWidth:800,naturalHeight:400}}]);
  const reviewed:RichNode={type:'doc',content,attrs:{review:{version:1,tracking:true,baseline:content,comments:[{id:'c-1',text:'保留批注',quote:'待恢复',from:1,to:4,resolved:false,orphaned:false,createdAt:'2026-10-25T00:00:00Z'}]}}};
  p.writeFlow(flowParts(reviewed,'start'),p.version,reviewed);await store.checkpoint(p);
  // Simulate process loss after one file was replaced but before sidecar/resources.
  await fs.writeFile(path.join(projectRoot,'main.tex'),p.capture().files.find(f=>f.path==='main.tex')!.bytes);
  const restarted=new RecoveryStore(cache),info=await restarted.find(projectRoot);assert.ok(info);assert.equal(info.conflict,false);
  const recovered=await restarted.restore(projectRoot,info.id);assert.equal(recovered.root,p.root);assert.deepEqual(recovered.state().reviewDocument,reviewed);assert.deepEqual(recovered.capture().files.find(f=>f.path===asset.src)!.bytes,image);
  await restarted.save(recovered);const reopened=await Project.open(projectRoot);assert.equal(reviewData(reopened.state().reviewDocument!)!.comments[0].text,'保留批注');assert.ok(reopened.history.texts.get('main.tex')!.includes('a^2+b^2=c^2'));assert.equal(await restarted.find(projectRoot),null);
});

test('自动保存遇到外部修改不覆盖，恢复到独立副本',async t=>{
  const {p,store,projectRoot}=await fixture(t);p.writeFlow([{id:'start',content:doc('应用里的修改')}],p.version);await store.checkpoint(p);
  const full=path.join(projectRoot,'main.tex'),external=(await fs.readFile(full,'utf8'))+'\n% 外部编辑器的修改';await fs.writeFile(full,external);
  await assert.rejects(store.save(p),/外部修改/);const info=await store.find(projectRoot);assert.equal(info?.conflict,true);
  const copy=await store.restore(projectRoot,info!.id);assert.notEqual(copy.root,p.root);assert.match(copy.history.texts.get('main.tex')!,/应用里的修改/);assert.equal(await fs.readFile(full,'utf8'),external);assert.equal(await store.find(projectRoot),null);
});

test('工程目录别名与真实路径使用同一恢复记录',async t=>{
  const {p,store,root,projectRoot,cache}=await fixture(t),alias=path.join(root,'document-alias');
  await fs.symlink(projectRoot,alias,'junction');p.writeFlow([{id:'start',content:doc('别名路径中的修改')}],p.version);await store.checkpoint(p);
  const restarted=new RecoveryStore(cache),info=await restarted.find(alias);assert.ok(info);assert.equal(info.conflict,false);
  const restored=await restarted.restore(alias,info.id);assert.equal(restored.root,p.root);assert.match(restored.history.texts.get('main.tex')!,/别名路径中的修改/);
  await restarted.clear(alias);assert.equal(await restarted.find(p.root),null);
});

test('当前恢复记录或内容损坏时回退到完整的上一版',async t=>{
  for(const corruptBlob of [false,true]){
    const {p,store,projectRoot,cache}=await fixture(t);
    p.writeFlow([{id:'start',content:doc('版本一')}],p.version);await store.checkpoint(p);const first=await store.find(projectRoot);
    p.writeFlow([{id:'start',content:doc('版本二')}],p.version);await store.checkpoint(p);
    const folder=path.join(cache,(await fs.readdir(cache))[0]),current=path.join(folder,'current.json');
    if(corruptBlob){const record=JSON.parse(await fs.readFile(current,'utf8'));await fs.writeFile(path.join(folder,'objects',record.files.find((f:{path:string})=>f.path==='main.tex').blob),'damaged');}
    else await fs.writeFile(current,'{');
    const restarted=new RecoveryStore(cache),info=await restarted.find(projectRoot);assert.equal(info?.id,first?.id);
    const recovered=await restarted.restore(projectRoot,info!.id);assert.match(recovered.history.texts.get('main.tex')!,/版本一/);
  }
});

test('正常保存后不重复提示；清除记录中断时也不恢复旧版本',async t=>{
  const {p,store,projectRoot,cache}=await fixture(t);
  p.writeFlow([{id:'start',content:doc('版本一')}],p.version);await store.checkpoint(p);p.writeFlow([{id:'start',content:doc('版本二')}],p.version);await store.checkpoint(p);
  const folder=path.join(cache,(await fs.readdir(cache))[0]);await fs.writeFile(path.join(folder,'current.json'),JSON.stringify({format:1,root:p.root,cleared:true}));assert.equal(await store.find(projectRoot),null);
  await store.save(p);assert.equal((await Project.open(projectRoot)).state().files.some(file=>file.dirty),false);assert.equal(await store.find(projectRoot),null);
});

test('持续写作与源码编辑自动落盘，保存中的新输入继续保留',async t=>{
  const {p,store,projectRoot}=await fixture(t);let saves=0,release=()=>{};const gate=new Promise<void>(resolve=>release=resolve),statuses:SaveStatus[]=[],errors:unknown[]=[];
  const api={async writeFlow(parts,version,document){const state=p.writeFlow(parts,version,document);await store.checkpoint(p);return state;},async source(file,text,version){const state=p.source(file,text,version);await store.checkpoint(p);return state;},async autoSave(){saves++;if(saves===2)await gate;return store.save(p);},async compile(){return {ok:true,projectId:p.id,version:p.version,token:String(p.version),regions:[],writingRegions:[],log:'',diagnostics:[],durationMs:1} as CompileResult;}} as WorkbenchApi;
  const s=new LiveSession(p.state(),api,{project(){},preview(){},busy(){},pending(){},saveStatus:status=>statuses.push(status),error:error=>errors.push(error)});t.after(()=>s.dispose());
  s.change(doc('自动保存的正文'));await s.flush();await new Promise(resolve=>setTimeout(resolve,1700));assert.equal(saves,1);assert.match(await fs.readFile(path.join(projectRoot,'main.tex'),'utf8'),/自动保存的正文/);assert.equal(statuses.at(-1),'saved');
  s.changeSource('main.tex',s.sourceText('main.tex')+'\n% 第一处源码修改');await s.flush();const saving=s.autosave();await new Promise(resolve=>setImmediate(resolve));
  s.changeSource('main.tex',s.sourceText('main.tex')+'\n% 保存期间继续输入');release();await saving;await s.autosave();
  const disk=await fs.readFile(path.join(projectRoot,'main.tex'),'utf8');assert.match(disk,/第一处源码修改/);assert.match(disk,/保存期间继续输入/);assert.equal(s.project.files.some(f=>f.dirty),false);assert.deepEqual(errors,[]);
});
