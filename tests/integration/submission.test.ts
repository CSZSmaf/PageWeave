import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {Project} from '../../core/project';
import {Compiler} from '../../core/compiler';
import {FormulaCompiler} from '../../core/formula';
import {SubmissionLibrary} from '../../core/submission-library';
import {defaultSubmission,SUBMISSION_TEMPLATES,type SubmissionId} from '../../core/submission';
import {flowDocument,flowParts,canFlow} from '../../core/flow';

// Official assets are cached once locally; CI unit tests never download publisher files.
test('官方投稿模板：真实编译、正文改写、重新打开和独立公式',{skip:!process.env.PAGEWEAVE_TEMPLATE_CACHE,timeout:300000},async()=>{
  const root=path.resolve('output/submission-integration-'+Date.now());await fs.mkdir(root,{recursive:true});const library=new SubmissionLibrary(process.env.PAGEWEAVE_TEMPLATE_CACHE!),compiler=new Compiler(path.join(root,'builds'));
  const cases:[SubmissionId,string][]=SUBMISSION_TEMPLATES.flatMap(t=>t.variants.map(([variant])=>[t.id,variant] as [SubmissionId,string]));
  for(const [id,variant]of cases){
    if(process.env.PAGEWEAVE_TEMPLATE_FILTER&&!new RegExp(process.env.PAGEWEAVE_TEMPLATE_FILTER).test(id))continue;
    const directory=path.join(root,id+'-'+variant);await fs.mkdir(directory);const config={...defaultSubmission(id),variant,title:'Template integration',authors:'First Author\nSecond Author',affiliation:'Example Institute',country:'Example Country',correspondingAuthor:'First Author',correspondingEmail:'author@example.org',abstract:'A short abstract for checking manuscript layout.',keywords:'template, editing',bibliography:'references.bib'};
    const resources=await library.resources(config);resources['references.bib']=Buffer.from('@article{smith2024,author={Smith, John},title={Template integration methods},journal={Example Journal},year={2024},volume={1},pages={1--5}}');
    const p=await Project.createSubmission(path.join(directory,'main.tex'),config,resources);assert.ok(canFlow(p.state()));
    const doc=flowDocument(p.state().writing);doc.content![1].content=[{type:'text',text:'Continuous editing preserves the manuscript. '},{type:'inlineMath',attrs:{latex:'a^2+b^2=c^2'}},{type:'text',text:' See '},{type:'citation',attrs:{command:'cite',keys:'smith2024'}}];
    doc.content!.push({type:'table',content:[{type:'tableRow',content:[{type:'tableHeader',content:[{type:'paragraph',content:[{type:'text',text:'Method'}]}]},{type:'tableHeader',content:[{type:'paragraph',content:[{type:'text',text:'Result'}]}]}]},{type:'tableRow',content:[{type:'tableCell',content:[{type:'paragraph',content:[{type:'text',text:'Example'}]}]},{type:'tableCell',content:[{type:'paragraph',content:[{type:'text',text:'1.0'}]}]}]}]});
    p.writeFlow(flowParts(doc,p.state().writing[0].id),p.version);await p.save();const result=await compiler.compile(p);await fs.writeFile(path.join(directory,'compile.log'),result.log);assert.ok(result.ok,id+' '+variant+'\n'+result.log.slice(-2500));await fs.writeFile(path.join(directory,'result.pdf'),result.pdf!);
    const reopened=await Project.openFile(path.join(directory,'main.tex'));assert.ok(canFlow(reopened.state()));assert.equal(reopened.engine,'pdflatex');
    const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs'),task=getDocument({data:new Uint8Array(result.pdf!),useSystemFonts:true,disableFontFace:true}),pdf=await task.promise;
    try{let text='';for(let n=1;n<=pdf.numPages;n++)text+=(await(await pdf.getPage(n)).getTextContent()).items.map((x:any)=>x.str??'').join(' ');assert.ok(text.replace(/\s/g,'').toLowerCase().includes('templateintegration'),id+' '+variant);assert.ok(text.includes('Continuous editing'));assert.ok(!text.includes('AUTHORERR'));}finally{await task.destroy();}
    if(id==='springer'&&variant==='single'){const formula=await new FormulaCompiler(path.join(root,'formulas')).compile(p,'x^2+y^2');assert.ok(formula.ok,formula.log.slice(-1500));}
    console.log(id+' '+variant+' PDF OK');
  }
  console.log('PDFs: '+root);
});

test('投稿模板的中文、多作者和参考文献可编译',{skip:!process.env.PAGEWEAVE_TEMPLATE_CACHE,timeout:300000},async()=>{
  const root=path.resolve('output/submission-references-'+Date.now());await fs.mkdir(root,{recursive:true});const library=new SubmissionLibrary(process.env.PAGEWEAVE_TEMPLATE_CACHE!),compiler=new Compiler(path.join(root,'builds'));
  for(const {id,citations}of SUBMISSION_TEMPLATES)for(const [citation]of citations){
    if(process.env.PAGEWEAVE_TEMPLATE_FILTER&&!new RegExp(process.env.PAGEWEAVE_TEMPLATE_FILTER).test(id))continue;
    const directory=path.join(root,id+'-'+citation);await fs.mkdir(directory);
    const config={...defaultSubmission(id),citation,engine:'xelatex' as const,title:'Template references',authors:'First Author\nSecond Author',affiliation:'Example Institute',country:'Example Country',correspondingAuthor:'First Author',correspondingEmail:'author@example.org',abstract:'中文摘要与英文排版。',bibliography:'references.bib'};
    const resources=await library.resources(config);resources['references.bib']=Buffer.from('@article{smith2024,author={Smith, John and Doe, Jane},title={A reproducible workflow},journal={Example Journal},year={2024},volume={1},pages={1--5}}');
    const p=await Project.createSubmission(path.join(directory,'main.tex'),config,resources),doc=flowDocument(p.state().writing);
    doc.content![1].content=[{type:'text',text:'中文内容，参考文献 '},{type:'citation',attrs:{command:'cite',keys:'smith2024'}},{type:'text',text:'。'}];
    p.writeFlow(flowParts(doc,p.state().writing[0].id),p.version);await p.save();const result=await compiler.compile(p);await fs.writeFile(path.join(directory,'compile.log'),result.log);assert.ok(result.ok,id+'\n'+result.log.slice(-3000));await fs.writeFile(path.join(directory,'result.pdf'),result.pdf!);
    const finalLog=await fs.readFile(path.join(compiler.cacheRoot,result.token,'out/main.log'),'utf8');
    assert.ok(!/Citation[^\n]*undefined|undefined citations/.test(finalLog),id+' reference unresolved');
    assert.match(await fs.readFile(path.join(compiler.cacheRoot,result.token,'out/main.bbl'),'utf8'),/reproducible/);
    const reopened=await Project.openFile(path.join(directory,'main.tex'));assert.ok(canFlow(reopened.state()));assert.equal(reopened.engine,'xelatex');
    console.log(id+' '+citation+' XeLaTeX + bibliography OK');
  }
  console.log('Reference PDFs: '+root);
});
