import {useEffect,useRef,useState} from 'react';
import {ArrowDown,ArrowUp,ChevronDown,ChevronRight,X} from 'lucide-react';
import type {SearchController,SearchSnapshot} from './SearchController';

export interface SearchRequest{mode:'find'|'replace';nonce:number;seed:string}
interface Props{request:SearchRequest|null;target:SearchController|null;scope:string;onMode(mode:'find'|'replace'):void;onClose():void}
const empty:SearchSnapshot={current:0,total:0,readOnly:true};
export default function SearchPanel({request,target,scope,onMode,onClose}:Props){
  const [query,setQuery]=useState(''),[replacement,setReplacement]=useState(''),[caseSensitive,setCaseSensitive]=useState(false),[status,setStatus]=useState(empty),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const input=useRef<HTMLInputElement>(null),replaceInput=useRef<HTMLInputElement>(null),open=!!request;
  useEffect(()=>{if(!request)return;if(request.seed)setQuery(request.seed);setMessage('');input.current?.focus();input.current?.select();},[request?.nonce]);
  useEffect(()=>{if(!target||!open){setStatus(empty);return;}const update=()=>setStatus(target.snapshot());const unsubscribe=target.subscribe(update);update();return()=>{unsubscribe();target.clear();};},[target,open]);
  useEffect(()=>{if(open)target?.setQuery({query,caseSensitive});setMessage('');},[target,open,query,caseSensitive]);
  const close=()=>{onClose();target?.focus();};
  const replace=async(all:boolean)=>{if(!target)return;setBusy(true);setMessage('');try{const n=await target.replace(replacement,all);setMessage(`已替换 ${n} 处`);}catch(error){setMessage(error instanceof Error?error.message:String(error));}finally{setBusy(false);}};
  if(!request)return null;
  return <section className="search-panel" role="search" aria-label="查找与替换" onKeyDown={event=>{
    if(event.nativeEvent.isComposing)return;
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}
    else if(event.key==='Enter'&&(event.target===input.current||event.target===replaceInput.current)){event.preventDefault();if(event.target===input.current)target?.step(event.shiftKey?-1:1);else if(!busy)void replace(false);}
  }}>
    <div className="search-row"><button aria-label={request.mode==='replace'?'收起替换':'展开替换'} title={request.mode==='replace'?'收起替换':'替换 · Ctrl+H'} onClick={()=>onMode(request.mode==='replace'?'find':'replace')}>{request.mode==='replace'?<ChevronDown size={16}/>:<ChevronRight size={16}/>}</button><input ref={input} aria-label="查找内容" placeholder="查找" value={query} onChange={event=>setQuery(event.target.value)}/><button className={caseSensitive?'on':''} aria-pressed={caseSensitive} aria-label="区分大小写" title="区分大小写" onClick={()=>setCaseSensitive(value=>!value)}>Aa</button><output className="search-count" aria-label="匹配结果" aria-live="polite">{status.total?`${status.current} / ${status.total}`:query?'无结果':'0 / 0'}</output><button aria-label="上一个匹配" title="上一个 · Shift+Enter" disabled={!status.total} onClick={()=>target?.step(-1)}><ArrowUp size={16}/></button><button aria-label="下一个匹配" title="下一个 · Enter" disabled={!status.total} onClick={()=>target?.step(1)}><ArrowDown size={16}/></button><button aria-label="关闭查找" title="关闭 · Esc" onClick={close}><X size={16}/></button></div>
    {request.mode==='replace'&&<div className="search-row replace-row"><input ref={replaceInput} aria-label="替换内容" placeholder="替换为" value={replacement} onChange={event=>setReplacement(event.target.value)}/><button disabled={busy||status.readOnly||!status.total} onClick={()=>void replace(false)}>替换</button><button disabled={busy||status.readOnly||!status.total} onClick={()=>void replace(true)}>全部替换</button></div>}
    <div className="search-status"><span>{scope}{status.readOnly?' · 只读':''}</span><span role="status">{message}</span></div>
  </section>;
}
