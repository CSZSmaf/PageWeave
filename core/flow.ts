import type {ProjectState} from './types';
import type {RichNode,WritingBlock} from './writing';

export interface FlowPart {id:string;content:RichNode}
export interface PaperLayout {width:number;height:number;margin:number;fontSize?:number;fontFamily?:string;cjkFont?:string}
const whitespace=(text:string)=>text.replace(/%[^\r\n]*/g,'').trim()==='';

// Only join a document whose entire body is represented by editable writing blocks.
// An arbitrary TeX command between blocks must never silently disappear from the page.
export function canFlow(project:ProjectState){
  const blocks=project.writing;
  const source=project.files.find(f=>f.path===project.main)?.content??'';
  const start=source.indexOf('\\begin{document}'),end=source.lastIndexOf('\\end{document}');
  if(!blocks.length||start<0||end<start||blocks.some(b=>b.file!==project.main||!b.editable)||new Set(blocks.map(b=>b.id)).size!==blocks.length)return false;
  let at=start+'\\begin{document}'.length;
  for(const block of blocks){if(block.range.from<at||!whitespace(source.slice(at,block.range.from)))return false;at=block.range.to;}
  return whitespace(source.slice(at,end));
}
export function flowDocument(blocks:WritingBlock[]):RichNode{
  return {type:'doc',content:blocks.flatMap(block=>(block.content.content??[]).map(node=>({...structuredClone(node),attrs:{...node.attrs,sourceId:block.id}})))};
}
export function flowParts(doc:RichNode,fallback:string):FlowPart[]{
  const parts:FlowPart[]=[];let id=fallback;
  for(const node of doc.content??[]){
    id=node.attrs?.sourceId||id;
    const clean=structuredClone(node);if(clean.attrs)delete clean.attrs.sourceId;
    if(parts.at(-1)?.id!==id){
      // Pasted fragments may carry a source ID already used earlier in the document.
      // Keep those fragments in the current group instead of producing duplicate TeX IDs.
      if(parts.some(p=>p.id===id))id=parts.at(-1)!.id;
      else parts.push({id,content:{type:'doc',content:[]}});
    }
    parts.at(-1)!.content.content!.push(clean);
  }
  return parts.length?parts:[{id:fallback,content:{type:'doc',content:[{type:'paragraph'}]}}];
}
export function paperLayout(project:ProjectState):PaperLayout{
  const text=project.files.find(f=>f.path===project.main)?.content??'';
  const options=/\\usepackage\[([^\]]*)\]\{geometry\}/.exec(text)?.[1]??'';
  const name=/\b(a4paper|a5paper|letterpaper)\b/.exec(options)?.[1]??/\\documentclass\[[^\]]*\b(a4paper|a5paper|letterpaper)\b/.exec(text)?.[1]??'a4paper';
  let [width,height]=name==='a5paper'?[148,210]:name==='letterpaper'?[215.9,279.4]:[210,297];
  if(/\blandscape\b/.test(options))[width,height]=[height,width];
  const px=96/25.4,margin=Number(/margin\s*=\s*([\d.]+)mm/.exec(options)?.[1]??25);
  const fontSize=Number(/\\documentclass\[([^\]]*)\]/.exec(text)?.[1].match(/\b(10|11|12)pt\b/)?.[1]??12);
  const fontFamily=/\\setmainfont(?:\[[^\]]*\])?\{([^}]+)\}/.exec(text)?.[1]??'Times New Roman',cjkFont=/\\setCJKmainfont(?:\[[^\]]*\])?\{([^}]+)\}/.exec(text)?.[1]??'SimSun';
  return {width:width*px,height:height*px,margin:margin*px,fontSize,fontFamily,cjkFont};
}
