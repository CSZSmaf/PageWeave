import {Node} from '@tiptap/core';

export const FlowImage=Node.create({
  name:'flowImage',group:'block',atom:true,draggable:false,
  addAttributes(){return {src:{default:''},width:{default:75},naturalWidth:{default:800},naturalHeight:{default:600},textAlign:{default:'center'}};},
  parseHTML(){return [{tag:'figure[data-flow-image]'}];},
  renderHTML({node}){return ['figure',{'data-flow-image':'true','data-src':node.attrs.src},['img',{src:'',alt:'文稿图片'}]];},
  addNodeView(){return ({node,editor,getPos})=>{
    const dom=document.createElement('figure');dom.className='flow-image';dom.contentEditable='false';dom.dataset.flowImage='true';dom.dataset.src=node.attrs.src;dom.style.textAlign=node.attrs.textAlign;
    const img=document.createElement('img');img.alt='文稿图片';img.draggable=false;img.style.width=`${node.attrs.width}%`;img.style.aspectRatio=`${node.attrs.naturalWidth}/${node.attrs.naturalHeight}`;
    img.width=node.attrs.naturalWidth;img.height=node.attrs.naturalHeight;dom.append(img);
    let disposed=false;
    window.workbench.imageData(node.attrs.src).then(data=>{if(!disposed)img.src=data;}).catch(()=>{if(!disposed)img.alt='图片暂不可用';});
    dom.addEventListener('click',()=>{const pos=getPos();if(typeof pos==='number')editor.chain().focus().setNodeSelection(pos).run();});
    return {dom,destroy(){disposed=true;}};
  };},
});
