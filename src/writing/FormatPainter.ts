import type {EditorState,Transaction} from '@tiptap/pm/state';
import type {Mark} from '@tiptap/pm/model';
import {closeHistory} from '@tiptap/pm/history';
import type {Editor} from '@tiptap/core';
import {FONTS} from '../../core/writing';
const textMarks=new Set(['bold','italic','underline','strike','textStyle']);
export type TextFormat={type:string;attrs:Record<string,unknown>}[];
export function readTextFormat(state:EditorState):TextFormat {
  let marks:readonly Mark[]|undefined;
  if(!state.selection.empty)state.doc.nodesBetween(state.selection.from,state.selection.to,node=>{if(node.isText&&marks===undefined)marks=node.marks;});
  marks??=state.storedMarks??state.selection.$from.marks();
  return marks.filter(mark=>textMarks.has(mark.type.name)).map(mark=>({type:mark.type.name,attrs:{...mark.attrs}}));
}
/** Include inherited heading/body styles, so the pasted text keeps its appearance. */
export function captureTextFormat(editor:Editor):TextFormat {
  const {state}=editor,format=readTextFormat(state);let position=state.selection.from,found=false;
  if(!state.selection.empty)state.doc.nodesBetween(state.selection.from,state.selection.to,(node,pos)=>{if(node.isText&&!found){position=Math.max(pos,state.selection.from);found=true;}});
  const dom=editor.view.domAtPos(position),node=dom.node.nodeType===1?(dom.node.childNodes[dom.offset]??dom.node):dom.node;
  const element=node.nodeType===1?node as Element:node.parentElement;if(!element)return format;
  const style=getComputedStyle(element),existing=format.find(mark=>mark.type==='textStyle'),attrs={...existing?.attrs};
  const family=style.fontFamily.split(',').map(name=>name.trim().replace(/^['"]|['"]$/g,'')).find(name=>FONTS.includes(name));
  const rgb=/^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(style.color);
  if(!attrs.fontFamily&&family)attrs.fontFamily=family;
  if(!attrs.fontSize&&Number.isFinite(parseFloat(style.fontSize)))attrs.fontSize=`${Math.round(parseFloat(style.fontSize)*75)/100}pt`;
  if(!attrs.color&&rgb)attrs.color='#'+rgb.slice(1).map(channel=>Number(channel).toString(16).padStart(2,'0')).join('');
  if(existing)existing.attrs=attrs;else format.push({type:'textStyle',attrs});
  if(Number(style.fontWeight)>=600&&!format.some(mark=>mark.type==='bold'))format.push({type:'bold',attrs:{}});
  if(style.fontStyle==='italic'&&!format.some(mark=>mark.type==='italic'))format.push({type:'italic',attrs:{}});
  return format;
}
export function paintTextFormat(state:EditorState,format:TextFormat):Transaction|null {
  if(state.selection.empty)return null;
  const tr=state.tr;let text=false;
  for(const {$from,$to} of state.selection.ranges){
    state.doc.nodesBetween($from.pos,$to.pos,node=>{if(node.isText)text=true;});
    for(const name of textMarks){const mark=state.schema.marks[name];if(mark)tr.removeMark($from.pos,$to.pos,mark);}
    for(const item of format){const mark=state.schema.marks[item.type];if(mark&&textMarks.has(item.type))tr.addMark($from.pos,$to.pos,mark.create(item.attrs));}
  }
  return text&&tr.docChanged?closeHistory(tr):null;
}
