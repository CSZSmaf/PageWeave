import type { Patch } from './types';

export interface Transaction { label: string; patches: Patch[] }
export class TextHistory {
  private past: Transaction[] = [];
  private future: Transaction[] = [];
  constructor(readonly texts: Map<string, string>) {}
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  get undoLabel() { return this.past.at(-1)?.label; }
  get redoLabel() { return this.future.at(-1)?.label; }
  clone(){const copy=new TextHistory(new Map(this.texts));copy.past=structuredClone(this.past);copy.future=structuredClone(this.future);return copy;}
  private apply(patches: Patch[]) {
    const staged = new Map(this.texts);
    const byFile = new Map<string, Patch[]>();
    for (const p of patches) byFile.set(p.file, [...(byFile.get(p.file) ?? []), p]);
    for (const [file, edits] of byFile) {
      let text = staged.get(file); if (text === undefined) throw new Error('文件不存在。');
      let boundary = text.length + 1;
      for (const p of edits.sort((a, b) => b.from - a.from)) {
        if (p.from < 0 || p.to < p.from || p.to > text.length || p.to > boundary || text.slice(p.from, p.to) !== p.before) throw new Error('源码已变化，无法应用旧补丁。请重新选择对象。');
        text = text.slice(0, p.from) + p.after + text.slice(p.to); boundary = p.from;
      }
      staged.set(file, text);
    }
    for (const [file, text] of staged) this.texts.set(file, text);
  }
  commit(label: string, patches: Patch[]) {
    patches = patches.filter(p => p.before !== p.after); if (!patches.length) return false;
    this.apply(patches); this.past.push({ label, patches }); this.future = []; return true;
  }
  undo() {
    const tx = this.past.at(-1); if (!tx) return false;
    const inverse: Patch[] = [];
    for (const file of new Set(tx.patches.map(p => p.file))) {
      let shift = 0;
      for (const p of tx.patches.filter(p => p.file === file).sort((a, b) => a.from - b.from)) {
        inverse.push({ file, from: p.from + shift, to: p.from + shift + p.after.length, before: p.after, after: p.before });
        shift += p.after.length - p.before.length;
      }
    }
    this.apply(inverse); this.past.pop(); this.future.push(tx); return true;
  }
  redo() { const tx = this.future.at(-1); if (!tx) return false; this.apply(tx.patches); this.future.pop(); this.past.push(tx); return true; }
  renameFile(from:string,to:string){
    const text=this.texts.get(from);if(text===undefined||this.texts.has(to))throw new Error('无法重命名源码文件。');
    this.texts.delete(from);this.texts.set(to,text);
    for(const tx of [...this.past,...this.future])for(const patch of tx.patches)if(patch.file===from)patch.file=to;
  }
  /** Keep undo/redo valid when a document key in the review sidecar changes. */
  rewriteFile(file:string,transform:(text:string)=>string){
    const current=this.texts.get(file);if(current===undefined)return;
    const apply=(text:string,patches:Patch[],inverse=false)=>{
      let shift=0;const edits=patches.filter(p=>p.file===file).sort((a,b)=>a.from-b.from).map(p=>{const edit=inverse?{...p,from:p.from+shift,to:p.from+shift+p.after.length,before:p.after,after:p.before}:p;shift+=p.after.length-p.before.length;return edit;});
      for(const p of edits.reverse()){if(text.slice(p.from,p.to)!==p.before)throw new Error('编辑历史与当前文件不一致。');text=text.slice(0,p.from)+p.after+text.slice(p.to);}return text;
    };
    const rebuild=(tx:Transaction,before:string,after:string):Transaction=>({label:tx.label,patches:[...tx.patches.filter(p=>p.file!==file),...(before===after?[]:[minimalPatch(file,before,after)])]});
    let text=current;const past:Transaction[]=[];
    for(const tx of [...this.past].reverse()){const before=apply(text,tx.patches,true);past.push(rebuild(tx,transform(before),transform(text)));text=before;}
    text=current;const future:Transaction[]=[];
    for(const tx of [...this.future].reverse()){const after=apply(text,tx.patches);future.push(rebuild(tx,transform(text),transform(after)));text=after;}
    this.past=past.reverse();this.future=future.reverse();this.texts.set(file,transform(current));
  }
}

export function minimalPatch(file: string, before: string, after: string): Patch {
  let from = 0, endBefore = before.length, endAfter = after.length;
  while (from < endBefore && from < endAfter && before[from] === after[from]) from++;
  while (endBefore > from && endAfter > from && before[endBefore - 1] === after[endAfter - 1]) { endBefore--; endAfter--; }
  // Never split a UTF-16 surrogate pair at a transaction boundary.
  if (from > 0 && /[\uDC00-\uDFFF]/.test(before[from] ?? after[from] ?? '')) from--;
  return { file, from, to: endBefore, before: before.slice(from, endBefore), after: after.slice(from, endAfter) };
}
