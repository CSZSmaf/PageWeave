import {Extension} from '@tiptap/core';
import {Plugin,PluginKey} from '@tiptap/pm/state';
import {Decoration,DecorationSet,type EditorView} from '@tiptap/pm/view';
import type {Node as PMNode} from '@tiptap/pm/model';
import type {PaperLayout} from '../../core/flow';

export const PAGE_GAP=28;
export const paginationKey=new PluginKey<DecorationSet>('writingPagination');
interface Unit{pos:number;top:number;bottom:number;manual?:boolean;columns?:number}

// Measure a noneditable clone. Page gaps are view decorations, never document nodes:
// selection, undo, paragraph joins and the IME all operate on one uninterrupted document.
function textLines(element:HTMLElement,node:PMNode,start:number):Unit[]{
  const fragments:Unit[]=[];let position=start+1;
  const range=document.createRange();
  function walk(dom:globalThis.Node){
    if(dom.nodeType===Node.TEXT_NODE){
      const text=dom as Text,length=text.length,base=position;position+=length;
      if(!length)return;
      range.selectNodeContents(text);
      for(const rect of Array.from(range.getClientRects())){
        if(!rect.width||!rect.height)continue;
        const target=(rect.top+rect.bottom)/2;let low=0,high=length-1;
        while(low<high){const mid=(low+high)>>1;range.setStart(text,mid);range.setEnd(text,mid+1);const r=range.getBoundingClientRect();if((r.top+r.bottom)/2<target-1)low=mid+1;else high=mid;}
        if(low>0&&/[\uDC00-\uDFFF]/.test(text.data[low]))low--;
        fragments.push({pos:base+low,top:rect.top,bottom:rect.bottom});
      }
    }else if(dom instanceof HTMLElement){
      if(dom.matches('[data-math]')){const rect=dom.getBoundingClientRect();fragments.push({pos:position++,top:rect.top,bottom:rect.bottom});}
      else if(dom.tagName==='BR'){const r=dom.getBoundingClientRect();if(r.height)fragments.push({pos:position,top:r.top,bottom:r.bottom});if(!dom.classList.contains('ProseMirror-trailingBreak'))position++;}
      else for(const child of dom.childNodes)walk(child);
    }
  }
  walk(element);
  const rect=element.getBoundingClientRect();
  if(!fragments.length)return [{pos:start,top:rect.top,bottom:rect.bottom}];
  const lines:Unit[]=[];
  for(const fragment of fragments){
    const last=lines.at(-1);
    if(last&&Math.min(last.bottom,fragment.bottom)-Math.max(last.top,fragment.top)>2){last.top=Math.min(last.top,fragment.top);last.bottom=Math.max(last.bottom,fragment.bottom);last.pos=Math.min(last.pos,fragment.pos);}
    else lines.push({...fragment});
  }
  const boundaries=lines.slice(1).map((line,i)=>(lines[i].bottom+line.top)/2);
  return lines.map((line,i)=>({pos:i===0?start:Math.min(line.pos,start+node.nodeSize-1),top:i===0?rect.top:boundaries[i-1],bottom:i===lines.length-1?rect.bottom:boundaries[i]}));
}

function paginate(view:EditorView,layout:PaperLayout){
  const mirror=document.createElement('div');mirror.className='page-writing-editor flow-measure';
  Object.assign(mirror.style,{position:'absolute',left:'-100000px',top:'0',width:`${layout.width-2*layout.margin}px`,visibility:'hidden',pointerEvents:'none'});
  mirror.contentEditable='false';
  mirror.style.setProperty('--image-max-height',`${(layout.height-2*layout.margin)*.82}px`);
  const entries:{element:HTMLElement;node:PMNode;pos:number}[]=[];
  view.state.doc.forEach((node,pos)=>{
    const real=view.nodeDOM(pos);if(!(real instanceof HTMLElement))return;
    const element=real.cloneNode(true) as HTMLElement;
    element.querySelectorAll('.flow-page-gap').forEach(gap=>gap.remove());
    element.removeAttribute('id');element.removeAttribute('contenteditable');
    mirror.append(element);entries.push({element,node,pos});
  });
  document.body.append(mirror);
  const origin=mirror.getBoundingClientRect().top,units:Unit[]=[];
  try{
    for(const {element,node,pos}of entries){
      if(node.type.name==='pageBreak'){const rect=element.getBoundingClientRect();units.push({pos,top:rect.top-origin,bottom:rect.bottom-origin,manual:true});}
      else if(node.type.name==='table'){
        const rows=element instanceof HTMLTableElement?element.rows:element.querySelector('table')?.rows;let index=0;
        node.forEach((row,offset)=>{const actual=rows?.[index];if(actual){const rect=actual.getBoundingClientRect();units.push({pos:index===0?pos:pos+1+offset,top:rect.top-origin,bottom:rect.bottom-origin,...(index?{columns:row.childCount}:{})});}index++;});
      }
      else if(node.isTextblock)units.push(...textLines(element,node,pos).map(unit=>({...unit,top:unit.top-origin,bottom:unit.bottom-origin})));
      else{const rect=element.getBoundingClientRect();units.push({pos,top:rect.top-origin,bottom:rect.bottom-origin});}
    }
  }finally{mirror.remove();}
  const body=layout.height-2*layout.margin,stride=layout.height+PAGE_GAP;
  let added=0,page=0;const decorations:Decoration[]=[];
  for(const unit of units){
    const top=unit.top+added,bottom=unit.bottom+added,pageStart=page*stride;
    if((unit.manual&&top>pageStart+.5)||(!unit.manual&&bottom>pageStart+body+.5&&top>pageStart+.5)){
      page++;const height=page*stride-top;added+=height;
      const inline=view.state.doc.resolve(unit.pos).parent.isTextblock,number=page;
      decorations.push(Decoration.widget(unit.pos,()=>{
        const gap=document.createElement(unit.columns?'tr':inline?'span':'div');
        gap.className='flow-page-gap'+(unit.columns?' flow-table-gap':'');gap.style.height=`${height}px`;
        if(unit.columns){const cell=document.createElement('td');cell.colSpan=unit.columns;cell.style.height=`${height}px`;gap.append(cell);}
        gap.contentEditable='false';gap.setAttribute('aria-hidden','true');
        gap.dataset.flowBreak=String(number);gap.dataset.position=String(unit.pos);
        return gap;
      },{side:-1,key:`page-${page}-${unit.pos}-${height.toFixed(2)}`,ignoreSelection:true,stopEvent:()=>true}));
    }
  }
  return {decorations:DecorationSet.create(view.state.doc,decorations),pages:page+1};
}

export function pagination(getLayout:()=>PaperLayout,onPages:(pages:number)=>void){
  return Extension.create({name:'continuousPagination',addProseMirrorPlugins(){return [new Plugin({
    key:paginationKey,
    state:{init:()=>DecorationSet.empty,apply:(tr,value)=>tr.getMeta(paginationKey)??value.map(tr.mapping,tr.doc)},
    props:{decorations:state=>paginationKey.getState(state)},
    view(view){
      let frame=0,timer:ReturnType<typeof setTimeout>|undefined,disposed=false,lastLayout='';
      const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
        if(disposed)return;
        if(view.composing){timer=setTimeout(schedule,80);return;}
        const result=paginate(view,getLayout());lastLayout=JSON.stringify(getLayout());
        view.dispatch(view.state.tr.setMeta(paginationKey,result.decorations).setMeta('addToHistory',false));
        onPages(result.pages);
        // Reflow can move the active line to a new sheet without a document transaction.
        // Ask ProseMirror to keep that caret visible, without touching selection or focus.
        if(view.hasFocus()&&view.state.selection.empty)view.dispatch(view.state.tr.scrollIntoView().setMeta('addToHistory',false));
      });};
      schedule();document.fonts.ready.then(()=>{if(!disposed)schedule();});
      return {update(next,previous){if(next.state.doc!==previous.doc||lastLayout!==JSON.stringify(getLayout()))schedule();},destroy(){disposed=true;cancelAnimationFrame(frame);clearTimeout(timer);}};
    },
  })];}});
}
