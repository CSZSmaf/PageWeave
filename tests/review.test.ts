import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {getSchema,type Editor} from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import {EditorState} from '@tiptap/pm/state';
import {history,undo,redo,closeHistory} from '@tiptap/pm/history';
import {Review,reviewPlugin,toggleTracking,addComment,editComment,decideRevision} from '../src/writing/Review';
import {reviewData,reviewChanges,REVIEW_FILE,reviewLocked,validateReviewDocument} from '../core/review';
import {Project} from '../core/project';
import {flowParts,flowDocument} from '../core/flow';
import {blockSource,type RichNode} from '../core/writing';
import {LiveSession} from '../src/writing/LiveSession';
import type {WorkbenchApi,CompileResult} from '../core/types';

const para=(text:string):RichNode=>({type:'paragraph',content:[{type:'text',text}]});
const schema=getSchema([StarterKit,Review]);
function fixture(content:RichNode[]=[para('第一段文字'),para('保留中间段'),para('最后一段')]){
  let state=EditorState.create({schema,doc:schema.nodeFromJSON({type:'doc',content}),plugins:[history(),reviewPlugin()]});
  const dispatch=(tr:typeof state.tr)=>{state=state.applyTransaction(tr).state;};
  const editor={get state(){return state;},schema,view:{dispatch,focus(){}}} as unknown as Editor;
  return {editor,get state(){return state;},dispatch,json:()=>state.doc.toJSON() as RichNode,undo:()=>undo(state,dispatch),redo:()=>redo(state,dispatch),boundary:()=>dispatch(closeHistory(state.tr))};
}
test('段落修订覆盖插入、删除、格式与逐项接受拒绝，撤销保留修订',()=>{
  const f=fixture();toggleTracking(f.editor);f.boundary();f.dispatch(f.state.tr.insertText('新增',2));
  assert.equal(reviewChanges(f.json()).length,1);const changed=f.state.doc.textContent;
  decideRevision(f.editor,false);assert.equal(f.state.doc.child(0).textContent,'第一段文字');assert.equal(reviewChanges(f.json()).length,0);
  assert.ok(f.undo());assert.equal(f.state.doc.textContent,changed);assert.equal(reviewChanges(f.json()).length,1);
  assert.ok(f.redo());assert.equal(reviewChanges(f.json()).length,0);
  f.boundary();f.dispatch(f.state.tr.addMark(1,4,schema.marks.bold.create()));assert.equal(reviewChanges(f.json()).length,1);
  decideRevision(f.editor,true);assert.equal(reviewChanges(f.json()).length,0);assert.ok(f.state.doc.child(0).child(0).marks.some(m=>m.type.name==='bold'));
  f.boundary();const start=f.state.doc.child(0).nodeSize;f.dispatch(f.state.tr.delete(start,start+f.state.doc.child(1).nodeSize));
  assert.equal(reviewChanges(f.json())[0].after.length,0);decideRevision(f.editor,false);assert.equal(f.state.doc.child(1).textContent,'保留中间段');
});
test('停止跟踪保留已有修订，其他段落继续正常编辑',()=>{
  const f=fixture();toggleTracking(f.editor);f.dispatch(f.state.tr.insertText('待审',2));toggleTracking(f.editor);
  const third=f.state.doc.child(0).nodeSize+f.state.doc.child(1).nodeSize+1;f.dispatch(f.state.tr.insertText('直接修改',third));
  assert.equal(reviewChanges(f.json()).length,1);decideRevision(f.editor,false);
  assert.equal(f.state.doc.child(0).textContent,'第一段文字');assert.match(f.state.doc.child(2).textContent,/直接修改/);assert.equal(reviewChanges(f.json()).length,0);
});
test('批注锚点跟随输入，删除原文保留引用，撤销恢复锚点与批注状态',()=>{
  const f=fixture();const id=addComment(f.editor,'需要补充说明',{from:1,to:4,quote:'第一段'});f.boundary();f.dispatch(f.state.tr.insertText('前缀',1));
  let c=reviewData(f.json())!.comments[0];assert.equal(c.from,3);assert.equal(c.to,6);
  f.boundary();f.dispatch(f.state.tr.delete(c.from,c.to));c=reviewData(f.json())!.comments[0];assert.ok(c.orphaned);assert.equal(c.quote,'第一段');
  f.undo();c=reviewData(f.json())!.comments[0];assert.equal(c.orphaned,false);assert.equal(f.state.doc.textBetween(c.from,c.to),'第一段');
  editComment(f.editor,id,{resolved:true});assert.ok(reviewData(f.json())!.comments[0].resolved);f.undo();assert.equal(reviewData(f.json())!.comments[0].resolved,false);
  editComment(f.editor,id,null);assert.equal(reviewData(f.json())!.comments.length,0);f.undo();assert.equal(reviewData(f.json())!.comments.length,1);
});
test('跨段分割、合并与复制产生唯一段落标识，全部拒绝还原正文',()=>{
  const f=fixture();const original=f.state.doc.textContent;toggleTracking(f.editor);f.dispatch(f.state.tr.split(3));
  const ids=f.json().content!.map(n=>n.attrs!.reviewId);assert.equal(new Set(ids).size,ids.length);
  f.dispatch(f.state.tr.insert(f.state.doc.content.size,f.state.doc.child(0)));assert.equal(new Set(f.json().content!.map(n=>n.attrs!.reviewId)).size,f.state.doc.childCount);
  decideRevision(f.editor,false);assert.equal(f.state.doc.textContent,original);assert.equal(f.state.doc.childCount,3);
});

test('移动段落作为完整修订接受或拒绝，关闭修订后移动不产生待审记录',()=>{
  for(const toFront of [false,true])for(const accept of [false,true]){
    const f=fixture(),original=f.state.doc.textContent;toggleTracking(f.editor);
    const node=f.state.doc.child(toFront?2:0),from=toFront?f.state.doc.content.size-node.nodeSize:0;
    const tr=f.state.tr.delete(from,from+node.nodeSize);tr.insert(toFront?0:tr.doc.content.size,node);f.dispatch(tr);
    const moved=f.state.doc.textContent,changes=reviewChanges(f.json());assert.equal(changes.length,1);
    decideRevision(f.editor,accept,changes[0].id);validateReviewDocument(f.json());assert.equal(reviewChanges(f.json()).length,0);assert.equal(f.state.doc.textContent,accept?moved:original);
  }
  const f=fixture();addComment(f.editor,'保留批注',{from:1,to:4,quote:'第一段'});const node=f.state.doc.child(0),tr=f.state.tr.delete(0,node.nodeSize);tr.insert(tr.doc.content.size,node);f.dispatch(tr);
  assert.equal(reviewChanges(f.json()).length,0);
});
test('批注与正文一起保存、另存为及撤销；源码修改重新定位唯一引用',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'pageweave-review-')),original=path.join(root,'original');
  try{await fs.mkdir(original);await fs.writeFile(path.join(original,'main.tex'),'\\documentclass{article}\n\\begin{document}\n'+blockSource('start',{type:'doc',content:[para('第一段文字'),para('第二段')]})+'\n\\end{document}');
    const p=await Project.open(original),f=fixture(flowDocument(p.state().writing).content);addComment(f.editor,'持久化批注',{from:1,to:4,quote:'第一段'});addComment(f.editor,'重复文字批注',{from:3,to:4,quote:'段'});
    p.writeFlow(flowParts(f.json(),'start'),p.version,f.json());await p.save();let opened=await Project.open(original);assert.equal(reviewData(opened.state().reviewDocument!)!.comments[0].text,'持久化批注');
    const copy=await p.saveAs(path.join(root,'copy'));assert.equal(await fs.readFile(path.join(copy.root,REVIEW_FILE),'utf8'),await fs.readFile(path.join(original,REVIEW_FILE),'utf8'));
    const before=p.history.texts.get('main.tex')!;p.source('main.tex','% preamble comment\n'+before,p.version);assert.equal(reviewData(p.state().reviewDocument!)!.comments[1].orphaned,false);p.undo(p.version);
    p.source('main.tex',before.replace('第一段文字','增加内容第一段文字'),p.version);let c=reviewData(p.state().reviewDocument!)!.comments[0];assert.equal(c.from,5);assert.equal(c.orphaned,false);
    p.undo(p.version);assert.equal(reviewData(p.state().reviewDocument!)!.comments[0].from,1);
    toggleTracking(f.editor);f.dispatch(f.state.tr.insertText('新增',2));p.writeFlow(flowParts(f.json(),'start'),p.version,f.json());assert.ok(reviewLocked(p.state().reviewDocument));assert.throws(()=>p.source('main.tex',before,p.version),/处理待审/);
    await p.save();opened=await Project.open(original);assert.equal(reviewChanges(opened.state().reviewDocument!).length,1);
    await fs.writeFile(path.join(original,'main.tex'),before.replace('第一段文字','外部改写'));const external=await Project.open(original);assert.match(external.state().reviewError!,/外部更改/);assert.ok(external.files.has(REVIEW_FILE));
  }finally{assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith('pageweave-review-'));await fs.rm(root,{recursive:true,force:true});}
});
test('仅修改批注不重新编译 PDF，保存仍包含审阅记录',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'pageweave-review-'));
  try{await fs.writeFile(path.join(root,'main.tex'),'\\documentclass{article}\n\\begin{document}'+blockSource('start',{type:'doc',content:[para('第一段文字')]})+'\\end{document}');const p=await Project.open(root),f=fixture(flowDocument(p.state().writing).content);let builds=0;
    const api={async writeFlow(parts,version,doc){return p.writeFlow(parts,version,doc);},async compile(){builds++;return {ok:true,projectId:p.id,version:p.version,token:String(builds),regions:[],writingRegions:[],log:'',diagnostics:[],durationMs:1} as CompileResult;}} as WorkbenchApi;
    const s=new LiveSession(p.state(),api,{project(){},preview(){},busy(){},pending(){},error(e){throw e;}});await s.build();addComment(f.editor,'不触发编译',{from:1,to:4,quote:'第一段'});s.change(f.json());await s.flush();await new Promise(r=>setTimeout(r,1000));assert.equal(builds,1);assert.equal(s.preview?.version,p.version);await s.mutate(()=>p.save());s.dispose();
  }finally{assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith('pageweave-review-'));await fs.rm(root,{recursive:true,force:true});}
});
