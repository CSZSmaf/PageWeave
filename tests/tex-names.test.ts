import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {shortTex,legacyTex} from '../core/tex-names';
import {LEGACY_BASE_STYLE,PAGEWEAVE_STYLES} from '../core/pageweave-package';
import {Project} from '../core/project';
import {serializeRich,parseWriting} from '../core/writing';
import {flowDocument,flowParts,canFlow} from '../core/flow';
import {LAYOUT_STYLE,LAYOUT_STYLE_FILE} from '../core/layout-style';

async function fixture(t:any){const root=await fs.mkdtemp(path.join(os.tmpdir(),'pageweave-names-'));t.after(async()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));await fs.rm(root,{recursive:true,force:true});});return root;}
const oldSource=String.raw`\documentclass[a4paper,12pt]{article}
\usepackage[margin=25mm]{geometry}
\usepackage{mogao}
\usepackage{pageweave-layout}
\begin{document}
% \MogaoBlock{comment} is not content
\MogaoBlock{start}{\MogaoPara{left}{1.5}{原有正文 \textbf{保留格式}}}
\end{document}`;
test('PW aliases preserve source offsets, literal escapes and commented commands',()=>{
 const next=shortTex(oldSource);assert.match(next,/\\PWBlock\{start\}/);assert.ok(next.includes('% \\MogaoBlock{comment}'));assert.equal(legacyTex(next),oldSource);
 const blocks=parseWriting(next,'main.tex');assert.equal(blocks.length,1);assert.ok(blocks[0].editable);assert.equal(next.slice(blocks[0].range.from,blocks[0].range.to),'\\PWBlock{start}{\\PWPara{left}{1.5}{原有正文 \\textbf{保留格式}}}');
 assert.equal(shortTex('\\\\MogaoPara \\MogaoPara'),'\\\\MogaoPara \\PWPara');
});
test('official legacy packages migrate reversibly without changing content; custom packages stay intact',async t=>{
 const root=await fixture(t);await fs.writeFile(path.join(root,'main.tex'),oldSource);await fs.writeFile(path.join(root,'mogao.sty'),LEGACY_BASE_STYLE);await fs.writeFile(path.join(root,LAYOUT_STYLE_FILE),LAYOUT_STYLE);
 const p=await Project.openFile(path.join(root,'main.tex')),before=serializeRich(flowDocument(p.state().writing));p.prepareWritingLayout();
 const next=p.history.texts.get(p.main)!;assert.match(next,/\\usepackage\{pageweave\}/);assert.ok(!next.includes('\\usepackage{mogao}'));assert.equal(serializeRich(flowDocument(p.state().writing)),before);assert.ok(canFlow(p.state()));assert.ok(p.files.has('pw.sty'));
 p.undo(p.version);assert.equal(p.history.texts.get(p.main),oldSource);p.redo(p.version);await p.save();const reopened=await Project.openFile(path.join(root,'main.tex'));assert.equal(serializeRich(flowDocument(reopened.state().writing)),before);assert.ok(reopened.files.has('pw.sty'));
 const doc=flowDocument(reopened.state().writing);doc.content![0].content!.push({type:'text',text:'追加'});reopened.writeFlow(flowParts(doc,'start'),reopened.version);assert.ok(reopened.history.texts.get('main.tex')!.includes('\\PWPara'));assert.ok(!reopened.history.texts.get('main.tex')!.includes('\\MogaoPara'));
 await fs.writeFile(path.join(root,'main.tex'),oldSource);await fs.writeFile(path.join(root,'mogao.sty'),LEGACY_BASE_STYLE+'\n% custom');const custom=await Project.openFile(path.join(root,'main.tex'));custom.prepareWritingLayout();assert.equal(custom.history.texts.get('main.tex'),oldSource);assert.ok(custom.history.texts.get('mogao.sty')!.endsWith('% custom'));
});
test('new documents use the PageWeave package and bundle the pw shorthand',async t=>{
 const root=await fixture(t),p=await Project.createDocument(path.join(root,'new.tex'),path.resolve('examples/writing'));assert.ok(p.files.has('pageweave.sty'));assert.ok(p.files.has('pw.sty'));assert.ok(!p.files.has('mogao.sty'));assert.match(p.history.texts.get(p.main)!,/\\PWBlock/);
 for(const [file,text]of Object.entries(PAGEWEAVE_STYLES))assert.equal(await fs.readFile(path.join('examples/writing',file),'utf8'),text);
 p.source('new.tex',p.history.texts.get(p.main)!.replace('\\usepackage{pageweave}','\\usepackage{pw}'),p.version);await p.save();assert.ok(canFlow((await Project.openFile(path.join(root,'new.tex'))).state()));
});
