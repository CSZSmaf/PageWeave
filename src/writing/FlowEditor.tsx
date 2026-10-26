import {useEffect,useRef,useState} from 'react';
import {EditorContent,useEditor,type Editor} from '@tiptap/react';
import {Extension} from '@tiptap/core';
import {Selection} from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import {TextStyleKit} from '@tiptap/extension-text-style';
import TextAlign from '@tiptap/extension-text-align';
import {AdvancedTable,AdvancedRow,AdvancedCell,AdvancedHeader} from './AdvancedTable';
import {drawingNode,type DrawingRequest} from './DrawingNode';
import {furnitureText} from '../../core/page-furniture';
import {syncTextSelection} from './selection';
import {FlowImage} from './FlowImage';
import type {RichNode} from '../../core/writing';
import type {PaperLayout} from '../../core/flow';
import type {PagePlan} from '../../core/page-plan';
import {BlockSpacing,mathNode,PageBreak,type MathRequest} from './RichEditor';
import {pagination,PAGE_GAP} from './Pagination';
import {WritingSearch,writingSearch} from '../search/WritingSearch';
import type {SearchController} from '../search/SearchController';
import {WritingListItem,ListKeys} from './Lists';
import {Review} from './Review';
import {InlineMarks} from './InlineMarks';

interface Props{content:RichNode;layout:PaperLayout;zoom:number;readOnly?:boolean;onReady(editor:Editor|null):void;onChange(doc:RichNode):void;onSelection():void;onPages(pages:number):void;onPlan?(plan:PagePlan):void;onMath(request:MathRequest):void;onDrawing(request:DrawingRequest):void;onComment?(id:string):void;onSearchReady(search:SearchController|null):void}
const SourceId=Extension.create({name:'writingSourceId',addGlobalAttributes(){return [{types:['paragraph','heading','displayMath','pageBreak','flowImage','drawing','table','bulletList','orderedList'],attributes:{sourceId:{default:null,parseHTML:element=>element.getAttribute('data-block'),renderHTML:attrs=>attrs.sourceId?{'data-block':attrs.sourceId}:{}}}}];}});

export default function FlowEditor(props:Props){
  const ref=useRef(props);ref.current=props;
  const [pages,setPages]=useState(1),compositionPending=useRef(false);
  const editor=useEditor({
    extensions:[StarterKit.configure({blockquote:false,listItem:false,code:false,codeBlock:false,horizontalRule:false,link:false,trailingNode:{node:'paragraph'},heading:{levels:[1,2,3]}}),WritingListItem,ListKeys,TextStyleKit.configure({lineHeight:false,backgroundColor:false}),TextAlign.configure({types:['heading','paragraph','flowImage','drawing'],defaultAlignment:'justify'}),BlockSpacing,SourceId,mathNode(false,r=>ref.current.onMath(r)),mathNode(true,r=>ref.current.onMath(r)),PageBreak,FlowImage,drawingNode(request=>ref.current.onDrawing(request)),AdvancedTable,AdvancedRow,AdvancedCell,AdvancedHeader,
      ...InlineMarks,Review,WritingSearch,pagination(()=>ref.current.layout,n=>{setPages(n);ref.current.onPages(n);},plan=>ref.current.onPlan?.(plan)),
      Extension.create({name:'continuousWritingKeys',priority:1000,addKeyboardShortcuts(){return {
        'Mod-Enter':()=>this.editor.isActive('table')||this.editor.isActive('listItem')||this.editor.commands.insertContent([{type:'pageBreak'},{type:'paragraph'}]),
        'Mod-End':()=>this.editor.chain().command(({tr})=>{tr.setSelection(Selection.atEnd(tr.doc));return true;}).scrollIntoView().run(),
        'Mod-Home':()=>this.editor.chain().command(({tr})=>{tr.setSelection(Selection.atStart(tr.doc));return true;}).scrollIntoView().run(),
      };}})],
    content:props.content,
    editorProps:{attributes:{class:'page-writing-editor flow-editor','aria-label':'页面正文编辑器',role:'textbox','aria-multiline':'true',spellcheck:'false'},handleDOMEvents:{
      mouseup(view,event){if(event.button===0)syncTextSelection(view);return false;},
      compositionend(view){setTimeout(()=>{if(compositionPending.current&&!view.isDestroyed){compositionPending.current=false;ref.current.onChange(view.state.doc.toJSON());}},40);return false;},
      click(_view,event){const target=event.target instanceof HTMLElement?event.target.closest<HTMLElement>('[data-comment-id]'):null;if(target?.dataset.commentId)ref.current.onComment?.(target.dataset.commentId);return false;},
    }},
    onUpdate:({editor})=>{if(editor.view.composing){compositionPending.current=true;return;}ref.current.onChange(editor.getJSON() as RichNode);},
    onSelectionUpdate:()=>ref.current.onSelection(),
    onTransaction:({transaction})=>{if(typeof transaction.getMeta('reviewVisible')==='boolean'||transaction.getMeta('activeRevision'))ref.current.onSelection();},
  });
  useEffect(()=>{props.onReady(editor);return()=>props.onReady(null);},[editor]);
  useEffect(()=>{editor?.setEditable(!props.readOnly,false);},[editor,props.readOnly]);
  useEffect(()=>{if(!editor)return;const search=writingSearch(editor),changed=()=>search.changed();ref.current.onSearchReady(search);editor.on('update',changed);return()=>{editor.off('update',changed);ref.current.onSearchReady(null);};},[editor]);
  useEffect(()=>{if(editor)editor.view.dispatch(editor.state.tr.setMeta('paperLayout',true).setMeta('addToHistory',false));},[props.layout.width,props.layout.height,props.layout.margin,props.layout.fontSize,props.layout.fontFamily,props.layout.cjkFont,JSON.stringify(props.layout.furniture),editor]);
  const {width,height,margin}=props.layout,total=pages*(height+PAGE_GAP)-PAGE_GAP;
  return <div className="flow-scroll"><div className="flow-scale" style={{zoom:props.zoom,width}}><div className="flow-document" data-pages={pages} style={{width,minHeight:total}} onMouseDown={event=>{
    if(event.target===event.currentTarget||((event.target as HTMLElement).classList.contains('flow-sheet'))){event.preventDefault();editor?.commands.focus('end');}
  }}>
    <div className="flow-sheets" aria-hidden="true">{Array.from({length:pages},(_,i)=><div key={i} className="flow-sheet" data-page={i+1} style={{top:i*(height+PAGE_GAP),width,height}}>{props.layout.furniture?(!props.layout.furniture.hideFirst||i>0)&&(['header','footer'] as const).map(kind=>{const f=props.layout.furniture!,single=f[kind].filter(Boolean).length===1;return <div key={kind} className={`flow-furniture ${kind} ${f[kind==='header'?'headerLine':'footerLine']?'with-line':''} ${single?'single':''}`} style={{left:margin,width:width-2*margin,fontSize:f.fontSize+'pt',color:f.color,top:kind==='header'?margin-(f.fontSize*1.4+6)*96/72:height-margin+6}}>{f[kind].map((text,index)=><span key={index} style={single&&text?{position:'absolute',width:'100%',textAlign:index===0?'left':index===1?'center':'right'}:undefined}>{furnitureText(text,i+1,pages)}</span>)}</div>}):<span className="flow-folio">{i+1}</span>}</div>)}</div>
    <div className="flow-content" style={{width:width-2*margin,marginLeft:margin,paddingTop:margin,paddingBottom:margin,'--writing-font-size':`${props.layout.fontSize??12}pt`,'--writing-font-family':`"${props.layout.fontFamily??'Times New Roman'}","${props.layout.cjkFont??'SimSun'}",serif`,'--image-max-height':`${(height-2*margin)*.82}px`} as React.CSSProperties}><EditorContent editor={editor}/></div>
  </div></div></div>;
}
