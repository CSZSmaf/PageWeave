import {useEffect,useLayoutEffect,useMemo,useRef,useState,type RefObject} from 'react';
import {Search,X} from 'lucide-react';
import {destinationNumber} from './Navigation';

function useDialog(host:RefObject<HTMLDivElement|null>,onClose:()=>void){
  const close=useRef(onClose);close.current=onClose;
  useLayoutEffect(()=>{const previous=document.activeElement as HTMLElement|null;host.current?.querySelector<HTMLInputElement>('input')?.focus();return()=>{if(previous?.isConnected)previous.focus({preventScroll:true});};},[host]);
  useEffect(()=>{const key=(event:KeyboardEvent)=>{
    if(event.isComposing)return;
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close.current();}
    if(event.key==='Tab'){
      const elements=[...host.current!.querySelectorAll<HTMLElement>('input,button:not(:disabled),[tabindex="0"]')].filter(element=>element.tabIndex>=0&&!element.hidden),first=elements[0],last=elements.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }
  };const node=host.current;node?.addEventListener('keydown',key);return()=>node?.removeEventListener('keydown',key);},[host]);
}
export interface EditorCommand {id:string;label:string;shortcut?:string;keywords?:string;disabled?:boolean;run():void}
export function CommandPalette({commands,onClose}:{commands:EditorCommand[];onClose():void}){
  const host=useRef<HTMLDivElement>(null),[query,setQuery]=useState(''),[active,setActive]=useState(0);useDialog(host,onClose);
  const items=useMemo(()=>{const words=query.trim().toLocaleLowerCase().split(/\s+/);return commands.filter(command=>words.every(word=>(command.label+' '+(command.keywords??'')+' '+(command.shortcut??'')).toLocaleLowerCase().includes(word)));},[commands,query]);
  useEffect(()=>{setActive(0);},[query]);
  useEffect(()=>{host.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({block:'nearest'});},[active,query]);
  const execute=(command:EditorCommand)=>{if(command.disabled)return;onClose();requestAnimationFrame(()=>command.run());};
  return <div className="modal-backdrop quick-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}><div ref={host} className="modal command-palette" role="dialog" aria-modal="true" aria-label="命令面板">
    <div className="command-input"><Search size={18}/><input aria-label="搜索命令" role="combobox" aria-expanded="true" aria-controls="editor-commands" aria-activedescendant={items[active]?'command-'+items[active].id:undefined} placeholder="搜索命令" value={query} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{
      if(event.nativeEvent.isComposing)return;if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();setActive(value=>items.length?(value+(event.key==='ArrowDown'?1:-1)+items.length)%items.length:0);}else if(event.key==='Enter'){event.preventDefault();if(items[active])execute(items[active]);}
    }}/><button aria-label="关闭命令面板" onClick={onClose}><X size={18}/></button></div>
    <div id="editor-commands" className="command-list" role="listbox" aria-label="可用命令">{items.map((command,index)=><button key={command.id} id={'command-'+command.id} type="button" role="option" aria-selected={active===index} aria-disabled={command.disabled||undefined} tabIndex={-1} className={active===index?'active':''} onMouseDown={event=>event.preventDefault()} onMouseEnter={()=>setActive(index)} onClick={()=>execute(command)}><span>{command.label}</span>{command.shortcut&&<kbd>{command.shortcut}</kbd>}</button>)}{!items.length&&<p className="command-empty">没有匹配的命令</p>}</div>
  </div></div>;
}
export function GoToDialog({kind,max,onGo,onClose}:{kind:'page'|'line';max:number;onGo(number:number):void;onClose():void}){
  const host=useRef<HTMLDivElement>(null),[value,setValue]=useState(''),[error,setError]=useState(false);useDialog(host,onClose);
  const label=kind==='line'?'行号':'页码';
  return <div className="modal-backdrop quick-backdrop"><div ref={host} className="modal goto-dialog" role="dialog" aria-modal="true" aria-labelledby="goto-title"><div className="modal-title"><h2 id="goto-title">转到{kind==='line'?'源码行':'页面'}</h2><button aria-label="关闭跳转" onClick={onClose}><X size={18}/></button></div><form onSubmit={event=>{event.preventDefault();const number=destinationNumber(value,max);if(number===null){setError(true);return;}onClose();requestAnimationFrame(()=>onGo(number));}}><label htmlFor="goto-number">{label}（1–{max}）</label><input id="goto-number" aria-label={label} inputMode="numeric" autoComplete="off" value={value} aria-invalid={error} onChange={event=>{setValue(event.target.value);setError(false);}}/>{error&&<p className="goto-error" role="alert">请输入 1 至 {max} 的整数。</p>}<div className="quick-actions"><button type="button" className="outline-button" onClick={onClose}>取消</button><button type="submit" className="primary-button">跳转</button></div></form></div></div>;
}
