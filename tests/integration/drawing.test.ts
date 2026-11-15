import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {Project} from '../../core/project';
import {Compiler} from '../../core/compiler';
import {emptyDiagram,SHAPES,validateDiagram,type Diagram,type DiagramNode} from '../../core/drawing';
import {flowDocument,flowParts} from '../../core/flow';
import {serializeRich,type RichNode} from '../../core/writing';

test('扩展绘图的公式、图形库、箭头、自由路径可编译并重开编辑',{timeout:120000},async()=>{
  const root=path.resolve('output/drawing-integration-'+Date.now());await fs.mkdir(root,{recursive:true});const project=await Project.createDocument(path.join(root,'drawing.tex'),path.resolve('examples/writing'));
  const base=(id:string,kind:DiagramNode['kind'],text:string,x:number,y:number,w=150,h=85):DiagramNode=>({id,kind,text,x,y,width:w,height:h,fill:'#eef4ff',stroke:'#376dc1',color:'#203650',fontSize:18,strokeWidth:2});
  const shapes:Diagram=validateDiagram({...emptyDiagram(),width:800,height:580,nodes:SHAPES.map(([kind,label],i)=>base('s'+i,kind,label,15+i%4*198,15+Math.floor(i/4)*112,170,85))});
  const diagram:Diagram=validateDiagram({...emptyDiagram(),nodes:[base('input','cylinder','输入数据',30,175),{...base('formula','rounded','\\mathbf{y}=\\operatorname{softmax}(W\\mathbf{x}+b)',260,150,280,110),textMode:'math',fontSize:20},base('output','document','输出结果',620,175),{...base('rotate','note','可旋转',310,340),rotation:20}],edges:[{id:'curve',from:'input',to:'formula',label:'\\mathbf{x}',labelMode:'math',route:'curve',fromPort:'right',toPort:'left',waypoints:[{x:210,y:80},{x:230,y:320}],startArrow:'circle',endArrow:'triangle',strokeWidth:2,color:'#526178',dashed:false},{id:'line',from:'formula',to:'output',label:'预测',route:'elbow',startArrow:'none',endArrow:'open',color:'#526178',dashed:true},{id:'free',from:'',to:'',start:{x:100,y:410},end:{x:220,y:340},route:'straight',label:'',startArrow:'diamond',endArrow:'triangle',color:'#7558a6',dashed:false}],strokes:[{id:'freehand',points:[{x:30,y:100},{x:70,y:70},{x:110,y:110},{x:160,y:60},{x:200,y:100}],color:'#376dc1',strokeWidth:3,dashed:false,closed:false,fill:'none'},{id:'polygon',points:[{x:590,y:350},{x:690,y:320},{x:755,y:390},{x:660,y:430}],color:'#7558a6',strokeWidth:2,dashed:false,closed:true,fill:'#f2edfb'}]});
  const heading=(text:string):RichNode=>({type:'heading',attrs:{level:1},content:[{type:'text',text}]}),content:RichNode[]=[heading('图形库'),{type:'drawing',attrs:{drawing:shapes,width:100,textAlign:'center'}},{type:'pageBreak'},heading('科研流程图'),{type:'drawing',attrs:{drawing:diagram,width:100,textAlign:'center'}}];
  project.writeFlow(flowParts({type:'doc',content},project.state().writing[0].id),project.version);await project.save();const compiler=new Compiler(path.join(root,'builds')),result=await compiler.compile(project);assert.ok(result.ok,result.log.slice(-6500));await fs.writeFile(path.join(root,'drawing.pdf'),result.pdf!);
  const reopened=await Project.openFile(path.join(root,'drawing.tex'));assert.equal(serializeRich(flowDocument(reopened.state().writing)),serializeRich(flowDocument(project.state().writing)));assert.ok(!/Undefined control sequence|Missing character/.test(result.log));
  console.log('Drawing PDF: '+path.join(root,'drawing.pdf'));
});
