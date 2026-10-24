import {useEffect,useRef,useState} from 'react';
import {EditorContent,useEditor,type Editor} from '@tiptap/react';
import {Extension} from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import {TextStyleKit} from '@tiptap/extension-text-style';
import TextAlign from '@tiptap/extension-text-align';
import {Table,TableRow,TableCell,TableHeader} from '@tiptap/extension-table';
import {FlowImage} from './FlowImage';
import type {RichNode} from '../../core/writing';
import type {PaperLayout} from '../../core/flow';
import {BlockSpacing,mathNode,PageBreak,type MathRequest} from './RichEditor';
import {pagination,PAGE_GAP} from './Pagination';
import {WritingSearch,writingSearch} from '../search/WritingSearch';
import type {SearchController} from '../search/SearchController';
import {WritingListItem,ListKeys} from './Lists';

interface Props{content:RichNode;layout:PaperLayout;zoom:number;readOnly?:boolean;onReady(editor:Editor|null):void;onChange(doc:RichNode):void;onSelection():void;onPages(pages:number):void;onMath(request:MathRequest):void;onSearchReady(search:SearchController|null):void}
const SourceId=Extension.create({name:'writingSourceId',addGlobalAttributes(){return [{types:['paragraph','heading','displayMath','pageBreak','flowImage','table','bulletList','orderedList'],attributes:{sourceId:{default:null,parseHTML:element=>element.getAttribute('data-block'),renderHTML:attrs=>attrs.sourceId?{'data-block':attrs.sourceId}:{}}}}];}});

export default function FlowEditor(props:Props){
  const ref=useRef(props);ref.current=props;
  const [pages,setPages]=useState(1),compositionPending=useRef(false);
  const editor=useEditor({
    extensions:[StarterKit.configure({blockquote:false,listItem:false,code:false,codeBlock:false,horizontalRule:false,link:false,trailingNode:{node:'paragraph'},heading:{levels:[1,2,3]}}),WritingListItem,ListKeys,TextStyleKit.configure({lineHeight:false,backgroundColor:false}),TextAlign.configure({types:['heading','paragraph','flowImage'],defaultAlignment:'justify'}),BlockSpacing,SourceId,mathNode(false,r=>ref.current.onMath(r)),mathNode(true,r=>ref.current.onMath(r)),PageBreak,FlowImage,Table.configure({resizable:false}),TableRow,TableCell.extend({content:'paragraph+'}),TableHeader.extend({content:'paragraph+'}),
      WritingSearch,pagination(()=>ref.current.layout,n=>{setPages(n);ref.current.onPages(n);}),
      Extension.create({name:'continuousWritingKeys',priority:1000,addKeyboardShortcuts(){return {
        'Mod-Enter':()=>this.editor.isActive('table')||this.editor.isActive('listItem')||this.editor.commands.insertContent([{type:'pageBreak'},{type:'paragraph'}]),
        'Mod-End':()=>this.editor.chain().setTextSelection(this.editor.state.doc.content.size-1).scrollIntoView().run(),
        'Mod-Home':()=>this.editor.chain().setTextSelection(1).scrollIntoView().run(),
      };}})],
    content:props.content,
    editorProps:{attributes:{class:'page-writing-editor flow-editor','aria-label':'页面正文编辑器',role:'textbox','aria-multiline':'true',spellcheck:'false'},handleDOMEvents:{
      compositionend(view){setTimeout(()=>{if(compositionPending.current&&!view.isDestroyed){compositionPending.current=false;ref.current.onChange(view.state.doc.toJSON());}},40);return false;},
    }},
    onUpdate:({editor})=>{if(editor.view.composing){compositionPending.current=true;return;}ref.current.onChange(editor.getJSON() as RichNode);},
    onSelectionUpdate:()=>ref.current.onSelection(),
  });
  useEffect(()=>{props.onReady(editor);return()=>props.onReady(null);},[editor]);
  useEffect(()=>{editor?.setEditable(!props.readOnly);},[editor,props.readOnly]);
  useEffect(()=>{if(!editor)return;const search=writingSearch(editor),changed=()=>search.changed();ref.current.onSearchReady(search);editor.on('update',changed);return()=>{editor.off('update',changed);ref.current.onSearchReady(null);};},[editor]);
  useEffect(()=>{if(editor)editor.view.dispatch(editor.state.tr.setMeta('paperLayout',true).setMeta('addToHistory',false));},[props.layout.width,props.layout.height,props.layout.margin,editor]);
  const {width,height,margin}=props.layout,total=pages*(height+PAGE_GAP)-PAGE_GAP;
  return <div className="flow-scroll"><div className="flow-scale" style={{zoom:props.zoom,width}}><div className="flow-document" data-pages={pages} style={{width,minHeight:total}} onMouseDown={event=>{
    if(event.target===event.currentTarget||((event.target as HTMLElement).classList.contains('flow-sheet'))){event.preventDefault();editor?.commands.focus('end');}
  }}>
    <div className="flow-sheets" aria-hidden="true">{Array.from({length:pages},(_,i)=><div key={i} className="flow-sheet" data-page={i+1} style={{top:i*(height+PAGE_GAP),width,height}}><span className="flow-folio">{i+1}</span></div>)}</div>
    <div className="flow-content" style={{width:width-2*margin,marginLeft:margin,paddingTop:margin,paddingBottom:margin,'--image-max-height':`${(height-2*margin)*.82}px`} as React.CSSProperties}><EditorContent editor={editor}/></div>
  </div></div></div>;
}
