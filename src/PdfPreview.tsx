import { useEffect, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions, OPS, type PDFDocumentProxy, type PDFPageProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { FileText, LoaderCircle } from 'lucide-react';
import type { CompileResult, Region } from '../core/types';
GlobalWorkerOptions.workerSrc = workerUrl;
type Matrix = [number, number, number, number, number, number];
const multiply = (a: Matrix, b: Matrix): Matrix => [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];

// Refine SyncTeX's line boxes with real PDF image geometry where it is unambiguous.
async function refineRegions(page: PDFPageProxy, regions: Region[]) {
  const viewport = page.getViewport({scale:1}), ops = await page.getOperatorList();
  let matrix: Matrix = [1,0,0,1,0,0]; const stack: Matrix[] = [];
  const boxes: {x:number;y:number;width:number;height:number}[] = [];
  for (let i=0;i<ops.fnArray.length;i++) {
    const op=ops.fnArray[i], args=ops.argsArray[i];
    if(op===OPS.save) stack.push([...matrix]);
    if(op===OPS.restore) matrix=stack.pop()??[1,0,0,1,0,0];
    if(op===OPS.transform) matrix=multiply(matrix,args as Matrix);
    if(op===OPS.paintImageXObject || op===OPS.paintInlineImageXObject) {
      const m=multiply(viewport.transform as Matrix,matrix);
      const points=[[0,0],[1,0],[0,1],[1,1]].map(([x,y])=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]]);
      const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
      boxes.push({x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)});
    }
    if(op===OPS.paintFormXObjectBegin) { stack.push([...matrix]); if(args[0]) matrix=multiply(matrix,args[0]); }
    if(op===OPS.paintFormXObjectEnd) matrix=stack.pop()??[1,0,0,1,0,0];
  }
  return regions.map(r=>{
    const matches=boxes.filter(b=>b.width>8&&b.height>8&&b.x>=r.x-4&&b.x+b.width<=r.x+r.width+4&&Math.abs(b.y-r.y)<8&&Math.abs(b.height-r.height)<8);
    return matches.length===1?{...r,...matches[0]}:r;
  });
}

function Page({pdf,number,width,zoom,regions,selected,stale,onSelect,onLocate,onError}:{pdf:PDFDocumentProxy;number:number;width:number;zoom:number;regions:Region[];selected:string|null;stale:boolean;onSelect(id:string):void;onLocate(page:number,x:number,y:number):void;onError(message:string):void}) {
  const canvas=useRef<HTMLCanvasElement>(null), host=useRef<HTMLDivElement>(null);
  const [size,setSize]=useState({width:595,height:842,scale:1}), [mapped,setMapped]=useState<Region[]>([]),[visible,setVisible]=useState(number===1);
  useEffect(()=>{const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))setVisible(true);},{rootMargin:'500px'});if(host.current)observer.observe(host.current);return()=>observer.disconnect();},[]);
  useEffect(()=>{if(selected&&regions.some(r=>r.objectId===selected&&r.page===number)){setVisible(true);host.current?.scrollIntoView({block:'nearest'});}},[selected]);
  useEffect(()=>{
    if(!visible)return;let canceled=false;let rendering:ReturnType<PDFPageProxy['render']>|undefined;
    (async()=>{
      const page=await pdf.getPage(number);if(canceled)return;
      const base=page.getViewport({scale:1}), scale=Math.max(.2,Math.min((width-56)/base.width,1.4))*zoom;
      const viewport=page.getViewport({scale});setSize({width:viewport.width,height:viewport.height,scale});
      const target=canvas.current!;const ratio=Math.min(window.devicePixelRatio||1,2);
      target.width=Math.floor(viewport.width*ratio);target.height=Math.floor(viewport.height*ratio);
      rendering=page.render({canvas:target,canvasContext:target.getContext('2d')!,viewport,transform:[ratio,0,0,ratio,0,0]});
      await rendering.promise;if(canceled)return;
      setMapped(await refineRegions(page,regions.filter(r=>r.page===number)));
    })().catch(e=>{if(!canceled&&e.name!=='RenderingCancelledException')onError(String(e));});
    return()=>{canceled=true;rendering?.cancel();};
  },[pdf,number,width,zoom,visible]);
  return <div className="pdf-page-wrap" ref={host}>
    <div className="page-label">第 {number} 页</div>
    <div className="pdf-page" style={{width:size.width,height:size.height}} onClick={e=>{if(!stale){const rect=e.currentTarget.getBoundingClientRect();onLocate(number,(e.clientX-rect.left)/size.scale,(e.clientY-rect.top)/size.scale);}}}>
      <canvas ref={canvas} style={{width:size.width,height:size.height}} aria-label={`PDF 第 ${number} 页`} />
      {!stale&&mapped.map((r,i)=><button key={`${r.objectId}:${i}`} className={`object-overlay ${selected===r.objectId?'selected':''}`} aria-label={`选中图片，${r.file} 第 ${r.line} 行`} style={{left:r.x*size.scale,top:r.y*size.scale,width:r.width*size.scale,height:r.height*size.scale}} onClick={e=>{e.stopPropagation();onSelect(r.objectId);}}><span className="object-tag">图片 · 点击编辑</span><i className="handle tl"/><i className="handle tr"/><i className="handle bl"/><i className="handle br"/></button>)}
    </div>
  </div>;
}
export default function PdfPreview({result,selected,stale,zoom,onSelect,onLocate,onPages,onError}:{result:CompileResult|null;selected:string|null;stale:boolean;zoom:number;onSelect(id:string):void;onLocate(page:number,x:number,y:number):void;onPages(count:number):void;onError(message:string):void}) {
  const [pdf,setPdf]=useState<PDFDocumentProxy|null>(null),[width,setWidth]=useState(600);const host=useRef<HTMLDivElement>(null);
  useEffect(()=>{const observer=new ResizeObserver(entries=>setWidth(entries[0].contentRect.width));if(host.current)observer.observe(host.current);return()=>observer.disconnect();},[]);
  useEffect(()=>{
    if(!result?.pdf){setPdf(null);return;}
    let canceled=false;const task=getDocument({data:new Uint8Array(result.pdf),useSystemFonts:true});
    task.promise.then(doc=>{if(!canceled){setPdf(doc);onPages(doc.numPages);}}).catch(e=>{if(!canceled)onError('PDF 读取失败：'+String(e));});
    return()=>{canceled=true;void task.destroy();};
  },[result?.token]);
  return <div className="pdf-scroll" ref={host}>
    {!result?<div className="preview-empty"><div className="empty-sheet"><FileText size={42}/></div><h3>从源码，走向成稿</h3><p>点击「编译」生成真实 PDF。<br/>然后在页面中选中图片，调整排版。</p><kbd>Ctrl + Enter</kbd></div>:!pdf?<div className="preview-empty"><LoaderCircle className="spin"/>正在载入成稿…</div>:Array.from({length:pdf.numPages},(_,i)=><Page key={`${result.token}:${i}`} pdf={pdf} number={i+1} width={width} zoom={zoom} regions={result.regions} selected={selected} stale={stale} onSelect={onSelect} onLocate={onLocate} onError={onError}/>)}
  </div>;
}
