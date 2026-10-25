import test,{type TestContext} from 'node:test';import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';import os from 'node:os';import path from 'node:path';
import {Project} from '../core/project';import {documentFileName,texFileName,DEFAULT_DOCUMENT_NAME} from '../core/file-name';
import {flowParts} from '../core/flow';import {identify,reviewData,REVIEW_FILE} from '../core/review';import type {RichNode} from '../core/writing';import {RecoveryStore} from '../core/recovery';
async function directory(t:TestContext){const root=await fs.mkdtemp(path.join(os.tmpdir(),'pageweave-files-'));t.after(async()=>{assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith('pageweave-files-'));await fs.rm(root,{recursive:true,force:true});});return root;}
const paragraph=(text:string):RichNode=>({type:'paragraph',content:[{type:'text',text}]});
test('显示实际文件名，默认 .tex 后缀，拒绝路径、保留名和其他格式',()=>{
 assert.equal(DEFAULT_DOCUMENT_NAME,'未命名.tex');assert.equal(documentFileName('chapters/项目说明.tex'),'项目说明.tex');assert.equal(documentFileName('main.tex'),'main.tex');assert.equal(texFileName('论文'),'论文.tex');
 for(const value of ['../report','a/b.tex','CON.tex','NUL','report.pdf','report.docx','a%name.tex'])assert.throws(()=>texFileName(value));
});
test('打开选中的 tex 和依赖，不加载相邻的其他文稿；支持新增源码依赖',async t=>{
 const root=await directory(t);await fs.mkdir(path.join(root,'figures'));await fs.mkdir(path.join(root,'parts'));
 await fs.writeFile(path.join(root,'main.tex'),'\\documentclass{article} tutorial');await fs.writeFile(path.join(root,'private.txt'),'unrelated');
 await fs.writeFile(path.join(root,'chosen.tex'),'\\documentclass{article}\n\\usepackage{custom}\n\\graphicspath{{figures/}}\n\\begin{document}\\input{parts/body}\\includegraphics{chart}\\end{document}');
 await fs.writeFile(path.join(root,'custom.sty'),'\\RequirePackage{localstyle}');await fs.writeFile(path.join(root,'localstyle.sty'),'% local');await fs.writeFile(path.join(root,'parts/body.tex'),'selected content');await fs.writeFile(path.join(root,'figures/chart.png'),Buffer.from([1,2,3]));
 const p=await Project.openFile(path.join(root,'chosen.tex'));assert.equal(p.main,'chosen.tex');assert.equal(p.scope,'file');assert.deepEqual([...p.files.keys()],['chosen.tex','custom.sty','figures/chart.png','localstyle.sty','parts/body.tex']);
 await fs.writeFile(path.join(root,'parts/extra.tex'),'extra');p.source(p.main,p.history.texts.get(p.main)+'\n\\input{parts/extra}',p.version);await p.refreshDependencies();assert.ok(p.files.has('parts/extra.tex'));assert.ok(!p.files.has('private.txt'));
 await assert.rejects(Project.openFile(path.join(root,'private.txt')),/\.tex/);
 const before=p.history.texts.get(p.main),version=p.version;await assert.rejects(p.sourceWithDependencies(p.main,before+'\n\\input{../outside}',version),/上级目录/);assert.equal(p.history.texts.get(p.main),before);assert.equal(p.version,version);
});
test('新建为空白 tex，可使用中文文件名，不覆盖同名文件或自定义样式',async t=>{
 const root=await directory(t),p=await Project.createDocument(path.join(root,'未命名'),path.resolve('examples/writing'));assert.equal(p.main,'未命名.tex');assert.ok(!p.history.texts.get(p.main)!.includes('入门教程'));assert.ok(p.files.has('mogao.sty'));
 await assert.rejects(Project.createDocument(path.join(root,'未命名.tex'),path.resolve('examples/writing')),/已存在/);
 await fs.writeFile(path.join(root,'mogao.sty'),'custom');await assert.rejects(Project.createDocument(path.join(root,'另一个.tex'),path.resolve('examples/writing')),/已有不同/);assert.equal(await fs.readFile(path.join(root,'mogao.sty'),'utf8'),'custom');
});
test('真实重命名保留正文、批注、修订和撤销重做，拒绝同名及外部修改',async t=>{
 const root=await directory(t),p=await Project.createDocument(path.join(root,'original.tex'),path.resolve('examples/writing'));
 const content=identify([paragraph('第一版正文')]),a:RichNode={type:'doc',content,attrs:{review:{version:1,tracking:true,baseline:content,comments:[{id:'c',text:'批注',quote:'第一版',from:1,to:4,resolved:false,orphaned:false,createdAt:'2026-01-01T00:00:00Z'}]}}};
 p.writeFlow(flowParts(a,'start'),p.version,a);const b=structuredClone(a);b.content![0].content![0].text='第二版正文';p.writeFlow(flowParts(b,'start'),p.version,b);await p.renameMain('研究 报告.tex',p.version);
 assert.equal(p.main,'研究 报告.tex');assert.equal(await fs.stat(path.join(root,'original.tex')).catch(()=>null),null);assert.deepEqual(p.state().reviewDocument,b);
 p.undo(p.version);assert.deepEqual(p.state().reviewDocument,a);p.redo(p.version);assert.deepEqual(p.state().reviewDocument,b);await p.save();
 const reopened=await Project.openFile(path.join(root,p.main));assert.equal(reviewData(reopened.state().reviewDocument!)!.comments[0].text,'批注');const review=JSON.parse(await fs.readFile(path.join(root,REVIEW_FILE),'utf8'));assert.ok(review.documents[p.main]);assert.ok(!review.documents['original.tex']);
 await fs.writeFile(path.join(root,'existing.tex'),'preserve');await assert.rejects(p.renameMain('existing.tex',p.version),/已存在/);assert.equal(await fs.readFile(path.join(root,'existing.tex'),'utf8'),'preserve');
 await fs.appendFile(path.join(root,p.main),'\n% external');await assert.rejects(p.renameMain('after.tex',p.version),/外部修改/);assert.equal(await fs.stat(path.join(root,'after.tex')).catch(()=>null),null);
});
test('单个文件的崩溃恢复保留所选入口和资源范围',async t=>{
 const root=await directory(t),p=await Project.createDocument(path.join(root,'selected.tex'),path.resolve('examples/writing'));await fs.writeFile(path.join(root,'main.tex'),'unrelated');
 p.source(p.main,p.history.texts.get(p.main)+'\n% recovered',p.version);const store=new RecoveryStore(path.join(root,'recovery'));await store.checkpoint(p);const info=await store.find(p.root);assert.ok(info);const restored=await store.restore(p.root,info.id);assert.equal(restored.scope,'file');assert.equal(restored.main,'selected.tex');assert.ok(!restored.files.has('main.tex'));assert.match(restored.history.texts.get(restored.main)!,/recovered/);
});
