import type {Node as PMNode} from '@tiptap/pm/model';
export interface OutlineHeading {position:number;level:number;title:string}
export function documentOutline(doc:PMNode):OutlineHeading[]{
  const headings:OutlineHeading[]=[];
  doc.descendants((node,position)=>{if(node.type.name==='heading'){headings.push({position:position+1,level:node.attrs.level,title:node.textContent.trim()||'空标题'});return false;}});
  return headings;
}
export function destinationNumber(value:string,max:number):number|null {
  if(!/^\d+$/.test(value.trim()))return null;const number=Number(value);
  return Number.isSafeInteger(number)&&number>=1&&number<=max?number:null;
}
