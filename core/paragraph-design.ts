import type {RichNode} from './writing';
import {bounded} from './table-design';
export function paragraphDesign(node:RichNode){
  const attrs=node.attrs??{},exact=String(attrs.lineHeight??'').endsWith('pt');
  return {mode:exact?'exact':'multiple',line:bounded(parseFloat(attrs.lineHeight),1.5,exact?6:.5,exact?120:6),before:bounded(attrs.spacingBefore,0,0,120),after:bounded(attrs.spacingAfter,8,0,120)};
}
export function designedParagraph(node:RichNode){return node.attrs?.spacingBefore!=null||node.attrs?.spacingAfter!=null||String(node.attrs?.lineHeight??'').endsWith('pt')||node.type==='heading'&&node.attrs?.lineHeight!=null&&node.attrs.lineHeight!=='1.5';}
export function serializeDesignedParagraph(node:RichNode,body:string,first=true,last=true){
  const d=paragraphDesign(node),align=['left','center','right','justify'].includes(node.attrs?.textAlign)?node.attrs!.textAlign:node.type==='heading'?'left':'justify';
  const values=`{${align}}{${d.mode}}{${d.line}}{${first?d.before:0}}{${last?d.after:0}}{${body}}`;
  return node.type==='heading'?`\\PageWeaveHeading{${bounded(node.attrs?.level,1,1,3)}}${values}`:`\\PageWeaveParagraph${values}`;
}
