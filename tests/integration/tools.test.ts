import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {Project} from '../../core/project';
import {Compiler} from '../../core/compiler';
import {flowParts,flowDocument} from '../../core/flow';
import type {RichNode} from '../../core/writing';

test('真实排版：继承字号的文字颜色、图片、跨页表格与资源重开',{timeout:120000},async()=>{
  const root=path.resolve('output/tools-integration-'+Date.now()),folder=path.join(root,'project');await fs.cp(path.resolve('examples/writing'),folder,{recursive:true});
  const p=await Project.open(folder),png=await fs.readFile(path.resolve('examples/paper/figures/workflow.png'));
  const image=p.addImage(png,p.version),doc=flowDocument(p.state().writing);
  doc.content![0].content![0].marks=[{type:'textStyle',attrs:{color:'#1565C0'}}];
  const paragraph=(text:string):RichNode=>({type:'paragraph',attrs:{textAlign:'left',lineHeight:'1.5'},content:[{type:'text',text}]});
  doc.content!.push({type:'flowImage',attrs:{src:image.src,width:70,textAlign:'center',naturalWidth:1600,naturalHeight:700}},
    {type:'table',content:Array.from({length:44},(_,row)=>({type:'tableRow',content:Array.from({length:3},(_,col)=>({type:row===0?'tableHeader':'tableCell',content:[paragraph(row===0?['项目','说明','进度'][col]:`第 ${row} 行，第 ${col+1} 列：表格会按行分页。`)]}))}))});
  p.writeFlow(flowParts(doc,p.state().writing[0].id),p.version);await p.save();
  const c=new Compiler(path.join(root,'builds')),r=await c.compile(p);assert.ok(r.ok,r.log.slice(-6000));
  await fs.copyFile(c.pdfPath(r.token),path.join(root,'tools.pdf'));
  const reopened=await Project.open(folder);assert.deepEqual(reopened.state().writing.map(b=>b.content),p.state().writing.map(b=>b.content));
  const again=await c.compile(reopened);assert.ok(again.ok,again.log.slice(-3000));
  await fs.writeFile(path.join(root,'report.json'),JSON.stringify({passed:true,rows:44,columns:3,png:image.src,pdf:'tools.pdf',reopened:true},null,2));console.log('Tools artifacts: '+root);
});
