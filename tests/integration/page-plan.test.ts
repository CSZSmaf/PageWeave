import test from 'node:test';import assert from 'node:assert/strict';import {promises as fs} from 'node:fs';import path from 'node:path';
import {Project} from '../../core/project';import {Compiler} from '../../core/compiler';import {flowDocument,paperLayout} from '../../core/flow';import {serializeRich,type RichNode} from '../../core/writing';import {nodeSize} from '../../core/review';

test('Shared page plans survive export, keep page contents, and invalidate after source changes',{timeout:120000},async()=>{
 const root=path.resolve('output/page-plan-integration-'+Date.now()),p=await Project.open('examples/writing'),c=new Compiler(path.join(root,'builds'));
 const content:RichNode[]=['FIRST PAGE','SECOND PAGE','THIRD PAGE'].map(text=>({type:'paragraph',attrs:{textAlign:'left',lineHeight:'1.5'},content:[{type:'text',text}]}));p.writeFlow([{id:p.state().writing[0].id,content:{type:'doc',content}}],p.version);
 const before=p.history.texts.get(p.main),state=p.state(),doc=flowDocument(state.writing);p.pagePlan({source:serializeRich(doc),breaks:[nodeSize(content[0]),nodeSize(content[0])+nodeSize(content[1])],layout:paperLayout(state)},p.version);assert.equal(p.history.texts.get(p.main),before);
 const first=c.compile(p),concurrent=c.compile(p);assert.equal(first,concurrent,'Reload reuses the same compilation');const r=await first;assert.ok(r.ok,r.log.slice(-3000));
 const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const read=async(bytes:Uint8Array)=>{const task=getDocument({data:new Uint8Array(bytes),disableFontFace:true,useSystemFonts:true}),pdf=await task.promise;try{const pages=[];for(let i=1;i<=pdf.numPages;i++)pages.push((await (await pdf.getPage(i)).getTextContent()).items.map((item:any)=>item.str??'').join(' '));return pages;}finally{await task.destroy();}};
 const pages=await read(r.pdf!);assert.equal(pages.length,3);for(let i=0;i<3;i++)assert.ok(pages[i].includes(content[i].content![0].text!));
 const exported=path.join(root,'exported');await p.snapshot(exported);const copy=await Project.open(exported),standalone=await c.compile(copy);assert.ok(standalone.ok,standalone.log.slice(-3000));assert.deepEqual(await read(standalone.pdf!),pages);
 copy.source(copy.main,copy.history.texts.get(copy.main)+'\n% External source edit\n',copy.version);const changed=await c.compile(copy);assert.ok(changed.ok,changed.log.slice(-3000));assert.equal((await read(changed.pdf!)).length,1,'Stale page plan is ignored');
});
