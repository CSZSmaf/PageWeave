import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {Project} from '../../core/project';
import {Compiler} from '../../core/compiler';
import type {RichNode,WritingRegion} from '../../core/writing';

test('真实写作排版：字体字号、公式、手动与自动分页、撤销及普通工程重开', {timeout:180000},async()=>{
  const root=path.resolve('output/writing-integration-'+Date.now());await fs.mkdir(root,{recursive:true});
  const p=await Project.open(path.resolve('examples/writing'));const original=p.history.texts.get('main.tex')!;
  const c=new Compiler(path.join(root,'builds'));const results:{name:string;ms:number;regions:WritingRegion[]}[]=[];
  const compile=async(name:string)=>{const r=await c.compile(p);assert.equal(r.ok,true,r.log.slice(-5000));assert.ok(r.writingRegions.length);await fs.copyFile(c.pdfPath(r.token),path.join(root,name+'.pdf'));results.push({name,ms:r.durationMs,regions:r.writingRegions});return r;};
  const first=await compile('01-original');assert.equal(first.writingRegions.length,10);
  const content:RichNode={type:'doc',content:[{type:'paragraph',attrs:{textAlign:'center',lineHeight:'2'},content:[
    {type:'text',text:'中文格式验证 Font 100% # _',marks:[{type:'textStyle',attrs:{fontFamily:'Microsoft YaHei',fontSize:'18pt',color:'#884422'}},{type:'bold'},{type:'italic'},{type:'underline'}]},
    {type:'hardBreak'},{type:'text',text:'第二行：换行生效。'}, {type:'inlineMath',attrs:{latex:'\\sqrt{2}+x^2'}}]},
    {type:'displayMath',attrs:{latex:'\\frac{-b+\\sqrt{b^2-4ac}}{2a}'}}]};
  p.writeBlock('intro',content,p.version);await compile('02-formatted');
  p.writeBlock('paragraph-three',{type:'doc',content:[{type:'pageBreak'},{type:'paragraph',content:[{type:'text',text:'第二页的正文：分页和保存测试。'}]}]},p.version);
  const paged=await compile('03-page-break');assert.equal(paged.writingRegions.find(r=>r.id==='paragraph-three')?.page,2);
  p.pageSettings(20,'a4paper',true,p.version);const landscape=await compile('04-landscape');
  assert.ok(landscape.writingRegions[0].width>first.writingRegions[0].width);
  p.undo(p.version);p.undo(p.version);p.undo(p.version);assert.equal(p.history.texts.get('main.tex'),original);
  const restored=await compile('05-restored');assert.deepEqual(restored.writingRegions,first.writingRegions);
  // A single flowing writing area crosses multiple PDF pages and remains mapped on every page.
  p.writeBlock('intro',{type:'doc',content:Array.from({length:50},(_,i)=>({type:'paragraph',attrs:{lineHeight:'1.5',textAlign:'justify'},content:[{type:'text',text:`第 ${i+1} 段：连续写作自动换页，正文与公式保留原生 LaTeX 结构。`.repeat(2)}]}))},p.version);
  const flowing=await compile('06-flowing');assert.ok(new Set(flowing.writingRegions.filter(r=>r.id==='intro').map(r=>r.page)).size>=3);
  const exported=path.join(root,'exported-project');await p.snapshot(exported);const reopened=await Project.open(exported);
  assert.deepEqual(reopened.state().writing.map(b=>b.content),p.state().writing.map(b=>b.content));
  const standalone=await new Compiler(path.join(root,'reopened-build')).compile(reopened);assert.equal(standalone.ok,true,standalone.log.slice(-4000));
  assert.equal(await fs.readFile(path.resolve('examples/writing/main.tex'),'utf8'),original);
  await fs.writeFile(path.join(root,'report.json'),JSON.stringify({passed:true,results,standalone:true},null,2));console.log('Writing artifacts: '+root);
});
