import type {CompileResult,ProjectState,WorkbenchApi} from '../../core/types';
import type {RichNode} from '../../core/writing';
import {flowParts} from '../../core/flow';
import {REVIEW_FILE} from '../../core/review';
import type {PagePlan} from '../../core/page-plan';

function sameRender(a:ProjectState,b:ProjectState){
  if(a.id!==b.id||a.main!==b.main||a.engine!==b.engine)return false;
  const files=a.files.filter(f=>f.path!==REVIEW_FILE),other=b.files.filter(f=>f.path!==REVIEW_FILE);
  return files.length===other.length&&files.every((f,i)=>f.path===other[i].path&&f.content===other[i].content&&(f.content!==null||f.size===other[i].size));
}

export type SaveStatus='pending'|'saving'|'saved'|'error';
interface Events{project(project:ProjectState):void;preview(result:CompileResult):void;busy(busy:boolean):void;pending(pending:boolean):void;error(error:unknown):void;saveStatus?(status:SaveStatus):void}
/** Serial source updates and coalesced builds. Neither completion replaces editor state. */
export class LiveSession{
  private pending:RichNode|null=null;
  private pendingPlan:PagePlan|null=null;
  private planKey='';
  private sources=new Map<string,string>();
  private queue:Promise<unknown>=Promise.resolve();
  private writeTimer:ReturnType<typeof setTimeout>|undefined;
  private maxWriteTimer:ReturnType<typeof setTimeout>|undefined;
  private buildTimer:ReturnType<typeof setTimeout>|undefined;
  private saveTimer:ReturnType<typeof setTimeout>|undefined;
  private maxSaveTimer:ReturnType<typeof setTimeout>|undefined;
  private building:Promise<void>|null=null;
  private requested=false;
  private disposed=false;
  private fallback:string;
  preview:CompileResult|null=null;
  constructor(public project:ProjectState,private api:WorkbenchApi,private events:Events){this.fallback=project.writing[0]?.id??'start';}
  private scheduleWrite(){this.events.pending(true);this.events.saveStatus?.('pending');clearTimeout(this.writeTimer);this.writeTimer=setTimeout(()=>void this.flush().catch(this.events.error),450);this.maxWriteTimer??=setTimeout(()=>void this.flush().catch(this.events.error),2000);}
  private clearSaveTimers(){clearTimeout(this.saveTimer);clearTimeout(this.maxSaveTimer);this.maxSaveTimer=undefined;}
  private scheduleSave(){
    if(this.disposed||!this.api.autoSave)return;
    if(!this.project.files.some(file=>file.dirty)){this.clearSaveTimers();if(!this.pending&&!this.sources.size&&!this.pendingPlan)this.events.saveStatus?.('saved');return;}
    this.events.saveStatus?.('pending');clearTimeout(this.saveTimer);
    const save=()=>void this.autosave().catch(error=>{this.events.saveStatus?.('error');this.events.error(error);});
    this.saveTimer=setTimeout(save,1500);this.maxSaveTimer??=setTimeout(save,5000);
  }
  async autosave(){
    this.clearSaveTimers();if(this.disposed||!this.api.autoSave)return;
    await this.mutate(async p=>{if(!p.files.some(file=>file.dirty))return p;this.events.saveStatus?.('saving');return this.api.autoSave();});
  }
  change(doc:RichNode){this.pending=doc;this.scheduleWrite();}
  changePlan(plan:PagePlan){if(!this.api.pagePlan)return;const key=JSON.stringify(plan);if(key===this.planKey)return;this.planKey=key;this.pendingPlan=plan;this.scheduleWrite();}
  changeSource(file:string,text:string){this.planKey='';this.sources.set(file,text);this.scheduleWrite();}
  sourceText(file:string){return this.sources.get(file)??this.project.files.find(f=>f.path===file)?.content??'';}
  private accept(next:ProjectState){
    if(this.disposed)return;
    const before=this.project,unchanged=sameRender(before,next);this.project=next;this.events.project(next);
    // Metadata can advance a matching preview, never an already stale PDF.
    if(unchanged&&this.preview?.projectId===before.id&&this.preview.version===before.version&&before.version!==next.version){this.preview={...this.preview,version:next.version};this.events.preview(this.preview);}
    this.scheduleSave();
  }
  private async drain(){
    while((this.pending||this.sources.size||this.pendingPlan)&&!this.disposed){
      const before=this.project;
      if(this.pending){
        const doc=this.pending;this.pending=null;
        try{this.accept(await this.api.writeFlow(flowParts(doc,this.fallback),this.project.version,doc));}
        catch(error){this.pending??=doc;throw error;}
      }else if(this.sources.size){
        const [file,text]=this.sources.entries().next().value!;
        this.accept(await this.api.source(file,text,this.project.version));
        if(this.sources.get(file)===text)this.sources.delete(file);
      }else if(this.pendingPlan){
        const plan=this.pendingPlan;
        this.accept(await this.api.pagePlan(plan,this.project.version));
        if(this.pendingPlan===plan)this.pendingPlan=null;
      }
      if(!sameRender(before,this.project))this.scheduleBuild();
    }
    this.events.pending(!!this.pending||!!this.sources.size||!!this.pendingPlan);
    if(!this.pending&&!this.sources.size&&!this.pendingPlan&&!this.project.files.some(f=>f.dirty))this.events.saveStatus?.('saved');
  }
  flush(){clearTimeout(this.writeTimer);clearTimeout(this.maxWriteTimer);this.maxWriteTimer=undefined;const task=this.queue.catch(()=>{}).then(()=>this.drain());this.queue=task;return task;}
  mutate(action:(project:ProjectState)=>Promise<ProjectState>){
    clearTimeout(this.writeTimer);clearTimeout(this.maxWriteTimer);this.maxWriteTimer=undefined;
    const task=this.queue.catch(()=>{}).then(async()=>{await this.drain();const before=this.project;this.accept(await action(this.project));await this.drain();if(!sameRender(before,this.project))this.scheduleBuild();});
    this.queue=task;return task;
  }
  private scheduleBuild(){clearTimeout(this.buildTimer);this.buildTimer=setTimeout(()=>void this.build().catch(this.events.error),850);}
  build():Promise<void>{
    clearTimeout(this.buildTimer);this.requested=true;
    if(this.building)return this.building;
    this.building=(async()=>{
      this.events.busy(true);
      try{while(this.requested&&!this.disposed){
        clearTimeout(this.buildTimer);this.requested=false;const started=this.project;let result=await this.api.compile();
        if(this.disposed||result.projectId!==this.project.id)continue;
        if(result.version!==this.project.version){if(sameRender(started,this.project))result={...result,version:this.project.version};else{this.requested=true;continue;}}
        this.preview=result;this.events.preview(result);
      }}finally{this.building=null;if(!this.disposed)this.events.busy(false);}
    })();
    return this.building;
  }
  async latest(){
    await this.flush();
    while(!this.disposed){
      if(this.building)await this.building;
      else if(!this.preview?.ok||this.preview.projectId!==this.project.id||this.preview.version!==this.project.version)await this.build();
      // Include input that arrived while compilation was in progress.
      await this.flush();
      if(this.preview?.projectId===this.project.id&&this.preview.version===this.project.version){
        if(!this.preview.ok)throw new Error('排版未通过，请查看日志。');
        return this.preview;
      }
    }
    throw new Error('当前文稿已关闭。');
  }
  async idle(){await this.flush();clearTimeout(this.buildTimer);this.clearSaveTimers();await this.building;if(this.pending||this.sources.size||this.pendingPlan)await this.idle();}
  resume(){if(this.disposed)return;this.scheduleSave();if(this.preview?.version!==this.project.version&&!this.building)this.scheduleBuild();}
  dispose(){this.disposed=true;clearTimeout(this.writeTimer);clearTimeout(this.maxWriteTimer);clearTimeout(this.buildTimer);this.clearSaveTimers();}
}
