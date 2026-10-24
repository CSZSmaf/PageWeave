import {useEffect,useRef,useState} from 'react';
import {getDocument,GlobalWorkerOptions,type PDFDocumentProxy,type PDFPageProxy} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type {Editor} from '@tiptap/react';
import type {CompileResult} from '../../core/types';
import type {WritingBlock,WritingRegion} from '../../core/writing';
import RichEditor,{type MathRequest} from './RichEditor';
import {FilePenLine,LoaderCircle} from 'lucide-react';
GlobalWorkerOptions.workerSrc=workerUrl;
interface Props{result:CompileResult|null;blocks:WritingBlock[];active:string|null;selected:string|null;zoom:number;onSelect(id:string):void;onEdit(id:string):void;onReady(editor:Editor|null):void;onChange():void;onFinish():void;onMath(request:MathRequest):void;onError(message:string):void;onPages(count:number):void}
function WritingPage({pdf,number,...props}:Props&{pdf:PDFDocumentProxy;number:number}){
  const canvas=useRef<HTMLCanvasElement>(null),[size,setSize]=useState({width:794,height:1123,scale:1.3333}),[ready,setReady]=useState(false),render=useRef<ReturnType<PDFPageProxy['render']>|undefined>(undefined);
  useEffect(()=>{let canceled=false;setReady(false);(async()=>{const page=await pdf.getPage(number);if(canceled)return;const scale=props.zoom*96/72,viewport=page.getViewport({scale});setSize({width:viewport.width,height:viewport.height,scale});
    const c=canvas.current!;const ratio=Math.min(devicePixelRatio,2);c.width=Math.round(viewport.width*ratio);c.height=Math.round(viewport.height*ratio);render.current=page.render({canvas:c,canvasContext:c.getContext('2d')!,viewport,transform:[ratio,0,0,ratio,0,0]});await render.current.promise;if(!canceled)setReady(true);
  })().catch(e=>{if(!canceled&&e.name!=='RenderingCancelledException')props.onError(String(e));});return()=>{canceled=true;render.current?.cancel();};},[pdf,number,props.zoom]);
  const regions=props.result?.writingRegions.filter(r=>r.page===number)??[];
  return <div className="writing-page-wrap"><span className="writing-page-number">第 {number} 页</span><div className="writing-page" data-rendered={ready?'true':'false'} style={{width:size.width,height:size.height}} onMouseDown={e=>{if(e.target===canvas.current)props.onFinish();}}><canvas ref={canvas} aria-label={`正式 PDF 第 ${number} 页`} style={{width:size.width,height:size.height}}/>{!ready&&<span className="writing-rendering"><LoaderCircle size={13} className="spin"/>正在显示页面</span>}
    {regions.map((r,i)=>{const block=props.blocks.find(b=>b.id===r.id);if(!block)return null;const editing=props.active===r.id;const primary=props.result?.writingRegions.find(x=>x.id===r.id)?.page===number;
      return editing&&primary?<div key={r.id} className="writing-active" data-block={r.id} style={{left:r.x*size.scale,top:r.y*size.scale,width:r.width*size.scale,minHeight:r.height*size.scale}}><div className="writing-editor-scale" style={{zoom:size.scale*72/96}}><RichEditor content={block.content} onReady={props.onReady} onChange={props.onChange} onFinish={props.onFinish} onMath={props.onMath}/></div></div>:<button key={r.id+':'+i} data-block={r.id} className={`writing-hit ${props.selected===r.id?'selected':''} ${block.editable?'':'readonly'}`} style={{left:r.x*size.scale,top:r.y*size.scale,width:r.width*size.scale,height:r.height*size.scale}} aria-label={`编辑段落 ${r.id}`} onClick={()=>{props.onSelect(r.id);if(block.editable)props.onEdit(r.id);}}></button>;
    })}
  </div></div>;
}
export default function WritingPdf(props:Props){
  const [pdf,setPdf]=useState<PDFDocumentProxy|null>(null);
  useEffect(()=>{if(!props.result?.pdf){setPdf(null);return;}let canceled=false;const task=getDocument({data:new Uint8Array(props.result.pdf),useSystemFonts:true});task.promise.then(doc=>{if(!canceled){setPdf(doc);props.onPages(doc.numPages);}}).catch(e=>{if(!canceled)props.onError(String(e));});return()=>{canceled=true;void task.destroy();};},[props.result?.token]);
  return <div className="writing-pages">{!props.result?<div className="writer-placeholder"><LoaderCircle className="spin"/><h2>正在排版…</h2></div>:!pdf?<div className="writer-placeholder"><LoaderCircle className="spin"/></div>:Array.from({length:pdf.numPages},(_,i)=><WritingPage key={i+1} {...props} pdf={pdf} number={i+1}/>)}</div>;
}
