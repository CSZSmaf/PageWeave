import {useEffect,useMemo,useRef,useState} from 'react';
import type {Editor} from '@tiptap/react';
import {ArrowDownToLine,ArrowUpRight,CheckCircle2,ChevronDown,FilePlus2,FileText,FolderOpen,Heading,Minus,Plus,Redo2,RefreshCw,Save,Search,Sigma,Undo2,X} from 'lucide-react';
import type {CompileResult,Engine,ProjectState,RecoveryInfo} from '../../core/types';
import type {RichNode,WritingBlock} from '../../core/writing';
import {canFlow,flowDocument,flowParts,paperLayout} from '../../core/flow';
import WritingPdf from './WritingPdf';
import FlowEditor from './FlowEditor';
import {LiveSession,type SaveStatus} from './LiveSession';
import WritingToolbar,{type RibbonTab} from './WritingToolbar';
import SourceEditor from '../Editor';
import {countWords,documentText} from '../../core/word-count';
import MathDialog from './MathDialog';
import FormulaList,{formulas,type FormulaEntry} from './FormulaList';
import type {MathRequest} from './RichEditor';
import SearchPanel,{type SearchRequest} from '../search/SearchPanel';
import type {SearchController} from '../search/SearchController';
import './writing.css';
import ReviewPanel,{ReviewTools} from './ReviewPanel';
import {selectedAnchor,reviewSnapshot,type CommentAnchor} from './Review';
import {REVIEW_FILE,reviewLocked} from '../../core/review';
import AiPanel from './AiPanel';
import DocumentMenu from './DocumentMenu';
import {documentFileName} from '../../core/file-name';
import brandIcon from '../../assets/pageweave.png';

const api=window.workbench;
const textOf=(node:RichNode):string=>node.text??(node.attrs?.latex?String(node.attrs.latex):(node.content??[]).map(textOf).join(''));
function syncSelection(e:Editor){
  // The browser may report selectionchange after a fast toolbar or shortcut action.
  const selection=window.getSelection();
  if(selection?.anchorNode&&selection.focusNode&&e.view.dom.contains(selection.anchorNode)&&e.view.dom.contains(selection.focusNode)){
    const from=e.view.posAtDOM(selection.anchorNode,selection.anchorOffset),to=e.view.posAtDOM(selection.focusNode,selection.focusOffset);
    if(from!==e.state.selection.anchor||to!==e.state.selection.head)e.commands.setTextSelection({from,to});
  }
}

export default function WritingApp(){
  const [recovery,setRecovery]=useState<RecoveryInfo|null>(null),[recovering,setRecovering]=useState(false),[saveStatus,setSaveStatus]=useState<SaveStatus>('saved');
  const [aiOpen,setAiOpen]=useState(false);
  const [openMenu,setOpenMenu]=useState(false);
  const [project,setProject]=useState<ProjectState|null>(null),[seed,setSeed]=useState<RichNode|null>(null),[preview,setPreview]=useState<CompileResult|null>(null),[last,setLast]=useState<CompileResult|null>(null);
  const [view,setView]=useState<'write'|'pdf'|'source'>('write'),[busy,setBusy]=useState(false),[pending,setPending]=useState(false),[pages,setPages]=useState(1),[pdfPages,setPdfPages]=useState(0),[zoom,setZoom]=useState(.95);
  const [navVisible,setNavVisible]=useState(false),[formulasVisible,setFormulasVisible]=useState(false),[math,setMath]=useState<MathRequest|null>(null),[exports,setExports]=useState(false),[saveMenu,setSaveMenu]=useState(false),[log,setLog]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(false),[,setTick]=useState(0);
  const [ribbonTab,setRibbonTab]=useState<RibbonTab>('home'),[sourceFile,setSourceFile]=useState('main.tex'),[bodyEpoch,setBodyEpoch]=useState(0),[wordDialog,setWordDialog]=useState(false),[switching,setSwitching]=useState(false);
  const [searchRequest,setSearchRequest]=useState<SearchRequest|null>(null),[writingSearch,setWritingSearch]=useState<SearchController|null>(null),[sourceSearch,setSourceSearch]=useState<SearchController|null>(null);
  const searchTarget=view==='source'?sourceSearch:view==='write'?writingSearch:null;
  const openSearch=(mode:'find'|'replace')=>{const text=document.activeElement?.closest('.search-panel')?'':searchTarget?.selectedText()??'';setSearchRequest({mode,nonce:Date.now(),seed:text.length<=200&&!/[\r\n\uFFFC]/.test(text)?text:''});};
  const currentView=useRef(view),sourceVersion=useRef(0),switchingView=useRef(false),previousContext=useRef('');currentView.current=view;
  const [layout,setLayout]=useState(false),[margin,setMargin]=useState(25),[paper,setPaper]=useState('a4paper'),[landscape,setLandscape]=useState(false);
  const [tableDialog,setTableDialog]=useState(false),[tableRows,setTableRows]=useState(3),[tableCols,setTableCols]=useState(3),[tableHeader,setTableHeader]=useState(true);
  const [reviewOpen,setReviewOpen]=useState(false),[reviewMode,setReviewMode]=useState<'comments'|'changes'>('comments'),[commentAnchor,setCommentAnchor]=useState<CommentAnchor|null>(null);
  const [commentFocus,setCommentFocus]=useState<{id:string;nonce:number}|null>(null);
  const imageInput=useRef<HTMLInputElement>(null);
  const session=useRef<LiveSession|null>(null),editor=useRef<Editor|null>(null);
  const automationHandler=useRef<(request:{id:string;action:string})=>Promise<void>>(async()=>{});
  const inputComposing=useRef(false);
  useEffect(()=>{const start=()=>{inputComposing.current=true;},end=()=>{inputComposing.current=false;};window.addEventListener('compositionstart',start,true);window.addEventListener('compositionend',end,true);return()=>{window.removeEventListener('compositionstart',start,true);window.removeEventListener('compositionend',end,true);};},[]);
  useEffect(()=>api.onAutomationRequest(request=>void automationHandler.current(request)),[]);
  const notify=(value:unknown,bad=false)=>{setMessage(String(value instanceof Error?value.message:value).replace(/^Error invoking remote method '[^']+': Error: /,''));setError(bad);};
  const run=async(fn:()=>Promise<unknown>)=>{try{await fn();}catch(error){notify(error,true);}};
  const tick=()=>setTick(n=>n+1);
  const newComment=()=>{const e=editor.current;if(!e||project?.reviewError)return;syncSelection(e);const anchor=selectedAnchor(e);if(!anchor){notify('请先选择需要批注的文字。');return;}setAiOpen(false);setCommentAnchor(anchor);setReviewMode('comments');setReviewOpen(true);setRibbonTab('review');};
  useEffect(()=>{const key=(event:KeyboardEvent)=>{if((event.target as Element)?.closest?.('.document-rename-dialog'))return;if((event.ctrlKey||event.metaKey)&&event.altKey&&!event.shiftKey&&event.key.toLowerCase()==='m'&&!event.isComposing&&view==='write'&&!math&&!wordDialog&&!layout&&!tableDialog){event.preventDefault();newComment();}};window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);});
  function load(next:ProjectState){
    if(next.recovery){session.current?.dispose();session.current=null;editor.current=null;setProject(null);setRecovery(next.recovery);setMessage('');setError(false);return;}
    setRecovery(null);setSaveStatus(next.files.some(file=>file.dirty)?'pending':'saved');
    session.current?.dispose();editor.current=null;setProject(next);setSeed(next.reviewDocument??flowDocument(next.writing));setPreview(null);setLast(null);setPending(false);setError(false);setMessage('');setView(canFlow(next)?'write':'pdf');setSourceFile(next.main);setRibbonTab('home');setSearchRequest(null);setCommentAnchor(null);setCommentFocus(null);setReviewOpen(!!next.reviewError);
    session.current=new LiveSession(next,api,{project:setProject,pending:setPending,busy:setBusy,saveStatus:setSaveStatus,error:e=>notify(e,true),preview:result=>{
      setLast(result);
      if(result.ok){setPreview(result);setError(false);}else{setLog(true);notify('排版未通过，请查看日志。',true);}
    }});
    session.current.resume();void run(()=>session.current!.build());
  }
  const init=async()=>{setMessage('');setError(false);if(!api)throw new Error('应用组件未能加载，请重新启动 PageWeave。');load((await api.initialize()).project);};
  useEffect(()=>{void run(init);return()=>session.current?.dispose();},[]);
  useEffect(()=>{if(message&&!error){const timer=setTimeout(()=>setMessage(''),4000);return()=>clearTimeout(timer);}},[message,error]);
  const capture=()=>{const e=editor.current;if(currentView.current!=='source'&&e&&!e.isDestroyed)session.current?.change(e.getJSON() as RichNode);};
  const save=()=>run(async()=>{capture();await session.current?.mutate(()=>api.save());notify('文稿已保存。');});
  const saveAs=()=>run(async()=>{if(switchingView.current||!session.current)return;const previous=session.current;switchingView.current=true;setSwitching(true);try{capture();await previous.idle();const next=await api.saveAs();if(next){load(next);notify('文稿已另存。');}}finally{if(session.current===previous)previous.resume();switchingView.current=false;setSwitching(false);}});
  useEffect(()=>{if(!saveMenu&&!exports&&!openMenu)return;const dismiss=(event:PointerEvent)=>{if(!(event.target as HTMLElement).closest('.export-wrap')){setSaveMenu(false);setExports(false);setOpenMenu(false);}};const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){setSaveMenu(false);setExports(false);setOpenMenu(false);}};window.addEventListener('pointerdown',dismiss);window.addEventListener('keydown',escape);return()=>{window.removeEventListener('pointerdown',dismiss);window.removeEventListener('keydown',escape);};},[saveMenu,exports,openMenu]);
  useEffect(()=>api.onCloseRequest(()=>void run(async()=>{const previous=session.current;capture();await previous?.idle();try{await api.finishClose();}finally{if(session.current===previous)previous?.resume();}})),[]);
  useEffect(()=>{const key=(event:KeyboardEvent)=>{if((event.target as Element)?.closest?.('.document-rename-dialog'))return;
    if(event.isComposing||!(event.ctrlKey||event.metaKey)||!event.shiftKey||event.altKey||event.key.toLowerCase()!=='s'||math||wordDialog||layout||tableDialog)return;
    event.preventDefault();event.stopPropagation();void saveAs();
  };window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);});
  useEffect(()=>{const key=(event:KeyboardEvent)=>{if((event.target as Element)?.closest?.('.document-rename-dialog'))return;
    if(event.key==='Escape'&&!event.isComposing&&searchRequest&&!math&&!wordDialog&&!layout&&!tableDialog){event.preventDefault();event.stopPropagation();setSearchRequest(null);searchTarget?.focus();return;}
    if(event.isComposing||!(event.ctrlKey||event.metaKey)||event.altKey||view==='pdf'||math||wordDialog||layout||tableDialog)return;
    if(['f','h'].includes(event.key.toLowerCase())){event.preventDefault();event.stopPropagation();openSearch(event.key.toLowerCase()==='h'?'replace':'find');}
  };window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);});
  useEffect(()=>{const key=(event:KeyboardEvent)=>{if((event.target as Element)?.closest?.('.document-rename-dialog'))return;
    if(!session.current||event.defaultPrevented||!(event.ctrlKey||event.metaKey))return;
    if(event.key.toLowerCase()==='s'){event.preventDefault();if(event.shiftKey)void saveAs();else void save();}
    if(currentView.current==='source')return;
    if(event.target instanceof HTMLInputElement||event.target instanceof HTMLTextAreaElement||event.target instanceof HTMLSelectElement)return;
    if(!editor.current?.isFocused&&['z','y'].includes(event.key.toLowerCase())&&!math){event.preventDefault();history(event.key.toLowerCase()==='y'||event.shiftKey?'redo':'undo');}
  };window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);});
  const history=(kind:'undo'|'redo')=>{setView('write');editor.current?.chain().focus()[kind]().run();tick();};
  const switchProject=(kind:'open'|'writingDemo'|'newDocument'|'reload',mode:'file'|'folder'='file')=>run(async()=>{if(switchingView.current||!session.current)return;const previous=session.current;switchingView.current=true;setSwitching(true);try{capture();await previous.idle();const next=await (kind==='open'?api.open(mode):api[kind]());if(next)load(next);}finally{if(session.current===previous)previous.resume();switchingView.current=false;setSwitching(false);}});
  const renameDocument=async(name:string)=>{if(switchingView.current||!session.current)throw new Error('请稍后重试。');const previous=session.current,main=previous.project.main;switchingView.current=true;setSwitching(true);try{capture();await previous.idle();await previous.mutate(p=>api.renameDocument(name,p.version));if(sourceFile===main)setSourceFile(previous.project.main);}finally{previous.resume();switchingView.current=false;setSwitching(false);}};
  automationHandler.current=async request=>{
    const previous=session.current,e=editor.current;
    if(!previous||switchingView.current||inputComposing.current||e?.view.composing||document.querySelector('.modal-backdrop')){await api.automationFinish(request.id,'编辑器正在切换文稿、输入或处理对话框，请稍后重试。');return;}
    switchingView.current=true;setSwitching(true);e?.setEditable(false,false);
    let failure:string|undefined,unlocked=false;
    const unlock=()=>{if(unlocked)return;unlocked=true;previous.resume();switchingView.current=false;setSwitching(false);if(e&&!e.isDestroyed)e.setEditable(!previous.project.reviewError,false);};
    try{
      capture();await previous.pause();
      if(request.action==='compile'){
        // Compilation uses an immutable snapshot. Continue typing while TeX runs.
        const result=api.automationExecute(request.id);unlock();await result;
      }else{
        let step:Awaited<ReturnType<typeof api.automationExecute>>|undefined;
        await previous.mutate(async()=>{step=await api.automationExecute(request.id);return step.project;});
        if(step&&step.refresh!=='none'){
          const next=previous.project,content=next.reviewDocument??flowDocument(next.writing);
          setSeed(content);sourceVersion.current=next.version;
          if(canFlow(next)){
            if(e&&!e.isDestroyed){e.commands.setContent(content,{emitUpdate:false});e.view.dispatch(e.state.tr.setMeta('paperLayout',true).setMeta('addToHistory',false));}
          }else if(currentView.current==='write'){currentView.current='source';setView('source');setSourceFile(next.main);}
        }
      }
    }catch(error){failure=String(error instanceof Error?error.message:error);}
    finally{unlock();await api.automationFinish(request.id,failure).catch(()=>{});}
  };
  const changeView=(next:'write'|'pdf'|'source')=>run(async()=>{
    if(switchingView.current||next===currentView.current)return;
    switchingView.current=true;setSwitching(true);
    try{
      capture();await session.current?.flush();const p=session.current!.project;
      if(next==='source')sourceVersion.current=p.version;
      else if(currentView.current==='source'&&sourceVersion.current!==p.version){editor.current=null;setSeed(p.reviewDocument??flowDocument(p.writing));setBodyEpoch(n=>n+1);}
      if(next==='write'&&!canFlow(p)){notify('这份源码包含未适配的结构，可继续编辑源码或查看 PDF。',true);return;}
      currentView.current=next;setView(next);setRibbonTab('home');if(next==='pdf')setSearchRequest(null);
    }finally{switchingView.current=false;setSwitching(false);}
  });
  const sourceHistory=(kind:'undo'|'redo')=>run(async()=>{if(reviewLocked(session.current?.project.reviewDocument))throw new Error('请返回审阅后撤销或重做。');await session.current?.mutate(p=>api[kind](p.version));});
  const openReview=async(mode:'comments'|'changes')=>{setAiOpen(false);if(currentView.current!=='write')await changeView('write');setRibbonTab('review');setReviewMode(mode);setReviewOpen(true);};
  const compileSource=()=>run(async()=>{await session.current?.flush();await session.current?.build();});
  const format=(operation:(e:Editor)=>void)=>{
    const e=editor.current;if(!e)return;setView('write');
    syncSelection(e);
    operation(e);e.commands.focus();tick();
  };
  const equation=(display:boolean)=>{const e=editor.current;if(!e)return;setMath({latex:'',display,commit:latex=>{setView('write');e.chain().focus().insertContent({type:display?'displayMath':'inlineMath',attrs:{latex}}).run();}});};
  const importImage=(file:File)=>run(async()=>{
    if(file.size>20*1024*1024)throw new Error('请选择 20 MB 以内的图片。');
    const bytes=new Uint8Array(await file.arrayBuffer());let image:Awaited<ReturnType<typeof api.importImage>>|undefined;
    await session.current?.mutate(async p=>{image=await api.importImage(bytes,p.version);return image.project;});
    if(image){const {src,naturalWidth,naturalHeight}=image;setView('write');editor.current?.chain().focus().insertContent([{type:'flowImage',attrs:{src,naturalWidth,naturalHeight,width:75,textAlign:'center'}},{type:'paragraph'}]).run();}
  });
  const begin=(id:string)=>{
    setView('write');const e=editor.current;if(!e)return;let found:number|undefined;
    e.state.doc.forEach((node,pos)=>{if(found===undefined&&node.attrs.sourceId===id)found=pos+(node.isTextblock?1:0);});
    if(found!==undefined)requestAnimationFrame(()=>e.chain().focus().setTextSelection(found!).scrollIntoView().run());
  };
  const liveBlocks=():WritingBlock[]=>{const p=session.current?.project,e=editor.current;if(!p)return [];if(!e)return p.writing;
    return flowParts(e.getJSON() as RichNode,p.writing[0]?.id??'start').map(part=>({...p.writing.find(b=>b.id===part.id)!,id:part.id,editable:true,content:part.content}));};
  const editFormula=(entry:FormulaEntry)=>{
    const e=editor.current;if(!e)return;
    const index=formulas(liveBlocks()).findIndex(f=>f.blockId===entry.blockId&&f.path.join('.')===entry.path.join('.'));
    const positions:number[]=[];e.state.doc.descendants((node,pos)=>{if(['inlineMath','displayMath'].includes(node.type.name))positions.push(pos);});
    const pos=positions[index],node=pos===undefined?undefined:e.state.doc.nodeAt(pos);if(!node)return;
    setFormulasVisible(false);setMath({latex:node.attrs.latex,display:node.type.name==='displayMath',commit:latex=>{
      const current=e.state.doc.nodeAt(pos);if(current?.type!==node.type||current.attrs.latex!==node.attrs.latex){notify('公式位置已变化，请重新选择。',true);return;}
      setView('write');e.chain().focus().command(({tr})=>{tr.setNodeMarkup(pos,undefined,{...current.attrs,latex});return true;}).run();
    }});
  };
  const openLayout=()=>{const p=session.current?.project;if(!p)return;const text=p.files.find(f=>f.path===p.main)?.content??'',options=/\\usepackage\[([^\]]*)\]\{geometry\}/.exec(text)?.[1]??'';
    setMargin(Number(/margin\s*=\s*([\d.]+)mm/.exec(options)?.[1]??25));setPaper(/\b(a4paper|a5paper|letterpaper)\b/.exec(options)?.[1]??/\\documentclass\[[^\]]*\b(a4paper|a5paper|letterpaper)\b/.exec(text)?.[1]??'a4paper');setLandscape(/\blandscape\b/.test(options));setLayout(true);};

  const e=editor.current,supported=useMemo(()=>!!project&&canFlow(project),[project]),enabled=!!e&&supported&&view!=='source'&&!switching&&!project?.reviewError;
  const sourceReviewLocked=reviewLocked(view==='source'?project?.reviewDocument:e?reviewSnapshot(e.state.doc).doc:null);
  const context=view==='source'?'':e?.isActive('flowImage')?'image':e?.isActive('table')?'table':'';
  useEffect(()=>{if(context!==previousContext.current){setRibbonTab(tab=>tab==='review'?tab:context as RibbonTab||'home');previousContext.current=context;}},[context]);
  const count=useMemo(()=>supported?countWords(documentText(view==='source'?flowDocument(project!.writing):e?.getJSON() as RichNode??seed??{type:'doc'})):null,[supported,view,project?.writing,e?.state.doc,seed]);
  const selectionCount=view==='write'&&e&&!e.state.selection.empty?countWords(documentText({type:'doc',content:e.state.doc.slice(e.state.selection.from,e.state.selection.to).content.toJSON()})).words:0;
  const documentName=documentFileName(project?.main??'');
  useEffect(()=>{document.title=project?documentName+' — PageWeave':'PageWeave';},[documentName,project?.id]);
  const activeSource=project?.files.find(f=>f.path===sourceFile);
  const selected=e?.state.selection.$from.parent.attrs.sourceId,dirty=pending||project?.files.some(f=>f.dirty);
  if(recovery)return <div className="modal-backdrop"><div className="modal recovery-dialog" role="dialog" aria-modal="true" aria-label="恢复文稿"><div className="modal-title"><h2>恢复未保存的文稿</h2></div><p>{recovery.name}</p><p>{new Date(recovery.savedAt).toLocaleString()}</p>{recovery.conflict&&<p>磁盘文件已更改，将恢复为独立副本。</p>}{error&&message&&<p className="formula-error" role="alert">{message}</p>}<div className="recovery-actions">{(['discard','restore'] as const).map(action=><button key={action} autoFocus={action==='restore'} disabled={recovering} className={action==='restore'?'primary-button':'outline-button'} onClick={()=>void run(async()=>{setRecovering(true);setMessage('');try{load(await api.resolveRecovery(recovery.id,action));if(action==='restore')notify('文稿已恢复。');}finally{setRecovering(false);}})}>{action==='discard'?'保留磁盘版本':recovering?'正在恢复…':recovery.conflict?'恢复副本':'恢复'}</button>)}</div></div></div>;
  if(!project)return <main className="startup-state" role={error?'alert':'status'}><h1>{error?'文稿未能打开':'正在打开文稿…'}</h1>{error&&<><p>{message}</p><button onClick={()=>location.reload()}>重新加载</button></>}</main>;
  return <div className="writer-shell" data-project-version={project?.version} data-preview-version={preview?.version} data-pending={pending} data-save-status={saveStatus}>
    <header className="writer-header">
      <div className="brand"><img className="brand-mark" src={brandIcon} alt=""/><span>PageWeave</span></div>
      <DocumentMenu name={documentName} path={project.root+'/'+project.main} dirty={!!dirty} disabled={switching} onRename={renameDocument} onSaveAs={()=>void saveAs()} onReveal={()=>void run(()=>api.reveal())}/>
      {view!=='source'&&<nav className="ribbon-tabs" role="tablist" aria-label="功能区">{([['home','开始'],['insert','插入'],['layout','布局'],['review','审阅'],...(context?[[context,context==='image'?'图片':'表格']]:[])] as [RibbonTab,string][]).map(([tab,label])=><button key={tab} role="tab" aria-selected={ribbonTab===tab} className={ribbonTab===tab?'on':''} onMouseDown={ev=>ev.preventDefault()} onClick={()=>tab==='review'?void openReview('changes'):setRibbonTab(tab)}>{label}</button>)}</nav>}
      <div className="writer-header-actions">
        <div className="export-wrap save-split"><button className="quiet-button" disabled={busy||switching} onClick={()=>void switchProject('open')}><FolderOpen size={15}/>打开</button><button className="quiet-button save-options" aria-label="更多打开选项" aria-expanded={openMenu} disabled={busy||switching} onClick={()=>{setSaveMenu(false);setExports(false);setOpenMenu(!openMenu);}}><ChevronDown size={12}/></button>{openMenu&&<div className="dropdown"><button onClick={()=>{setOpenMenu(false);void switchProject('open','file');}}>打开 .tex 文件</button><button onClick={()=>{setOpenMenu(false);void switchProject('open','folder');}}>打开工程文件夹</button></div>}</div><button className="quiet-button" disabled={busy||switching} onClick={()=>void switchProject('newDocument')}><FilePlus2 size={15}/>新建</button>
        <div className="export-wrap save-split"><button className="quiet-button" disabled={switching} onClick={()=>void save()}><Save size={15}/>保存</button><button className="quiet-button save-options" aria-label="更多保存选项" aria-expanded={saveMenu} onClick={()=>{setExports(false);setSaveMenu(!saveMenu);}}><ChevronDown size={12}/></button>{saveMenu&&<div className="dropdown"><button onClick={()=>{setSaveMenu(false);void saveAs();}}>另存为<span className="menu-shortcut">Ctrl+Shift+S</span></button></div>}</div>
        <div className="export-wrap"><button className="primary-button" onClick={()=>{setSaveMenu(false);setExports(!exports);}}><ArrowDownToLine size={15}/>导出<ChevronDown size={12}/></button>{exports&&<div className="dropdown">
          <button onClick={()=>{setExports(false);void run(async()=>{capture();const result=await session.current!.latest();const p=await api.exportPdf(result.token);if(p)notify('PDF 已导出：'+p);});}}>导出正式 PDF</button>
          <button onClick={()=>{setExports(false);void run(async()=>{capture();await session.current?.flush();const p=await api.exportProject();if(p)notify('LaTeX 工程已导出：'+p);});}}>导出 LaTeX 工程</button>
        </div>}</div>
      </div>
      <button className="ai-toggle" aria-label="AI 助手" aria-pressed={aiOpen} onClick={()=>{setAiOpen(!aiOpen);setReviewOpen(false);}}>AI</button><div className="writer-view-toggle" aria-label="文稿视图">{([['write','写作'],['pdf','PDF'],['source','源码']] as const).map(([name,label])=><button key={name} aria-pressed={view===name} className={view===name?'on':''} disabled={switching||(name==='write'&&!supported)} onClick={()=>void changeView(name)}>{label}</button>)}</div>
    </header>
    {view==='source'?<div className="writer-ribbon source-toolbar" role="toolbar" aria-label="源码编辑工具">
      <div className="tool-group"><button aria-label="源码撤销" title="撤销 · Ctrl+Z" disabled={!project?.canUndo&&!pending} onClick={()=>void sourceHistory('undo')}><Undo2 size={17}/></button><button aria-label="源码重做" title="重做 · Ctrl+Y" disabled={!project?.canRedo} onClick={()=>void sourceHistory('redo')}><Redo2 size={17}/></button></div>
      <div className="tool-group"><label>文件<select aria-label="源文件" value={sourceFile} onChange={event=>setSourceFile(event.target.value)}>{project?.files.filter(f=>f.path!==REVIEW_FILE&&f.path!=='pageweave-pages.tex').map(f=><option key={f.path} value={f.path}>{f.path}{f.dirty?' *':''}</option>)}</select></label></div>
      <div className="tool-group"><label>主文件<select aria-label="主文件" value={project?.main} onChange={event=>{const file=event.target.value;void run(()=>session.current!.mutate(p=>api.configure(file,p.engine)));}}>{project?.files.filter(f=>/\.tex$/i.test(f.path)&&f.path!=='pageweave-pages.tex').map(f=><option key={f.path}>{f.path}</option>)}</select></label><select aria-label="编译器" value={project?.engine} onChange={event=>{const engine=event.target.value as Engine;void run(()=>session.current!.mutate(p=>api.configure(p.main,engine)));}}><option value="xelatex">XeLaTeX</option><option value="pdflatex">pdfLaTeX</option><option value="lualatex">LuaLaTeX</option></select></div>
      <button disabled={busy} onClick={()=>void compileSource()}><RefreshCw size={16}/><span>重新排版</span></button><button onClick={()=>void run(()=>api.reveal())}><FolderOpen size={16}/><span>工程文件夹</span></button><button disabled={busy} onClick={()=>void switchProject('reload')}>重新读取</button><div className="ribbon-search"><button aria-label="查找与替换" title="查找 · Ctrl+F / 替换 · Ctrl+H" disabled={!sourceSearch} onClick={()=>openSearch('find')}><Search size={17}/><span>查找</span></button></div>
    </div>:<WritingToolbar editor={e} enabled={enabled} tab={ribbonTab} reviewTools={<ReviewTools editor={e} enabled={enabled&&view==='write'} onComment={newComment} onPanel={mode=>void openReview(mode)} onError={error=>notify(error,true)}/>}  format={format} history={history} onMath={equation} onImage={()=>imageInput.current?.click()} onTable={()=>setTableDialog(true)} onLayout={openLayout} onFormulas={()=>setFormulasVisible(true)} onOutline={()=>setNavVisible(!navVisible)} onSearch={()=>{if(view==='pdf')void changeView('write');openSearch('find');}}/>}
    {view==='source'&&sourceReviewLocked&&sourceFile===project?.main&&<div className="source-review-notice"><span>关闭修订并处理待审修改后，可编辑正文源码。</span><button onClick={()=>void openReview('changes')}>返回审阅</button></div>}
    <SearchPanel request={view==='pdf'?null:searchRequest} target={searchTarget} scope={view==='source'?sourceFile:'正文'} onMode={mode=>setSearchRequest(request=>request?{...request,mode}:null)} onClose={()=>setSearchRequest(null)}/>
    <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp" aria-label="图片文件" hidden onChange={ev=>{const file=ev.target.files?.[0];ev.target.value='';if(file)void importImage(file);}}/>
    <div className="writer-workspace">{navVisible&&view!=='source'&&<aside className="writer-navigation"><div className="writer-nav-title"><span>文档结构</span></div><div className="writer-block-list">{liveBlocks().map((b,i)=><button key={b.id} className={selected===b.id?'active':''} onClick={()=>begin(b.id)}><span className="block-symbol">{b.content.content?.[0]?.type==='heading'?<Heading size={14}/>:b.content.content?.[0]?.type==='displayMath'?<Sigma size={14}/>:String(i+1).padStart(2,'0')}</span><span>{textOf(b.content).slice(0,34)||'空白段落'}</span></button>)}</div><div className="writer-nav-bottom"><button onClick={()=>void switchProject('writingDemo')} disabled={busy}><FileText size={14}/>入门教程</button><button onClick={()=>void run(()=>api.reveal())}><FolderOpen size={14}/>打开工程文件夹<ArrowUpRight size={12}/></button></div></aside>}
      <main className="writer-main">
        {view==='source'&&<section className="source-workspace">{activeSource?.content!==null&&activeSource?.content!==undefined?<SourceEditor key={project?.id} file={sourceFile} text={session.current?.sourceText(sourceFile)??''} readOnly={!activeSource.editable||switching||(sourceReviewLocked&&sourceFile===project?.main)} onChange={text=>{session.current?.changeSource(sourceFile,text);tick();}} onCursor={()=>{}} onUndo={()=>void sourceHistory('undo')} onRedo={()=>void sourceHistory('redo')} onSave={()=>void save()} onCompile={()=>void compileSource()} onSearchReady={setSourceSearch} onSearchBoundary={async()=>{await session.current?.flush();}}/>:<div className="source-resource"><FileText size={34}/><span>{sourceFile}</span><button className="outline-button" onClick={()=>void run(()=>api.reveal())}>打开工程文件夹</button></div>}</section>}

        {supported&&seed&&project&&<div className="writer-view" hidden={view!=='write'}><FlowEditor key={project.id+':'+bodyEpoch} content={seed} layout={paperLayout(project)} zoom={zoom} readOnly={switching||!!project.reviewError} onReady={value=>{editor.current=value;tick();}} onChange={doc=>{if(currentView.current!=='source')session.current?.change(doc);tick();}} onSelection={tick} onComment={id=>{setReviewMode('comments');setReviewOpen(true);setCommentFocus({id,nonce:Date.now()});}} onPages={setPages} onPlan={plan=>{if(currentView.current!=='source')session.current?.changePlan(plan);}} onMath={setMath} onSearchReady={setWritingSearch}/></div>}
        {view==='pdf'&&<div className="writer-view">{project&&!supported&&<div className="flow-unavailable"><span>当前工程的正文需要在源码视图中编辑。</span><button className="outline-button" onClick={()=>void changeView('source')}>查看源码</button></div>}<WritingPdf result={preview} blocks={supported?project?.writing??[]:[]} active={null} selected={null} zoom={zoom} onSelect={()=>{}} onEdit={begin} onReady={()=>{}} onChange={()=>{}} onFinish={()=>{}} onMath={setMath} onError={msg=>notify(msg,true)} onPages={setPdfPages}/></div>}
        {log&&<div className="writer-log"><div><strong>排版日志</strong><button aria-label="关闭排版日志" onClick={()=>setLog(false)}><X size={16}/></button></div><pre>{last?.log??'尚无日志'}</pre></div>}
      </main>
      {aiOpen&&<AiPanel key={project.id} editor={view==='write'?e:null} onClose={()=>setAiOpen(false)}/>}
      {reviewOpen&&view==='write'&&<ReviewPanel key={project?.id} editor={e} mode={reviewMode} onMode={setReviewMode} anchor={commentAnchor} focus={commentFocus} onCancelDraft={()=>setCommentAnchor(null)} onClose={()=>{setReviewOpen(false);setCommentAnchor(null);}} error={project?.reviewError} onError={error=>notify(error,true)}/>}
    </div>
    <footer className="writer-status"><span>{last?.ok===false?'排版失败':busy?'正在排版…':pending?'正在同步…':preview?.version===project?.version?'排版已更新':'等待排版'}</span><span aria-label="保存状态" role="status">{saveStatus==='saving'?'正在保存…':saveStatus==='pending'?'待保存':saveStatus==='error'?'保存失败':'已保存'}</span><span>{view==='pdf'?pdfPages:pages} 页</span><button className="word-count" aria-label="字数统计" disabled={!count} title="中文按字，英文和数字按词；不含公式、图片及 LaTeX 命令" onClick={()=>setWordDialog(true)}>{count?selectionCount?`已选 ${selectionCount} / 共 ${count.words} 字`:`${count.words} 字`:'字数 —'}</button><button onClick={()=>setLog(!log)}>日志</button><span className="writer-status-spacer"/>{view==='source'?<span>{activeSource?.encoding??''}</span>:<><button aria-label="缩小页面" onClick={()=>setZoom(v=>Math.max(.5,v-.1))}><Minus size={14}/></button><span>{Math.round(zoom*100)}%</span><button aria-label="放大页面" onClick={()=>setZoom(v=>Math.min(1.6,v+.1))}><Plus size={14}/></button></>}</footer>
    {wordDialog&&count&&<div className="modal-backdrop"><div className="modal word-count-dialog"><div className="modal-title"><h2>字数统计</h2><button aria-label="关闭字数统计" onClick={()=>setWordDialog(false)}><X size={18}/></button></div><dl><div><dt>字数</dt><dd>{count.words}</dd></div><div><dt>字符数（不含空格）</dt><dd>{count.characters}</dd></div><div><dt>字符数（含空格）</dt><dd>{count.charactersWithSpaces}</dd></div>{selectionCount>0&&<div><dt>已选字数</dt><dd>{selectionCount}</dd></div>}</dl><p>中文按字，英文和数字按词；不计公式、图片及 LaTeX 命令。</p></div></div>}
    {message&&<div className={`toast ${error?'error':''}`} role="status"><CheckCircle2 size={16}/><span>{message}</span><button aria-label="关闭写作提示" onClick={()=>setMessage('')}><X size={15}/></button></div>}
    {math&&<MathDialog request={math} onClose={()=>setMath(null)}/>}
    {tableDialog&&<div className="modal-backdrop"><div className="modal"><div className="modal-title"><h2>插入表格</h2><button aria-label="关闭插入表格" onClick={()=>setTableDialog(false)}><X size={18}/></button></div><div className="table-size-fields"><label>行数<input aria-label="表格行数" type="number" min="1" max="50" value={tableRows} onChange={ev=>setTableRows(Number(ev.target.value))}/></label><label>列数<input aria-label="表格列数" type="number" min="1" max="12" value={tableCols} onChange={ev=>setTableCols(Number(ev.target.value))}/></label></div><label className="orientation-label"><input type="checkbox" checked={tableHeader} onChange={ev=>setTableHeader(ev.target.checked)}/>首行作为表头</label><button className="primary-button full" disabled={!Number.isInteger(tableRows)||tableRows<1||tableRows>50||!Number.isInteger(tableCols)||tableCols<1||tableCols>12} onClick={()=>{setTableDialog(false);format(e=>e.commands.insertTable({rows:tableRows,cols:tableCols,withHeaderRow:tableHeader}));}}>插入</button></div></div>}
    {formulasVisible&&<FormulaList items={formulas(liveBlocks())} onEdit={editFormula} onClose={()=>setFormulasVisible(false)}/>}
    {layout&&<div className="modal-backdrop"><div className="modal"><div className="modal-title"><h2>页面设置</h2><button className="icon-button" aria-label="关闭页面设置" onClick={()=>setLayout(false)}><X size={18}/></button></div><label className="field-label">纸张<select aria-label="纸张" value={paper} onChange={ev=>setPaper(ev.target.value)}><option value="a4paper">A4</option><option value="a5paper">A5</option><option value="letterpaper">Letter</option></select></label><label className="field-label">四周页边距（毫米）<input className="page-margin-input" aria-label="页边距" type="number" min="10" max="50" value={margin} onChange={ev=>setMargin(Number(ev.target.value))}/></label><label className="orientation-label"><input type="checkbox" checked={landscape} onChange={ev=>setLandscape(ev.target.checked)}/>横向页面</label><button className="primary-button full" onClick={()=>void run(async()=>{capture();await session.current?.mutate(p=>api.pageSettings(margin,paper,landscape,p.version));setLayout(false);})}>应用页面设置</button></div></div>}
  </div>;
}


