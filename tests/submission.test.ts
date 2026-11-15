import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {zipSync,strToU8} from 'fflate';
import {SUBMISSION_TEMPLATES,defaultSubmission,submissionSource,readSubmission,SUBMISSION_BODY,submissionBodyRange} from '../core/submission';
import {SUBMISSION_STYLES} from '../core/submission-style';
import {SubmissionLibrary,unpackSubmission} from '../core/submission-library';
import {Project} from '../core/project';
import {canFlow,flowDocument,flowParts,paperLayout} from '../core/flow';
import {serializeRich,parseRich} from '../core/writing';
import {nodeSize} from '../core/review';
const resources=()=>Object.fromEntries(Object.entries(SUBMISSION_STYLES).map(([name,text])=>[name,Buffer.from(text)]));

test('所有投稿模板使用明确的官方类和可编辑正文边界',()=>{
  for(const template of SUBMISSION_TEMPLATES)for(const [variant]of template.variants){
    const config={...defaultSubmission(template.id),variant,correspondingAuthor:'Example Author',correspondingEmail:'author@example.org'};const source=submissionSource(config,SUBMISSION_BODY);
    assert.equal(readSubmission(source)?.template,template.id);const range=submissionBodyRange(source)!;
    assert.equal(source.slice(range.from,range.to).trim(),SUBMISSION_BODY);assert.ok(!source.includes('pageweave-layout'));
    const windowsSource=source.replace(/\n/g,'\r\n'),windowsRange=submissionBodyRange(windowsSource)!;
    assert.equal(windowsSource.slice(windowsRange.from,windowsRange.to).replace(/\r\n/g,'\n').trim(),SUBMISSION_BODY);
  }
});
test('匿名稿不把作者写入源码注释，正文元字符作为文字处理',()=>{
  const config={...defaultSubmission('ieee-journal'),anonymous:true,title:'A&B 50% {model}',authors:'Private author',affiliation:'Private institution'};
  const source=submissionSource(config,SUBMISSION_BODY);
  assert.ok(!source.includes('Private'));assert.ok(source.includes('A\\&B 50\\% \\{model\\}'));assert.equal(readSubmission(source)?.authors,'');
});
test('套用、切换模板和撤销保留正文；页计划不覆盖出版社分页',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'pw-submission-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const p=await Project.createDocument(path.join(root,'paper.tex'),path.resolve('examples/writing')),before=p.history.texts.get(p.main)!,body=serializeRich(flowDocument(p.state().writing));
  p.applySubmission(defaultSubmission('ieee-journal'),resources(),p.version);assert.ok(canFlow(p.state()));assert.equal(p.engine,'pdflatex');assert.equal(serializeRich(flowDocument(p.state().writing)),body);
  const version=p.version;p.pagePlan({source:body,layout:paperLayout(p.state()),breaks:[]},version);assert.equal(p.version,version);
  p.undo(p.version);assert.equal(p.history.texts.get(p.main),before);assert.equal(p.engine,'xelatex');p.redo(p.version);assert.equal(p.engine,'pdflatex');
  const doc=flowDocument(p.state().writing);doc.content![0]={type:'paragraph',content:[{type:'text',text:'Updated manuscript'}]};p.writeFlow(flowParts(doc,p.state().writing[0].id),p.version);
  p.applySubmission(defaultSubmission('elsevier'),resources(),p.version);assert.ok(canFlow(p.state()));assert.ok(p.history.texts.get(p.main)!.includes('Updated manuscript'));
  p.configure(p.main,'xelatex');await p.save();const reopened=await Project.openFile(path.join(root,p.main));assert.ok(canFlow(reopened.state()));assert.equal(reopened.engine,'xelatex');assert.equal(readSubmission(reopened.history.texts.get(reopened.main)!)?.template,'elsevier');
});
test('正文边界内的未知命令保持源码编辑；自定义样式不被模板覆盖',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'pw-submission-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const p=await Project.createSubmission(path.join(root,'paper.tex'),defaultSubmission(),resources());
  const source=p.history.texts.get(p.main)!;p.source(p.main,source.replace('% PW-BODY-END','\\input{custom}\n% PW-BODY-END'),p.version);assert.equal(canFlow(p.state()),false);
  p.source(p.main,source,p.version);p.source('pageweave-submission-design.sty','% custom layout',p.version);assert.throws(()=>p.applySubmission(defaultSubmission('elsevier'),resources(),p.version),/自定义/);assert.equal(p.history.texts.get('pageweave-submission-design.sty'),'% custom layout');
});
test('模板资源只提取排版资产，参考文献样式可由官方类直接查找',()=>{
  const files=unpackSubmission('springer',zipSync({'template/sn-jnl.cls':strToU8('class'),'template/bst/sn-basic.bst':strToU8('bib'),'template/run.exe':strToU8('ignored'),'template/Fonts/Private.otf':strToU8('ignored')}));
  assert.deepEqual(Object.keys(files).sort(),['sn-basic.bst','sn-jnl.cls']);
  assert.throws(()=>unpackSubmission('wiley',zipSync({'../WileyNJDv5.cls':strToU8('class')})),/路径/);
});
test('我的模板复用版式选项，独立于论文身份和正文',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'pw-presets-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const library=new SubmissionLibrary(root);
  const items=await library.save('双栏审稿',{...defaultSubmission('wiley'),variant:'double',title:'Private title',authors:'Private author'});
  assert.equal(items[0].config.variant,'double');assert.equal(items[0].config.title,'');assert.equal(items[0].config.authors,'');assert.equal((await library.list()).length,1);assert.deepEqual(await library.remove(items[0].id),[]);
});

test('引用键在连续写作和源码之间保留，并按一个编辑节点计数',()=>{
  const source=String.raw`\MogaoPara{justify}{1}{See \cite{smith2024,doe2025} and \citet{smith2024}.}`;
  const doc=parseRich(source);assert.equal(serializeRich(doc),source);
  assert.equal(nodeSize(doc.content![0].content![1]),1);
});
