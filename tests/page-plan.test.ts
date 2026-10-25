import test from 'node:test';import assert from 'node:assert/strict';
import {pagedBlocks,pagePlanSource} from '../core/page-plan';
import {flowDocument,paperLayout} from '../core/flow';import {Project} from '../core/project';import {serializeRich,type RichNode} from '../core/writing';

test('Page plans preserve marks and formulas when splitting a logical paragraph',()=>{
 const doc:RichNode={type:'doc',content:[{type:'paragraph',attrs:{sourceId:'a'},content:[{type:'text',text:'before ',marks:[{type:'bold'}]},{type:'inlineMath',attrs:{latex:'x^2'}},{type:'text',text:' after',marks:[{type:'italic'}]}]}]};
 const rendered=pagedBlocks(doc,[],[9]).get('a')!.join('');assert.match(rendered,/\\PageWeaveParaPart/);assert.match(rendered,/\\textbf\{before \}/);assert.match(rendered,/\\MogaoInlineMath\{x\^2\}/);assert.match(rendered,/\\textit\{ after\}/);assert.equal((rendered.match(/\\PageWeaveBreak/g)??[]).length,1);
 assert.throws(()=>pagePlanSource(doc,[],{source:serializeRich(doc),breaks:[9,9],layout:{width:100,height:100,margin:10}},[]),/无效/);
});
test('Generated plans do not change semantic source or the undo stack and stale plans are ignored',async()=>{
 const p=await Project.open('examples/writing');const before=p.history.texts.get(p.main),state=p.state(),doc=flowDocument(state.writing),layout=paperLayout(state),plan={source:serializeRich(doc),breaks:[],layout};
 const next=p.pagePlan(plan,p.version);assert.equal(next.version,1);assert.equal(p.history.texts.get(p.main),before);assert.equal(p.history.canUndo,false);const source=p.history.texts.get('pageweave-pages.tex')!;assert.match(source,/PageWeaveCheckFile/);assert.ok(!source.includes(p.root));p.pagePlan(plan,p.version);assert.equal(p.version,1);
 p.pagePlan({...plan,source:'stale'},p.version);assert.equal(p.version,1);p.pagePlan({...plan,layout:{...layout,margin:10}},p.version);assert.equal(p.version,1);
});
