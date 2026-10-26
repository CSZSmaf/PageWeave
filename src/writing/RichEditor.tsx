import {useEffect,useRef} from 'react';
import {EditorContent,useEditor,type Editor} from '@tiptap/react';
import {Node,Extension} from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import {TextStyleKit} from '@tiptap/extension-text-style';
import TextAlign from '@tiptap/extension-text-align';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import type {RichNode} from '../../core/writing';
import {InlineMarks} from './InlineMarks';
export interface MathRequest{latex:string;display:boolean;commit(latex:string):void}
interface Props{content:RichNode;onReady(editor:Editor|null):void;onChange():void;onFinish():void;onMath(request:MathRequest):void}
export const BlockSpacing=Extension.create({name:'blockSpacing',addGlobalAttributes(){return [{types:['paragraph','heading'],attributes:{lineHeight:{default:'1.5',parseHTML:element=>element.style.lineHeight||'1.5',renderHTML:attrs=>({style:`line-height:${attrs.lineHeight}`})},spacingBefore:{default:null,parseHTML:element=>element.getAttribute('data-space-before'),renderHTML:attrs=>attrs.spacingBefore!=null?{'data-space-before':attrs.spacingBefore,style:`margin-top:${Math.max(0,Math.min(120,Number(attrs.spacingBefore)))}pt`}:{}},spacingAfter:{default:null,parseHTML:element=>element.getAttribute('data-space-after'),renderHTML:attrs=>attrs.spacingAfter!=null?{'data-space-after':attrs.spacingAfter,style:`margin-bottom:${Math.max(0,Math.min(120,Number(attrs.spacingAfter)))}pt`}:{}}}}];}});
export function mathNode(display:boolean,onMath:(request:MathRequest)=>void){return Node.create({
  name:display?'displayMath':'inlineMath',group:display?'block':'inline',inline:!display,atom:true,
  addAttributes(){return {latex:{default:'x'}};},
  parseHTML(){return [{tag:`${display?'div':'span'}[data-math]`,getAttrs:element=>({latex:element.getAttribute('data-latex')??'x'})}];},
  renderHTML({node}){return [display?'div':'span',{'data-math':display?'display':'inline','data-latex':node.attrs.latex},node.attrs.latex];},
  addNodeView(){return ({node,editor,getPos})=>{
    const dom=document.createElement(display?'div':'span');dom.contentEditable='false';dom.className='writing-math '+(display?'display':'inline');dom.setAttribute('role','button');dom.setAttribute('aria-label','编辑公式 '+node.attrs.latex);dom.dataset.latex=node.attrs.latex;
    dom.dataset.math=display?'display':'inline';
    dom.innerHTML=katex.renderToString(node.attrs.latex,{displayMode:display,throwOnError:false,trust:false});
    dom.addEventListener(display?'click':'dblclick',event=>{event.preventDefault();onMath({latex:node.attrs.latex,display,commit:latex=>{const pos=getPos();if(typeof pos==='number')editor.chain().focus().command(({tr})=>{tr.setNodeMarkup(pos,undefined,{...node.attrs,latex});return true;}).run();}});});
    return {dom};
  };},
});}
export const PageBreak=Node.create({name:'pageBreak',group:'block',atom:true,parseHTML(){return[{tag:'div[data-page-break]'}];},renderHTML(){return ['div',{'data-page-break':'true',class:'inline-page-break','aria-label':'分页符'}];}});
export default function RichEditor(props:Props){
  const ref=useRef(props);ref.current=props;
  const editor=useEditor({
    extensions:[StarterKit.configure({blockquote:false,bulletList:false,orderedList:false,listItem:false,code:false,codeBlock:false,horizontalRule:false,link:false,heading:{levels:[1,2,3]}}),TextStyleKit.configure({lineHeight:false,backgroundColor:false}),TextAlign.configure({types:['heading','paragraph'],defaultAlignment:'justify'}),BlockSpacing,mathNode(false,r=>ref.current.onMath(r)),mathNode(true,r=>ref.current.onMath(r)),PageBreak,
      ...InlineMarks,Extension.create({name:'pageWritingKeys',addKeyboardShortcuts(){return {'Mod-Enter':()=>this.editor.commands.insertContent([{type:'pageBreak'},{type:'paragraph'}]),Escape:()=>{ref.current.onFinish();return true;}};}})],
    content:props.content,autofocus:'end',editorProps:{attributes:{class:'page-writing-editor','aria-label':'页面正文编辑器',role:'textbox','aria-multiline':'true',spellcheck:'false'}},
    onUpdate:()=>ref.current.onChange(),onSelectionUpdate:()=>ref.current.onChange(),
  });
  useEffect(()=>{props.onReady(editor);return()=>props.onReady(null);},[editor]);
  return <EditorContent editor={editor}/>;
}
