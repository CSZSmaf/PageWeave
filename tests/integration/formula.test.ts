import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {Project} from '../../core/project';
import {FormulaCompiler} from '../../core/formula';
import {identify,reviewData,REVIEW_FILE} from '../../core/review';
import {flowDocument,flowParts} from '../../core/flow';
test('公式单独重建：只编译公式，保持文稿源码和编辑历史', {timeout:60000},async()=>{
  const p=await Project.open(path.resolve('examples/writing')),before=p.history.texts.get('main.tex');
  const root=path.resolve('output/formula-integration-'+Date.now()),c=new FormulaCompiler(root);
  const result=await c.compile(p,'\\frac{-b+\\sqrt{b^2-4ac}}{2a}');
  assert.equal(result.ok,true,result.log.slice(-4000));assert.ok(result.pdf?.length);
  assert.equal(p.history.texts.get('main.tex'),before);assert.equal(p.version,0);assert.equal(p.state().canUndo,false);
  await fs.writeFile(path.join(root,'formula.pdf'),result.pdf!);
  await fs.writeFile(path.join(root,'report.json'),JSON.stringify({passed:true,documentUnchanged:true,ms:result.durationMs},null,2));
  console.log('Formula artifacts: '+root);
});

test('审阅已同步且存在待审修订时，公式仍可独立重建', {timeout:60000},async()=>{
  const p=await Project.open(path.resolve('examples/writing'));
  const doc=flowDocument(p.state().writing),baseline=identify(doc.content!);
  const content=[...baseline,{type:'paragraph',attrs:{reviewId:'pending-paragraph'},content:[{type:'text',text:'待审文字'}]}];
  const reviewed={...doc,content,attrs:{review:{version:1,tracking:true,baseline,comments:[]}}};
  p.writeFlow(flowParts(reviewed,p.state().writing[0].id),p.version,reviewed);
  const before=[...p.history.texts],version=p.version,root=path.resolve('output/formula-review-integration-'+Date.now());
  assert.ok(p.files.has(REVIEW_FILE));assert.equal(reviewData(p.state().reviewDocument!)!.tracking,true);
  const result=await new FormulaCompiler(root).compile(p,'x^2+y^2=z^2');
  assert.equal(result.ok,true,result.log.slice(-4000));assert.ok(result.pdf?.length);
  assert.equal(p.version,version);assert.deepEqual([...p.history.texts],before);assert.equal(reviewData(p.state().reviewDocument!)!.tracking,true);
});
