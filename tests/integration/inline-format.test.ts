import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {Project} from '../../core/project';
import {Compiler} from '../../core/compiler';
import {flowParts,flowDocument} from '../../core/flow';
import {serializeRich,type RichNode} from '../../core/writing';

test('真实 PDF：上下标位置与链接目标正确，保存后可继续编辑',{timeout:120000},async()=>{
 const root=path.resolve('output/inline-integration-'+Date.now());await fs.mkdir(root,{recursive:true});const p=await Project.createDocument(path.join(root,'text.tex'),path.resolve('examples/writing'));
 const href='https://example.com/paper_v2?view=full&section=1%20two#results';
 const content:RichNode={type:'doc',content:[{type:'paragraph',attrs:{textAlign:'left'},content:[{type:'text',text:'Water H'},{type:'text',text:'2',marks:[{type:'subscript'}]},{type:'text',text:'O and area cm'},{type:'text',text:'2',marks:[{type:'superscript'}]}]},
 {type:'paragraph',content:[{type:'text',text:'研究资料 Reference',marks:[{type:'link',attrs:{href}}]}]}]};
 p.writeFlow(flowParts(content,p.state().writing[0].id),p.version);await p.save();const c=new Compiler(path.join(root,'builds')),r=await c.compile(p);assert.ok(r.ok,r.log.slice(-5000));await fs.writeFile(path.join(root,'result.pdf'),r.pdf!);
 const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs'),task=getDocument({data:new Uint8Array(r.pdf!),disableFontFace:true,useSystemFonts:true}),pdf=await task.promise;
 try{const page=await pdf.getPage(1),items=(await page.getTextContent()).items as any[],links=await page.getAnnotations();assert.ok(links.some(item=>item.url===href));
  const twos=items.filter(item=>item.str==='2');assert.equal(twos.length,2);assert.ok(twos[0].transform[5]<twos[1].transform[5],'subscript should be below superscript');
 }finally{await task.destroy();}
 const again=await Project.openFile(path.join(root,'text.tex'));assert.equal(serializeRich(flowDocument(again.state().writing)),serializeRich(flowDocument(p.state().writing)));
 again.source(again.main,again.history.texts.get(again.main)!.replace('\\usepackage{pageweave}','\\usepackage{pw}'),again.version);const shorthand=await c.compile(again);assert.ok(shorthand.ok,shorthand.log.slice(-4000));
 console.log('Inline formatting PDF: '+path.join(root,'result.pdf'));
});
