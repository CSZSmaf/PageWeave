import {useEffect,useRef,useState} from 'react';
import {ExternalLink,FileText,LoaderCircle,Save,Trash2,X} from 'lucide-react';
import {SUBMISSION_TEMPLATES,defaultSubmission,templateDefinition,submissionCategory,managedAnonymity,type SubmissionConfig,type SubmissionId,type SavedSubmission} from '../../core/submission';
import type {CompileResult} from '../../core/types';
import PdfPreview from '../PdfPreview';
import './submission.css';
const api=window.workbench,noop=()=>{};
export default function SubmissionDialog({initial,mode:initialMode,canApply,onClose,onApply,onNew}:{initial:SubmissionConfig|null;mode:'new'|'apply';canApply:boolean;onClose():void;onApply(config:SubmissionConfig):Promise<void>;onNew(config:SubmissionConfig):Promise<boolean>}){
  const [config,setConfig]=useState(initial??defaultSubmission()),[mode,setMode]=useState(initialMode==='apply'&&!canApply?'new':initialMode),[saved,setSaved]=useState<SavedSubmission[]>([]),[presetName,setPresetName]=useState('');
  const [category,setCategory]=useState<'journal'|'conference'|'saved'>(submissionCategory(initial?.template??'springer')),[query,setQuery]=useState('');
  const matches=(text:string)=>text.toLowerCase().includes(query.trim().toLowerCase());
  const [error,setError]=useState(''),[working,setWorking]=useState(false),[result,setResult]=useState<CompileResult|null>(null),[autoPreview,setAutoPreview]=useState(false),[previewBusy,setPreviewBusy]=useState(false),[previewStale,setPreviewStale]=useState(false);
  const generation=useRef(0),queue=useRef(Promise.resolve()),definition=templateDefinition(config.template);
  const set=(patch:Partial<SubmissionConfig>)=>setConfig(old=>({...old,...patch}));
  const choose=(id:SubmissionId)=>setConfig(old=>({...old,...defaultSubmission(id),title:old.title,authors:old.authors,affiliation:old.affiliation,country:old.country,correspondingAuthor:old.correspondingAuthor,correspondingEmail:old.correspondingEmail,abstract:old.abstract,keywords:old.keywords,bibliography:old.bibliography,engine:old.engine}));
  const attempt=async(action:()=>Promise<void>)=>{setError('');setWorking(true);try{await action();}catch(e){setError(String(e instanceof Error?e.message:e).replace(/^Error invoking remote method '[^']+': Error: /,''));}finally{setWorking(false);}};
  useEffect(()=>{void api.submissionPresets().then(setSaved).catch(e=>setError(String(e)));},[]);
  useEffect(()=>{const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!working){event.stopPropagation();onClose();}};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);},[working,onClose]);
  useEffect(()=>{
    const id=++generation.current;setPreviewStale(true);if(!autoPreview)return;
    const timer=setTimeout(()=>{setPreviewBusy(true);queue.current=queue.current.catch(()=>{}).then(async()=>{
      if(id!==generation.current)return;
      try{const next=await api.previewSubmission(config,mode==='apply');if(id!==generation.current)return;if(next.ok){setResult(next);setError('');setPreviewStale(false);}else setError(next.diagnostics[0]?.message??'模板编译失败，请检查正文和模板信息。');}
      catch(e){if(id===generation.current)setError(String(e instanceof Error?e.message:e));}
      finally{if(id===generation.current)setPreviewBusy(false);}
    });},1000);
    return()=>{clearTimeout(timer);generation.current++;};
  },[config,mode,autoPreview]);
  return <div className="modal-backdrop"><section className="submission-dialog" role="dialog" aria-modal="true" aria-labelledby="submission-title">
    <header><div><h2 id="submission-title">投稿模板</h2><span>选用版式，继续写作</span></div><button className="icon-button" aria-label="关闭投稿模板" disabled={working} onClick={onClose}><X size={19}/></button></header>
    <div className="submission-workspace">
      <nav aria-label="模板列表"><input className="submission-search" aria-label="搜索投稿模板" placeholder="搜索模板" value={query} onChange={e=>setQuery(e.target.value)}/><div className="submission-categories" role="tablist" aria-label="模板分类">{([['journal','期刊'],['conference','会议'],['saved','我的']] as const).map(([id,label])=><button key={id} role="tab" aria-selected={category===id} onClick={()=>{setCategory(id);setQuery('');}}>{label}</button>)}</div>
        <div className="submission-template-list">{category!=='saved'&&SUBMISSION_TEMPLATES.filter(t=>(query.trim()||submissionCategory(t.id)===category)&&matches(t.name+' '+t.detail+' '+t.id)).map(t=><button key={t.id} className={config.template===t.id?'selected':''} onClick={()=>choose(t.id)}><strong>{t.name}</strong><span>{t.detail}</span></button>)}
          {category==='saved'&&<div className="submission-saved">{!saved.length&&<p>保存的版式会显示在这里。</p>}{saved.filter(item=>matches(item.name)).map(item=><div key={item.id}><button onClick={()=>setConfig(old=>({...old,...item.config,title:old.title,authors:old.authors,affiliation:old.affiliation,country:old.country,correspondingAuthor:old.correspondingAuthor,correspondingEmail:old.correspondingEmail,abstract:old.abstract,keywords:old.keywords,bibliography:old.bibliography}))}>{item.name}</button><button aria-label={'删除模板 '+item.name} onClick={()=>void attempt(async()=>setSaved(await api.removeSubmissionPreset(item.id)))}><Trash2 size={14}/></button></div>)}</div>}
        </div>
      </nav>
      <div className="submission-settings">
        <div className="submission-mode" role="group" aria-label="模板用途"><button aria-pressed={mode==='new'} onClick={()=>setMode('new')}>新建文稿</button><button aria-pressed={mode==='apply'} disabled={!canApply} onClick={()=>setMode('apply')}>当前文稿</button></div>
        <div className="submission-fields"><label>版式<select aria-label="模板版式" value={config.variant} onChange={e=>set({variant:e.target.value,anonymous:managedAnonymity(config.template)?e.target.value==='review':config.anonymous})}>{definition.variants.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><label>参考文献样式<select aria-label="参考文献样式" value={config.citation} onChange={e=>set({citation:e.target.value})}>{definition.citations.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label></div>
        <label>标题<input aria-label="论文标题" value={config.title} onChange={e=>set({title:e.target.value})} placeholder="Article title"/></label>
        <label>作者<textarea aria-label="作者" value={config.authors} onChange={e=>set({authors:e.target.value})} rows={2} disabled={config.anonymous} placeholder="每行一位作者"/></label>
        <label>单位<input aria-label="作者单位" value={config.affiliation} onChange={e=>set({affiliation:e.target.value})} disabled={config.anonymous}/></label>
        {config.template.startsWith('acm')&&<label>国家 / 地区<input aria-label="作者国家或地区" value={config.country} onChange={e=>set({country:e.target.value})} disabled={config.anonymous}/></label>}
        {config.template==='icml-2027'&&!config.anonymous&&<div className="submission-fields"><label>通讯作者<input aria-label="通讯作者" value={config.correspondingAuthor} onChange={e=>set({correspondingAuthor:e.target.value})}/></label><label>通讯邮箱<input type="email" aria-label="通讯邮箱" value={config.correspondingEmail} onChange={e=>set({correspondingEmail:e.target.value})}/></label></div>}
        <label className="submission-check"><input type="checkbox" checked={config.anonymous} disabled={managedAnonymity(config.template)} onChange={e=>set({anonymous:e.target.checked})}/>匿名作者信息</label>
        <label>摘要<textarea aria-label="摘要" rows={4} value={config.abstract} onChange={e=>set({abstract:e.target.value})}/></label>
        <label>关键词<input aria-label="关键词" value={config.keywords} onChange={e=>set({keywords:e.target.value})} placeholder="逗号分隔"/></label>
        <details><summary>编译与参考文献</summary><label>编译器<select aria-label="模板编译器" value={config.engine} onChange={e=>set({engine:e.target.value as 'pdflatex'|'xelatex'})}><option value="pdflatex">pdfLaTeX · 英文投稿</option><option value="xelatex">XeLaTeX · 中文与系统字体</option></select></label><label>参考文献文件<input aria-label="参考文献文件" value={config.bibliography} onChange={e=>set({bibliography:e.target.value})} placeholder="references.bib"/></label></details>
        <div className="submission-save"><input aria-label="保存模板名称" placeholder="保存版式为我的模板" value={presetName} onChange={e=>setPresetName(e.target.value)}/><button aria-label="保存模板" title="保存版式和编译选项" disabled={working||!presetName.trim()} onClick={()=>void attempt(async()=>{setSaved(await api.saveSubmissionPreset(presetName,config));setPresetName('');})}><Save size={17}/></button></div>
        <button className="submission-source" onClick={()=>void api.submissionWebsite(config.template)}><ExternalLink size={14}/>官方模板与投稿说明</button>
      </div>
      <div className="submission-preview"><div className="submission-preview-bar"><span>{previewBusy?'正在排版…':previewStale&&result?(autoPreview?'正在更新预览':'预览待更新'):'PDF 预览'}</span><button disabled={previewBusy} onClick={()=>setAutoPreview(value=>!value)}>{autoPreview?'暂停自动预览':'开启实时预览'}</button></div>{result?<PdfPreview result={result} selected={null} stale={true} zoom={1} onSelect={noop} onLocate={noop} onPages={noop} onError={setError}/>:<div className="submission-empty">{previewBusy?<LoaderCircle className="spin" size={28}/>:<FileText size={38}/>}<p>{previewBusy?'正在准备官方模板':'预览当前正文的投稿版式'}</p><span>首次使用时获取官方模板，此后可离线复用。</span></div>}</div>
    </div>
    <footer>{error?<p role="alert" className="submission-error">{error}</p>:<p>正文连续编辑，PDF 按投稿模板自动分栏与分页。</p>}<button className="primary-button" disabled={working} onClick={()=>void attempt(async()=>{if(mode==='apply'){await onApply(config);onClose();}else if(await onNew(config))onClose();})}>{working?<LoaderCircle className="spin" size={16}/>:null}{mode==='apply'?'应用到当前文稿':'创建文稿'}</button></footer>
  </section></div>;
}
