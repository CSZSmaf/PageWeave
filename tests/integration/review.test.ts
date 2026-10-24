import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {Project} from '../../core/project';
import {Compiler} from '../../core/compiler';
import {REVIEW_FILE} from '../../core/review';
import type {RichNode} from '../../core/writing';

test('审阅 PDF 只包含当前正文，工程导出保留批注和修改前内容',{timeout:120000},async()=>{
  const root=path.resolve('output/review-integration-'+Date.now()),folder=path.join(root,'project');await fs.cp(path.resolve('examples/writing'),folder,{recursive:true});
  const p=await Project.open(folder),c=new Compiler(path.join(root,'builds'));
  const node=(text:string):RichNode=>({type:'paragraph',attrs:{reviewId:'review-one'},content:[{type:'text',text}]});
  const doc:RichNode={type:'doc',content:[node('CURRENTTEXT 当前正文可以生成 PDF。')],attrs:{review:{version:1,tracking:true,baseline:[node('ORIGINALTEXT 修改前的内容。')],comments:[{id:'comment-one',text:'COMMENTPRIVATE 批注不应出现在 PDF 中',quote:'CURRENTTEXT',from:1,to:12,orphaned:false,resolved:false,createdAt:new Date().toISOString()}]}}};
  p.writeFlow([{id:p.state().writing[0].id,content:doc}],p.version,doc);const r=await c.compile(p);assert.ok(r.ok,r.log.slice(-4000));
  const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');const task=getDocument({data:new Uint8Array(r.pdf!),disableFontFace:true,useSystemFonts:true}),pdf=await task.promise;let text='';
  try{for(let i=1;i<=pdf.numPages;i++)text+=(await(await pdf.getPage(i)).getTextContent()).items.flatMap(item=>'str'in item?[item.str]:[]).join('');}finally{await task.destroy();}
  assert.match(text,/CURRENTTEXT/);assert.doesNotMatch(text,/COMMENTPRIVATE|ORIGINALTEXT/);
  const exported=path.join(root,'exported');await p.snapshot(exported);const stored=await fs.readFile(path.join(exported,REVIEW_FILE),'utf8');assert.match(stored,/COMMENTPRIVATE/);assert.match(stored,/ORIGINALTEXT/);
  const reopened=await Project.open(exported);assert.deepEqual(reopened.state().reviewDocument,p.state().reviewDocument);
  await fs.writeFile(path.join(root,'current.pdf'),r.pdf!);console.log('Review PDF artifacts: '+root);
});
