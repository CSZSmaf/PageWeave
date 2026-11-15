import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyDiagram,validateDiagram,upgradeDiagram,SHAPES,diagramTikz,edgePoints,edgePath,pathSamples,nodeAnchor,simplifyStroke,type Diagram,type DiagramNode} from '../core/drawing';
import {diagramTikz as legacyTikz,serializeDrawing as legacyDrawing,type Diagram as LegacyDiagram} from '../core/drawing-legacy';
import {parseRich,serializeRich} from '../core/writing';
import {moveObjects,duplicateObjects,removeObjects,alignNodes} from '../core/drawing-edit';
import {diagramSvgContent} from '../src/writing/DrawingSvg';

const node=(id:string,x=40):DiagramNode=>({id,kind:'rounded',x,y:100,width:160,height:80,text:'Text & <label>',fill:'#eef4ff',stroke:'#376dc1',color:'#203650',fontSize:18});
const sample=():Diagram=>validateDiagram({...emptyDiagram(),nodes:[node('a'),node('b',520)],edges:[{id:'ab',from:'a',to:'b',label:'x+y',route:'curve',color:'#526178',dashed:false,fromPort:'right',toPort:'left',waypoints:[{x:320,y:30},{x:420,y:240}],startArrow:'circle',endArrow:'open',labelMode:'math'}],strokes:[{id:'pen',points:[{x:20,y:360},{x:90,y:320},{x:150,y:380}],color:'#526178',strokeWidth:3,dashed:false,closed:false,fill:'none'}]});
test('旧流程图保留原 TeX，新编辑保存为可往返的新版绘图',()=>{
  const legacy:LegacyDiagram={version:1,width:800,height:420,nodes:[node('a') as LegacyDiagram['nodes'][0],node('b',520) as LegacyDiagram['nodes'][0]],edges:[{id:'ab',from:'a',to:'b',label:'旧连线',route:'elbow',color:'#526178',dashed:false}]};
  assert.equal(diagramTikz(legacy),legacyTikz(legacy));const source=legacyDrawing({type:'drawing',attrs:{drawing:legacy,width:90,textAlign:'center'}});assert.equal(serializeRich(parseRich(source)),source);
  const next=upgradeDiagram(legacy);assert.equal(next.version,2);const updated=serializeRich({type:'doc',content:[{type:'drawing',attrs:{drawing:next}}]});assert.equal(serializeRich(parseRich(updated)),updated);
});
test('十八种图形、旋转、公式、曲线和自由路径在正文往返保存',()=>{
  const d=sample();d.nodes=SHAPES.map(([kind],i)=>({...node('n'+i),kind,x:(i%5)*155,y:Math.floor(i/5)*105,width:140,height:85,rotation:i===0?25:0}));d.edges=[];d.nodes.push({...node('math',560),y:350,text:'\\frac{1}{n}\\sum_{i=1}^n x_i',textMode:'math',kind:'text'});
  const source=serializeRich({type:'doc',content:[{type:'drawing',attrs:{drawing:d}}]});assert.equal(serializeRich(parseRich(source)),source);assert.ok(source.includes('$\\displaystyle \\frac{1}{n}'));assert.ok(diagramTikz(d).includes('.. controls'));
  const svg=diagramSvgContent(d);assert.ok(svg.includes('foreignObject'));assert.ok(svg.includes('katex'));assert.ok(!svg.includes('<label>'));assert.ok(svg.includes('&amp;'));
});
test('旋转后的连接点与曲线端点跟随图形，支持自由端点',()=>{
  const d=sample();d.nodes[0].rotation=90;const p=nodeAnchor(d.nodes[0],{x:700,y:140},'right');assert.ok(Math.abs(p.x-120)<.001);assert.ok(Math.abs(p.y-220)<.001);
  const before=edgePoints(d,d.edges[0]);d.nodes[0].x+=20;const after=edgePoints(d,d.edges[0]);assert.equal(after[0].x-before[0].x,20);assert.deepEqual(after.slice(1,-1),before.slice(1,-1));assert.equal(edgePath(d,d.edges[0])[1].type,'C');
  const e={...d.edges[0],from:'',start:{x:10,y:40},to:'',end:{x:500,y:400}};assert.deepEqual(edgePoints(d,e)[0],e.start);assert.deepEqual(pathSamples(edgePath(d,e)).at(-1),e.end);
});
test('多选移动和复制保留内部连线、折点和自由路径，删除不留下孤立端点',()=>{
  const d=sample(),moved=moveObjects(d,['a','b','pen'],10,20);assert.equal(moved.nodes[0].x,50);assert.deepEqual(moved.edges[0].waypoints![0],{x:330,y:50});assert.equal(moved.strokes![0].points[0].y,380);
  let i=0;const result=duplicateObjects(d,d,['a','b','pen'],()=>`copy${++i}`);assert.equal(result.diagram.nodes.length,4);assert.equal(result.diagram.edges.length,2);assert.equal(result.diagram.edges[1].from,result.diagram.nodes[2].id);assert.equal(result.diagram.edges[1].to,result.diagram.nodes[3].id);assert.ok(result.ids.includes(result.diagram.edges[1].id));
  const removed=removeObjects(result.diagram,[result.diagram.nodes[2].id]);assert.equal(removed.edges.length,1);assert.equal(removed.strokes!.length,2);
});
test('对齐与均匀分布保持图形尺寸，画笔简化保留首尾和转折',()=>{
  const d={...emptyDiagram(),nodes:[node('a',10),{...node('b',300),y:200},{...node('c',610),y:300}]},aligned=alignNodes(d,['a','b','c'],'middle');assert.equal(aligned.nodes[0].y,aligned.nodes[2].y);assert.equal(aligned.nodes[0].width,160);
  const spaced=alignNodes(d,['a','b','c'],'horizontal');assert.equal(spaced.nodes[1].x,310);
  const points=Array.from({length:101},(_,i)=>({x:i,y:i<=50?i:100-i})),simple=simplifyStroke(points);assert.equal(simple.length,3);assert.deepEqual(simple[0],points[0]);assert.deepEqual(simple.at(-1),points.at(-1));
});
