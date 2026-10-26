import {useEffect,useRef,useState} from 'react';
import type {Editor} from '@tiptap/react';
import {closeHistory} from '@tiptap/pm/history';
import {TextSelection} from '@tiptap/pm/state';
import type {ChainedCommands} from '@tiptap/core';
import {ArrowUp,Check,FilePenLine,MessageSquare,Plus,Settings2,SlidersHorizontal,Square,X} from 'lucide-react';
import {AI_DEFAULT,AI_PROVIDERS,formatDescription,type AiFormat,type AiStatus,type AiConfig,type AiMessage,type AiReply} from '../../core/ai';
import {syncTextSelection} from './selection';
import './ai.css';

const api=window.workbench;
type Anchor={doc:unknown;from:number;to:number;text:string};
function formatChain(chain:ChainedCommands,f:AiFormat){
  if(f.fontFamily)chain.setFontFamily(f.fontFamily);if(f.fontSize)chain.setFontSize(f.fontSize+'pt');if(f.color)chain.setColor(f.color);if(f.textAlign)chain.setTextAlign(f.textAlign);if(f.lineHeight)chain.updateAttributes('paragraph',{lineHeight:String(f.lineHeight)}).updateAttributes('heading',{lineHeight:String(f.lineHeight)});
}
type Suggestion={reply:AiReply;anchor:Anchor|null;inserted?:boolean;formatted?:boolean};
export default function AiPanel({editor,open,onClose}:{editor:Editor|null;open:boolean;onClose():void}){
  const [status,setStatus]=useState<AiStatus|null>(null),[config,setConfig]=useState<AiConfig>(AI_DEFAULT),[settings,setSettings]=useState(false),[key,setKey]=useState('');
  const [prompt,setPrompt]=useState(''),[context,setContext]=useState(false),[messages,setMessages]=useState<AiMessage[]>([]),[suggestion,setSuggestion]=useState<Suggestion|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[,tick]=useState(0);
  const active=useRef<string|null>(null),mounted=useRef(true),selection=useRef<Anchor|null>(null),conversation=useRef<HTMLDivElement>(null),input=useRef<HTMLTextAreaElement>(null);
  function rememberSelection(){
    if(!editor||editor.isDestroyed)return;syncTextSelection(editor.view);
    const {from,to}=editor.state.selection;
    selection.current={doc:editor.state.doc,from,to,text:editor.state.doc.textBetween(from,to,'\n')};tick(n=>n+1);
  }
  useEffect(()=>{mounted.current=true;void api.aiStatus().then(s=>{if(!mounted.current)return;setStatus(s);setConfig(s);setSettings(!s.hasKey||!s.model);}).catch(fail);return()=>{mounted.current=false;if(active.current)void api.aiCancel(active.current);};},[]);
  useEffect(()=>{
    if(!editor||!open)return;
    const update=()=>{const {from,to}=editor.state.selection;selection.current={doc:editor.state.doc,from,to,text:editor.state.doc.textBetween(from,to,'\n')};tick(n=>n+1);};
    update();editor.on('selectionUpdate',update);editor.on('update',update);
    return()=>{editor.off('selectionUpdate',update);editor.off('update',update);};
  },[editor,open]);
  useEffect(()=>{if(open)conversation.current?.scrollTo({top:conversation.current.scrollHeight});},[open,messages,busy,suggestion]);
  function fail(value:unknown){if(mounted.current)setError(String(value instanceof Error?value.message:value).replace(/^Error invoking remote method '[^']+': Error: /,''));}
  async function saveConfig(){
    if(saving)return;setSaving(true);setError('');
    try{const s=await api.aiConfigure(config,key||undefined);if(!mounted.current)return;setStatus(s);setConfig(s);setKey('');setSettings(false);setMessages([]);setSuggestion(null);}catch(e){fail(e);}finally{if(mounted.current)setSaving(false);}
  }
  async function send(){
    if(!prompt.trim()||active.current)return;setError('');
    const a=editor&&selection.current?.doc===editor.state.doc?selection.current:null;
    if(context&&!a?.text){setError('请先选择要附带的文字，或取消附带选项。');return;}
    const next=[...messages.slice(-36),{role:'user' as const,content:prompt.trim()}],id=crypto.randomUUID();
    active.current=id;setBusy(true);setSuggestion(null);setMessages(next);setPrompt('');
    try{
      const result=await api.aiRequest({id,mode:'assistant',messages:next,hasSelection:!!a?.text,...(context?{context:a!.text}:{})});
      if(!mounted.current)return;
      const history=[result.text,result.draft,result.format?formatDescription(result.format):''].filter(Boolean).join('\n\n');
      setMessages([...next,{role:'assistant',content:history}]);setSuggestion({reply:result,anchor:a});
    }catch(e){fail(e);if(mounted.current){setPrompt(next.at(-1)!.content);setMessages(next.slice(0,-1));}}
    finally{if(mounted.current)setBusy(false);active.current=null;}
  }
  function apply(kind:'insert'|'replace'|'append'|'format'){
    if(!editor||editor.isDestroyed||!editor.isEditable||!suggestion)return;setError('');
    try{
      const {reply,anchor:a}=suggestion;
      if(kind!=='append'&&(!a||editor.state.doc!==a.doc))throw new Error('文稿已变化，请重新生成建议，或将正文追加到文末。');
      if((kind==='replace'||kind==='format')&&(!a||a.from===a.to))throw new Error('请先选择需要修改的文字。');
      const chain=editor.chain().focus().command(({tr})=>{closeHistory(tr);return true;});
      if(kind==='format'){
        const f=reply.format;if(!f)return;chain.setTextSelection({from:a!.from,to:a!.to});
        formatChain(chain,f);
      }else{
        if(!reply.draft)return;
        const content=reply.draft.split(/\n\s*\n/).filter(Boolean).map(text=>({type:'paragraph',content:text.split('\n').flatMap((line,index)=>[...(index?[{type:'hardBreak'}]:[]),...(line?[{type:'text',text:line}]:[])])}));
        chain.insertContentAt(kind==='append'?editor.state.doc.content.size:kind==='replace'?{from:a!.from,to:a!.to}:a!.to,content);
        if(reply.format){const before=editor.state.doc;chain.command(({tr})=>{const from=before.content.findDiffStart(tr.doc.content),end=before.content.findDiffEnd(tr.doc.content);if(from===null||!end)return false;tr.setSelection(TextSelection.between(tr.doc.resolve(from),tr.doc.resolve(end.b)));return true;});formatChain(chain,reply.format);}
      }
      if(!chain.run())throw new Error('当前选区无法应用此建议。');editor.view.dispatch(closeHistory(editor.state.tr));
      setSuggestion({...suggestion,...(kind==='format'?{formatted:true}:{inserted:true,formatted:!!reply.format})});
    }catch(e){fail(e);}
  }
  const reply=suggestion?.reply,validAnchor=!!editor&&suggestion?.anchor?.doc===editor.state.doc,hasRange=validAnchor&&suggestion!.anchor!.from<suggestion!.anchor!.to,canEdit=!!editor?.isEditable;
  const selected=editor&&selection.current?.doc===editor.state.doc?selection.current.text:'',provider=AI_PROVIDERS.find(p=>p.id===status?.provider)?.name??'AI 服务';
  const destination=status?.baseUrl?new URL(status.baseUrl).host:'';
  return <aside className="ai-panel" aria-label="AI 助手" hidden={!open} onPointerDownCapture={rememberSelection}>
    <header><strong><MessageSquare size={17}/>AI 助手</strong><div>
      <button aria-label="新对话" title="新对话" disabled={busy||!messages.length} onClick={()=>{setMessages([]);setSuggestion(null);setError('');}}><Plus size={17}/></button>
      <button aria-label="AI 设置" title="AI 设置" aria-pressed={settings} disabled={busy||saving} onClick={()=>{setSettings(!settings);setError('');}}><Settings2 size={17}/></button>
      <button aria-label="关闭 AI" onClick={onClose}><X size={17}/></button>
    </div></header>
    {settings?<div className="ai-settings">
      <label>服务<select aria-label="AI 服务" disabled={saving} value={config.provider} onChange={e=>{const preset=AI_PROVIDERS.find(p=>p.id===e.target.value)!;setConfig({...config,provider:preset.id,baseUrl:preset.baseUrl,model:''});setKey('');}}>{AI_PROVIDERS.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label>API 地址<input aria-label="AI API 地址" disabled={saving} value={config.baseUrl} onChange={e=>setConfig({...config,baseUrl:e.target.value})} placeholder="https://…" spellCheck={false}/></label>
      <label>模型<input aria-label="AI 模型" disabled={saving} value={config.model} onChange={e=>setConfig({...config,model:e.target.value})} placeholder="模型名称" spellCheck={false}/></label>
      <label>API 密钥<input aria-label="AI API 密钥" disabled={saving} type="password" autoComplete="off" value={key} onChange={e=>setKey(e.target.value)} placeholder={status?.hasKey&&config.provider===status.provider&&config.baseUrl===status.baseUrl?'已配置；留空保留':'输入密钥'}/></label>
      <label className="ai-check"><input type="checkbox" disabled={saving} checked={config.rememberKey} onChange={e=>setConfig({...config,rememberKey:e.target.checked})}/>在本机记住密钥</label>
      {status&&!status.canRememberKey&&<p>系统密钥存储不可用，可取消记住密钥，仅在本次运行中使用。</p>}
      <button className="primary-button" disabled={saving} onClick={()=>void saveConfig()}>{saving?'正在保存…':'保存配置'}</button>
      {status?.hasKey&&<button className="outline-button" disabled={saving} onClick={()=>{setSaving(true);void api.aiConfigure(config,'').then(s=>{setStatus(s);setKey('');}).catch(fail).finally(()=>setSaving(false));}}>清除密钥</button>}
    </div>:<>
      <div className="ai-conversation" ref={conversation} aria-busy={busy}>
        {!messages.length&&!busy&&<div className="ai-empty"><div className="ai-empty-mark"><FilePenLine size={25}/></div><h3>从文稿开始</h3><div className="ai-suggestions">{[
          [FilePenLine,'起草一段摘要','起草一段摘要：'],[SlidersHorizontal,'设置所选段落','将所选文字设为 12 磅、1.5 倍行距。'],
        ].map(([Icon,label,value])=>{const I=Icon as typeof MessageSquare;return <button key={String(label)} onClick={()=>{setPrompt(String(value));input.current?.focus();}}><I size={16}/>{String(label)}</button>;})}</div></div>}
        {messages.map((m,i)=><div key={i} className={'ai-message '+m.role}><div>{i===messages.length-1&&reply?reply.text:m.content}</div></div>)}
        {busy&&<div className="ai-pending" role="status"><span/>正在生成…</div>}
        {reply?.draft&&<section className="ai-proposal" aria-label="正文建议"><header><FilePenLine size={15}/><strong>正文建议</strong>{suggestion?.inserted&&<span><Check size={14}/>已插入</span>}</header><div className="ai-draft">{reply.draft}</div><div className="ai-proposal-actions">
          <button className="primary-button" disabled={!canEdit||!validAnchor||suggestion?.inserted} onClick={()=>apply('insert')}>插入光标处</button><button className="outline-button" disabled={!canEdit||!hasRange||suggestion?.inserted} onClick={()=>apply('replace')}>替换选区</button><button disabled={!canEdit||suggestion?.inserted} onClick={()=>apply('append')}>追加文末</button>
        </div></section>}
        {reply?.format&&<section className="ai-proposal" aria-label="排版建议"><header><SlidersHorizontal size={15}/><strong>排版建议</strong>{suggestion?.formatted&&<span><Check size={14}/>已应用</span>}</header><p>{formatDescription(reply.format)}</p><div className="ai-proposal-actions">{reply.draft?<span>随正文一起应用</span>:<button className="primary-button" disabled={!canEdit||!hasRange||suggestion?.formatted} onClick={()=>apply('format')}>应用到选区</button>}</div></section>}
        {suggestion&&!validAnchor&&(reply?.draft||reply?.format)&&!suggestion.inserted&&!suggestion.formatted&&<p className="ai-stale" role="status">文稿已变化，原选区建议已停用。</p>}
      </div>
      <div className="ai-compose">
        <label className={'ai-context '+(context?'attached':'')} title={selected?'所选文字：'+selected.length+' 字符':'仅在勾选后发送所选文字'}><input type="checkbox" aria-label="附带选区" checked={context} disabled={busy} onChange={e=>setContext(e.target.checked)}/>附带选区{selected&&<span>{selected.length} 字符</span>}</label>
        <div className="ai-input-box"><textarea ref={input} aria-label="AI 提问" value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="讨论、写作或调整格式…" disabled={busy} onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'&&!e.nativeEvent.isComposing){e.preventDefault();void send();}}}/>
          <div className="ai-compose-actions"><button className="ai-destination" title={destination} onClick={()=>setSettings(true)} disabled={busy}>{provider}<span>{status?.model||'配置服务'}</span></button>{busy?<button className="ai-send" aria-label="停止生成" onClick={()=>active.current&&void api.aiCancel(active.current)}><Square size={14}/></button>:<button className="ai-send" aria-label="发送" title="发送 · Ctrl+Enter" disabled={!prompt.trim()||!status?.hasKey||!status.model} onClick={()=>void send()}><ArrowUp size={18}/></button>}</div>
        </div>
      </div>
    </>}{error&&<p className="ai-error" role="alert">{error}</p>}
  </aside>;
}
