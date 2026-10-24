import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseLatex, widthReplacement } from '../core/parser';
import { TextHistory, minimalPatch } from '../core/history';
import { Project, contained } from '../core/project';
import type { ImageObject } from '../core/types';
const image = (s: string) => parseLatex(s, 'main.tex').find(o => o.kind === 'image') as ImageObject;
const snippet = '% 中文与 emoji 🖋️\r\n\\newcommand{\\name}{Keep me}\r\n\\begin{figure}[t]\r\n  \\centering\r\n  \\includegraphics[width = 0.6\\linewidth]{figures/a.png} % 保留\r\n  \\caption{图题 {nested} 内容}\r\n  \\label{fig:a}\r\n\\end{figure}\r\n';

test('图片宽度补丁仅改数值，保留中文、CRLF、空格、图题及宏', () => {
  const object = image(snippet); assert.equal(object.editable, true); assert.equal(object.line, 5); assert.equal(object.caption, '图题 {nested} 内容'); assert.equal(object.label, 'fig:a');
  const h = new TextHistory(new Map([['main.tex', snippet]]));
  h.commit('width', [widthReplacement(object, .8, '\\linewidth', snippet)]);
  assert.equal(h.texts.get('main.tex'), snippet.replace('0.6', '0.8'));
  h.undo(); assert.equal(h.texts.get('main.tex'), snippet); h.redo(); assert.equal(h.texts.get('main.tex'), snippet.replace('0.6', '0.8'));
});
test('注释、宏定义与 verbatim 内部的命令不形成图片对象', () => {
  const s = '% \\includegraphics[width=.2\\linewidth]{comment}\n\\newcommand{\\fig}[1]{\\includegraphics[width=.5\\linewidth]{#1}}\n\\begin{verbatim}\n\\includegraphics[width=.5\\linewidth]{code}\n\\end{verbatim}\n\\verb|\\includegraphics|';
  assert.equal(parseLatex(s, 'x.tex').length, 0);
});
test('复杂图片参数、容器和表达式拒绝可视化回写', () => {
  for (const s of [
    '\\includegraphics[width=.6\\linewidth,height=20mm]{a}',
    '\\includegraphics[width=.6\\linewidth,angle=90]{a}',
    '\\includegraphics[scale=.8]{a}',
    '\\includegraphics[width=\\dimexpr\\linewidth-2cm\\relax]{a}',
    '\\resizebox{.8\\linewidth}{!}{\\includegraphics[width=.6\\linewidth]{a}}',
    '\\begin{minipage}{5cm}\\includegraphics[width=.6\\linewidth]{a}\\end{minipage}',
    '\\iftrue\\includegraphics[width=.6\\linewidth]{a}\\fi',
    '\\includegraphics[width=.6\\linewidth,width=.7\\linewidth]{a}',
  ]) { const obj = image(s); assert.equal(obj.editable, false, s); assert.throws(() => widthReplacement(obj, .8, '\\linewidth', s)); }
});
test('绝对长度与栏宽含义分别保持', () => {
  for (const unit of ['mm', 'cm', 'pt', '\\columnwidth', '\\textwidth']) { const s = `\\includegraphics[width=0.6${unit}]{a}`; assert.equal(widthReplacement(image(s), .75, unit, s).after, `.75${unit}`.replace(/^\./, '0.')); }
  assert.throws(() => widthReplacement(image(snippet), NaN, '\\linewidth', snippet));
  assert.throws(() => widthReplacement(image(snippet), 1, 'bad', snippet));
});
test('混合源码编辑与属性操作逐步撤销并保留代理对', () => {
  const h = new TextHistory(new Map([['main.tex', snippet]]));
  const first = snippet.replace('🖋️', '😀'); h.commit('source', [minimalPatch('main.tex', snippet, first)]);
  h.commit('width', [widthReplacement(image(first), .8, '\\linewidth', first)]);
  h.undo(); assert.equal(h.texts.get('main.tex'), first); h.undo(); assert.equal(h.texts.get('main.tex'), snippet);
  h.redo(); h.commit('branch', [minimalPatch('main.tex', first, first + '% new')]); assert.equal(h.canRedo, false);
});
test('多文件事务失败时不产生部分更改，撤销多段变长补丁正确', () => {
  const h = new TextHistory(new Map([['a.tex', 'abcdef'], ['b.tex', 'xyz']]));
  assert.throws(() => h.commit('bad', [{ file:'a.tex',from:0,to:1,before:'a',after:'hello' },{ file:'b.tex',from:0,to:1,before:'wrong',after:'q' }]));
  assert.equal(h.texts.get('a.tex'), 'abcdef');
  h.commit('multi', [{ file:'a.tex',from:0,to:1,before:'a',after:'hello' },{ file:'a.tex',from:3,to:5,before:'de',after:'X' }]);
  assert.equal(h.texts.get('a.tex'), 'hellobcXf'); h.undo(); assert.equal(h.texts.get('a.tex'), 'abcdef');
});
test('打开保存逐字节保持 UTF-8 BOM，编辑撤销后精确恢复', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mogao-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const bytes = Buffer.concat([Buffer.from([0xef,0xbb,0xbf]), Buffer.from(snippet)]);
  await fs.writeFile(path.join(root,'main.tex'), bytes);
  const p = await Project.open(root); await p.save(); assert.deepEqual(await fs.readFile(path.join(root,'main.tex')),bytes);
  p.width((p.state().objects[0] as ImageObject).id, .8, '\\linewidth', 0); await p.save();
  p.undo(1); await p.save(); assert.deepEqual(await fs.readFile(path.join(root,'main.tex')),bytes);
});
test('旧版本操作拒绝执行，外部文件修改不会被覆盖', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mogao-test-')); t.after(() => fs.rm(root,{recursive:true,force:true}));
  const full = path.join(root,'main.tex'); await fs.writeFile(full,snippet); const p = await Project.open(root);
  const id = p.state().objects[0].id; p.source('main.tex', '% new\n'+snippet,0);
  assert.throws(() => p.width(id,.8,'\\linewidth',0));
  await fs.writeFile(full,'external'); await assert.rejects(p.save(),/外部修改/); assert.equal(await fs.readFile(full,'utf8'),'external');
});
test('快照冻结当前版本，在异步写盘期间继续编辑不污染构建', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'mogao-test-')); t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.writeFile(path.join(root,'main.tex'),snippet); const p = await Project.open(root);
  const task = p.snapshot(path.join(root,'snapshot')); p.source('main.tex','changed',0); const state = await task;
  assert.equal(state.version,0); assert.equal(await fs.readFile(path.join(root,'snapshot/main.tex'),'utf8'),snippet);
});
test('拒绝越界路径和绝对路径', () => { assert.throws(()=>contained(path.resolve('test-project'),'../private')); assert.throws(()=>contained(path.resolve('test-project'),path.resolve('private'))); });
