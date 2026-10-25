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
  const canvas=useRef<HTMLCanvasElement>(null),wrap=useRef<HTMLDivElement>(null);
  const [page,setPage]=useState<PDFPageProxy|null>(null),[visible,setVisible]=useState(false),[ready,setReady]=useState(false);
  const scale=props.zoom*96/72,viewport=page?.getViewport({scale}),size={width:viewport?.width??595.28*scale,height:viewport?.height??841.89*scale,scale};
  useEffect(()=>{
    let canceled=false;
    void pdf.getPage(number).then(page=>{if(!canceled)setPage(page);}).catch(e=>{if(!canceled)props.onError(String(e));});
    return()=>{canceled=true;};
  },[pdf,number]);
  useEffect(()=>{
    const observer=new IntersectionObserver(entries=>setVisible(entries.some(entry=>entry.isIntersecting)),{root:wrap.current!.closest('.writing-pages'),rootMargin:'800px 0px'});
    observer.observe(wrap.current!);return()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    setReady(false);if(!page||!visible)return;
    let canceled=false,render:ReturnType<PDFPageProxy['render']>|undefined;const c=canvas.current!,ratio=Math.min(devicePixelRatio,2),viewport=page.getViewport({scale});
    c.width=Math.round(viewport.width*ratio);c.height=Math.round(viewport.height*ratio);
    void (async()=>{render=page.render({canvas:c,canvasContext:c.getContext('2d')!,viewport,transform:[ratio,0,0,ratio,0,0]});await render.promise;if(!canceled)setReady(true);})().catch(e=>{if(!canceled&&e.name!=='RenderingCancelledException')props.onError(String(e));});
    return()=>{canceled=true;render?.cancel();c.width=0;c.height=0;if(render)void render.promise.catch(()=>{}).then(()=>page.cleanup());};
  },[page,visible,scale]);
  const regions=props.result?.writingRegions.filter(r=>r.page===number)??[];
  return <div ref={wrap} className="writing-page-wrap" data-visible={visible?'true':'false'}><span className="writing-page-number">第 {number} 页</span><div className="writing-page" data-rendered={ready?'true':'false'} style={{width:size.width,height:size.height}} onMouseDown={e=>{if(e.target===canvas.current)props.onFinish();}}><canvas ref={canvas} width={0} height={0} aria-label={`正式 PDF 第 ${number} 页`} style={{width:size.width,height:size.height}}/>{visible&&!ready&&<span className="writing-rendering"><LoaderCircle size={13} className="spin"/>正在显示页面</span>}
    {regions.map((r,i)=>{const block=props.blocks.find(b=>b.id===r.id);if(!block)return null;const editing=props.active===r.id;const primary=props.result?.writingRegions.find(x=>x.id===r.id)?.page===number;
      return editing&&primary?<div key={r.id} className="writing-active" data-block={r.id} style={{left:r.x*size.scale,top:r.y*size.scale,width:r.width*size.scale,minHeight:r.height*size.scale}}><div className="writing-editor-scale" style={{zoom:size.scale*72/96}}><RichEditor content={block.content} onReady={props.onReady} onChange={props.onChange} onFinish={props.onFinish} onMath={props.onMath}/></div></div>:<button key={r.id+':'+i} data-block={r.id} className={`writing-hit ${props.selected===r.id?'selected':''} ${block.editable?'':'readonly'}`} style={{left:r.x*size.scale,top:r.y*size.scale,width:r.width*size.scale,height:r.height*size.scale}} aria-label={`编辑段落 ${r.id}`} onClick={()=>{props.onSelect(r.id);if(block.editable)props.onEdit(r.id);}}></button>;
    })}
  </div></div>;
}
export default function WritingPdf(props:Props){
  const [loaded,setLoaded]=useState<{token:string;pdf:PDFDocumentProxy}|null>(null),pdf=loaded?.token===props.result?.token?loaded?.pdf:null;
  useEffect(()=>{if(!props.result?.pdf){setLoaded(null);return;}let canceled=false;const token=props.result.token,task=getDocument({data:new Uint8Array(props.result.pdf),useSystemFonts:true});task.promise.then(pdf=>{if(!canceled){setLoaded({token,pdf});props.onPages(pdf.numPages);}}).catch(e=>{if(!canceled)props.onError(String(e));});return()=>{canceled=true;void task.destroy();};},[props.result?.token]);
  return <div className="writing-pages">{!props.result?<div className="writer-placeholder"><LoaderCircle className="spin"/><h2>正在排版…</h2></div>:!pdf?<div className="writer-placeholder"><LoaderCircle className="spin"/></div>:Array.from({length:pdf.numPages},(_,i)=><WritingPage key={loaded!.token+':'+i} {...props} pdf={pdf} number={i+1}/>)}</div>;
}
