import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {blockSource,parseRich,parseWriting,serializeRich,type RichNode} from '../core/writing';
import {Project} from '../core/project';

test('写作内容往返：中文、TeX 特殊字符、格式、标题、公式、换行与分页',()=>{
  const doc:RichNode={type:'doc',content:[
    {type:'heading',attrs:{level:2,textAlign:'center'},content:[{type:'text',text:'公式与正文'}]},
    {type:'paragraph',attrs:{textAlign:'right',lineHeight:'2'},content:[
      {type:'text',text:'中文 English 100% $ # & _ { } \\ ~ ^',marks:[{type:'textStyle',attrs:{fontFamily:'Microsoft YaHei',fontSize:'16pt',color:'#123456'}},{type:'bold'},{type:'italic'},{type:'underline'}]},
      {type:'hardBreak'}, {type:'inlineMath',attrs:{latex:'x^{2}+\\sqrt{y}'}}]},
    {type:'displayMath',attrs:{latex:'\\frac{a}{b}=\\int_0^1 x\\,dx'}},
    {type:'pageBreak'}, {type:'paragraph'}]};
  const result=parseRich(serializeRich(doc));
  assert.equal(result.content?.[0].attrs?.textAlign,'center');
  const p=result.content![1];assert.equal(p.attrs?.lineHeight,'2');
  assert.equal(p.content?.[0].text,doc.content![1].content![0].text);
  assert.equal(p.content?.[0].marks?.find(m=>m.type==='textStyle')?.attrs?.fontSize,'16pt');
  assert.deepEqual(p.content?.[0].marks?.map(m=>m.type).sort(),['bold','italic','textStyle','underline'].sort());
  assert.equal(p.content?.[2].attrs?.latex,'x^{2}+\\sqrt{y}');
  assert.equal(result.content?.[3].type,'pageBreak');
});

test('未知写作命令保留源码并拒绝可视化覆盖',()=>{
  const source='prefix\n\\MogaoBlock{x}{\\MogaoPara{left}{1.5}{\\custom{abc}}}\nsuffix';
  const parsed=parseWriting(source,'main.tex');
  assert.equal(parsed.length,1);assert.equal(parsed[0].editable,false);
  assert.equal(source.slice(parsed[0].range.from,parsed[0].range.to),'\\MogaoBlock{x}{\\MogaoPara{left}{1.5}{\\custom{abc}}}');
  assert.equal(parseWriting('% \\MogaoBlock{x}{invalid}\n','main.tex').length,0);
});

test('区域编辑与结构操作只改目标范围，支持混合撤销、存盘重开和版本拒绝',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'mogao-writing-'));
  const original='\\documentclass{article}\r\n% 原始注释\r\n\\begin{document}\r\n'+blockSource('one',{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'原文'}]}]})+'\r\n% 后置注释\r\n\\end{document}\r\n';
  await fs.writeFile(path.join(root,'main.tex'),original);
  const p=await Project.open(root);
  p.writeBlock('one',{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'新正文 % 数学'},{type:'inlineMath',attrs:{latex:'a+b'}}]}]},0);
  assert.ok(p.history.texts.get('main.tex')!.startsWith(original.split('\\MogaoBlock')[0]));
  assert.ok(p.history.texts.get('main.tex')!.endsWith('\r\n% 后置注释\r\n\\end{document}\r\n'));
  const inserted=p.insertBlock('one','pageBreak',1);assert.equal(p.state().writing.length,2);
  p.deleteBlock(inserted.id,2);p.undo(3);assert.equal(p.state().writing.length,2);
  p.undo(4);p.undo(5);assert.equal(p.history.texts.get('main.tex'),original);
  p.redo(6);assert.throws(()=>p.writeBlock('one',{type:'doc'},6),/版本/);
  await p.save();const reopened=await Project.open(root);assert.deepEqual(reopened.state().writing[0].content,p.state().writing[0].content);
});
