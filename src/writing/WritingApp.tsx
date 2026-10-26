import {useEffect,useMemo,useRef,useState,type CSSProperties} from 'react';
import type {Editor} from '@tiptap/react';
import {ArrowDownToLine,ArrowUpRight,CheckCircle2,ChevronDown,FilePlus2,FileText,FolderOpen,Minus,Plus,Redo2,RefreshCw,Save,Search,Undo2,X} from 'lucide-react';
import type {CompileResult,Engine,ProjectState,RecoveryInfo,RecentDocument} from '../../core/types';
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
import './quick-tools.css';
import {CommandPalette,GoToDialog,type EditorCommand} from './QuickTools';
import {documentOutline} from './Navigation';
import {captureTextFormat,paintTextFormat,type TextFormat} from './FormatPainter';
import ReviewPanel,{ReviewTools} from './ReviewPanel';
import {selectedAnchor,reviewSnapshot,type CommentAnchor} from './Review';
import {REVIEW_FILE,reviewLocked} from '../../core/review';
import AiPanel from './AiPanel';
import DocumentMenu from './DocumentMenu';
import {documentFileName} from '../../core/file-name';
import brandIcon from '../../assets/pageweave.png';

const api=window.workbench;
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
  const [recent,setRecent]=useState<RecentDocument[]>([]),[palette,setPalette]=useState(false),[goTo,setGoTo]=useState(false);
  const [sourceLocation,setSourceLocation]=useState<{file:string;line:number;nonce:number}>(),[sourceLine,setSourceLine]=useState(1);
  const [formatArmed,setFormatArmed]=useState(false),formatClipboard=useRef<TextFormat|null>(null);
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
  useEffect(()=>{const key=(event:KeyboardEvent)=>{if(event.isComposing||inputComposing.current||document.querySelector('.modal-backdrop'))return;if((event.ctrlKey||event.metaKey)&&event.altKey&&!event.shiftKey&&event.key.toLowerCase()==='m'&&!event.isComposing&&view==='write'&&!math&&!wordDialog&&!layout&&!tableDialog){event.preventDefault();newComment();}};window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);});
  function load(next:ProjectState){
    setFormatArmed(false);formatClipboard.current=null;setSourceLocation(undefined);setSourceLine(1);setPages(1);setPdfPages(0);
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
  useEffect(()=>{if(!openMenu)return;let active=true;void api.recentDocuments().then(items=>{if(active)setRecent(items);}).catch(error=>{if(active)notify(error,true);});return()=>{active=false;};},[openMenu]);
  useEffect(()=>{if(message&&!error){const timer=setTimeout(()=>setMessage(''),4000);return()=>clearTimeout(timer);}},[message,error]);
  const capture=()=>{const e=editor.current;if(currentView.current!=='source'&&e&&!e.isDestroyed)session.current?.change(e.getJSON() as RichNode);};
  const save=()=>run(async()=>{capture();await session.current?.mutate(()=>api.save());notify('文稿已保存。');});
  const saveAs=()=>run(async()=>{if(switchingView.current||!session.current)return;const previous=session.current;switchingView.current=true;setSwitching(true);try{capture();await previous.idle();const next=await api.saveAs();if(next){load(next);notify('文稿已另存。');}}finally{if(session.current===previous)previous.resume();switchingView.current=false;setSwitching(false);}});
  useEffect(()=>{if(!saveMenu&&!exports&&!openMenu)return;const dismiss=(event:PointerEvent)=>{if(!(event.target as HTMLElement).closest('.export-wrap')){setSaveMenu(false);setExports(false);setOpenMenu(false);}};const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){setSaveMenu(false);setExports(false);setOpenMenu(false);}};window.addEventListener('pointerdown',dismiss);window.addEventListener('keydown',escape);return()=>{window.removeEventListener('pointerdown',dismiss);window.removeEventListener('keydown',escape);};},[saveMenu,exports,openMenu]);
  useEffect(()=>api.onCloseRequest(()=>void run(async()=>{const previous=session.current;capture();await previous?.idle();try{await api.finishClose();}finally{if(session.current===previous)previous?.resume();}})),[]);
  useEffect(()=>{const key=(event:KeyboardEvent)=>{if(event.isComposing||inputComposing.current||document.querySelector('.modal-backdrop'))return;
    if(event.isComposing||!(event.ctrlKey||event.metaKey)||!event.shiftKey||event.altKey||event.key.toLowerCase()!=='s'||math||wordDialog||layout||tableDialog)return;
    event.preventDefault();event.stopPropagation();void saveAs();
  };window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);});
  useEffect(()=>{const key=(event:KeyboardEvent)=>{if(event.isComposing||inputComposing.current||document.querySelector('.modal-backdrop'))return;
    if(event.key==='Escape'&&!event.isComposing&&searchRequest&&!math&&!wordDialog&&!layout&&!tableDialog){event.preventDefault();event.stopPropagation();setSearchRequest(null);searchTarget?.focus();return;}
    if(event.isComposing||!(event.ctrlKey||event.metaKey)||event.altKey||view==='pdf'||math||wordDialog||layout||tableDialog)return;
    if(['f','h'].includes(event.key.toLowerCase())){event.preventDefault();event.stopPropagation();openSearch(event.key.toLowerCase()==='h'?'replace':'find');}
  };window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);});
  useEffect(()=>{const key=(event:KeyboardEvent)=>{if(event.isComposing||inputComposing.current||document.querySelector('.modal-backdrop'))return;
    if(!session.current||event.defaultPrevented||!(event.ctrlKey||event.metaKey))return;
    if(event.key.toLowerCase()==='s'){event.preventDefault();if(event.shiftKey)void saveAs();else void save();}
    if(currentView.current==='source')return;
    if(event.target instanceof HTMLInputElement||event.target instanceof HTMLTextAreaElement||event.target instanceof HTMLSelectElement)return;
    if(!editor.current?.isFocused&&['z','y'].includes(event.key.toLowerCase())&&!math){event.preventDefault();history(event.key.toLowerCase()==='y'||event.shiftKey?'redo':'undo');}
  };window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);});
  const history=(kind:'undo'|'redo')=>{setView('write');editor.current?.chain().focus()[kind]().run();tick();};
  const switchProject=(kind:'open'|'openRecent'|'writingDemo'|'newDocument'|'reload',mode:'file'|'folder'='file',id?:string)=>run(async()=>{if(switchingView.current||!session.current)return;const previous=session.current;switchingView.current=true;setSwitching(true);try{capture();await previous.idle();const next=await (kind==='open'?api.open(mode):kind==='openRecent'?api.openRecent(id!):api[kind]());if(next)load(next);}finally{if(session.current===previous)previous.resume();switchingView.current=false;setSwitching(false);}});
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
    setFormatArmed(false);
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

  const copyFormat=()=>{const e=editor.current;if(!e||view!=='write'||switching||project?.reviewError)return;syncSelection(e);formatClipboard.current=captureTextFormat(e);};
  const pasteFormat=()=>{const e=editor.current;if(!e||view!=='write'||switching||project?.reviewError||formatClipboard.current===null)return;syncSelection(e);if(e.state.selection.empty){notify('请先选择要应用格式的文字。');return;}const tr=paintTextFormat(e.state,formatClipboard.current);if(tr)e.view.dispatch(tr);setFormatArmed(false);e.commands.focus();tick();};
  const startPainter=()=>{if(formatArmed){setFormatArmed(false);return;}copyFormat();if(formatClipboard.current!==null){setFormatArmed(true);editor.current?.commands.focus();}};
  useEffect(()=>{if(!formatArmed)return;const apply=(event:MouseEvent)=>{if((event.target as HTMLElement).closest('.flow-editor'))requestAnimationFrame(()=>{if(editor.current&&!editor.current.state.selection.empty&&!inputComposing.current)pasteFormat();});};window.addEventListener('mouseup',apply);return()=>window.removeEventListener('mouseup',apply);});
  const exportDocument=(kind:'pdf'|'project')=>run(async()=>{setExports(false);capture();let destination:string|null;if(kind==='pdf'){const result=await session.current!.latest();destination=await api.exportPdf(result.token);}else{await session.current?.flush();destination=await api.exportProject();}if(destination)notify(kind==='pdf'?'PDF 已导出。':'LaTeX 工程已导出。');});
  const jumpTo=(number:number)=>{
    if(view==='source'){setSourceLocation({file:sourceFile,line:number,nonce:Date.now()});setSourceLine(number);return;}
    const page=document.querySelector<HTMLElement>(`${view==='pdf'?'.writing-page-wrap':'.flow-sheet'}[data-page="${number}"]`);if(!page)return;
    page.scrollIntoView({block:'start'});
    if(view==='write'&&editor.current&&project){const e=editor.current,rect=page.getBoundingClientRect(),margin=paperLayout(project).margin*zoom;const hit=e.view.posAtCoords({left:rect.left+margin+8,top:rect.top+margin+12});if(hit)e.commands.setTextSelection(hit.pos);e.commands.focus(undefined,{scrollIntoView:false});}
  };
  const jumpHeading=(position:number)=>{void run(async()=>{if(view!=='write')await changeView('write');requestAnimationFrame(()=>{const e=editor.current;if(!e)return;e.chain().focus().setTextSelection(position).run();const node=e.view.nodeDOM(position-1);if(node instanceof HTMLElement)node.scrollIntoView({block:'start'});});});};

  const e=editor.current,supported=useMemo(()=>!!project&&canFlow(project),[project]),enabled=!!e&&supported&&view!=='source'&&!switching&&!project?.reviewError;
  const outline=useMemo(()=>e?documentOutline(e.state.doc):[],[e?.state.doc]);
  const activeHeading=outline.filter(item=>item.position<=(e?.state.selection.from??0)).at(-1)?.position;
  const destinationMax=view==='source'?(session.current?.sourceText(sourceFile)??'').split(/\r?\n/).length:view==='pdf'?pdfPages:pages;
  const commands:EditorCommand[]=[
    {id:'open',label:'打开文稿',shortcut:'Ctrl+O',keywords:'open file tex',run:()=>void switchProject('open')},
    {id:'new',label:'新建文稿',shortcut:'Ctrl+N',keywords:'new',run:()=>void switchProject('newDocument')},
    {id:'recent',label:'最近打开',keywords:'recent',run:()=>{setSaveMenu(false);setExports(false);setOpenMenu(true);}},
    {id:'save',label:'保存',shortcut:'Ctrl+S',keywords:'save',run:()=>void save()},
    {id:'save-as',label:'另存为',shortcut:'Ctrl+Shift+S',keywords:'save as',run:()=>void saveAs()},
    {id:'find',label:'查找',shortcut:'Ctrl+F',keywords:'find search',disabled:!searchTarget,run:()=>openSearch('find')},
    {id:'replace',label:'替换',shortcut:'Ctrl+H',keywords:'replace',disabled:!searchTarget,run:()=>openSearch('replace')},
    {id:'goto',label:view==='source'?'转到源码行':'转到页面',shortcut:'Ctrl+G',keywords:'go to page line',disabled:!destinationMax,run:()=>setGoTo(true)},
    {id:'outline',label:navVisible?'关闭文档大纲':'显示文档大纲',keywords:'outline heading',disabled:!supported||view==='source',run:()=>setNavVisible(!navVisible)},
    {id:'painter',label:'格式刷',keywords:'format painter',disabled:!enabled||view!=='write',run:startPainter},
    {id:'copy-format',label:'复制文字格式',shortcut:'Ctrl+Alt+C',keywords:'copy format',disabled:!enabled||view!=='write',run:()=>{copyFormat();notify('文字格式已复制。');}},
    {id:'paste-format',label:'粘贴文字格式',shortcut:'Ctrl+Alt+V',keywords:'paste format',disabled:!enabled||view!=='write'||formatClipboard.current===null,run:pasteFormat},
    {id:'image',label:'插入图片',keywords:'insert image',disabled:!enabled||view!=='write'||e?.isActive('table')||e?.isActive('listItem'),run:()=>imageInput.current?.click()},
    {id:'table',label:'插入表格',keywords:'insert table',disabled:!enabled||view!=='write'||e?.isActive('table')||e?.isActive('listItem'),run:()=>setTableDialog(true)},
    {id:'formula',label:'插入行内公式',keywords:'insert math equation',disabled:!enabled||view!=='write',run:()=>equation(false)},
    {id:'layout',label:'页面设置',keywords:'layout margins',disabled:!enabled,run:openLayout},
    {id:'comment',label:'新建批注',shortcut:'Ctrl+Alt+M',keywords:'comment',disabled:!enabled||view!=='write',run:newComment},
    {id:'review',label:'审阅修订',keywords:'review',disabled:!supported,run:()=>void openReview('changes')},
    {id:'write',label:'切换到写作',keywords:'write',disabled:!supported,run:()=>void changeView('write')},
    {id:'pdf',label:'切换到 PDF',run:()=>void changeView('pdf')},
    {id:'source',label:'切换到源码',keywords:'source tex',run:()=>void changeView('source')},
    {id:'export-pdf',label:'导出 PDF',run:()=>void exportDocument('pdf')},
    {id:'export-project',label:'导出 LaTeX 工程',run:()=>void exportDocument('project')},
    {id:'compile',label:'重新排版',keywords:'compile build',disabled:busy,run:()=>void compileSource()},
    {id:'words',label:'字数统计',keywords:'word count',disabled:!supported,run:()=>setWordDialog(true)},
    {id:'folder',label:'打开工程文件夹',keywords:'folder',run:()=>void run(()=>api.reveal())},
  ];
  useEffect(()=>{const key=(event:KeyboardEvent)=>{
    if(event.defaultPrevented||event.isComposing||inputComposing.current||switching||!project||document.querySelector('.modal-backdrop'))return;
    const mod=event.ctrlKey||event.metaKey,key=event.key.toLowerCase();
    if(key==='escape'&&formatArmed){event.preventDefault();setFormatArmed(false);return;}
    if((mod&&event.shiftKey&&!event.altKey&&key==='p')||key==='f1'){event.preventDefault();event.stopPropagation();setPalette(true);return;}
    if(!mod)return;
    if(event.altKey&&!event.shiftKey&&view==='write'&&editor.current?.view.dom.contains(event.target as Node)&&['c','v'].includes(key)){event.preventDefault();event.stopPropagation();if(key==='c'){copyFormat();notify('文字格式已复制。');}else pasteFormat();return;}
    if(event.altKey||event.shiftKey)return;
    if(['o','n','g'].includes(key)){event.preventDefault();event.stopPropagation();if(key==='g'){if(destinationMax)setGoTo(true);}else void switchProject(key==='o'?'open':'newDocument');}
  };window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);});
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
  return <div className={`writer-shell ${formatArmed?'format-painting':''}`} data-project-version={project?.version} data-preview-version={preview?.version} data-pending={pending} data-save-status={saveStatus}>
    <header className="writer-header">
      <div className="brand"><img className="brand-mark" src={brandIcon} alt=""/><span>PageWeave</span></div>
      <DocumentMenu name={documentName} path={project.root+'/'+project.main} dirty={!!dirty} disabled={switching} onRename={renameDocument} onSaveAs={()=>void saveAs()} onReveal={()=>void run(()=>api.reveal())}/>
      {view!=='source'&&<nav className="ribbon-tabs" role="tablist" aria-label="功能区">{([['home','开始'],['insert','插入'],['layout','布局'],['review','审阅'],...(context?[[context,context==='image'?'图片':'表格']]:[])] as [RibbonTab,string][]).map(([tab,label])=><button key={tab} role="tab" aria-selected={ribbonTab===tab} className={ribbonTab===tab?'on':''} onMouseDown={ev=>ev.preventDefault()} onClick={()=>tab==='review'?void openReview('changes'):setRibbonTab(tab)}>{label}</button>)}</nav>}
      <div className="writer-header-actions">
        <div className="export-wrap save-split"><button className="quiet-button" disabled={busy||switching} onClick={()=>void switchProject('open')}><FolderOpen size={15}/>打开</button><button className="quiet-button save-options" aria-label="更多打开选项" aria-expanded={openMenu} disabled={busy||switching} onClick={()=>{setSaveMenu(false);setExports(false);setOpenMenu(!openMenu);}}><ChevronDown size={12}/></button>{openMenu&&<div className="dropdown recent-dropdown"><button onClick={()=>{setOpenMenu(false);void switchProject('open','file');}}>打开 .tex 文件<span className="menu-shortcut">Ctrl+O</span></button><button onClick={()=>{setOpenMenu(false);void switchProject('open','folder');}}>打开工程文件夹</button><div className="recent-heading">最近打开</div>{recent.map(item=><button className="recent-entry" key={item.id} title={item.root+'/'+item.main} onClick={()=>{setOpenMenu(false);void switchProject('openRecent','file',item.id);}}><span>{documentFileName(item.main)}</span><span className="recent-parent">{item.root}</span></button>)}{!recent.length&&<p className="recent-empty">暂无记录</p>}{!!recent.length&&<button className="recent-clear" onClick={()=>void run(async()=>{await api.clearRecent();setRecent([]);})}>清空最近记录</button>}</div>}</div><button className="quiet-button" disabled={busy||switching} onClick={()=>void switchProject('newDocument')}><FilePlus2 size={15}/>新建</button>
        <div className="export-wrap save-split"><button className="quiet-button" disabled={switching} onClick={()=>void save()}><Save size={15}/>保存</button><button className="quiet-button save-options" aria-label="更多保存选项" aria-expanded={saveMenu} onClick={()=>{setExports(false);setSaveMenu(!saveMenu);}}><ChevronDown size={12}/></button>{saveMenu&&<div className="dropdown"><button onClick={()=>{setSaveMenu(false);void saveAs();}}>另存为<span className="menu-shortcut">Ctrl+Shift+S</span></button></div>}</div>
        <div className="export-wrap"><button className="primary-button" onClick={()=>{setSaveMenu(false);setExports(!exports);}}><ArrowDownToLine size={15}/>导出<ChevronDown size={12}/></button>{exports&&<div className="dropdown">
          <button onClick={()=>void exportDocument('pdf')}>导出正式 PDF</button>
          <button onClick={()=>void exportDocument('project')}>导出 LaTeX 工程</button>
        </div>}</div>
      </div>
      <button className="ai-toggle" aria-label="AI 助手" aria-pressed={aiOpen} onClick={()=>{setAiOpen(!aiOpen);setReviewOpen(false);}}>AI</button><div className="writer-view-toggle" aria-label="文稿视图">{([['write','写作'],['pdf','PDF'],['source','源码']] as const).map(([name,label])=><button key={name} aria-pressed={view===name} className={view===name?'on':''} disabled={switching||(name==='write'&&!supported)} onClick={()=>void changeView(name)}>{label}</button>)}</div>
    </header>
    {view==='source'?<div className="writer-ribbon source-toolbar" role="toolbar" aria-label="源码编辑工具">
      <div className="tool-group"><button aria-label="源码撤销" title="撤销 · Ctrl+Z" disabled={!project?.canUndo&&!pending} onClick={()=>void sourceHistory('undo')}><Undo2 size={17}/></button><button aria-label="源码重做" title="重做 · Ctrl+Y" disabled={!project?.canRedo} onClick={()=>void sourceHistory('redo')}><Redo2 size={17}/></button></div>
      <div className="tool-group"><label>文件<select aria-label="源文件" value={sourceFile} onChange={event=>setSourceFile(event.target.value)}>{project?.files.filter(f=>f.path!==REVIEW_FILE&&f.path!=='pageweave-pages.tex').map(f=><option key={f.path} value={f.path}>{f.path}{f.dirty?' *':''}</option>)}</select></label></div>
      <div className="tool-group"><label>主文件<select aria-label="主文件" value={project?.main} onChange={event=>{const file=event.target.value;void run(()=>session.current!.mutate(p=>api.configure(file,p.engine)));}}>{project?.files.filter(f=>/\.tex$/i.test(f.path)&&f.path!=='pageweave-pages.tex').map(f=><option key={f.path}>{f.path}</option>)}</select></label><select aria-label="编译器" value={project?.engine} onChange={event=>{const engine=event.target.value as Engine;void run(()=>session.current!.mutate(p=>api.configure(p.main,engine)));}}><option value="xelatex">XeLaTeX</option><option value="pdflatex">pdfLaTeX</option><option value="lualatex">LuaLaTeX</option></select></div>
      <button disabled={busy} onClick={()=>void compileSource()}><RefreshCw size={16}/><span>重新排版</span></button><button onClick={()=>void run(()=>api.reveal())}><FolderOpen size={16}/><span>工程文件夹</span></button><button disabled={busy} onClick={()=>void switchProject('reload')}>重新读取</button><div className="ribbon-search"><button aria-label="查找与替换" title="查找 · Ctrl+F / 替换 · Ctrl+H" disabled={!sourceSearch} onClick={()=>openSearch('find')}><Search size={17}/><span>查找</span></button></div>
    </div>:<WritingToolbar editor={e} enabled={enabled} painterArmed={formatArmed} onPainter={startPainter} painterEnabled={enabled&&view==='write'} tab={ribbonTab} reviewTools={<ReviewTools editor={e} enabled={enabled&&view==='write'} onComment={newComment} onPanel={mode=>void openReview(mode)} onError={error=>notify(error,true)}/>}  format={format} history={history} onMath={equation} onImage={()=>imageInput.current?.click()} onTable={()=>setTableDialog(true)} onLayout={openLayout} onFormulas={()=>setFormulasVisible(true)} onOutline={()=>setNavVisible(!navVisible)} onSearch={()=>{if(view==='pdf')void changeView('write');openSearch('find');}}/>}
    {view==='source'&&sourceReviewLocked&&sourceFile===project?.main&&<div className="source-review-notice"><span>关闭修订并处理待审修改后，可编辑正文源码。</span><button onClick={()=>void openReview('changes')}>返回审阅</button></div>}
    <SearchPanel request={view==='pdf'?null:searchRequest} target={searchTarget} scope={view==='source'?sourceFile:'正文'} onMode={mode=>setSearchRequest(request=>request?{...request,mode}:null)} onClose={()=>setSearchRequest(null)}/>
    <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp" aria-label="图片文件" hidden onChange={ev=>{const file=ev.target.files?.[0];ev.target.value='';if(file)void importImage(file);}}/>
    <div className="writer-workspace">{navVisible&&view!=='source'&&<aside className="writer-navigation" aria-label="文档大纲"><div className="writer-nav-title"><span>文档大纲</span><button aria-label="关闭文档大纲" onClick={()=>setNavVisible(false)}><X size={15}/></button></div><div className="writer-block-list">{outline.map(heading=><button key={heading.position} className={`outline-heading ${activeHeading===heading.position?'active':''}`} style={{'--outline-level':heading.level-1} as CSSProperties} title={heading.title} aria-current={activeHeading===heading.position?'location':undefined} onClick={()=>jumpHeading(heading.position)}><span>{heading.title}</span></button>)}{!outline.length&&<p className="outline-empty">设置标题样式后，标题会显示在这里。</p>}</div><div className="writer-nav-bottom"><button onClick={()=>void switchProject('writingDemo')} disabled={busy}><FileText size={14}/>入门教程</button><button onClick={()=>void run(()=>api.reveal())}><FolderOpen size={14}/>打开工程文件夹<ArrowUpRight size={12}/></button></div></aside>}
      <main className="writer-main">
        {view==='source'&&<section className="source-workspace">{activeSource?.content!==null&&activeSource?.content!==undefined?<SourceEditor key={project?.id} file={sourceFile} text={session.current?.sourceText(sourceFile)??''} readOnly={!activeSource.editable||switching||(sourceReviewLocked&&sourceFile===project?.main)} onChange={text=>{session.current?.changeSource(sourceFile,text);tick();}} location={sourceLocation?.file===sourceFile?sourceLocation:undefined} onCursor={setSourceLine} onUndo={()=>void sourceHistory('undo')} onRedo={()=>void sourceHistory('redo')} onSave={()=>void save()} onCompile={()=>void compileSource()} onSearchReady={setSourceSearch} onSearchBoundary={async()=>{await session.current?.flush();}}/>:<div className="source-resource"><FileText size={34}/><span>{sourceFile}</span><button className="outline-button" onClick={()=>void run(()=>api.reveal())}>打开工程文件夹</button></div>}</section>}

        {supported&&seed&&project&&<div className="writer-view" hidden={view!=='write'}><FlowEditor key={project.id+':'+bodyEpoch} content={seed} layout={paperLayout(project)} zoom={zoom} readOnly={switching||!!project.reviewError} onReady={value=>{editor.current=value;tick();}} onChange={doc=>{if(currentView.current!=='source')session.current?.change(doc);tick();}} onSelection={tick} onComment={id=>{setReviewMode('comments');setReviewOpen(true);setCommentFocus({id,nonce:Date.now()});}} onPages={setPages} onPlan={plan=>{if(currentView.current!=='source')session.current?.changePlan(plan);}} onMath={setMath} onSearchReady={setWritingSearch}/></div>}
        {view==='pdf'&&<div className="writer-view">{project&&!supported&&<div className="flow-unavailable"><span>当前工程的正文需要在源码视图中编辑。</span><button className="outline-button" onClick={()=>void changeView('source')}>查看源码</button></div>}<WritingPdf result={preview} blocks={supported?project?.writing??[]:[]} active={null} selected={null} zoom={zoom} onSelect={()=>{}} onEdit={begin} onReady={()=>{}} onChange={()=>{}} onFinish={()=>{}} onMath={setMath} onError={msg=>notify(msg,true)} onPages={setPdfPages}/></div>}
        {log&&<div className="writer-log"><div><strong>排版日志</strong><button aria-label="关闭排版日志" onClick={()=>setLog(false)}><X size={16}/></button></div><pre>{last?.log??'尚无日志'}</pre></div>}
      </main>
      {aiOpen&&<AiPanel key={project.id} editor={view==='write'?e:null} onClose={()=>setAiOpen(false)}/>}
      {reviewOpen&&view==='write'&&<ReviewPanel key={project?.id} editor={e} mode={reviewMode} onMode={setReviewMode} anchor={commentAnchor} focus={commentFocus} onCancelDraft={()=>setCommentAnchor(null)} onClose={()=>{setReviewOpen(false);setCommentAnchor(null);}} error={project?.reviewError} onError={error=>notify(error,true)}/>}
    </div>
    <footer className="writer-status"><span>{last?.ok===false?'排版失败':busy?'正在排版…':pending?'正在同步…':preview?.version===project?.version?'排版已更新':'等待排版'}</span><span aria-label="保存状态" role="status">{saveStatus==='saving'?'正在保存…':saveStatus==='pending'?'待保存':saveStatus==='error'?'保存失败':'已保存'}</span><button aria-label={view==='source'?'转到源码行':'转到页面'} title="跳转 · Ctrl+G" disabled={!destinationMax} onClick={()=>setGoTo(true)}>{view==='source'?`第 ${sourceLine} 行`:`${view==='pdf'?pdfPages:pages} 页`}</button><button className="word-count" aria-label="字数统计" disabled={!count} title="中文按字，英文和数字按词；不含公式、图片及 LaTeX 命令" onClick={()=>setWordDialog(true)}>{count?selectionCount?`已选 ${selectionCount} / 共 ${count.words} 字`:`${count.words} 字`:'字数 —'}</button><button onClick={()=>setLog(!log)}>日志</button><button title="命令面板 · Ctrl+Shift+P" onClick={()=>setPalette(true)}>命令</button>{formatArmed&&<button className="painter-status" onClick={()=>setFormatArmed(false)}>格式刷：选择文字 · Esc 取消</button>}<span className="writer-status-spacer"/>{view==='source'?<span>{activeSource?.encoding??''}</span>:<><button aria-label="缩小页面" onClick={()=>setZoom(v=>Math.max(.5,v-.1))}><Minus size={14}/></button><span>{Math.round(zoom*100)}%</span><button aria-label="放大页面" onClick={()=>setZoom(v=>Math.min(1.6,v+.1))}><Plus size={14}/></button></>}</footer>
    {palette&&<CommandPalette commands={commands} onClose={()=>setPalette(false)}/>}
    {goTo&&<GoToDialog kind={view==='source'?'line':'page'} max={destinationMax} onGo={jumpTo} onClose={()=>setGoTo(false)}/>}
    {wordDialog&&count&&<div className="modal-backdrop"><div className="modal word-count-dialog"><div className="modal-title"><h2>字数统计</h2><button aria-label="关闭字数统计" onClick={()=>setWordDialog(false)}><X size={18}/></button></div><dl><div><dt>字数</dt><dd>{count.words}</dd></div><div><dt>字符数（不含空格）</dt><dd>{count.characters}</dd></div><div><dt>字符数（含空格）</dt><dd>{count.charactersWithSpaces}</dd></div>{selectionCount>0&&<div><dt>已选字数</dt><dd>{selectionCount}</dd></div>}</dl><p>中文按字，英文和数字按词；不计公式、图片及 LaTeX 命令。</p></div></div>}
    {message&&<div className={`toast ${error?'error':''}`} role="status"><CheckCircle2 size={16}/><span>{message}</span><button aria-label="关闭写作提示" onClick={()=>setMessage('')}><X size={15}/></button></div>}
    {math&&<MathDialog request={math} onClose={()=>setMath(null)}/>}
    {tableDialog&&<div className="modal-backdrop"><div className="modal"><div className="modal-title"><h2>插入表格</h2><button aria-label="关闭插入表格" onClick={()=>setTableDialog(false)}><X size={18}/></button></div><div className="table-size-fields"><label>行数<input aria-label="表格行数" type="number" min="1" max="50" value={tableRows} onChange={ev=>setTableRows(Number(ev.target.value))}/></label><label>列数<input aria-label="表格列数" type="number" min="1" max="12" value={tableCols} onChange={ev=>setTableCols(Number(ev.target.value))}/></label></div><label className="orientation-label"><input type="checkbox" checked={tableHeader} onChange={ev=>setTableHeader(ev.target.checked)}/>首行作为表头</label><button className="primary-button full" disabled={!Number.isInteger(tableRows)||tableRows<1||tableRows>50||!Number.isInteger(tableCols)||tableCols<1||tableCols>12} onClick={()=>{setTableDialog(false);format(e=>e.commands.insertTable({rows:tableRows,cols:tableCols,withHeaderRow:tableHeader}));}}>插入</button></div></div>}
    {formulasVisible&&<FormulaList items={formulas(liveBlocks())} onEdit={editFormula} onClose={()=>setFormulasVisible(false)}/>}
    {layout&&<div className="modal-backdrop"><div className="modal"><div className="modal-title"><h2>页面设置</h2><button className="icon-button" aria-label="关闭页面设置" onClick={()=>setLayout(false)}><X size={18}/></button></div><label className="field-label">纸张<select aria-label="纸张" value={paper} onChange={ev=>setPaper(ev.target.value)}><option value="a4paper">A4</option><option value="a5paper">A5</option><option value="letterpaper">Letter</option></select></label><label className="field-label">四周页边距（毫米）<input className="page-margin-input" aria-label="页边距" type="number" min="10" max="50" value={margin} onChange={ev=>setMargin(Number(ev.target.value))}/></label><label className="orientation-label"><input type="checkbox" checked={landscape} onChange={ev=>setLandscape(ev.target.checked)}/>横向页面</label><button className="primary-button full" onClick={()=>void run(async()=>{capture();await session.current?.mutate(p=>api.pageSettings(margin,paper,landscape,p.version));setLayout(false);})}>应用页面设置</button></div></div>}
  </div>;
}


