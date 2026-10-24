import type {CompileResult,ProjectState,WorkbenchApi} from '../../core/types';
import type {RichNode} from '../../core/writing';
import {flowParts} from '../../core/flow';

interface Events{project(project:ProjectState):void;preview(result:CompileResult):void;busy(busy:boolean):void;pending(pending:boolean):void;error(error:unknown):void}
/** Serial source updates and coalesced builds. Neither completion replaces editor state. */
export class LiveSession{
  private pending:RichNode|null=null;
  private sources=new Map<string,string>();
  private queue:Promise<unknown>=Promise.resolve();
  private writeTimer:ReturnType<typeof setTimeout>|undefined;
  private maxWriteTimer:ReturnType<typeof setTimeout>|undefined;
  private buildTimer:ReturnType<typeof setTimeout>|undefined;
  private building:Promise<void>|null=null;
  private requested=false;
  private disposed=false;
  private fallback:string;
  preview:CompileResult|null=null;
  constructor(public project:ProjectState,private api:WorkbenchApi,private events:Events){this.fallback=project.writing[0]?.id??'start';}
  private scheduleWrite(){this.events.pending(true);clearTimeout(this.writeTimer);this.writeTimer=setTimeout(()=>void this.flush().catch(this.events.error),450);this.maxWriteTimer??=setTimeout(()=>void this.flush().catch(this.events.error),2000);}
  change(doc:RichNode){this.pending=doc;this.scheduleWrite();}
  changeSource(file:string,text:string){this.sources.set(file,text);this.scheduleWrite();}
  sourceText(file:string){return this.sources.get(file)??this.project.files.find(f=>f.path===file)?.content??'';}
  private accept(next:ProjectState){if(this.disposed)return;this.project=next;this.events.project(next);}
  private async drain(){
    while((this.pending||this.sources.size)&&!this.disposed){
      const before=this.project.version;
      if(this.pending){
        const doc=this.pending;this.pending=null;
        try{this.accept(await this.api.writeFlow(flowParts(doc,this.fallback),this.project.version));}
        catch(error){this.pending??=doc;throw error;}
      }else{
        const [file,text]=this.sources.entries().next().value!;
        this.accept(await this.api.source(file,text,this.project.version));
        if(this.sources.get(file)===text)this.sources.delete(file);
      }
      if(this.project.version!==before)this.scheduleBuild();
    }
    this.events.pending(!!this.pending||!!this.sources.size);
  }
  flush(){clearTimeout(this.writeTimer);clearTimeout(this.maxWriteTimer);this.maxWriteTimer=undefined;const task=this.queue.catch(()=>{}).then(()=>this.drain());this.queue=task;return task;}
  mutate(action:(project:ProjectState)=>Promise<ProjectState>){
    clearTimeout(this.writeTimer);clearTimeout(this.maxWriteTimer);this.maxWriteTimer=undefined;
    const task=this.queue.catch(()=>{}).then(async()=>{await this.drain();const before=this.project.version;this.accept(await action(this.project));await this.drain();if(this.project.version!==before)this.scheduleBuild();});
    this.queue=task;return task;
  }
  private scheduleBuild(){clearTimeout(this.buildTimer);this.buildTimer=setTimeout(()=>void this.build().catch(this.events.error),850);}
  build():Promise<void>{
    clearTimeout(this.buildTimer);this.requested=true;
    if(this.building)return this.building;
    this.building=(async()=>{
      this.events.busy(true);
      try{while(this.requested&&!this.disposed){
        this.requested=false;const result=await this.api.compile();
        if(this.disposed||result.projectId!==this.project.id)continue;
        if(result.version!==this.project.version){this.requested=true;continue;}
        this.preview=result;this.events.preview(result);
      }}finally{this.building=null;if(!this.disposed)this.events.busy(false);}
    })();
    return this.building;
  }
  async latest(){
    await this.flush();await this.build();
    // Export/source-switch callers need all edits that arrived during an in-flight build.
    while(this.pending||this.sources.size||this.preview?.version!==this.project.version){await this.flush();await this.build();}
    if(!this.preview?.ok)throw new Error('排版未通过，请查看日志。');
    return this.preview;
  }
  async idle(){await this.flush();clearTimeout(this.buildTimer);await this.building;if(this.pending||this.sources.size)await this.idle();}
  dispose(){this.disposed=true;clearTimeout(this.writeTimer);clearTimeout(this.maxWriteTimer);clearTimeout(this.buildTimer);}
}
