import {useEffect,useRef,useState} from 'react';
import type {Editor} from '@tiptap/react';
import {Settings2,X} from 'lucide-react';
import {AI_DEFAULT,AI_PROVIDERS,type AiStatus,type AiConfig,type AiMode,type AiMessage,type AiReply} from '../../core/ai';
import './ai.css';

const api=window.workbench;
export default function AiPanel({editor,onClose}:{editor:Editor|null;onClose():void}){
  const [status,setStatus]=useState<AiStatus|null>(null),[config,setConfig]=useState<AiConfig>(AI_DEFAULT),[settings,setSettings]=useState(false),[key,setKey]=useState('');
  const [mode,setMode]=useState<AiMode>('chat'),[prompt,setPrompt]=useState(''),[context,setContext]=useState(false),[messages,setMessages]=useState<AiMessage[]>([]),[reply,setReply]=useState<AiReply|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const active=useRef<string|null>(null),mounted=useRef(true),anchor=useRef<{doc:unknown;from:number;to:number}|null>(null);
  const selectionAnchor=useRef<{doc:unknown;from:number;to:number;text:string}|null>(null);
  function rememberNativeSelection(){
    if(!editor||editor.isDestroyed)return;const s=window.getSelection();
    if(s?.anchorNode&&s.focusNode&&editor.view.dom.contains(s.anchorNode)&&editor.view.dom.contains(s.focusNode)&&!s.isCollapsed){const a=editor.view.posAtDOM(s.anchorNode,s.anchorOffset),b=editor.view.posAtDOM(s.focusNode,s.focusOffset),from=Math.min(a,b),to=Math.max(a,b);selectionAnchor.current={doc:editor.state.doc,from,to,text:editor.state.doc.textBetween(from,to,'\n')};}
  }
  useEffect(()=>{
    if(!editor)return;const remember=()=>{const s=editor.state.selection;if(!s.empty)selectionAnchor.current={doc:editor.state.doc,from:s.from,to:s.to,text:editor.state.doc.textBetween(s.from,s.to,'\n')};};
    const changed=()=>{if(selectionAnchor.current?.doc!==editor.state.doc)selectionAnchor.current=null;};
    const dom=editor.view.dom;remember();editor.on('selectionUpdate',remember);editor.on('update',changed);dom.addEventListener('focusout',rememberNativeSelection);return()=>{editor.off('selectionUpdate',remember);editor.off('update',changed);dom.removeEventListener('focusout',rememberNativeSelection);};
  },[editor]);
  useEffect(()=>{mounted.current=true;void api.aiStatus().then(s=>{if(mounted.current){setStatus(s);setConfig(s);setSettings(!s.hasKey||!s.model);}}).catch(e=>setError(String(e)));return()=>{mounted.current=false;if(active.current)void api.aiCancel(active.current);};},[]);
  const fail=(e:unknown)=>setError(String(e instanceof Error?e.message:e).replace(/^Error invoking remote method '[^']+': Error: /,''));
  async function saveConfig(){setError('');try{const s=await api.aiConfigure(config,key||undefined);setStatus(s);setConfig(s);setKey('');setSettings(false);setMessages([]);setReply(null);}catch(e){fail(e);}}
  async function send(){
    if(!prompt.trim()||busy)return;setError('');setReply(null);
    const selection=selectionAnchor.current?.doc===editor?.state.doc?selectionAnchor.current:null,selected=selection?.text??'';
    if(mode==='format'&&!selected){setError('请先在文稿中选择要设置格式的文字。');return;}
    if(context&&!selected){setError('请先选择要附带的文字，或取消附带选项。');return;}
    anchor.current=selection;
    const next=[...(mode==='chat'?messages:[]),{role:'user' as const,content:prompt.trim()}],id=crypto.randomUUID();active.current=id;setBusy(true);
    try{const result=await api.aiRequest({id,mode,messages:next,...(context?{context:selected}:{})});if(!mounted.current)return;setReply(result);setMessages([...next,{role:'assistant',content:result.text}]);setPrompt('');}
    catch(e){if(mounted.current)fail(e);}finally{if(mounted.current)setBusy(false);active.current=null;}
  }
  function apply(){
    if(!editor||editor.isDestroyed||!reply)return;
    try{
      if(reply.format){const a=anchor.current;if(!a||editor.state.doc!==a.doc)throw new Error('文稿已变化，请重新选取范围后生成排版建议。');
        const f=reply.format,chain=editor.chain().focus().setTextSelection({from:a.from,to:a.to});
        if(f.fontFamily)chain.setFontFamily(f.fontFamily);if(f.fontSize)chain.setFontSize(f.fontSize+'pt');if(f.color)chain.setColor(f.color);if(f.textAlign)chain.setTextAlign(f.textAlign);if(f.lineHeight)chain.updateAttributes('paragraph',{lineHeight:String(f.lineHeight)}).updateAttributes('heading',{lineHeight:String(f.lineHeight)});chain.run();
      }else{const content=reply.text.split(/\n\s*\n/).filter(Boolean).map(text=>({type:'paragraph',content:[{type:'text',text}]}));editor.chain().focus().insertContentAt(editor.state.doc.content.size,content).run();}
      setReply(null);
    }catch(e){fail(e);}
  }
  return <aside className="ai-panel" aria-label="AI 助手" onPointerDownCapture={rememberNativeSelection}><header><strong>AI</strong><div><button aria-label="AI 设置" disabled={busy} onClick={()=>{setSettings(!settings);setError('');}}><Settings2 size={17}/></button><button aria-label="关闭 AI" onClick={onClose}><X size={17}/></button></div></header>
    {settings?<div className="ai-settings">
      <label>服务<select aria-label="AI 服务" value={config.provider} onChange={e=>{const preset=AI_PROVIDERS.find(p=>p.id===e.target.value)!;setConfig({...config,provider:preset.id,baseUrl:preset.baseUrl,model:''});setKey('');}}>{AI_PROVIDERS.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label>API 地址<input aria-label="AI API 地址" value={config.baseUrl} onChange={e=>setConfig({...config,baseUrl:e.target.value})} placeholder="https://…" spellCheck={false}/></label>
      <label>模型<input aria-label="AI 模型" value={config.model} onChange={e=>setConfig({...config,model:e.target.value})} placeholder="填写服务商提供的模型名称" spellCheck={false}/></label>
      <label>API 密钥<input aria-label="AI API 密钥" type="password" autoComplete="off" value={key} onChange={e=>setKey(e.target.value)} placeholder={status?.hasKey&&config.provider===status.provider&&config.baseUrl===status.baseUrl?'已配置；留空保留':'输入密钥'}/></label>
      <label className="ai-check"><input type="checkbox" checked={config.rememberKey} onChange={e=>setConfig({...config,rememberKey:e.target.checked})}/>在本机记住密钥</label>
      {status&&!status.canRememberKey&&<p>系统密钥存储不可用，可取消记住密钥，仅在本次运行中使用。</p>}
      <button className="primary-button" onClick={()=>void saveConfig()}>保存配置</button>
      {status?.hasKey&&<button className="outline-button" onClick={()=>void api.aiConfigure(config,'').then(s=>{setStatus(s);setKey('');}).catch(fail)}>清除密钥</button>}
    </div>:<>
      <div className="ai-mode" role="tablist" aria-label="AI 功能">{([['chat','对话'],['draft','写文稿'],['format','排版']] as const).map(([m,label])=><button role="tab" aria-selected={mode===m} key={m} disabled={busy} onClick={()=>{setMode(m);setMessages([]);setReply(null);setError('');}}>{label}</button>)}</div>
      <div className="ai-conversation" aria-live="polite">{messages.map((m,i)=><div key={i} className={'ai-message '+m.role}><span>{m.role==='user'?'提问':'AI'}</span><div>{m.content}</div></div>)}{busy&&<p role="status">正在生成…</p>}</div>
      {reply&&mode!=='chat'&&<button className="outline-button ai-apply" disabled={!editor||!editor.isEditable} onClick={apply}>{reply.format?'应用到所选文字':'插入文末'}</button>}
      <div className="ai-compose"><label className="ai-check"><input type="checkbox" checked={context} disabled={busy} onChange={e=>setContext(e.target.checked)}/>附带选中文字</label><textarea aria-label="AI 提问" value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder={mode==='format'?'描述所选文字的字体、字号或段落格式':'输入要求'} disabled={busy} onKeyDown={e=>{if(e.ctrlKey&&e.key==='Enter'){e.preventDefault();void send();}}}/><div><button className="outline-button" disabled={busy||!messages.length} onClick={()=>{setMessages([]);setReply(null);}}>清空对话</button>{busy?<button className="outline-button" onClick={()=>active.current&&void api.aiCancel(active.current)}>停止</button>:<button className="primary-button" disabled={!prompt.trim()||!status?.hasKey||!status.model} onClick={()=>void send()}>发送</button>}</div><p>发送至 {AI_PROVIDERS.find(p=>p.id===status?.provider)?.name??'所选服务'}{status?.baseUrl?' · '+new URL(status.baseUrl).host:''}</p></div>
    </>}{error&&<p className="ai-error" role="alert">{error}</p>}
  </aside>;
}
