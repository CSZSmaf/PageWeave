import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {getSchema,type Editor} from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import {TextStyleKit} from '@tiptap/extension-text-style';
import {EditorState,TextSelection} from '@tiptap/pm/state';
import {history,undo,redo} from '@tiptap/pm/history';
import {PreferenceStore,RECENT_LIMIT,documentKey,type DocumentReference} from '../core/preferences';
import {Review,reviewPlugin,addComment,toggleTracking} from '../src/writing/Review';
import {reviewData,reviewChanges} from '../core/review';
import {readTextFormat,paintTextFormat} from '../src/writing/FormatPainter';
import {documentOutline,destinationNumber} from '../src/writing/Navigation';

test('最近文稿兼容旧设置，串行保存不丢记录，区分同目录的独立文件',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'pageweave-recent-')),file=path.join(root,'preferences.json');
  t.after(()=>{assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('pageweave-recent-'));return fs.rm(root,{recursive:true,force:true});});
  const doc:DocumentReference={root,main:'first.tex',engine:'xelatex',scope:'file'};
  await fs.writeFile(file,JSON.stringify(doc));const store=new PreferenceStore(file);
  assert.equal((await store.read()).main,'first.tex');assert.deepEqual((await store.read()).recent,[]);
  await store.remember(doc);
  await Promise.all(Array.from({length:RECENT_LIMIT+4},(_,i)=>store.remember({...doc,main:`document-${i}.tex`})));
  const prefs=await store.read();assert.equal(prefs.recent.length,RECENT_LIMIT);assert.equal(prefs.recent[0].main,`document-${RECENT_LIMIT+3}.tex`);
  await store.remember({...doc,main:prefs.recent[4].main});const moved=await store.read();assert.equal(moved.recent.length,RECENT_LIMIT);assert.equal(moved.recent[0].id,prefs.recent[4].id);
  const old={...doc,main:moved.main!},renamed={...doc,main:'renamed.tex'};await store.remember(renamed,old);
  const next=await store.read();assert.equal(next.recent[0].main,'renamed.tex');assert.ok(!next.recent.some(item=>item.id===documentKey(old)));
  await store.clearRecent();assert.deepEqual((await store.read()).recent,[]);assert.equal((await store.read()).main,'renamed.tex');
  assert.equal((await fs.stat(root)).isDirectory(),true);
});

test('最近记录拒绝损坏路径、去重工程入口，缺少设置可恢复',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'pageweave-recent-')),file=path.join(root,'prefs.json');t.after(()=>{assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('pageweave-recent-'));return fs.rm(root,{recursive:true,force:true});});
  const doc:DocumentReference={root,main:'main.tex',engine:'xelatex',scope:'folder'},store=new PreferenceStore(file);
  await fs.writeFile(file,JSON.stringify({...doc,recent:[{...doc,id:'forged'}, {...doc,main:'chapter.tex'}, {...doc,root:'relative'}, {...doc,main:'../outside.tex'},null]}));
  const recent=(await store.read()).recent;assert.equal(recent.length,1);assert.equal(recent[0].id,documentKey(doc));
  await store.remember({...doc,main:'chapter.tex'});assert.equal((await store.read()).recent.length,1);
  await fs.writeFile(file,'{broken');await store.remember(doc);assert.equal((await store.read()).recent[0].main,'main.tex');
});

const schema=getSchema([StarterKit.configure({link:false}),TextStyleKit,Review]);
test('格式刷只修改文字样式，保留批注、修订与一次撤销重做',()=>{
  const style={type:'textStyle',attrs:{fontFamily:'SimHei',fontSize:'18pt',color:'#2463c7'}};
  const doc=schema.nodeFromJSON({type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'来源',marks:[{type:'bold'},style]}]},{type:'paragraph',content:[{type:'text',text:'目标文字',marks:[{type:'italic'}]}]}]});
  let state=EditorState.create({schema,doc,plugins:[history(),reviewPlugin()]});
  const dispatch=(tr:typeof state.tr)=>{state=state.applyTransaction(tr).state;};
  const editor={get state(){return state;},schema,view:{dispatch}} as unknown as Editor;
  addComment(editor,'保留批注',{from:5,to:9,quote:'目标文字'});toggleTracking(editor);
  dispatch(state.tr.setSelection(TextSelection.create(state.doc,1,3)));const copied=readTextFormat(state);
  dispatch(state.tr.setSelection(TextSelection.create(state.doc,5,9)));const before=state.doc.toJSON();
  const tr=paintTextFormat(state,copied);assert.ok(tr);dispatch(tr);
  const after=state.doc.toJSON(),marks=state.doc.child(1).firstChild!.marks;
  assert.ok(marks.some(mark=>mark.type.name==='bold'));assert.ok(!marks.some(mark=>mark.type.name==='italic'));
  assert.equal(marks.find(mark=>mark.type.name==='textStyle')?.attrs.color,'#2463c7');
  assert.deepEqual(reviewData(after)?.comments,reviewData(before)?.comments);assert.equal(reviewChanges(after).length,1);
  assert.ok(undo(state,dispatch));assert.deepEqual(state.doc.toJSON(),before);
  assert.ok(redo(state,dispatch));assert.deepEqual(state.doc.toJSON(),after);
});

test('格式刷可以复制无样式文字，空选区不修改正文，大纲使用真实标题位置',()=>{
  const doc=schema.nodeFromJSON({type:'doc',content:[{type:'heading',attrs:{level:1},content:[{type:'text',text:'第一章'}]},{type:'paragraph',content:[{type:'text',text:'正文'}]},{type:'heading',attrs:{level:2},content:[{type:'text',text:'小节'}]},{type:'paragraph',content:[{type:'text',text:'目标',marks:[{type:'bold'}]}]}]});
  let state=EditorState.create({schema,doc});const headings=documentOutline(doc);
  assert.deepEqual(headings,[{position:1,level:1,title:'第一章'},{position:10,level:2,title:'小节'}]);
  assert.equal(paintTextFormat(state,[]),null);
  state=state.apply(state.tr.setSelection(TextSelection.create(state.doc,6,8)));assert.deepEqual(readTextFormat(state),[]);
  state=state.apply(state.tr.setSelection(TextSelection.create(state.doc,14,16)));const tr=paintTextFormat(state,[]);assert.ok(tr);assert.equal(tr.doc.lastChild!.firstChild!.marks.length,0);
  for(const invalid of ['0','-1','1.5','2x','', '13'])assert.equal(destinationNumber(invalid,12),null);
  assert.equal(destinationNumber(' 12 ',12),12);
});
