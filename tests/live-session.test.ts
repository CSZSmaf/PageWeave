import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Project} from '../core/project';
import {blockSource,type RichNode} from '../core/writing';
import {identify} from '../core/review';
import {LiveSession} from '../src/writing/LiveSession';
import type {WorkbenchApi,CompileResult} from '../core/types';

const document=(text:string):RichNode=>({type:'doc',content:[{type:'paragraph',content:[{type:'text',text}]}]});
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(r=>resolve=r);return {promise,resolve};}
async function fixture(t:TestContext,compile?:(result:CompileResult)=>Promise<CompileResult>){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'pageweave-live-'));
  await fs.writeFile(path.join(root,'main.tex'),'\\documentclass{article}\n\\begin{document}\n'+blockSource('start',document('原文'))+'\n\\end{document}');
  const p=await Project.open(root);let builds=0;
  const api={
    async writeFlow(parts,version,doc){return p.writeFlow(parts,version,doc);},
    async source(file,text,version){return p.source(file,text,version);},
    async compile(){const result:CompileResult={ok:true,projectId:p.id,version:p.version,token:String(++builds),regions:[],writingRegions:[],log:'',diagnostics:[],durationMs:1};return compile?compile(result):result;},
  } as WorkbenchApi;
  const session=new LiveSession(p.state(),api,{project(){},preview(){},busy(){},pending(){},error(e){throw e;}});
  t.after(async()=>{session.dispose();assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith('pageweave-live-'));await fs.rm(root,{recursive:true,force:true});});
  return {p,session,get builds(){return builds;}};
}

test('正文待排版时添加批注，不得把旧 PDF 标记为最新版本',async t=>{
  const f=await fixture(t),s=f.session;await s.build();const original=s.preview!;
  const changed=document('更新后的正文');s.change(changed);await s.flush();
  const content=identify(changed.content!);
  s.change({...changed,content,attrs:{review:{version:1,tracking:false,baseline:content,comments:[{id:'comment-1',text:'说明',quote:'正文',from:5,to:7,resolved:false,orphaned:false,createdAt:'2026-10-25T00:00:00Z'}]}}});await s.flush();
  assert.equal(s.preview?.version,original.version);assert.notEqual(s.preview?.version,s.project.version);
  const result=await s.latest();assert.equal(result.version,s.project.version);assert.equal(f.builds,2);
});

test('重复导出复用最新 PDF，仅在正文更改后重新编译',async t=>{
  const f=await fixture(t),s=f.session;const first=await s.latest();
  assert.equal((await s.latest()).token,first.token);assert.equal(f.builds,1);
  s.change(document('导出的最新内容'));const next=await s.latest();
  assert.equal(f.builds,2);assert.equal(next.version,s.project.version);
  assert.equal((await s.latest()).token,next.token);assert.equal(f.builds,2);
});

test('导出等待正在进行的编译，不重复编译同一正文',async t=>{
  const gate=deferred(),entered=deferred();
  const f=await fixture(t,async result=>{entered.resolve();await gate.promise;return result;});
  const building=f.session.build();await entered.promise;
  const exporting=f.session.latest();await new Promise(resolve=>setImmediate(resolve));gate.resolve();
  await building;assert.equal((await exporting).version,f.p.version);assert.equal(f.builds,1);
});

test('导出期间输入新内容，等待新正文的编译结果',async t=>{
  const gate=deferred(),entered=deferred();
  const f=await fixture(t,async result=>{if(result.token==='1'){entered.resolve();await gate.promise;}return result;});
  const exporting=f.session.latest();await entered.promise;f.session.change(document('编译期间输入'));gate.resolve();
  const result=await exporting;assert.equal(result.version,f.p.version);assert.equal(f.builds,2);
  assert.match(f.p.history.texts.get('main.tex')!,/编译期间输入/);
});

test('编译失败时导出报错，不循环重试',async t=>{
  const f=await fixture(t,async result=>({...result,ok:false}));
  await assert.rejects(f.session.latest(),/排版未通过/);assert.equal(f.builds,1);
});
