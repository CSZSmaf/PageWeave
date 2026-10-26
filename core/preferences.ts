import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {atomicWrite} from './recovery';
import type {Engine,RecentDocument} from './types';

export interface DocumentReference {root:string;main:string;engine:Engine;scope:'file'|'folder'}
interface Preferences extends Partial<DocumentReference> {recent:RecentDocument[]}
export const RECENT_LIMIT=12;
function reference(value:any):DocumentReference|null {
  if(!value||typeof value.root!=='string'||!path.isAbsolute(value.root)||typeof value.main!=='string'||!value.main.toLowerCase().endsWith('.tex')||path.isAbsolute(value.main)||value.main.split(/[\\/]/).some((part:string)=>part==='..'))return null;
  return {root:path.normalize(value.root),main:value.main.replaceAll('\\','/'),engine:['xelatex','pdflatex','lualatex'].includes(value.engine)?value.engine:'xelatex',scope:value.scope==='file'?'file':'folder'};
}
export function documentKey(value:DocumentReference){
  let key=path.resolve(value.root)+'\0'+value.scope+'\0'+(value.scope==='file'?value.main:'');
  if(process.platform==='win32')key=key.toLowerCase();
  return createHash('sha256').update(key).digest('hex').slice(0,24);
}
function normalize(value:any):Preferences {
  const current=reference(value),recent:RecentDocument[]=[],seen=new Set<string>();
  for(const item of Array.isArray(value?.recent)?value.recent:[]){
    const doc=reference(item);if(!doc)continue;const id=documentKey(doc);if(seen.has(id))continue;
    seen.add(id);recent.push({...doc,id,openedAt:typeof item.openedAt==='string'&&Number.isFinite(Date.parse(item.openedAt))?item.openedAt:new Date(0).toISOString()});
    if(recent.length===RECENT_LIMIT)break;
  }
  return {...current,recent};
}
/** Local application preferences only; never copied into document exports. */
export class PreferenceStore {
  private pending:Promise<unknown>=Promise.resolve();
  constructor(private file:string){}
  async read():Promise<Preferences>{await this.pending;try{return normalize(JSON.parse(await fs.readFile(this.file,'utf8')));}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT'||error instanceof SyntaxError)return {recent:[]};throw error;}}
  private update(change:(prefs:Preferences)=>Preferences){
    const task=this.pending.then(async()=>{
      let prefs:Preferences;try{prefs=normalize(JSON.parse(await fs.readFile(this.file,'utf8')));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT'&&!(error instanceof SyntaxError))throw error;prefs={recent:[]};}
      const next=change(prefs);await fs.mkdir(path.dirname(this.file),{recursive:true});await atomicWrite(this.file,JSON.stringify(next,null,2));return next;
    });
    this.pending=task.catch(()=>{});return task;
  }
  remember(value:DocumentReference,previous?:DocumentReference){
    const doc=reference(value);if(!doc)throw new Error('文稿位置无效。');
    const id=documentKey(doc),oldId=previous?documentKey(previous):id;
    return this.update(prefs=>({...doc,recent:[{...doc,id,openedAt:new Date().toISOString()},...prefs.recent.filter(item=>item.id!==id&&item.id!==oldId)].slice(0,RECENT_LIMIT)}));
  }
  clearRecent(){return this.update(prefs=>({...prefs,recent:[]}));}
}
