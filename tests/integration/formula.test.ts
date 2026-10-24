import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {Project} from '../../core/project';
import {FormulaCompiler} from '../../core/formula';
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
