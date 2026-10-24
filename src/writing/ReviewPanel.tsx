import {useEffect,useRef,useState} from 'react';
import type {Editor} from '@tiptap/react';
import {Check,CheckCheck,ChevronDown,ChevronUp,Eye,FilePenLine,MessageSquarePlus,PanelRight,Pencil,RotateCcw,Trash2,X} from 'lucide-react';
import {reviewText,nodePosition,type ReviewChange} from '../../core/review';
import {addComment,decideRevision,editComment,locateComment,locateRevision,reviewKey,reviewSnapshot,setReviewVisible,toggleTracking,type CommentAnchor} from './Review';
import './review.css';

export function ReviewTools({editor,enabled,onComment,onPanel,onError}:{editor:Editor|null;enabled:boolean;onComment():void;onPanel(mode:'comments'|'changes'):void;onError(error:unknown):void}){
  const snapshot=editor?reviewSnapshot(editor.state.doc):null,changes=snapshot?.changes??[],visible=editor?reviewKey.getState(editor.state)?.visible:true;
  const [index,setIndex]=useState(0),active=editor?reviewKey.getState(editor.state)?.active:undefined;
  const current=changes.find(c=>c.id===active)??changes.find(c=>{const nodes=snapshot?.doc.content??[],pos=editor?.state.selection.from??0;return pos>=nodePosition(nodes,c.fromB)&&pos<nodePosition(nodes,c.toB);})??changes[Math.min(index,changes.length-1)];
  const act=(operation:()=>void)=>{try{operation();}catch(error){onError(error);}};
  const step=(offset:number)=>{if(!editor||!changes.length)return;const next=(changes.indexOf(current)+offset+changes.length)%changes.length;setIndex(next);locateRevision(editor,changes[next].id);onPanel('changes');};
  return <>
    <div className="tool-group"><button aria-label="记录修订" aria-pressed={!!snapshot?.data?.tracking} className={snapshot?.data?.tracking?'on':''} disabled={!enabled} onClick={()=>act(()=>{if(editor)toggleTracking(editor);onPanel('changes');})}><FilePenLine size={17}/><span>修订</span></button><button aria-label="显示审阅标记" aria-pressed={visible} className={visible?'on':''} disabled={!enabled} onClick={()=>{if(editor)setReviewVisible(editor,!visible);}}><Eye size={17}/><span>显示标记</span></button></div>
    <div className="tool-group"><button aria-label="新建批注" title="新建批注 · Ctrl+Alt+M" disabled={!enabled||!editor||editor.state.selection.empty} onMouseDown={e=>e.preventDefault()} onClick={onComment}><MessageSquarePlus size={17}/><span>新建批注</span></button><button aria-label="打开审阅窗格" onClick={()=>onPanel('comments')}><PanelRight size={17}/><span>审阅窗格</span></button></div>
    <div className="tool-group"><button aria-label="上一处修订" disabled={!enabled||!changes.length} onClick={()=>step(-1)}><ChevronUp size={17}/></button><button aria-label="下一处修订" disabled={!enabled||!changes.length} onClick={()=>step(1)}><ChevronDown size={17}/></button><button aria-label="接受当前修订" disabled={!enabled||!current} onClick={()=>act(()=>{if(editor&&current)decideRevision(editor,true,current.id);})}><Check size={17}/><span>接受</span></button><button aria-label="拒绝当前修订" disabled={!enabled||!current} onClick={()=>act(()=>{if(editor&&current)decideRevision(editor,false,current.id);})}><X size={17}/><span>拒绝</span></button></div>
    <div className="tool-group"><button aria-label="接受全部修订" disabled={!enabled||!changes.length} onClick={()=>act(()=>{if(editor)decideRevision(editor,true);})}><CheckCheck size={17}/><span>全部接受</span></button><button aria-label="拒绝全部修订" disabled={!enabled||!changes.length} onClick={()=>act(()=>{if(editor)decideRevision(editor,false);})}><RotateCcw size={17}/><span>全部拒绝</span></button></div>
  </>;
}
function changePreview(change:ReviewChange){
  const before=reviewText(change.before),after=reviewText(change.after);let from=0,endBefore=before.length,endAfter=after.length;
  while(from<endBefore&&from<endAfter&&before[from]===after[from])from++;
  while(endBefore>from&&endAfter>from&&before[endBefore-1]===after[endAfter-1]){endBefore--;endAfter--;}
  const start=Math.max(0,from-24),clip=(value:string,end:number)=>(start?'…':'')+value.slice(start,Math.min(end+24,start+500))+(value.length>Math.min(end+24,start+500)?'…':'');
  return {before:before===after?before.slice(0,180):clip(before,endBefore),after:before===after?after.slice(0,180):clip(after,endAfter),label:!change.before.length?'新增':!change.after.length?'删除':before===after?'格式修改':'修改'};
}
interface Props{editor:Editor|null;mode:'comments'|'changes';onMode(mode:'comments'|'changes'):void;anchor:CommentAnchor|null;focus:{id:string;nonce:number}|null;onCancelDraft():void;onClose():void;error?:string;onError(error:unknown):void}
export default function ReviewPanel({editor,mode,onMode,anchor,focus,onCancelDraft,onClose,error,onError}:Props){
  const [text,setText]=useState(''),[editing,setEditing]=useState<string|null>(null),[editText,setEditText]=useState(''),[all,setAll]=useState(false);
  const panel=useRef<HTMLElement>(null),draft=useRef<HTMLTextAreaElement>(null),data=editor?reviewSnapshot(editor.state.doc):null,comments=data?.data?.comments??[],changes=data?.changes??[];
  useEffect(()=>{setText('');if(anchor)draft.current?.focus();},[anchor]);
  useEffect(()=>{if(mode==='comments'&&focus){const card=[...panel.current!.querySelectorAll<HTMLElement>('[data-comment]')].find(el=>el.dataset.comment===focus.id);card?.scrollIntoView({block:'nearest'});}},[focus,mode]);
  const act=(action:()=>void)=>{try{action();}catch(error){onError(error);}};
  const post=()=>act(()=>{if(editor&&anchor){addComment(editor,text,anchor);setText('');onCancelDraft();}});
  return <aside ref={panel} className="review-panel" aria-label="审阅窗格">
    <div className="review-panel-title"><strong>审阅</strong><button aria-label="关闭审阅窗格" onClick={onClose}><X size={18}/></button></div>
    <div className="review-panel-tabs" role="tablist" aria-label="审阅内容"><button role="tab" aria-selected={mode==='comments'} onClick={()=>onMode('comments')}>批注 {comments.filter(c=>!c.resolved).length}</button><button role="tab" aria-selected={mode==='changes'} onClick={()=>onMode('changes')}>修订 {changes.length}</button></div>
    {error?<p className="review-error" role="alert">{error}</p>:<div className="review-panel-content">
      {mode==='comments'?<>
        {anchor&&<form className="review-composer" onSubmit={e=>{e.preventDefault();post();}}><blockquote>{anchor.quote.slice(0,180)}</blockquote><textarea ref={draft} aria-label="批注内容" placeholder="输入批注" maxLength={4000} value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();post();}if(e.key==='Escape'){e.stopPropagation();onCancelDraft();}}}/><div className="review-actions"><button type="button" onClick={onCancelDraft}>取消</button><button type="submit" className="review-primary" disabled={!text.trim()}>添加批注</button></div></form>}
        <label className="review-filter"><input type="checkbox" checked={all} onChange={e=>setAll(e.target.checked)}/>显示已解决批注</label>
        {!comments.filter(c=>all||!c.resolved).length&&!anchor&&<p className="review-empty">暂无批注</p>}
        {comments.filter(c=>all||!c.resolved).map((c,i)=><article className={`review-card ${c.resolved?'resolved':''} ${focus?.id===c.id?'active':''}`} key={c.id} data-comment={c.id}>
          <button className="review-quote" aria-label={`定位批注 ${i+1}`} disabled={c.orphaned} onClick={()=>editor&&locateComment(editor,c.id)}>{c.quote.slice(0,180)||'文稿'}</button>
          {c.orphaned&&<span className="review-label">原文已删除或更改</span>}{c.resolved&&<span className="review-label">已解决</span>}
          {editing===c.id?<form onSubmit={e=>{e.preventDefault();act(()=>{if(editor)editComment(editor,c.id,{text:editText});setEditing(null);});}}><textarea autoFocus aria-label="编辑批注内容" maxLength={4000} value={editText} onChange={e=>setEditText(e.target.value)}/><div className="review-actions"><button type="button" onClick={()=>setEditing(null)}>取消</button><button className="review-primary" disabled={!editText.trim()}>保存批注</button></div></form>:<p className="review-comment-text">{c.text}</p>}
          <div className="review-actions"><button aria-label={c.resolved?'重新打开批注':'解决批注'} title={c.resolved?'重新打开':'解决'} onClick={()=>act(()=>{if(editor)editComment(editor,c.id,{resolved:!c.resolved});})}>{c.resolved?<RotateCcw size={16}/>:<Check size={16}/>}</button><button aria-label="编辑批注" title="编辑" onClick={()=>{setEditing(c.id);setEditText(c.text);}}><Pencil size={15}/></button><button aria-label="删除批注" title="删除" onClick={()=>act(()=>{if(editor)editComment(editor,c.id,null);})}><Trash2 size={15}/></button></div>
        </article>)}
      </>:<>{!changes.length&&<p className="review-empty">暂无待审修订</p>}{changes.map((change,i)=>{const preview=changePreview(change);return <article className="review-card revision-card" key={change.id} data-revision={change.id}><button className="review-change-title" aria-label={`定位修订 ${i+1}`} onClick={()=>editor&&locateRevision(editor,change.id)}>{preview.label}<span>{i+1}</span></button>{preview.label==='格式修改'?<p>{preview.after||'段落格式'}</p>:<>{change.before.length>0&&<del>{preview.before||'空白段落'}</del>}{change.after.length>0&&<ins>{preview.after||'空白段落'}</ins>}</>}<div className="review-actions"><button aria-label={`接受修订 ${i+1}`} onClick={()=>act(()=>{if(editor)decideRevision(editor,true,change.id);})}><Check size={15}/>接受</button><button aria-label={`拒绝修订 ${i+1}`} onClick={()=>act(()=>{if(editor)decideRevision(editor,false,change.id);})}><X size={15}/>拒绝</button></div></article>;})}</>}
    </div>}
  </aside>;
}
