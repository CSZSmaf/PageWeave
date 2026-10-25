import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {Project} from '../core/project';
import {RecoveryStore} from '../core/recovery';
import {Compiler} from '../core/compiler';
import {AutomationService,documentRevision,validateCliRequest,type CliResponse} from '../core/automation';
import {serveCli,callCli,connectionFile} from '../core/cli-transport';

async function fixture(t:TestContext){
  const directory=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'pageweave-cli-'))),root=path.join(directory,'文稿');await fs.mkdir(root);
  await fs.writeFile(path.join(root,'报告.tex'),'\\documentclass{article}\n\\usepackage[a4paper,margin=25mm]{geometry}\n\\begin{document}\nHello Hello\n\\end{document}');
  const project=await Project.openFile(path.join(root,'报告.tex')),recovery=new RecoveryStore(path.join(directory,'recovery')),service=new AutomationService(()=>project,recovery,new Compiler(path.join(directory,'builds')));
  t.after(async()=>{assert.ok(path.basename(directory).startsWith('pageweave-cli-'));assert.equal(path.dirname(directory),await fs.realpath(os.tmpdir()));await fs.rm(directory,{recursive:true,force:true});});
  return {directory,root,project,service,recovery};
}
function code(value:CliResponse){return value.ok?'OK':value.error.code;}
test('CLI 修改要求当前 revision，拒绝歧义替换并保留撤销与恢复',async t=>{
  const {project,service,recovery}=await fixture(t),revision=documentRevision(project);
  assert.equal(code((await service.execute({action:'replace',revision,find:'Hello',replace:'changed'})).response),'AMBIGUOUS_MATCH');
  assert.equal(documentRevision(project),revision);
  const result=await service.execute({action:'replace',revision,find:'Hello',replace:'$& exact',all:true});assert.equal(result.response.ok,true);
  assert.ok(project.history.texts.get(project.main)!.includes('$& exact $& exact'));assert.ok(await recovery.find(project.root));
  assert.equal(code((await service.execute({action:'write',revision,content:'stale'})).response),'REVISION_CONFLICT');
  assert.equal(code((await service.execute({action:'read',file:'../secret.tex'})).response),'FILE_NOT_FOUND');
  const next=documentRevision(project);assert.equal((await service.execute({action:'save',revision:next})).response.ok,true);assert.equal(documentRevision(project),next);
  assert.equal((await service.execute({action:'undo',revision:next})).response.ok,true);assert.ok(project.history.texts.get(project.main)!.includes('Hello Hello'));
});
test('CLI 页面设置验证参数，快照不受后续编辑影响',async t=>{
  const {project,service}=await fixture(t),revision=documentRevision(project),frozen=project.forkSnapshot();
  assert.equal(code((await service.execute({action:'layout',revision,margin:-1,paper:'a4paper',landscape:false})).response),'INVALID_REQUEST');
  assert.equal((await service.execute({action:'layout',revision,margin:20,paper:'a5paper',landscape:true})).response.ok,true);
  assert.match(project.history.texts.get(project.main)!,/a5paper,margin=20mm,landscape/);assert.match(frozen.history.texts.get(frozen.main)!,/a4paper,margin=25mm/);
  const current=documentRevision(project);project.files.set('pageweave-pages.tex',{...project.files.get(project.main)!,info:{...project.files.get(project.main)!.info,path:'pageweave-pages.tex'}});project.history.texts.set('pageweave-pages.tex','generated');assert.equal(documentRevision(project),current);
  assert.throws(()=>validateCliRequest({action:'status',shell:'anything'}));
  assert.throws(()=>validateCliRequest({action:'write',content:'missing revision'}));
});
test('本地 CLI 管道认证、JSON 输出、退出码和失效连接',async t=>{
  const {directory,service}=await fixture(t),profile=path.join(directory,'profile');let calls=0;
  const close=await serveCli(profile,async request=>{calls++;return (await service.execute(request)).response;});
  try{
    const status=await callCli(profile,{action:'status'});assert.equal(status.ok,true);assert.equal(calls,1);
    const config=JSON.parse(await fs.readFile(connectionFile(profile),'utf8'));
    const denied=await new Promise<CliResponse>((resolve,reject)=>{const socket=net.createConnection(config.endpoint);let data='';socket.on('error',reject);socket.on('connect',()=>socket.write(JSON.stringify({protocol:1,token:'0'.repeat(64),request:{action:'status'}})+'\n'));socket.on('data',chunk=>data+=chunk);socket.on('end',()=>resolve(JSON.parse(data)));});
    assert.equal(code(denied),'UNAUTHORIZED');assert.equal(calls,1);
    const env:NodeJS.ProcessEnv={...process.env,PAGEWEAVE_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;
    const run=promisify(execFile);const good=await run(process.execPath,['--import','tsx','cli/main.ts','read'],{env,cwd:path.resolve('.'),windowsHide:true});assert.equal(JSON.parse(good.stdout).data.file,'报告.tex');
    await assert.rejects(run(process.execPath,['--import','tsx','cli/main.ts','write','--input','package.json','--revision','stale'],{env,cwd:path.resolve('.'),windowsHide:true}),e=>{const error=e as Error&{code:number;stdout:string};assert.equal(error.code,4);assert.equal(JSON.parse(error.stdout).error.code,'REVISION_CONFLICT');return true;});
    await assert.rejects(run(process.execPath,['--import','tsx','cli/main.ts','status','--unknown','value'],{env,cwd:path.resolve('.'),windowsHide:true}),e=>{assert.equal((e as {code:number}).code,2);return true;});
  }finally{await close();}
  await assert.rejects(callCli(profile,{action:'status'}),/未找到/);
});
