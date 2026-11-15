import {Node} from '@tiptap/core';
import {validateDiagram,type Diagram} from '../../core/drawing';
import {diagramSvgContent} from './DrawingSvg';
export {diagramSvgContent} from './DrawingSvg';
export interface DrawingRequest {drawing:Diagram;commit(value:Diagram):void}
export function drawingNode(onEdit:(request:DrawingRequest)=>void){return Node.create({
  name:'drawing',group:'block',atom:true,draggable:false,
  addAttributes(){return {drawing:{default:null},width:{default:90},textAlign:{default:'center'}};},
  parseHTML(){return [{tag:'figure[data-pageweave-drawing]',getAttrs:element=>{try{return {drawing:validateDiagram(JSON.parse(element.getAttribute('data-pageweave-drawing')!)),width:Number(element.getAttribute('data-width')??90),textAlign:element.getAttribute('data-align')??'center'};}catch{return false;}}}];},
  renderHTML({node}){return ['figure',{'data-pageweave-drawing':JSON.stringify(node.attrs.drawing),'data-width':node.attrs.width,'data-align':node.attrs.textAlign},'流程图'];},
  addNodeView(){return ({node:initial,editor,getPos})=>{
    let node=initial;const dom=document.createElement('figure');dom.className='flow-drawing';dom.contentEditable='false';dom.setAttribute('aria-label','流程图，双击编辑');
    const paint=()=>{const d=validateDiagram(node.attrs.drawing);dom.style.textAlign=node.attrs.textAlign;dom.innerHTML=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${d.width} ${d.height}" style="width:${node.attrs.width}%;max-width:calc(var(--image-max-height) * ${d.width/d.height});height:auto" role="img" aria-label="流程图">${diagramSvgContent(d)}</svg>`;};paint();
    dom.onclick=()=>{const pos=getPos();if(typeof pos==='number')editor.chain().focus().setNodeSelection(pos).run();};
    dom.ondblclick=event=>{event.preventDefault();if(!editor.isEditable)return;const before=node;onEdit({drawing:validateDiagram(node.attrs.drawing),commit:drawing=>{const pos=getPos();if(typeof pos!=='number'||editor.state.doc.nodeAt(pos)!==before)throw new Error('绘图位置已变化，请重新打开。');editor.commands.command(({tr})=>{tr.setNodeMarkup(pos,undefined,{...before.attrs,drawing:validateDiagram(drawing)});return true;});}});};
    return {dom,update(next){if(next.type!==node.type)return false;const same=next.attrs.drawing===node.attrs.drawing&&next.attrs.width===node.attrs.width&&next.attrs.textAlign===node.attrs.textAlign;node=next;if(!same)paint();return true;},ignoreMutation(){return true;}};
  };},
});}
