import katex from 'katex';
import {X} from 'lucide-react';
import type {RichNode,WritingBlock} from '../../core/writing';
export interface FormulaEntry {blockId:string;path:number[];latex:string;display:boolean}
export function formulas(blocks:WritingBlock[]):FormulaEntry[]{
  const found:FormulaEntry[]=[];
  for(const block of blocks){if(!block.editable)continue;const visit=(node:RichNode,path:number[])=>{if(node.type==='inlineMath'||node.type==='displayMath')found.push({blockId:block.id,path,latex:node.attrs?.latex??'',display:node.type==='displayMath'});node.content?.forEach((n,i)=>visit(n,[...path,i]));};visit(block.content,[]);}
  return found;
}
export default function FormulaList({items,onEdit,onClose}:{items:FormulaEntry[];onEdit(entry:FormulaEntry):void;onClose():void}){
  return <div className="modal-backdrop"><div className="formula-list-dialog"><div className="modal-title"><h2>公式</h2><button aria-label="关闭公式列表" onClick={onClose}><X size={19}/></button></div><div className="formula-list">{items.length?items.map((item,i)=><button key={item.blockId+':'+item.path.join('.')} aria-label={`编辑第 ${i+1} 个公式`} onClick={()=>onEdit(item)}><span className="formula-kind">{item.display?'独立':'行内'}</span><span dangerouslySetInnerHTML={{__html:katex.renderToString(item.latex,{throwOnError:false,trust:false,displayMode:item.display})}}/><span className="formula-edit-label">编辑</span></button>):<p>文稿中还没有公式。</p>}</div></div></div>;
}
