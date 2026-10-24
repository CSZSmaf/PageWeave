import type {Node as PMNode} from '@tiptap/pm/model';

export interface SearchOptions{query:string;caseSensitive:boolean}
export interface SearchRange{from:number;to:number}
/** Literal matching with UTF-16 offsets, shared by the two editor engines. */
export function findText(text:string,{query,caseSensitive}:SearchOptions,offset=0):SearchRange[]{
  if(!query)return [];
  const pattern=new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),caseSensitive?'gu':'giu');
  return Array.from(text.matchAll(pattern),match=>({from:offset+match.index!,to:offset+match.index!+match[0].length}));
}
/** A match may span formatting marks, but never a formula, image or cell boundary. */
export function findDocument(doc:PMNode,options:SearchOptions):SearchRange[]{
  if(!options.query)return [];
  const matches:SearchRange[]=[];
  doc.descendants((node,pos)=>{
    if(!node.isTextblock)return;
    let text='',start=pos+1;
    const flush=()=>{matches.push(...findText(text,options,start));text='';};
    node.forEach((child,offset)=>{
      if(child.isText){if(!text)start=pos+1+offset;text+=child.text;}
      else flush();
    });flush();return false;
  });
  return matches;
}
