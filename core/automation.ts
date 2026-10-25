import {createHash} from 'node:crypto';
import {Project} from './project';
import {Compiler} from './compiler';
import {RecoveryStore} from './recovery';
import {PAGE_PLAN_FILE} from './page-plan';
import {REVIEW_FILE} from './review';
import {canFlow} from './flow';
import type {ProjectState} from './types';

export const CLI_PROTOCOL=1;
export const MAX_CLI_BYTES=8*1024*1024;
export type CliRequest=
  | {action:'status'}
  | {action:'read';file?:string}
  | {action:'write';revision:string;file?:string;content:string}
  | {action:'replace';revision:string;file?:string;find:string;replace:string;all?:boolean}
  | {action:'layout';revision:string;margin:number;paper:'a4paper'|'a5paper'|'letterpaper';landscape:boolean}
  | {action:'save'|'undo';revision:string}
  | {action:'compile';revision?:string};
export type CliResponse={ok:true;data:Record<string,unknown>}|{ok:false;error:{code:string;message:string};data?:Record<string,unknown>};
export interface AutomationStep {response:CliResponse;project:ProjectState;refresh:'none'|'content'|'layout'}
export class CliError extends Error {constructor(readonly code:string,message:string){super(message);}}
export const cliError=(error:unknown):CliResponse=>({ok:false,error:{code:error instanceof CliError?error.code:'OPERATION_FAILED',message:error instanceof Error?error.message:String(error)}});
const object=(value:unknown):Record<string,unknown>=>{if(!value||typeof value!=='object'||Array.isArray(value))throw new CliError('INVALID_REQUEST','请求必须是 JSON 对象。');return value as Record<string,unknown>;};
export function validateCliRequest(value:unknown):CliRequest {
  const v=object(value),action=v.action;
  const string=(key:string,optional=false)=>{const x=v[key];if(optional&&x===undefined)return; if(typeof x!=='string'||Buffer.byteLength(x)>5*1024*1024)throw new CliError('INVALID_REQUEST',`${key} 必须是 5 MB 以内的字符串。`);};
  if(!['status','read','write','replace','layout','save','undo','compile'].includes(String(action)))throw new CliError('UNKNOWN_COMMAND','不支持的命令，请运行 pageweave help。');
  const fields:Record<string,string[]>={status:[],read:['file'],write:['file','content','revision'],replace:['file','find','replace','all','revision'],layout:['margin','paper','landscape','revision'],save:['revision'],undo:['revision'],compile:['revision']};
  if(Object.keys(v).some(key=>key!=='action'&&!fields[String(action)].includes(key)))throw new CliError('INVALID_REQUEST','请求含有未知参数。');
  if(action==='read'||action==='write'||action==='replace')string('file',true);
  if(!['status','read','compile'].includes(String(action))){string('revision');if(!v.revision)throw new CliError('REVISION_REQUIRED','请先读取文稿并提供返回的 revision。');}
  if(action==='compile')string('revision',true);
  if(action==='write')string('content');
  if(action==='replace'){string('find');string('replace');if(!v.find||v.all!==undefined&&typeof v.all!=='boolean')throw new CliError('INVALID_REQUEST','find 不能为空，all 必须是布尔值。');}
  if(action==='layout'&&(!Number.isFinite(v.margin)||Number(v.margin)<10||Number(v.margin)>50||!['a4paper','a5paper','letterpaper'].includes(String(v.paper))||typeof v.landscape!=='boolean'))throw new CliError('INVALID_REQUEST','页边距为 10–50 毫米，纸张支持 a4paper、a5paper、letterpaper。');
  return v as CliRequest;
}

const binaryHashes=new WeakMap<Buffer,string>();
/** Generated page plans and save acknowledgements do not invalidate a document revision. */
export function documentRevision(project:Project){
  const hash=createHash('sha256').update(JSON.stringify([project.id,project.main,project.engine]));
  for(const [name,file]of [...project.files].sort(([a],[b])=>a.localeCompare(b))){
    if(name===PAGE_PLAN_FILE)continue;
    const text=project.history.texts.get(name);
    let content=text;
    if(content===undefined){content=binaryHashes.get(file.bytes);if(!content){content=createHash('sha256').update(file.bytes).digest('hex');binaryHashes.set(file.bytes,content);}}
    hash.update(JSON.stringify([name,content]));
  }
  return hash.digest('hex');
}
function summary(project:Project){const state=project.state();return {protocol:CLI_PROTOCOL,revision:documentRevision(project),main:state.main,root:state.root,engine:state.engine,writing:canFlow(state),dirty:state.files.some(f=>f.dirty),files:state.files.map(({path,editable,size,dirty})=>({path,editable,size,dirty}))};}

export class AutomationService {
  constructor(private getProject:()=>Project,private recovery:RecoveryStore,private compiler:Compiler){}
  async execute(input:unknown):Promise<AutomationStep>{
    const project=this.getProject();let refresh:AutomationStep['refresh']='none';const before=documentRevision(project);
    try{
      const request=validateCliRequest(input);
      if('revision' in request&&request.revision!==undefined&&request.revision!==before)throw new CliError('REVISION_CONFLICT','文稿已变化，请重新读取后再提交修改。');
      if(request.action==='status')return {response:{ok:true,data:summary(project)},project:project.state(),refresh};
      if(request.action==='read'||request.action==='write'||request.action==='replace'){
        const file=request.file??project.main,disk=project.files.get(file),content=project.history.texts.get(file);
        if(!disk||content===undefined)throw new CliError('FILE_NOT_FOUND','文件不在当前文稿的可读取源码中。');
        if(request.action==='read')return {response:{ok:true,data:{revision:before,file,content,editable:disk.info.editable&&file!==PAGE_PLAN_FILE&&file!==REVIEW_FILE}},project:project.state(),refresh};
        if(!disk.info.editable||file===PAGE_PLAN_FILE||file===REVIEW_FILE)throw new CliError('READ_ONLY','此文件不能通过 CLI 直接修改。');
        let next:string,count:number|undefined;
        if(request.action==='write')next=request.content;
        else{
          count=content.split(request.find).length-1;
          if(!count)throw new CliError('TEXT_NOT_FOUND','未找到指定原文。');
          if(count>1&&!request.all)throw new CliError('AMBIGUOUS_MATCH','原文出现多次，请缩小匹配范围或显式指定 all。');
          next=request.all?content.split(request.find).join(request.replace):content.replace(request.find,()=>request.replace);
        }
        if(Buffer.byteLength(next)>5*1024*1024)throw new CliError('TOO_LARGE','修改后的源码不能超过 5 MB。');
        refresh='content';await project.sourceWithDependencies(file,next,project.version);await this.recovery.checkpoint(project);
        return {response:{ok:true,data:{...summary(project),file,...(count===undefined?{}:{replacements:count})}},project:project.state(),refresh};
      }
      if(request.action==='layout'){refresh='layout';project.pageSettings(request.margin,request.paper,request.landscape,project.version);await this.recovery.checkpoint(project);}
      if(request.action==='undo'){refresh='content';project.undo(project.version);await this.recovery.checkpoint(project);}
      if(request.action==='save')await this.recovery.save(project);
      if(request.action==='compile'){
        const frozen=project.forkSnapshot(),result=await this.compiler.compile(frozen);
        const data={revision:before,main:frozen.main,durationMs:result.durationMs,diagnostics:result.diagnostics,log:result.log,...(result.ok?{pdf:this.compiler.pdfPath(result.token)}:{})};
        return {response:result.ok?{ok:true,data}:{ok:false,error:{code:'COMPILE_FAILED',message:'LaTeX 排版未通过。'},data},project:project.state(),refresh};
      }
      return {response:{ok:true,data:summary(project)},project:project.state(),refresh};
    }catch(error){const response=cliError(error);if(!response.ok&&documentRevision(project)!==before)response.data={applied:true,revision:documentRevision(project)};return {response,project:project.state(),refresh};}
  }
}
