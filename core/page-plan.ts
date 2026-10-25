import {createHash} from 'node:crypto';
import {nodeSize} from './review';
import {serializeRich,serializeInline,type RichNode,type WritingBlock} from './writing';
import type {PaperLayout} from './flow';

export const PAGE_PLAN_FILE='pageweave-pages.tex';
export interface PagePlan {source:string;breaks:number[];layout:PaperLayout}
const parameters=(source:string)=>source.replace(/\\[\s\S]|#/g,token=>token==='#'?'##':token);

/** Split only at page boundaries. Logical paragraphs and user-authored TeX stay intact. */
export function pagedBlocks(doc:RichNode,blocks:WritingBlock[],breaks:number[]){
  const wanted=new Set(breaks),used=new Set<number>();let position=0;
  const br=(pos:number,table=false)=>{if(!wanted.has(pos))return '';used.add(pos);return table?'\\PageWeaveTableBreak\n':'\\PageWeaveBreak\n';};
  const inlineSlice=(content:RichNode[],from:number,to:number)=>{
    const result:RichNode[]=[];let pos=0;
    for(const node of content){const end=pos+nodeSize(node);if(end>from&&pos<to){if(node.type==='text')result.push({...node,text:node.text!.slice(Math.max(0,from-pos),Math.min(node.text!.length,to-pos))});else{if(from>pos||to<end)throw new Error('分页位置不能拆开公式。');result.push(node);}}pos=end;}
    return result.map(serializeInline).join('')||'\\strut';
  };
  const node=(n:RichNode,pos:number,inTable=false):string=>{
    const prefix=br(pos,inTable);
    if(n.type==='paragraph'||n.type==='heading'){
      const from=pos+1,end=pos+nodeSize(n)-1,cuts=breaks.filter(at=>at>from&&at<end);
      if(wanted.has(from)){used.add(from);if(!prefix)return '\\PageWeaveBreak\n'+paragraph();}
      return prefix+paragraph();
      function paragraph(){
        if(!cuts.length)return serializeRich({type:'doc',content:[n]});
        const bounds=[from,...cuts,end];
        return bounds.slice(1).map((to,i)=>{
          if(i)used.add(bounds[i]);
          const body=inlineSlice(n.content??[],bounds[i]-from,to-from),last=i===bounds.length-2?1:0;
          const fragment=n.type==='heading'?`\\PageWeaveHeadingPart{${n.attrs?.level??1}}{${n.attrs?.textAlign??'left'}}{${last}}{${body}}`:`\\PageWeaveParaPart{${n.attrs?.textAlign??'justify'}}{${n.attrs?.lineHeight??1.5}}{${last}}{${body}}`;
          return (i?'\\PageWeaveBreak\n':'')+fragment;
        }).join('\n');
      }
    }
    if(n.type==='bulletList'||n.type==='orderedList'){
      let childPos=pos+1;const items=(n.content??[]).map(item=>{const before=br(childPos);let at=childPos+1;const body=(item.content??[]).map(child=>{const output=node(child,at);at+=nodeSize(child);return output;}).join('\n');childPos+=nodeSize(item);return before+'\\PageWeaveItem{'+body+'}';});
      return prefix+`\\PageWeaveList{${n.type==='orderedList'?'ordered':'bullet'}}{${n.attrs?.start??1}}{\n${items.join('\n')}\n}`;
    }
    if(n.type==='table'){
      let rowPos=pos+1;const rows=(n.content??[]).map((row,i)=>{const before=br(rowPos,i>0);const content=serializeRich({type:'doc',content:[{type:'table',content:[row]}]});const rowSource=content.slice(content.indexOf('\\MogaoRow'),content.lastIndexOf('\n}'));rowPos+=nodeSize(row);return before+rowSource;});
      return prefix+`\\MogaoTable{${n.content?.[0]?.content?.length??1}}{\n${rows.join('\n')}\n}`;
    }
    if(n.type==='pageBreak'){used.add(pos);return '\\newpage';}
    return prefix+serializeRich({type:'doc',content:[n]});
  };
  const result=new Map<string,string[]>();let fallback=blocks[0]?.id??'start';
  for(const n of doc.content??[]){const id=n.attrs?.sourceId??fallback;fallback=id;const body=node(n,position);position+=nodeSize(n);if(!result.has(id))result.set(id,[]);result.get(id)!.push(body);}
  if(breaks.some(at=>!used.has(at)))throw new Error('分页位置已变化，请重新排版。');
  return result;
}

export function pagePlanSource(doc:RichNode,blocks:WritingBlock[],plan:PagePlan,files:{path:string;bytes:Buffer}[]){
  const size=(doc.content??[]).reduce((n,node)=>n+nodeSize(node),0);
  if(!Array.isArray(plan.breaks)||plan.breaks.length>3000||plan.breaks.some((at,i)=>!Number.isInteger(at)||at<=0||at>=size||(i>0&&at<=plan.breaks[i-1])))throw new Error('分页数据无效。');
  const rendered=pagedBlocks(doc,blocks,plan.breaks),checks:string[]=[];
  for(const file of files.filter(file=>/\.(tex|sty|cls|cfg)$/i.test(file.path)&&file.path!==PAGE_PLAN_FILE)){
    if(/[{}%\r\n]/.test(file.path))throw new Error('入口或样式文件名不支持同步分页。');
    checks.push(`\\PageWeaveCheckFile{\\detokenize{${file.path}}}{${createHash('md5').update(file.bytes).digest('hex').toUpperCase()}}`);
  }
  return '% Generated page boundaries; source and style changes invalidate this plan.\n'+checks.join('\n')+'\n'+[...rendered].map(([id,parts])=>`\\expandafter\\long\\expandafter\\def\\csname PageWeaveLayout@${id}\\endcsname{\n${parameters(parts.join('\n'))}\n}`).join('\n')+'\n';
}
