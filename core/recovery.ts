import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {Project,contained,type ProjectSnapshot} from './project';
import type {Engine,RecoveryInfo} from './types';

interface RecordFile {path:string;blob:string;baseline:string|null;size:number}
interface RecoveryRecord {format:1;id:string;root:string;main:string;engine:Engine;savedAt:string;files:RecordFile[]}
const sha=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');
const digest=/^[a-f0-9]{64}$/;
export async function atomicWrite(file:string,bytes:Buffer|string){
  const temp=file+'.'+randomUUID()+'.tmp';let handle;
  try{handle=await fs.open(temp,'wx');await handle.writeFile(bytes);await handle.sync();await handle.close();handle=undefined;await fs.rename(temp,file);}
  finally{await handle?.close();await fs.unlink(temp).catch(()=>{});}
}

/** Local, content-addressed journal. A complete manifest is committed before source files are saved. */
export class RecoveryStore {
  private queues=new Map<string,Promise<unknown>>();
  private hashes=new WeakMap<Buffer,string>();
  constructor(readonly directory:string){}
  private key(root:string){const resolved=path.resolve(root);return sha(process.platform==='win32'?resolved.toLowerCase():resolved);}
  private folder(root:string){return path.join(this.directory,this.key(root));}
  private hash(bytes:Buffer){let value=this.hashes.get(bytes);if(!value){value=sha(bytes);this.hashes.set(bytes,value);}return value;}
  private serial<T>(root:string,action:()=>Promise<T>):Promise<T>{const key=this.key(root),next=(this.queues.get(key)??Promise.resolve()).catch(()=>{}).then(action);this.queues.set(key,next);return next;}
  checkpoint(project:Project){
    if(!project.state().files.some(file=>file.dirty))return Promise.resolve();
    const snapshot=project.capture();
    return this.serial(snapshot.root,async()=>{
      const folder=this.folder(snapshot.root),objects=path.join(folder,'objects');await fs.mkdir(objects,{recursive:true});
      const files:RecordFile[]=[];
      for(const file of snapshot.files){
        const blob=this.hash(file.bytes),target=path.join(objects,blob);
        if(!await fs.stat(target).catch(()=>null))await atomicWrite(target,file.bytes);
        files.push({path:file.path,blob,baseline:file.baseline?this.hash(file.baseline):null,size:file.bytes.length});
      }
      const record:RecoveryRecord={format:1,id:randomUUID(),root:snapshot.root,main:snapshot.main,engine:snapshot.engine,savedAt:new Date().toISOString(),files};
      const current=path.join(folder,'current.json'),old=await fs.readFile(current).catch(()=>null);
      if(old)await atomicWrite(path.join(folder,'previous.json'),old);
      await atomicWrite(current,JSON.stringify(record));
      const keep=new Set(files.map(file=>file.blob));
      if(old)try{for(const file of this.parse(old,snapshot.root).files)keep.add(file.blob);}catch{}
      for(const entry of await fs.readdir(objects,{withFileTypes:true}))if(entry.isFile()&&digest.test(entry.name)&&!keep.has(entry.name))await fs.unlink(path.join(objects,entry.name)).catch(()=>{});
    });
  }
  private parse(bytes:Buffer,root:string):RecoveryRecord {
    if(bytes.length>2*1024*1024)throw new Error('恢复记录过大。');
    const record=JSON.parse(bytes.toString('utf8')) as RecoveryRecord;
    if(record.format!==1||typeof record.id!=='string'||this.key(record.root)!==this.key(root)||!['xelatex','pdflatex','lualatex'].includes(record.engine)||!Array.isArray(record.files)||record.files.length>3000||!Number.isFinite(Date.parse(record.savedAt)))throw new Error('恢复记录格式无效。');
    const names=new Set<string>();let size=0;
    for(const file of record.files){
      contained(root,file.path);
      if(!file.path||names.has(file.path)||!digest.test(file.blob)||(file.baseline!==null&&!digest.test(file.baseline))||!Number.isInteger(file.size)||file.size<0)throw new Error('恢复文件索引无效。');
      names.add(file.path);size+=file.size;
    }
    if(size>300*1024*1024||!names.has(record.main))throw new Error('恢复工程大小或入口无效。');
    return record;
  }
  private async read(root:string){
    const folder=this.folder(root);
    for(const name of ['current.json','previous.json'])try{
      const bytes=await fs.readFile(path.join(folder,name)),header=JSON.parse(bytes.toString('utf8'));
      if(name==='current.json'&&header.format===1&&header.cleared===true&&this.key(header.root)===this.key(root))return null;
      const record=this.parse(bytes,root),files:ProjectSnapshot['files']=[];
      for(const file of record.files){const bytes=await fs.readFile(path.join(folder,'objects',file.blob));if(bytes.length!==file.size||sha(bytes)!==file.blob)throw new Error('恢复内容校验失败。');files.push({path:file.path,bytes,baseline:null});}
      return {record,snapshot:{root:record.root,main:record.main,engine:record.engine,files} as ProjectSnapshot};
    }catch{}
    return null;
  }
  private async diskState(record:RecoveryRecord){
    let matches=true,conflict=false;
    for(const file of record.files){
      const full=contained(record.root,file.path),real=await fs.realpath(full).catch(()=>null);
      if(real){const relative=path.relative(record.root,real);if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative)){conflict=true;matches=false;continue;}}
      const bytes=real?await fs.readFile(full).catch(()=>null):null,hash=bytes?sha(bytes):null;
      if(hash!==file.blob)matches=false;
      if(hash!==file.blob&&hash!==file.baseline)conflict=true;
    }
    return {matches,conflict};
  }
  async find(root:string):Promise<RecoveryInfo|null>{
    await this.queues.get(this.key(root))?.catch(()=>{});const saved=await this.read(root);if(!saved)return null;
    const disk=await this.diskState(saved.record);if(disk.matches)return null;
    return {id:saved.record.id,name:path.basename(saved.record.root),savedAt:saved.record.savedAt,conflict:disk.conflict};
  }
  clear(root:string,guard=()=>true){return this.serial(root,async()=>{if(!guard())return;const folder=this.folder(root);await fs.mkdir(folder,{recursive:true});await atomicWrite(path.join(folder,'current.json'),JSON.stringify({format:1,root,cleared:true}));await fs.unlink(path.join(folder,'previous.json')).catch(e=>{if(e.code!=='ENOENT')throw e;});});}
  async save(project:Project){
    await this.checkpoint(project);const state=await project.save();
    if(!state.files.some(file=>file.dirty))await this.clear(project.root,()=>!project.state().files.some(file=>file.dirty));
    return project.state();
  }
  async restore(root:string,id:string){
    await this.queues.get(this.key(root))?.catch(()=>{});const saved=await this.read(root);
    if(!saved||saved.record.id!==id)throw new Error('恢复记录已变化，请重新打开文稿。');
    const disk=await this.diskState(saved.record);let project:Project;
    if(disk.conflict||!await fs.stat(root).catch(()=>null)){
      const target=path.join(this.directory,'recovered','文稿-'+Date.now()+'-'+randomUUID().slice(0,8));await fs.mkdir(target,{recursive:true});
      for(const file of saved.snapshot.files){const full=contained(target,file.path);await fs.mkdir(path.dirname(full),{recursive:true});await atomicWrite(full,file.bytes);}
      project=await Project.open(target);project.configure(saved.snapshot.main,saved.snapshot.engine);await this.clear(root);
    }else{project=await Project.open(root);await project.restore(saved.snapshot);await this.checkpoint(project);}
    return project;
  }
}
