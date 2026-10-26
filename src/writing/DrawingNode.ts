import {Node} from '@tiptap/core';
import {validateDiagram,edgePoints,arrowPoints,shapeLines,type Diagram} from '../../core/drawing';
export interface DrawingRequest {drawing:Diagram;commit(value:Diagram):void}
const xml=(text:string)=>text.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]!));
const xy=(p:{x:number;y:number})=>`${p.x},${p.y}`;
export function diagramSvgContent(value:Diagram){
  const d=validateDiagram(value),result:string[]=[];
  for(const e of d.edges){const points=edgePoints(d,e),middle=points[Math.floor((points.length-1)/2)],next=points[Math.ceil((points.length-1)/2)];result.push(`<g data-edge="${e.id}"><polyline points="${points.map(xy).join(' ')}" fill="none" stroke="${e.color}" stroke-width="2" ${e.dashed?'stroke-dasharray="7 5"':''}/><polyline class="edge-hit" points="${points.map(xy).join(' ')}" fill="none" stroke="transparent" stroke-width="14"/><polygon points="${arrowPoints(points).map(xy).join(' ')}" fill="${e.color}"/>${e.label?`<text x="${(middle.x+next.x)/2}" y="${(middle.y+next.y)/2}" dy=".35em" text-anchor="middle" font-size="14" fill="${e.color}" stroke="white" stroke-width="4" paint-order="stroke">${xml(e.label)}</text>`:''}</g>`);}
  for(const n of d.nodes){const style=`fill="${n.fill}" stroke="${n.stroke}" stroke-width="2"`;let shape='';
    if(n.kind==='ellipse')shape=`<ellipse cx="${n.x+n.width/2}" cy="${n.y+n.height/2}" rx="${n.width/2}" ry="${n.height/2}" ${style}/>`;
    else if(n.kind==='diamond')shape=`<polygon points="${n.x+n.width/2},${n.y} ${n.x+n.width},${n.y+n.height/2} ${n.x+n.width/2},${n.y+n.height} ${n.x},${n.y+n.height/2}" ${style}/>`;
    else shape=`<rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" rx="${n.kind==='rounded'?9:0}" ${style}/>`;
    const lines=shapeLines(n);result.push(`<g data-node="${n.id}" aria-label="${xml(n.text||'图形')}">${shape}<text text-anchor="middle" font-size="${n.fontSize}" fill="${n.color}">${lines.map((line,i)=>`<tspan x="${n.x+n.width/2}" y="${n.y+n.height/2+(i-(lines.length-1)/2)*n.fontSize*1.25}" dy=".35em">${xml(line)}</tspan>`).join('')}</text></g>`);
  }return result.join('');
}
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
