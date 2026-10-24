import {Extension,type Editor} from '@tiptap/core';
import {Plugin,PluginKey,TextSelection,Selection,type Transaction} from '@tiptap/pm/state';
import {Fragment,type Node as PMNode} from '@tiptap/pm/model';
import {Mapping} from '@tiptap/pm/transform';
import {Decoration,DecorationSet} from '@tiptap/pm/view';
import {closeHistory,isHistoryTransaction} from '@tiptap/pm/history';
import {advanceBaseline,nodePosition,reviewChanges,reviewData,type ReviewData,type Comment} from '../../core/review';
import type {RichNode} from '../../core/writing';

export const reviewKey=new PluginKey<{visible:boolean;active?:string;decorations:DecorationSet}>('pageReview');
const cache=new WeakMap<PMNode,{doc:RichNode;data:ReviewData|null;changes:ReturnType<typeof reviewChanges>}>();
export function reviewSnapshot(doc:PMNode){let value=cache.get(doc);if(!value){const json=doc.toJSON() as RichNode;value={doc:json,data:reviewData(json),changes:reviewChanges(json)};cache.set(doc,value);}return value;}
function assignIds(tr:Transaction){const ids=new Set<string>();tr.doc.forEach((node,pos)=>{let id=node.attrs.reviewId;if(!id||ids.has(id)){id=crypto.randomUUID();tr.setNodeAttribute(pos,'reviewId',id);}ids.add(id);});return tr;}
function ensureReview(tr:Transaction):ReviewData{
  const existing=tr.doc.attrs.review as ReviewData|null;if(existing)return existing;
  assignIds(tr);return {version:1,tracking:false,baseline:tr.doc.content.toJSON(),comments:[]};
}
export function mapComments(comments:Comment[],mapping:Mapping):Comment[]{
  return comments.map(c=>{if(c.orphaned)return c;const from=mapping.map(c.from,1),to=mapping.map(c.to,-1);return {...c,from:Math.min(from,to),to:Math.max(from,to),orphaned:to<=from};});
}
function decorations(doc:PMNode,visible:boolean){
  if(!visible)return DecorationSet.empty;
  const {data,changes}=reviewSnapshot(doc),items:Decoration[]=[];if(!data)return DecorationSet.empty;
  for(const c of data.comments)if(!c.resolved&&!c.orphaned&&c.to>c.from&&c.to<=doc.content.size)items.push(Decoration.inline(c.from,c.to,{'class':'review-comment-anchor','data-comment-id':c.id,title:c.text}));
  const nodes=doc.content.toJSON() as RichNode[];
  for(const change of changes){let pos=nodePosition(nodes,change.fromB);for(let i=change.fromB;i<change.toB;i++){const node=doc.child(i);items.push(Decoration.node(pos,pos+node.nodeSize,{class:change.before.length?'review-modified':'review-inserted','data-revision-id':change.id}));pos+=node.nodeSize;}}
  return DecorationSet.create(doc,items);
}
export function reviewPlugin(){return new Plugin<{visible:boolean;active?:string;decorations:DecorationSet}>({
  key:reviewKey,
  state:{init:(_,state)=>({visible:true,decorations:decorations(state.doc,true)}),apply:(tr,value,_,next)=>{const visible=typeof tr.getMeta('reviewVisible')==='boolean'?tr.getMeta('reviewVisible'):value.visible,active=tr.getMeta('activeRevision')??(tr.selectionSet?undefined:value.active);return {visible,active,decorations:tr.docChanged||visible!==value.visible?decorations(next.doc,visible):value.decorations};}},
  props:{decorations:state=>reviewKey.getState(state)?.decorations},
  appendTransaction(transactions,oldState,newState){
    if(!newState.doc.attrs.review||transactions.some(tr=>tr.getMeta(reviewKey)||isHistoryTransaction(tr))||oldState.doc.content.eq(newState.doc.content))return null;
    const tr=assignIds(newState.tr),mapping=new Mapping();for(const tx of transactions)mapping.appendMapping(tx.mapping);
    const before=reviewSnapshot(oldState.doc).doc,data=newState.doc.attrs.review as ReviewData;
    const next={...data,baseline:advanceBaseline(before,tr.doc.content.toJSON()),comments:mapComments(data.comments,mapping)};
    return tr.setDocAttribute('review',next).setMeta(reviewKey,true);
  },
});}
export const Review=Extension.create({
  name:'pageReview',
  addGlobalAttributes(){return [
    {types:['doc'],attributes:{review:{default:null,rendered:false}}},
    {types:['paragraph','heading','displayMath','pageBreak','flowImage','table','bulletList','orderedList'],attributes:{reviewId:{default:null,rendered:false,keepOnSplit:false}}},
  ];},
  addProseMirrorPlugins(){return [reviewPlugin()];},
});
function dispatchReview(editor:Editor,tr:Transaction,data:ReviewData){editor.view.dispatch(closeHistory(tr.setDocAttribute('review',data).setMeta(reviewKey,true)));}
export function toggleTracking(editor:Editor){const tr=editor.state.tr,data=ensureReview(tr);dispatchReview(editor,tr,{...data,tracking:!data.tracking});}
export function setReviewVisible(editor:Editor,visible:boolean){editor.view.dispatch(editor.state.tr.setMeta('reviewVisible',visible).setMeta('addToHistory',false));}
export function decideRevision(editor:Editor,accept:boolean,id?:string){
  const {data,changes}=reviewSnapshot(editor.state.doc);if(!data)return;
  const selected=id?changes.filter(c=>c.id===id):changes;if(!selected.length)return;
  const tr=editor.state.tr,baseline=[...data.baseline],nodes=tr.doc.content.toJSON();
  for(const change of [...selected].reverse()){
    if(accept)baseline.splice(change.fromA,change.toA-change.fromA,...change.after);
    else tr.replaceWith(nodePosition(nodes,change.fromB),nodePosition(nodes,change.toB),Fragment.from(change.before.map(n=>editor.schema.nodeFromJSON(n))));
  }
  dispatchReview(editor,tr,{...data,baseline,comments:mapComments(data.comments,tr.mapping)});
}
export interface CommentAnchor{from:number;to:number;quote:string}
export function selectedAnchor(editor:Editor):CommentAnchor|null{
  const {from,to,empty}=editor.state.selection;if(empty)return null;
  const quote=editor.state.doc.textBetween(from,to,'\n','\uFFFC');return quote.trim()&&quote.length<=8000?{from,to,quote}:null;
}
export function addComment(editor:Editor,text:string,anchor:CommentAnchor){
  text=text.trim();if(!text||text.length>4000)throw new Error('批注请输入 1 至 4000 个字符。');
  if(anchor.to>editor.state.doc.content.size||editor.state.doc.textBetween(anchor.from,anchor.to,'\n','\uFFFC')!==anchor.quote)throw new Error('原文已变化，请重新选择批注位置。');
  const tr=editor.state.tr,data=ensureReview(tr);if(data.comments.length>=2000)throw new Error('单个文稿最多保留 2000 条批注。');
  const comment:Comment={...anchor,id:crypto.randomUUID(),text,resolved:false,orphaned:false,createdAt:new Date().toISOString()};
  dispatchReview(editor,tr,{...data,comments:[...data.comments,comment]});return comment.id;
}
export function editComment(editor:Editor,id:string,change:{text?:string;resolved?:boolean}|null){
  const data=editor.state.doc.attrs.review as ReviewData|null;if(!data)return;
  if(change?.text!==undefined&&(!change.text.trim()||change.text.trim().length>4000))throw new Error('批注请输入 1 至 4000 个字符。');
  const comments=change?data.comments.map(c=>c.id===id?{...c,...change,...(change.text===undefined?{}:{text:change.text.trim()})}:c):data.comments.filter(c=>c.id!==id);
  dispatchReview(editor,editor.state.tr,{...data,comments});
}
export function locateComment(editor:Editor,id:string){const c=(editor.state.doc.attrs.review as ReviewData|null)?.comments.find(c=>c.id===id);if(!c||c.orphaned)return;editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc,c.from,c.to)).scrollIntoView());editor.view.focus();}
export function locateRevision(editor:Editor,id:string){const {doc,changes}=reviewSnapshot(editor.state.doc),change=changes.find(c=>c.id===id);if(!change)return;const pos=Math.min(nodePosition(doc.content??[],change.fromB),editor.state.doc.content.size);editor.view.dispatch(editor.state.tr.setSelection(Selection.near(editor.state.doc.resolve(pos))).setMeta('activeRevision',id).scrollIntoView());editor.view.focus();}
