import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowLeftRight, ArrowUpRight, BookOpen, Check, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, Code2, FileCode2, FileImage, FileText, FolderOpen, Image as ImageIcon, Layers3, List, LoaderCircle, Maximize2, Minus, MoreHorizontal, Plus, Redo2, RefreshCw, Save, Settings2, Terminal, Undo2, X } from 'lucide-react';
import type { CompileResult, Engine, ImageObject, ProjectState, SemanticObject, ToolInfo } from '../core/types';
import Editor from './Editor';
import PdfPreview from './PdfPreview';

const api=window.workbench;
const units=[['\\linewidth','当前容器宽度'],['\\columnwidth','栏宽'],['\\textwidth','正文宽度'],['mm','毫米 mm'],['cm','厘米 cm'],['in','英寸 in'],['pt','点 pt'],['bp','大点 bp']];
const cleanError=(e:unknown)=>String(e instanceof Error?e.message:e).replace(/^Error invoking remote method '[^']+': Error: /,'');
export default function App(){
  const [project,setProject]=useState<ProjectState|null>(null),[tools,setTools]=useState<ToolInfo[]>([]),[file,setFile]=useState('main.tex'),[nav,setNav]=useState<'files'|'outline'|'images'>('files');
  const [selected,setSelected]=useState<string|null>(null),[location,setLocation]=useState<{line:number;nonce:number}>(),[mode,setMode]=useState<'split'|'pdf'|'source'>('split');
  const [preview,setPreview]=useState<CompileResult|null>(null),[lastBuild,setLastBuild]=useState<CompileResult|null>(null),[busy,setBusy]=useState(false),[auto,setAuto]=useState(true),[pages,setPages]=useState(0),[zoom,setZoom]=useState(1);
  const [logOpen,setLogOpen]=useState(false),[settings,setSettings]=useState(false),[help,setHelp]=useState(false),[exports,setExports]=useState(false),[message,setMessage]=useState<{text:string;error:boolean}|null>(null),[draftTick,setDraftTick]=useState(0);
  const current=useRef<ProjectState|null>(null),drafts=useRef(new Map<string,string>()),serial=useRef(Promise.resolve()),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),compileBusy=useRef(false),autoRef=useRef(auto),buildRef=useRef<()=>Promise<void>>(async()=>{});
  autoRef.current=auto;
  const notify=useCallback((text:string,error=false)=>setMessage({text,error}),[]);
  const accept=useCallback((next:ProjectState)=>{current.current=next;setProject(next);},[]);
  const queue=useCallback(<T,>(fn:()=>Promise<T>):Promise<T>=>{const next=serial.current.then(fn,fn);serial.current=next.then(()=>{},()=>{});return next;},[]);
  const flush=useCallback(async()=>{
    clearTimeout(timer.current);
    return queue(async()=>{
      for(const [path,text]of [...drafts.current]){
        const state=current.current;if(!state)break;
        if(state.files.find(f=>f.path===path)?.content!==text)accept(await api.source(path,text,state.version));
        if(drafts.current.get(path)===text)drafts.current.delete(path);
      }
      setDraftTick(n=>n+1);
    });
  },[accept,queue]);
  const run=useCallback(async(fn:()=>Promise<void>)=>{try{await fn();}catch(e){notify(cleanError(e),true);}},[notify]);
  const compile=useCallback(async()=>{
    if(compileBusy.current)return;
    compileBusy.current=true;setBusy(true);
    try{
      await flush();const result=await api.compile();
      if(result.projectId!==current.current?.id)return;
      setLastBuild(result);
      if(result.ok){setPreview(result);if(result.version===current.current.version)notify(`编译完成 · ${(result.durationMs/1000).toFixed(1)} 秒`);}
      else{setLogOpen(true);notify('编译未通过，已保留上次成功的成稿。请查看错误日志。',true);}
    }catch(e){notify(cleanError(e),true);}finally{compileBusy.current=false;setBusy(false);}
  },[flush,notify]);
  buildRef.current=compile;
  const schedule=()=>{clearTimeout(timer.current);timer.current=setTimeout(()=>{void run(async()=>{await flush();if(autoRef.current)await buildRef.current();});},1200);};
  useEffect(()=>{
    if(!api){notify('请通过桌面启动器打开PageWeave。浏览器页面不能直接读取本地工程。',true);return;}
    void api.initialize().then(({project,tools})=>{accept(project);setTools(tools);setFile(project.main);void buildRef.current();}).catch(e=>notify(cleanError(e),true));
    return api.onCloseRequest(()=>{void run(async()=>{await flush();await api.finishClose();});});
  },[]);
  // A source edit during a build makes the old PDF read-only, then requests a fresh snapshot.
  useEffect(()=>{if(!busy&&auto&&lastBuild&&project&&lastBuild.projectId===project.id&&lastBuild.version!==project.version){const id=setTimeout(()=>void compile(),800);return()=>clearTimeout(id);}},[busy,auto,project?.version,lastBuild?.version]);
  const performHistory=(kind:'undo'|'redo')=>void run(async()=>{await flush();await queue(async()=>accept(await api[kind](current.current!.version)));if(autoRef.current)await compile();});
  const save=()=>void run(async()=>{await flush();await queue(async()=>accept(await api.save()));notify('工程已保存。');});
  const switchProject=async(kind:'open'|'demo'|'reload')=>{await flush();const next=await api[kind]();if(next){drafts.current.clear();accept(next);setFile(next.main);setSelected(null);setPreview(null);setLastBuild(null);await compile();}};
  const selectObject=(object:SemanticObject)=>{setSelected(object.id);setFile(object.file);setLocation({line:object.line,nonce:Date.now()});};
  const selectedObject=project?.objects.find(o=>o.id===selected);
  const activeFile=project?.files.find(f=>f.path===file);
  const source=drafts.current.get(file)??activeFile?.content??'';
  const dirty=!!project?.files.some(f=>f.dirty)||drafts.current.size>0;
  const stale=!!preview&&(preview.projectId!==project?.id||preview.version!==project?.version||drafts.current.size>0);
  const images=project?.objects.filter((o):o is ImageObject=>o.kind==='image')??[];
  const selectedImage=selectedObject?.kind==='image'?selectedObject:null;
  const locate=(page:number,x:number,y:number)=>void run(async()=>{
    if(!preview||stale)return;const result=await api.locate(preview.token,page,x,y);if(!result)return;
    if(project?.files.some(f=>f.path===result.file&&f.content!==null)){setFile(result.file);setLocation({line:result.line,nonce:Date.now()});const obj=project.objects.find(o=>o.file===result.file&&o.line===result.line);setSelected(obj?.id??null);}
  });
  useEffect(()=>{
    const listener=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();void compile();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();save();}};
    window.addEventListener('keydown',listener);return()=>window.removeEventListener('keydown',listener);
  },[compile]);
  return <div className="app-shell">
    <header className="topbar"><div className="brand"><div className="brand-mark">墨</div><span>PageWeave<small>TeX Workbench</small></span></div>
      <div className="project-crumb"><FolderOpen size={15}/><span>{project?.name??'正在打开工程'}</span><ChevronRight size={13}/><strong>{project?.main??'…'}</strong><span className="local-badge">本地工程</span></div>
      <div className="top-actions"><button className="icon-button" aria-label="使用指南" title="使用指南" onClick={()=>setHelp(true)}><CircleHelp size={18}/></button><button className="quiet-button" onClick={()=>setSettings(true)}><Settings2 size={15}/>工程设置</button><div className="export-wrap"><button className="outline-button" onClick={()=>setExports(!exports)}><ArrowDownToLine size={15}/>导出<ChevronDown size={12}/></button>{exports&&<div className="dropdown"><button disabled={!preview} onClick={()=>{setExports(false);void run(async()=>{const dest=await api.exportPdf(preview!.token);if(dest)notify(`PDF 已导出到 ${dest}`);});}}>当前成稿 PDF{stale?'（旧版本）':''}</button><button onClick={()=>{setExports(false);void run(async()=>{await flush();const dest=await api.exportProject();if(dest)notify(`工程已导出到 ${dest}`);});}}>原生 LaTeX 工程</button></div>}</div></div>
    </header>
    <div className="workspace">
      <aside className="sidebar"><div className="sidebar-top"><span className="eyebrow">工作空间</span><button className="icon-button" title="打开工程" aria-label="打开工程" disabled={busy} onClick={()=>void run(()=>switchProject('open'))}><FolderOpen size={17}/></button></div>
        <div className="nav-tabs"><button className={nav==='files'?'active':''} onClick={()=>setNav('files')}><FileCode2 size={15}/>文件</button><button className={nav==='outline'?'active':''} onClick={()=>setNav('outline')}><List size={15}/>大纲</button><button className={nav==='images'?'active':''} onClick={()=>setNav('images')}><ImageIcon size={15}/>图片</button></div>
        <div className="navigation">
          {nav==='files'&&<><div className="tree-root"><ChevronDown size={13}/><FolderOpen size={14}/><span>{project?.name??'工程'}</span></div>{project?.files.map(f=><button className={`file-item ${file===f.path?'active':''}`} key={f.path} style={{paddingLeft:16+Math.min(f.path.split('/').length-1,3)*13}} title={f.path} onClick={()=>{setFile(f.path);setSelected(null);}}>{f.content!==null?<FileCode2 size={15}/>:<FileImage size={15}/>}<span>{f.path.split('/').at(-1)}</span>{(f.dirty||drafts.current.has(f.path))&&<i className="dirty-dot"/>}{f.path===project.main&&<span className="main-file">主</span>}</button>)}</>}
          {nav==='outline'&&<><div className="list-heading">章节结构 <span>{project?.objects.filter(o=>o.kind==='heading').length??0}</span></div>{project?.objects.filter(o=>o.kind==='heading').map(o=><button className={`outline-item ${selected===o.id?'active':''}`} key={o.id} onClick={()=>selectObject(o)}><span className="outline-mark">{o.kind==='heading'&&o.level>2?'Ⅱ':'Ⅰ'}</span><span>{o.kind==='heading'?o.title:''}<small>{o.file} : {o.line}</small></span></button>)}</>}
          {nav==='images'&&<><div className="list-heading">文档图片 <span>{images.length}</span></div>{images.map((o,i)=><button className={`image-item ${selected===o.id?'active':''}`} key={o.id} onClick={()=>selectObject(o)}><div className="image-index">{String(i+1).padStart(2,'0')}</div><span>{o.path.split('/').at(-1)}<small>{o.editable?o.width:'通过源码修改'}</small></span></button>)}{!images.length&&<p className="nav-empty">没有识别到直接调用的图片命令。</p>}</>}
        </div>
        <div className="sidebar-footer"><div className="project-note"><div className="note-icon"><BookOpen size={17}/></div><strong>工程文件</strong><p>编辑和保存 LaTeX 工程。</p></div><button className="sidebar-link" onClick={()=>void run(async()=>api.reveal())}><FolderOpen size={15}/>在文件夹中显示<ArrowUpRight size={13}/></button><button className="sidebar-link" disabled={busy} onClick={()=>void run(()=>switchProject('demo'))}><Layers3 size={15}/>打开示例工程</button></div>
      </aside>
      <main className="main-workspace">
        <div className="work-toolbar"><div className="view-tabs"><button className={mode==='split'?'active':''} onClick={()=>setMode('split')}><ArrowLeftRight size={14}/>源码与成稿</button><button className={mode==='pdf'?'active':''} onClick={()=>setMode('pdf')}>成稿</button><button className={mode==='source'?'active':''} onClick={()=>setMode('source')}>源码</button></div><div className="edit-actions"><button className="icon-button" aria-label="撤销" title={`撤销 ${project?.undoLabel??''} · Ctrl+Z`} disabled={!project?.canUndo&&!drafts.current.size} onClick={()=>performHistory('undo')}><Undo2 size={17}/></button><button className="icon-button" aria-label="重做" title="重做 · Ctrl+Shift+Z" disabled={!project?.canRedo} onClick={()=>performHistory('redo')}><Redo2 size={17}/></button><span className="divider"/><button className="icon-button" aria-label="保存工程" title="保存工程 · Ctrl+S" onClick={save}><Save size={17}/></button><button className={`compile-button ${busy?'working':''}`} disabled={busy||!project} onClick={()=>void compile()}>{busy?<LoaderCircle size={15} className="spin"/>:<RefreshCw size={15}/>}<span>{busy?'正在编译':'编译'}</span></button></div></div>
        <div className={`edit-panes ${mode}`}>
          {mode!=='pdf'&&<section className="source-pane"><div className="pane-header"><span><FileCode2 size={14}/>{file}</span><span className="muted">{dirty?'有未保存修改':'已保存'}<i className={`state-dot ${dirty?'amber':''}`}/></span></div>{activeFile?.content!==null&&activeFile?.content!==undefined?<Editor file={file} text={source} readOnly={!activeFile.editable} location={location} onChange={text=>{drafts.current.set(file,text);setDraftTick(n=>n+1);schedule();}} onCursor={line=>{const object=current.current?.objects.find(o=>o.kind==='image'&&o.file===file&&o.line===line);if(object)setSelected(object.id);}} onUndo={()=>performHistory('undo')} onRedo={()=>performHistory('redo')} onSave={save} onCompile={()=>void compile()}/>:<div className="source-empty"><FileImage size={36}/><h3>工程资源</h3><p>{file}</p><small>此资源将随工程一起编译和导出。</small></div>}<div className="source-footer"><span>{activeFile?.encoding??'binary'}</span><span>{source.includes('\r\n')?'CRLF':'LF'}</span><span>{activeFile?.content!==null?`${source.split('\n').length} 行`:'资源文件'}</span></div></section>}
          {mode!=='source'&&<section className="preview-pane"><div className="pane-header"><span><FileText size={14}/>成稿预览{preview&&<span className="mini-badge">PDF</span>}</span><div className="zoom-control"><button aria-label="缩小预览" onClick={()=>setZoom(z=>Math.max(.5,z-.1))}><Minus size={13}/></button><button className="zoom-value" onClick={()=>setZoom(1)} title="适合页面宽度">{Math.round(zoom*100)}%</button><button aria-label="放大预览" onClick={()=>setZoom(z=>Math.min(2,z+.1))}><Plus size={13}/></button></div></div>{stale&&<div className="stale-banner"><RefreshCw size={13}/>源码已更新。编译后可继续点选页面对象。</div>}<PdfPreview result={preview} selected={selected} stale={stale} zoom={zoom} onSelect={id=>{const obj=project?.objects.find(o=>o.id===id);if(obj)selectObject(obj);}} onLocate={locate} onPages={setPages} onError={e=>notify(e,true)}/><div className="preview-footer"><span>{preview?`${pages} 页 · ${project?.engine==='xelatex'?'XeLaTeX':project?.engine}`:'等待首次编译'}</span><span>{preview?`快照 v${preview.version}`:'真实 LaTeX 排版'}</span></div></section>}
        </div>
        {logOpen&&<section className="log-panel"><div className="log-header"><span><Terminal size={14}/>编译日志 {lastBuild&&(lastBuild.ok?<b className="success-text">成功</b>:<b className="error-text">失败</b>)}</span><button className="icon-button" aria-label="关闭日志" onClick={()=>setLogOpen(false)}><X size={15}/></button></div>{lastBuild?.diagnostics.map((d,i)=><button className="diagnostic" key={i} onClick={()=>{if(d.file&&project?.files.some(f=>f.path===d.file)){setFile(d.file);setLocation({line:d.line??1,nonce:Date.now()});}}}>{d.file}{d.line?`:${d.line}`:''} {d.message}</button>)}<pre>{lastBuild?.log??'编译日志将在此处显示。'}</pre></section>}
      </main>
      <aside className="inspector"><div className="inspector-title"><Settings2 size={16}/><strong>对象属性</strong><span>当前对象</span></div>{selectedImage?<ImageInspector key={`${selectedImage.id}:${selectedImage.width}`} image={selectedImage} onApply={(value,unit)=>void run(async()=>{await flush();await queue(async()=>accept(await api.width(selectedImage.id,value,unit,current.current!.version)));if(autoRef.current)await compile();})} onSource={()=>{setMode('split');setLocation({line:selectedImage.line,nonce:Date.now()});}}/>:<div className="inspector-empty"><div className="selection-illustration"><ImageIcon size={31}/><i/><i/><i/><i/></div><h3>从页面中选择一个对象</h3><p>点击成稿中的图片，<br/>在这里调整它的宽度。</p><div className="tip-line"><span>01</span><p>编译 LaTeX 工程</p></div><div className="tip-line"><span>02</span><p>点选图片或左侧图片列表</p></div><div className="tip-line"><span>03</span><p>修改宽度，查看正式排版</p></div>{images.length>0&&<button className="outline-button full" onClick={()=>{setNav('images');selectObject(images[0]);}}><ImageIcon size={14}/>选择第一张图片</button>}</div>}<div className="inspector-bottom"><CheckCircle2 size={15}/><p>属性修改精确回写源码<br/><span>支持统一撤销与重做</span></p></div></aside>
    </div>
    <footer className="statusbar"><span className="status-left"><i className={`state-dot ${lastBuild&&!lastBuild.ok?'red':''}`}/>{busy?'正在生成正式成稿…':lastBuild?.ok?`编译成功 · ${(lastBuild.durationMs/1000).toFixed(1)}s`:lastBuild?'编译失败':'准备就绪'}{stale&&<span className="status-stale">预览待更新</span>}</span><button className={logOpen?'active':''} onClick={()=>setLogOpen(!logOpen)}><Terminal size={13}/>日志</button><div className="status-right"><label className="auto-switch"><input type="checkbox" checked={auto} onChange={e=>setAuto(e.target.checked)}/><span className="switch-track"/>自动编译</label><span>本地运行</span><span>v0.1.0</span></div></footer>
    {message&&<div className={`toast ${message.error?'error':''}`} role="status">{message.error?<Terminal size={16}/>:<CheckCircle2 size={16}/>}<span>{message.text}</span><button aria-label="关闭提示" onClick={()=>setMessage(null)}><X size={14}/></button></div>}
    {settings&&<div className="modal-backdrop" onClick={()=>setSettings(false)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-title"><h2>工程设置</h2><button className="icon-button" aria-label="关闭设置" onClick={()=>setSettings(false)}><X size={19}/></button></div><p className="modal-description">选择入口文件与本机的 TeX 编译器。</p><label className="field-label">入口文件<select value={project?.main} onChange={e=>void run(async()=>{await flush();accept(await api.configure(e.target.value,current.current!.engine));})}>{project?.files.filter(f=>f.path.endsWith('.tex')).map(f=><option key={f.path}>{f.path}</option>)}</select></label><label className="field-label">编译器<select value={project?.engine} onChange={e=>void run(async()=>{await flush();accept(await api.configure(current.current!.main,e.target.value as Engine));})}><option value="xelatex">XeLaTeX · 推荐中文工程</option><option value="pdflatex">pdfLaTeX</option><option value="lualatex">LuaLaTeX</option></select></label><div className="environment-list">{tools.map(t=><div key={t.name}><span>{t.name}</span><span className={t.available?'success-text':'error-text'}>{t.available?'已就绪':'未找到'}</span></div>)}</div><p className="settings-note">编译使用独立快照；默认不运行 shell escape 和项目 latexmkrc。需要自定义构建脚本的工程暂不支持。</p><button className="outline-button full" disabled={busy} onClick={()=>{setSettings(false);void run(()=>switchProject('reload'));}}><RefreshCw size={15}/>重新读取磁盘工程</button><button className="primary-button full" onClick={()=>{setSettings(false);void compile();}}>完成并编译</button></div></div>}
    {help&&<div className="modal-backdrop" onClick={()=>setHelp(false)}><div className="modal help-modal" onClick={e=>e.stopPropagation()}><div className="modal-title"><h2>开始使用PageWeave</h2><button className="icon-button" aria-label="关闭指南" onClick={()=>setHelp(false)}><X size={19}/></button></div><p>打开包含 <code>.tex</code> 文件的目录，在工程设置中选择入口。首次启动会打开一份可编辑的示例副本。</p><ol><li>编辑源码，或点选成稿中的图片。</li><li>在属性面板修改宽度，点击「应用宽度」。</li><li>等待真实编译，检查页面上的变化。</li><li>保存工程，或导出 PDF 与原生工程。</li></ol><div className="shortcut-list"><span>保存</span><kbd>Ctrl S</kbd><span>编译</span><kbd>Ctrl Enter</kbd><span>撤销 / 重做</span><kbd>Ctrl Z / Ctrl Shift Z</kbd><span>查找源码</span><kbd>Ctrl F</kbd></div><p className="settings-note">在源码视图中编辑 LaTeX，在 PDF 视图中检查排版。</p><button className="primary-button full" onClick={()=>setHelp(false)}>开始写作</button></div></div>}
  </div>;
}

function ImageInspector({image,onApply,onSource}:{image:ImageObject;onApply(value:number,unit:string):void;onSource():void}){
  const [unit,setUnit]=useState(image.unit??'\\linewidth'),[value,setValue]=useState(String((image.coefficient??.6)*(image.unit?.startsWith('\\')?100:1)));
  const relative=unit.startsWith('\\'),n=Number(value),valid=Number.isFinite(n)&&n>0&&n<=(relative?200:1000);
  return <div className="image-inspector"><div className="selected-type"><span className="object-icon"><ImageIcon size={20}/></span><div><strong>图片</strong><small>{image.path.split('/').at(-1)}</small></div><span className="object-number">FIG</span></div><div className="inspector-section"><h4>尺寸与布局</h4><label className="field-label">参考单位<select value={unit} disabled={!image.editable} onChange={e=>{setUnit(e.target.value);setValue(e.target.value.startsWith('\\')?'80':'80');}}>{units.map(([v,label])=><option value={v} key={v}>{label}</option>)}</select></label><label className="field-label">图片宽度<div className="number-field"><input aria-label="图片宽度" type="number" min="0.1" max={relative?200:1000} step={relative?1:.1} value={value} disabled={!image.editable} onChange={e=>setValue(e.target.value)}/><span>{relative?'%':unit}</span></div></label>{relative&&<><input className="width-slider" aria-label="宽度滑块" type="range" min="10" max="100" step="1" value={Math.min(100,n||10)} disabled={!image.editable} onChange={e=>setValue(e.target.value)}/><div className="range-labels"><span>10%</span><span>100%</span></div><div className="presets">{[50,60,75,80,100].map(v=><button disabled={!image.editable} className={n===v?'active':''} key={v} onClick={()=>setValue(String(v))}>{v}%</button>)}</div></>}
      <button className="primary-button full" disabled={!image.editable||!valid} onClick={()=>onApply(relative?n/100:n,unit)}><Check size={15}/>应用宽度</button>{!valid&&<p className="error-text">请输入有效的正数宽度。</p>}{!image.editable&&<p className="unsupported-note">{image.reason}</p>}<div className="scope-label"><Layers3 size={13}/><span>作用范围：当前图片调用</span></div></div>
      <div className="inspector-section"><h4>源码映射</h4><div className="code-preview"><code>width={valid?String(Number((relative?n/100:n).toFixed(5)))+unit:image.width}</code></div><button className="source-location" onClick={onSource}><FileCode2 size={14}/><span>{image.file} : {image.line}</span><ArrowUpRight size={14}/></button></div>
      <div className="inspector-section"><h4>图片信息</h4><label className="metadata-label">图题</label><p className="caption-text">{image.caption||'未识别到图题'}</p><label className="metadata-label">标签</label><code className="label-value">{image.label||'未设置'}</code><label className="metadata-label">资源路径</label><p className="resource-path">{image.path}</p></div>
  </div>;
}
