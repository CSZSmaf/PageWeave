import {Table,TableRow,TableCell,TableHeader} from '@tiptap/extension-table';
import type {Editor} from '@tiptap/core';
import {Fragment,type Node as PMNode} from '@tiptap/pm/model';
import {NodeSelection} from '@tiptap/pm/state';
import {closeHistory} from '@tiptap/pm/history';
import {tableDesign,tableKeys,designedTable,minimumColumnWidth,bounded,type TableStyle,TABLE_PRESETS} from '../../core/table-design';

export function tableContext(editor:Editor){
  const selection=editor.state.selection;if(selection instanceof NodeSelection&&selection.node.type.name==='table')return {node:selection.node,pos:selection.from,row:0,col:0};
  const p=selection.$from;for(let depth=p.depth;depth>0;depth--)if(p.node(depth).type.name==='table')return {node:p.node(depth),pos:p.before(depth),row:p.index(depth),col:p.depth>depth?p.index(depth+1):0};return null;
}
export function setColumnWidths(editor:Editor,pos:number,widths:number[]){
  const table=editor.state.doc.nodeAt(pos);if(table?.type.name!=='table'||table.firstChild?.childCount!==widths.length)return;
  const tr=editor.state.tr;table.forEach((row,rowOffset)=>row.forEach((cell,cellOffset,col)=>tr.setNodeMarkup(pos+1+rowOffset+1+cellOffset,undefined,{...cell.attrs,colwidth:[bounded(widths[col],100,24,4000)]})));
  editor.view.dispatch(closeHistory(tr));
}
export function setRowHeight(editor:Editor,height:number){const context=tableContext(editor);if(!context)return;let pos=context.pos+1;for(let i=0;i<context.row;i++)pos+=context.node.child(i).nodeSize;const row=context.node.child(context.row);editor.view.dispatch(closeHistory(editor.state.tr.setNodeMarkup(pos,undefined,{...row.attrs,minHeight:height})));}
export function applyTablePreset(editor:Editor,style:TableStyle){editor.commands.updateAttributes('table',{tableStyle:style,...Object.fromEntries(Object.entries(TABLE_PRESETS[style]).filter(([key])=>key!=='label'))});}
export function moveTable(editor:Editor,direction:-1|1,rowOnly=false){
  const selection=editor.state.selection,context=tableContext(editor)??(!rowOnly&&selection instanceof NodeSelection&&['drawing','flowImage'].includes(selection.node.type.name)?{node:selection.node,pos:selection.from,row:0,col:0}:null);if(!context)return false;const parent=rowOnly?context.node:editor.state.doc,index=rowOnly?context.row:editor.state.doc.resolve(context.pos).index(0),other=index+direction;
  if(other<0||other>=parent.childCount)return false;
  let from=rowOnly?context.pos+1:0;for(let i=0;i<Math.min(index,other);i++)from+=parent.child(i).nodeSize;
  const first=parent.child(Math.min(index,other)),second=parent.child(Math.max(index,other));
  let moving=parent.child(index);if(!rowOnly&&moving.attrs.sourceId&&parent.child(other).attrs.sourceId)moving=moving.type.create({...moving.attrs,sourceId:parent.child(other).attrs.sourceId},moving.content,moving.marks);
  const reordered=direction===-1?[moving,parent.child(other)]:[parent.child(other),moving],destination=direction===-1?from:from+parent.child(other).nodeSize;
  const tr=editor.state.tr.replaceWith(from,from+first.nodeSize+second.nodeSize,Fragment.from(reordered));
  tr.setMeta('contentMoves',[{from,to:from+first.nodeSize,offset:second.nodeSize},{from:from+first.nodeSize,to:from+first.nodeSize+second.nodeSize,offset:-first.nodeSize}]);
  tr.setSelection(NodeSelection.create(tr.doc,rowOnly?context.pos:destination));editor.view.dispatch(closeHistory(tr));editor.commands.focus();return true;
}
export const AdvancedTable=Table.extend({
  draggable:false,
  addAttributes(){return {...this.parent?.(),...Object.fromEntries(tableKeys.map(key=>[key,{default:null,parseHTML:(el:HTMLElement)=>el.getAttribute('data-pw-'+key),renderHTML:(attrs:Record<string,unknown>)=>attrs[key]!=null?{['data-pw-'+key]:attrs[key]}:{}}]))};},
  addNodeView(){return ({node:initial,editor,getPos})=>{
    let node=initial,finishDrag:(()=>void)|null=null;
    const dom=document.createElement('div');dom.className='pw-table-wrapper';
    const table=document.createElement('table'),cols=document.createElement('colgroup'),contentDOM=document.createElement('tbody'),handles=document.createElement('div'),select=document.createElement('button');
    table.append(cols,contentDOM);handles.className='pw-table-handles';handles.contentEditable='false';select.className='pw-table-select';select.contentEditable='false';select.type='button';select.textContent='⠿';select.title='选择表格';select.setAttribute('aria-label','选择表格');
    select.onmousedown=event=>{event.preventDefault();const pos=getPos();if(typeof pos==='number')editor.chain().focus().setNodeSelection(pos).run();};dom.append(table,handles,select);
    const widthsOf=(value:PMNode)=>{const widths:number[]=[];value.firstChild?.forEach(cell=>widths.push(bounded(cell.attrs.colwidth?.[0],100,1,4000)));return widths;};
    const paint=(widths=widthsOf(node))=>{
      const design=tableDesign(node.attrs),total=widths.reduce((a,b)=>a+b,0);dom.style.width=design.width+'%';dom.style.marginLeft=design.textAlign==='left'?'0':'auto';dom.style.marginRight=design.textAlign==='right'?'0':'auto';dom.dataset.tableStyle=design.tableStyle;dom.toggleAttribute('data-table-legacy',!designedTable(node.toJSON()));
      dom.style.setProperty('--table-border',design.borderColor);dom.style.setProperty('--table-rule',design.borderWidth+'pt');dom.style.setProperty('--table-pad',design.cellPadding+'pt');dom.style.setProperty('--table-header',design.headerColor);dom.style.setProperty('--table-stripe',design.stripeColor);dom.style.setProperty('--table-valign',design.verticalAlign);
      cols.replaceChildren(...widths.map(width=>{const col=document.createElement('col');col.style.width=width/total*100+'%';return col;}));
      handles.replaceChildren();let x=0;for(let i=0;i<widths.length-1;i++){x+=widths[i];const handle=document.createElement('div');handle.className='pw-column-handle';handle.style.left=x/total*100+'%';handle.setAttribute('role','separator');handle.setAttribute('aria-label',`调整第 ${i+1} 列宽度`);handle.setAttribute('aria-orientation','vertical');
        handle.onpointerdown=event=>{
          if(!editor.isEditable)return;event.preventDefault();event.stopPropagation();const pos=getPos();if(typeof pos!=='number')return;
          const original=node,scale=table.getBoundingClientRect().width/table.offsetWidth,start=event.clientX,base=widths.map(width=>width/total*table.offsetWidth);let next=[...base];
          const minimum=minimumColumnWidth(node.attrs);if(base[i]+base[i+1]<minimum*2)return;
          const move=(ev:PointerEvent)=>{const delta=Math.max(minimum-base[i],Math.min(base[i+1]-minimum,(ev.clientX-start)/scale));next=[...base];next[i]+=delta;next[i+1]-=delta;Array.from(cols.children).forEach((col,index)=>(col as HTMLElement).style.width=next[index]/table.offsetWidth*100+'%');handle.style.left=next.slice(0,i+1).reduce((a,b)=>a+b,0)/table.offsetWidth*100+'%';};
          const end=(ev:PointerEvent)=>{move(ev);cleanup();if(editor.state.doc.nodeAt(pos)===original)setColumnWidths(editor,pos,next);else paint();};
          const cancel=()=>{cleanup();paint();};const cleanup=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',end);window.removeEventListener('pointercancel',cancel);finishDrag=null;};
          finishDrag=cancel;window.addEventListener('pointermove',move);window.addEventListener('pointerup',end);window.addEventListener('pointercancel',cancel);
        };handles.append(handle);
      }
    };paint();
    return {dom,contentDOM,update(next:PMNode){if(next.type!==node.type)return false;const changed=JSON.stringify(node.attrs)!==JSON.stringify(next.attrs)||widthsOf(node).join(':')!==widthsOf(next).join(':');node=next;if(changed)paint();return true;},stopEvent(event:Event){return handles.contains(event.target as Node)||select.contains(event.target as Node);},ignoreMutation(mutation:any){return mutation.type!=='selection'&&!contentDOM.contains(mutation.target);},destroy(){finishDrag?.();}};
  };},
}).configure({resizable:false,allowTableNodeSelection:true});
export const AdvancedRow=TableRow.extend({addAttributes(){return {...this.parent?.(),minHeight:{default:null,parseHTML:(element:HTMLElement)=>element.getAttribute('data-min-height'),renderHTML:(attrs:Record<string,any>)=>attrs.minHeight?{'data-min-height':attrs.minHeight,style:`height:${bounded(attrs.minHeight,0,0,300)}pt`}:{}}};}});
const cellAttributes={backgroundColor:{default:null,parseHTML:(element:HTMLElement)=>element.getAttribute('data-pw-fill')||null,renderHTML:(attrs:Record<string,any>)=>/^#[a-f\d]{6}$/i.test(attrs.backgroundColor??'')?{'data-pw-fill':attrs.backgroundColor,style:'--cell-fill:'+attrs.backgroundColor+';background-color:'+attrs.backgroundColor}:{}}};
export const AdvancedCell=TableCell.extend({content:'paragraph+',addAttributes(){return {...this.parent?.(),...cellAttributes};}});
export const AdvancedHeader=TableHeader.extend({content:'paragraph+',addAttributes(){return {...this.parent?.(),...cellAttributes};}});
