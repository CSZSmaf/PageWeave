import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {Project} from '../../core/project';
import {Compiler} from '../../core/compiler';
import type {RichNode} from '../../core/writing';
test('真实 PDF：跨页编号、嵌套项目符号、行内公式与另存为',{timeout:120000},async()=>{
  const root=path.resolve('output/lists-integration-'+Date.now()),folder=path.join(root,'project');await fs.cp(path.resolve('examples/writing'),folder,{recursive:true});
  const p=await Project.open(folder),c=new Compiler(path.join(root,'builds'));
  const para=(text:string):RichNode=>({type:'paragraph',attrs:{textAlign:'left',lineHeight:'1.5'},content:[{type:'text',text}]});
  const content:RichNode[]=[{type:'orderedList',attrs:{start:3},content:Array.from({length:80},(_,i)=>({type:'listItem',content:[para(`项目 ${i+1}：列表可以自动换行并跨页排版。`),...(i===2?[{type:'bulletList',content:[{type:'listItem',content:[para('嵌套项目甲')]},{type:'listItem',content:[{...para('公式'),content:[{type:'text',text:'嵌套公式 '},{type:'inlineMath',attrs:{latex:'a^2+b^2=c^2'}}]}]}]}]:[])]}))},para('列表之后继续写作。')];
  p.writeFlow([{id:p.state().writing[0].id,content:{type:'doc',content}}],p.version);
  const copy=await p.saveAs(path.join(root,'copy')),r=await c.compile(copy);assert.ok(r.ok,r.log.slice(-5000));
  await fs.writeFile(path.join(root,'lists.pdf'),r.pdf!);assert.ok(r.writingRegions.some(region=>region.page>=3));
  // A successful TeX build can still leave a label attached to the wrong line.
  const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task=getDocument({data:new Uint8Array(r.pdf!),disableFontFace:true,useSystemFonts:true}),pdf=await task.promise;
  const labels:number[]=[];
  try{for(let page=1;page<=pdf.numPages;page++){
    const items=(await(await pdf.getPage(page)).getTextContent()).items.filter(item=>'str'in item);
    for(const label of items.filter(item=>/^\d+\.$/.test(item.str))){
      const number=Number(label.str.slice(0,-1)),line=items.filter(item=>Math.abs(item.transform[5]-label.transform[5])<.2).map(item=>item.str).join('');
      assert.match(line,new RegExp(`项目\\s*${number-2}：`),`List label ${number} has the wrong baseline`);labels.push(number);
    }
  }}finally{await task.destroy();}
  assert.deepEqual(labels,Array.from({length:80},(_,i)=>i+3));
  const reopened=await Project.open(copy.root);assert.deepEqual(reopened.state().writing.map(b=>b.content),copy.state().writing.map(b=>b.content));
  console.log('List PDF artifacts: '+root);
});
