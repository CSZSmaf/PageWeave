import {bounded,hexColor} from './table-design';
import {encodeMetadata} from './page-furniture';
import {escapeText,type RichNode} from './writing';
export type ShapeKind='rectangle'|'rounded'|'diamond'|'ellipse';
export interface DiagramNode {id:string;kind:ShapeKind;x:number;y:number;width:number;height:number;text:string;fill:string;stroke:string;color:string;fontSize:number}
export interface DiagramEdge {id:string;from:string;to:string;label:string;route:'straight'|'elbow';color:string;dashed:boolean}
export interface Diagram {version:1;width:number;height:number;nodes:DiagramNode[];edges:DiagramEdge[]}
export const emptyDiagram=():Diagram=>({version:1,width:800,height:420,nodes:[],edges:[]});
export function validateDiagram(value:unknown):Diagram {
  const v=value as Diagram;if(!v||v.version!==1||!Array.isArray(v.nodes)||!Array.isArray(v.edges)||v.nodes.length>80||v.edges.length>160)throw new Error('绘图最多支持 80 个图形和 160 条连线。');
  const width=bounded(v.width,800,240,1600),height=bounded(v.height,420,160,1200),ids=new Set<string>();
  const id=(value:string)=>{if(typeof value!=='string'||!/^[-a-z\d]{1,64}$/i.test(value)||ids.has(value))throw new Error('绘图对象标识无效。');ids.add(value);return value;};
  const nodes=v.nodes.map(n=>{if(!n||!['rectangle','rounded','diamond','ellipse'].includes(n.kind)||typeof n.text!=='string'||n.text.length>400)throw new Error('图形参数无效。');const w=bounded(n.width,140,40,width),h=bounded(n.height,60,28,height);return {id:id(n.id),kind:n.kind,x:bounded(n.x,20,0,width-w),y:bounded(n.y,20,0,height-h),width:w,height:h,text:n.text,fill:hexColor(n.fill,'#eaf2ff'),stroke:hexColor(n.stroke,'#2463c7'),color:hexColor(n.color,'#203650'),fontSize:bounded(n.fontSize,18,8,40)};});
  const nodeIds=new Set(nodes.map(n=>n.id));
  const edges=v.edges.map(e=>{if(!e||!nodeIds.has(e.from)||!nodeIds.has(e.to)||e.from===e.to||typeof e.label!=='string'||e.label.length>80)throw new Error('连线端点或文字无效。');return {id:id(e.id),from:e.from,to:e.to,label:e.label,route:e.route==='elbow'?'elbow' as const:'straight' as const,color:hexColor(e.color,'#526178'),dashed:!!e.dashed};});
  return {version:1,width,height,nodes,edges};
}
export interface Point {x:number;y:number}
function anchor(node:DiagramNode,target:Point):Point {
  const center={x:node.x+node.width/2,y:node.y+node.height/2},dx=target.x-center.x,dy=target.y-center.y;
  const rx=node.width/2,ry=node.height/2;let factor:number;
  if(!dx&&!dy)return center;
  if(node.kind==='ellipse')factor=1/Math.sqrt(dx*dx/(rx*rx)+dy*dy/(ry*ry));
  else if(node.kind==='diamond')factor=1/(Math.abs(dx)/rx+Math.abs(dy)/ry);
  else factor=1/Math.max(Math.abs(dx)/rx,Math.abs(dy)/ry);
  return {x:center.x+dx*factor,y:center.y+dy*factor};
}
export function edgePoints(diagram:Diagram,edge:DiagramEdge):Point[]{
  const from=diagram.nodes.find(n=>n.id===edge.from)!,to=diagram.nodes.find(n=>n.id===edge.to)!,a={x:from.x+from.width/2,y:from.y+from.height/2},b={x:to.x+to.width/2,y:to.y+to.height/2};
  if(edge.route==='straight')return [anchor(from,b),anchor(to,a)];
  if(Math.abs(b.x-a.x)>Math.abs(b.y-a.y)){const start=anchor(from,{x:b.x,y:a.y}),end=anchor(to,{x:a.x,y:b.y}),x=(start.x+end.x)/2;return [start,{x,y:start.y},{x,y:end.y},end];}
  const start=anchor(from,{x:a.x,y:b.y}),end=anchor(to,{x:b.x,y:a.y}),y=(start.y+end.y)/2;return [start,{x:start.x,y},{x:end.x,y},end];
}
export function arrowPoints(points:Point[]){const tip=points.at(-1)!,previous=[...points.slice(0,-1)].reverse().find(p=>p.x!==tip.x||p.y!==tip.y)??{x:tip.x-1,y:tip.y},angle=Math.atan2(tip.y-previous.y,tip.x-previous.x);return [tip,{x:tip.x-10*Math.cos(angle)+4*Math.sin(angle),y:tip.y-10*Math.sin(angle)-4*Math.cos(angle)},{x:tip.x-10*Math.cos(angle)-4*Math.sin(angle),y:tip.y-10*Math.sin(angle)+4*Math.cos(angle)}];}
export function shapeLines(node:DiagramNode){
  const width=node.width*(node.kind==='diamond'?.62:.88),max=Math.max(1,Math.floor(node.height*(node.kind==='diamond'?.65:.9)/(node.fontSize*1.25))),lines:string[]=[];let line='',used=0;
  for(const char of node.text){const size=char.codePointAt(0)!>255?1:.56;if(char==='\n'||used+size>width/node.fontSize){lines.push(line);line=char==='\n'?'':char;used=char==='\n'?0:size;}else{line+=char;used+=size;}}
  lines.push(line);if(lines.length>max){lines.length=max;lines[max-1]=lines[max-1].slice(0,-1)+'…';}return lines;
}
const point=(p:Point)=>`(${Number(p.x.toFixed(2))},${Number(p.y.toFixed(2))})`;
export function diagramTikz(input:Diagram){
  const d=validateDiagram(input),result=[`\\begin{tikzpicture}[x=.75bp,y=-.75bp]`,`\\path[use as bounding box] (0,0) rectangle (${d.width},${d.height});`];
  for(const e of d.edges){const points=edgePoints(d,e),arrow=arrowPoints(points);result.push(`\\definecolor{PWStroke}{HTML}{${e.color.slice(1)}}`,`\\draw[draw=PWStroke,line width=1.5bp${e.dashed?',dashed':''}] ${points.map(point).join(' -- ')};`,`\\fill[fill=PWStroke] ${arrow.map(point).join(' -- ')} -- cycle;`);if(e.label){const middle=points[Math.floor((points.length-1)/2)],next=points[Math.ceil((points.length-1)/2)];result.push(`\\node[fill=white,inner sep=2bp,text=PWStroke,font=\\fontsize{10.5bp}{13bp}\\selectfont] at ${point({x:(middle.x+next.x)/2,y:(middle.y+next.y)/2})} {${escapeText(e.label)}};`);}}
  for(const n of d.nodes){result.push(`\\definecolor{PWFill}{HTML}{${n.fill.slice(1)}}`,`\\definecolor{PWStroke}{HTML}{${n.stroke.slice(1)}}`,`\\definecolor{PWText}{HTML}{${n.color.slice(1)}}`);const style='fill=PWFill,draw=PWStroke,line width=1.5bp';
    if(n.kind==='ellipse')result.push(`\\draw[${style}] ${point({x:n.x+n.width/2,y:n.y+n.height/2})} ellipse [x radius=${n.width/2},y radius=${n.height/2}];`);
    else if(n.kind==='diamond')result.push(`\\draw[${style}] ${[{x:n.x+n.width/2,y:n.y},{x:n.x+n.width,y:n.y+n.height/2},{x:n.x+n.width/2,y:n.y+n.height},{x:n.x,y:n.y+n.height/2}].map(point).join(' -- ')} -- cycle;`);
    else result.push(`\\draw[${style}${n.kind==='rounded'?',rounded corners=7bp':''}] ${point({x:n.x,y:n.y})} rectangle ${point({x:n.x+n.width,y:n.y+n.height})};`);
    const lines=shapeLines(n);result.push(`\\node[inner sep=0pt,text=PWText,align=center,font=\\fontsize{${n.fontSize*.75}bp}{${n.fontSize*.9375}bp}\\selectfont] at ${point({x:n.x+n.width/2,y:n.y+n.height/2})} {\\shortstack{${lines.map(escapeText).join('\\\\')}}};`);
  }
  result.push('\\end{tikzpicture}');return result.join('\n');
}
export function serializeDrawing(node:RichNode){const d=validateDiagram(node.attrs?.drawing),width=bounded(node.attrs?.width,90,15,100),align=['left','center','right'].includes(node.attrs?.textAlign)?node.attrs!.textAlign:'center';return `\\PageWeaveDrawing{${encodeMetadata(d)}}{${width/100}}{${align}}{\n${diagramTikz(d)}\n}`;}
