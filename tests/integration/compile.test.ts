import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Project } from '../../core/project';
import { Compiler } from '../../core/compiler';
import type { ImageObject } from '../../core/types';

test('真实 XeLaTeX：60% → 80% → 撤销，跨文件工程、页面定位与错误恢复', {timeout:180000}, async () => {
  const root=path.resolve('output/integration-'+Date.now());await fs.mkdir(root,{recursive:true});
  const project=await Project.open(path.resolve('examples/paper'));
  const original=project.history.texts.get('main.tex')!;
  const compiler=new Compiler(path.join(root,'builds'));
  const first=await compiler.compile(project);
  assert.equal(first.ok,true,first.log.slice(-4000));assert.ok(first.pdf?.length);assert.ok(first.regions.length>0);
  await fs.copyFile(compiler.pdfPath(first.token),path.join(root,'01-width-60.pdf'));
  const initial=first.regions[0];
  const location=await compiler.locate(first.token,initial.page,initial.x+initial.width/2,initial.y+initial.height/2);
  const captionLine=original.split(/\r?\n/).findIndex(line=>line.includes('\\caption{'))+1;
  assert.equal(location?.file,'main.tex');assert.ok(Math.abs((location?.line??0)-captionLine)<=1);
  const image=project.state().objects.find((o):o is ImageObject=>o.kind==='image')!;
  project.width(image.id,.8,'\\linewidth',0);
  assert.equal(project.history.texts.get('main.tex'),original.replace('width=0.6','width=0.8'));
  const second=await compiler.compile(project);assert.equal(second.ok,true,second.log.slice(-4000));
  await fs.copyFile(compiler.pdfPath(second.token),path.join(root,'02-width-80.pdf'));
  const ratio=second.regions[0].height/first.regions[0].height;assert.ok(Math.abs(ratio-4/3)<.02,`图片高度比例 ${ratio}`);
  project.undo(1);assert.equal(project.history.texts.get('main.tex'),original);
  const restored=await compiler.compile(project);assert.equal(restored.ok,true);
  await fs.copyFile(compiler.pdfPath(restored.token),path.join(root,'03-restored.pdf'));
  assert.equal(restored.regions[0].height,first.regions[0].height);
  project.source('main.tex',original.replace('\\begin{abstract}','\\UndefinedMoGaoCommand\n\\begin{abstract}'),2);
  const failure=await compiler.compile(project);assert.equal(failure.ok,false);assert.ok(failure.diagnostics.length>0);assert.equal(failure.pdf,undefined);
  assert.ok((await fs.stat(compiler.pdfPath(restored.token))).size>0,'上一次成功 PDF 继续存在');
  // Compile snapshots never wrote into the original project.
  assert.equal(await fs.readFile(path.resolve('examples/paper/main.tex'),'utf8'),original);
  await fs.writeFile(path.join(root,'report.json'),JSON.stringify({passed:true,firstMs:first.durationMs,secondMs:second.durationMs,restoreMs:restored.durationMs,heightRatio:ratio,firstRegion:first.regions[0],secondRegion:second.regions[0],inverseLocation:location,error:failure.diagnostics},null,2));
  console.log('Integration artifacts: '+root);
});
