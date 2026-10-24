import test from 'node:test';
import assert from 'node:assert/strict';
import {Schema} from '@tiptap/pm/model';
import {findText,findDocument,type SearchOptions} from '../core/search';
import {SearchController} from '../src/search/SearchController';

const options=(query:string,caseSensitive=false):SearchOptions=>({query,caseSensitive});
test('查找按字面匹配，Unicode 偏移正确且不重叠',()=>{
  assert.deepEqual(findText('😀甲 a.b A.B a+b $&',options('a.b')),[{from:4,to:7},{from:8,to:11}]);
  assert.deepEqual(findText('😀甲 a.b A.B',options('a.b',true)),[{from:4,to:7}]);
  assert.deepEqual(findText('aaa',options('aa')),[{from:0,to:2}]);
  assert.deepEqual(findText('a$b $&',options('$&')),[{from:4,to:6}]);
  assert.deepEqual(findText('anything',options('')),[]);
});
test('写作查找跨文字格式，不跨公式、换行、段落和表格单元格',()=>{
  const schema=new Schema({nodes:{doc:{content:'block+'},paragraph:{group:'block',content:'inline*'},text:{group:'inline'},inlineMath:{group:'inline',inline:true,atom:true,attrs:{latex:{default:''}}},hardBreak:{group:'inline',inline:true},table:{group:'block',content:'row+'},row:{content:'cell+'},cell:{content:'paragraph+'}},marks:{bold:{}}});
  const p=(...children:any[])=>schema.node('paragraph',null,children),t=(text:string,bold=false)=>schema.text(text,bold?[schema.mark('bold')]:[]);
  const doc=schema.node('doc',null,[p(t('查'),t('找',true),schema.node('inlineMath',{latex:'查找'}),t('查'),schema.node('hardBreak'),t('找')),p(t('找查')),p(t('找')),schema.node('table',null,[schema.node('row',null,[schema.node('cell',null,[p(t('查'))]),schema.node('cell',null,[p(t('找'))]),schema.node('cell',null,[p(t('查找'))])])])]);
  const matches=findDocument(doc,options('查找'));assert.equal(matches.length,2);assert.equal(matches[0].from,1);assert.equal(matches[0].to,3);
  assert.ok(matches.every(range=>doc.textBetween(range.from,range.to)==='查找'));
});
function fixture(text:string,readOnly=false){
  let source=text,selected={from:0,to:0};
  const controller=new SearchController({find:opts=>findText(source,opts),start:()=>selected.from,selectedText:()=>source.slice(selected.from,selected.to),highlight:()=>{},select:range=>{selected=range;},replace:(ranges,replacement)=>{for(const {from,to}of [...ranges].reverse())source=source.slice(0,from)+replacement+source.slice(to);},focus:()=>{},readOnly:()=>readOnly});
  return {controller,text:()=>source,change:(next:string)=>{source=next;controller.changed();}};
}
test('查找前后循环、单次替换前进，全部替换不递归替换新文本',async()=>{
  const f=fixture('cat CAT cat'),s=f.controller;s.setQuery(options('cat'));
  assert.deepEqual(s.snapshot(),{total:3,current:1,readOnly:false});s.step(-1);assert.equal(s.snapshot().current,3);s.step(1);assert.equal(s.snapshot().current,1);
  assert.equal(await s.replace('catcat'),1);assert.equal(f.text(),'catcat CAT cat');assert.equal(s.snapshot().current,3);
  assert.equal(await s.replace('$&',true),4);assert.equal(f.text(),'$&$& $& $&');assert.equal(s.snapshot().total,0);
});
test('删除匹配、外部撤销更新和只读保护',async()=>{
  const f=fixture('中文 中文');f.controller.setQuery(options('中文'));assert.equal(await f.controller.replace('',true),2);assert.equal(f.text(),' ');
  f.change('中文 中文');assert.equal(f.controller.snapshot().total,2);f.controller.clear();assert.equal(f.controller.snapshot().total,0);
  const ro=fixture('禁止替换',true);ro.controller.setQuery(options('替换'));assert.equal(await ro.controller.replace('写入',true),0);assert.equal(ro.text(),'禁止替换');
});
