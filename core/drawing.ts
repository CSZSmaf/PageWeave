import {bounded,hexColor} from './table-design';
import {encodeMetadata} from './page-furniture';
import {escapeText,type RichNode} from './writing';
import {validateDiagram as validateLegacy,diagramTikz as legacyTikz,type Diagram as LegacyDiagram} from './drawing-legacy';

export const SHAPES=[['rectangle','矩形'],['rounded','圆角矩形'],['ellipse','椭圆'],['diamond','判断'],['triangle','三角形'],['hexagon','六边形'],['parallelogram','输入输出'],['trapezoid','梯形'],['cylinder','数据库'],['document','文档'],['process','子流程'],['capsule','开始结束'],['cloud','云'],['note','便签'],['arrow','块箭头'],['star','星形'],['cross','十字'],['text','文字']] as const;
export type ShapeKind=typeof SHAPES[number][0];
export interface Point {x:number;y:number}
export type Port='auto'|'top'|'right'|'bottom'|'left';
export type ArrowKind='none'|'triangle'|'open'|'diamond'|'circle';
export interface DiagramNode {id:string;kind:ShapeKind;x:number;y:number;width:number;height:number;text:string;fill:string;stroke:string;color:string;fontSize:number;rotation?:number;strokeWidth?:number;dashed?:boolean;textMode?:'text'|'math'}
export interface DiagramEdge {id:string;from:string;to:string;label:string;route:'straight'|'elbow'|'curve';color:string;dashed:boolean;fromPort?:Port;toPort?:Port;start?:Point;end?:Point;waypoints?:Point[];startArrow?:ArrowKind;endArrow?:ArrowKind;strokeWidth?:number;labelMode?:'text'|'math'}
export interface DiagramStroke {id:string;points:Point[];color:string;strokeWidth:number;dashed:boolean;closed:boolean;fill:string}
export interface Diagram {version:1|2;width:number;height:number;nodes:DiagramNode[];edges:DiagramEdge[];strokes?:DiagramStroke[]}
export const emptyDiagram=():Diagram=>({version:2,width:800,height:480,nodes:[],edges:[],strokes:[]});
export function validateDiagram(value:unknown):Diagram {
  const v=value as Diagram;
  if(v?.version===1)return validateLegacy(v) as Diagram;
  if(!v||v.version!==2||!Array.isArray(v.nodes)||!Array.isArray(v.edges)||v.nodes.length>80||v.edges.length>160||(v.strokes?.length??0)>120)throw new Error('绘图最多支持 80 个图形、160 条连线和 120 条自由路径。');
  const width=bounded(v.width,800,240,2400),height=bounded(v.height,480,160,1800),ids=new Set<string>();
  const id=(s:string)=>{if(typeof s!=='string'||!/^[-a-z\d]{1,64}$/i.test(s)||ids.has(s))throw new Error('绘图对象标识无效。');ids.add(s);return s;};
  const pt=(p:Point):Point=>{if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))throw new Error('绘图坐标无效。');return {x:bounded(p.x,0,0,width),y:bounded(p.y,0,0,height)};};
  const color=(s:string)=>s==='none'?'none':hexColor(s,'#ffffff');
  const nodes=v.nodes.map(n=>{if(!n||!SHAPES.some(([kind])=>kind===n.kind)||typeof n.text!=='string'||n.text.length>2000)throw new Error('图形参数无效。');const w=bounded(n.width,160,24,width),h=bounded(n.height,72,20,height);return {id:id(n.id),kind:n.kind,x:bounded(n.x,20,0,width-w),y:bounded(n.y,20,0,height-h),width:w,height:h,text:n.text,fill:color(n.fill),stroke:hexColor(n.stroke,'#376dc1'),color:hexColor(n.color,'#203650'),fontSize:bounded(n.fontSize,18,8,80),rotation:bounded(n.rotation,0,-180,180),strokeWidth:bounded(n.strokeWidth,2,0,12),dashed:!!n.dashed,textMode:n.textMode==='math'?'math' as const:'text' as const};});
  const nodeIds=new Set(nodes.map(n=>n.id)),port=(p:Port|undefined):Port=>['top','right','bottom','left'].includes(p??'')?p!:'auto',arrow=(a:ArrowKind|undefined,fallback:ArrowKind):ArrowKind=>['none','triangle','open','diamond','circle'].includes(a??'')?a!:fallback;
  const edges=v.edges.map(e=>{if(!e||typeof e.label!=='string'||e.label.length>1000||e.from&&!nodeIds.has(e.from)||e.to&&!nodeIds.has(e.to)||e.from&&e.from===e.to||!e.from&&!e.start||!e.to&&!e.end)throw new Error('连线端点或文字无效。');if((e.waypoints?.length??0)>32)throw new Error('连线最多支持 32 个折点。');return {id:id(e.id),from:e.from||'',to:e.to||'',label:e.label,route:['elbow','curve'].includes(e.route)?e.route:'straight' as const,color:hexColor(e.color,'#526178'),dashed:!!e.dashed,fromPort:port(e.fromPort),toPort:port(e.toPort),...(e.start?{start:pt(e.start)}:{}),...(e.end?{end:pt(e.end)}:{}),waypoints:(e.waypoints??[]).map(pt),startArrow:arrow(e.startArrow,'none'),endArrow:arrow(e.endArrow,'triangle'),strokeWidth:bounded(e.strokeWidth,2,.5,12),labelMode:e.labelMode==='math'?'math' as const:'text' as const};});
  const strokes=(v.strokes??[]).map(s=>{if(!Array.isArray(s.points)||s.points.length<2||s.points.length>2000)throw new Error('自由路径需要 2–2000 个点。');return {id:id(s.id),points:s.points.map(pt),color:hexColor(s.color,'#526178'),strokeWidth:bounded(s.strokeWidth,2,.5,16),dashed:!!s.dashed,closed:!!s.closed,fill:color(s.fill)};});
  return {version:2,width,height,nodes,edges,strokes};
}
export const upgradeDiagram=(d:Diagram):Diagram=>validateDiagram({...d,version:2});
export const center=(n:DiagramNode):Point=>({x:n.x+n.width/2,y:n.y+n.height/2});
export function rotatePoint(p:Point,origin:Point,degrees:number):Point {const a=degrees*Math.PI/180,c=Math.cos(a),s=Math.sin(a),x=p.x-origin.x,y=p.y-origin.y;return {x:origin.x+x*c-y*s,y:origin.y+x*s+y*c};}
export type PathCommand={type:'M'|'L';p:Point}|{type:'C';a:Point;b:Point;p:Point}|{type:'Z'};
export interface ShapePath {commands:PathCommand[];fill:boolean}
export const polygonPath=(points:Point[],closed=true):PathCommand[]=>[...points.map((p,i)=>({type:i?'L' as const:'M' as const,p})),...(closed?[{type:'Z' as const}]:[])];
export function shapePaths(n:DiagramNode):ShapePath[]{
  const {x,y,width:w,height:h}=n,p=(a:number,b:number)=>({x:x+a*w,y:y+b*h}),outline=(points:number[][])=>polygonPath(points.map(([a,b])=>p(a,b))),paths:ShapePath[]=[],add=(commands:PathCommand[],fill=true)=>paths.push({commands,fill});
  const oval=(cy=.5,ry=.5):PathCommand[]=>[{type:'M',p:p(1,cy)},{type:'C',a:p(1,cy+ry*.55228475),b:p(.776142375,cy+ry),p:p(.5,cy+ry)},{type:'C',a:p(.223857625,cy+ry),b:p(0,cy+ry*.55228475),p:p(0,cy)},{type:'C',a:p(0,cy-ry*.55228475),b:p(.223857625,cy-ry),p:p(.5,cy-ry)},{type:'C',a:p(.776142375,cy-ry),b:p(1,cy-ry*.55228475),p:p(1,cy)},{type:'Z'}];
  switch(n.kind){
    case 'ellipse':add(oval());break;
    case 'diamond':add(outline([[.5,0],[1,.5],[.5,1],[0,.5]]));break;
    case 'triangle':add(outline([[.5,0],[1,1],[0,1]]));break;
    case 'hexagon':add(outline([[.2,0],[.8,0],[1,.5],[.8,1],[.2,1],[0,.5]]));break;
    case 'parallelogram':add(outline([[.2,0],[1,0],[.8,1],[0,1]]));break;
    case 'trapezoid':add(outline([[.2,0],[.8,0],[1,1],[0,1]]));break;
    case 'arrow':add(outline([[0,.25],[.65,.25],[.65,0],[1,.5],[.65,1],[.65,.75],[0,.75]]));break;
    case 'star':add(outline(Array.from({length:10},(_,i)=>{const a=-Math.PI/2+i*Math.PI/5,r=i%2?.22:.5;return [.5+Math.cos(a)*r,.5+Math.sin(a)*r];})));break;
    case 'cross':add(outline([[.33,0],[.67,0],[.67,.33],[1,.33],[1,.67],[.67,.67],[.67,1],[.33,1],[.33,.67],[0,.67],[0,.33],[.33,.33]]));break;
    case 'cloud':add([{type:'M',p:p(.22,.84)},{type:'C',a:p(-.08,.86),b:p(-.06,.35),p:p(.17,.32)},{type:'C',a:p(.1,-.04),b:p(.52,-.06),p:p(.57,.2)},{type:'C',a:p(.8,-.02),b:p(1,.22),p:p(.87,.4)},{type:'C',a:p(1.16,.6),b:p(.94,1.07),p:p(.7,.87)},{type:'C',a:p(.55,1.1),b:p(.25,1.02),p:p(.22,.84)},{type:'Z'}]);break;
    case 'document':add([{type:'M',p:p(0,0)},{type:'L',p:p(1,0)},{type:'L',p:p(1,.83)},{type:'C',a:p(.65,.57),b:p(.35,1.15),p:p(0,.9)},{type:'Z'}]);break;
    case 'note':add(outline([[0,0],[.78,0],[1,.22],[1,1],[0,1]]));add(polygonPath([p(.78,0),p(.78,.22),p(1,.22)],false),false);break;
    case 'cylinder':add([{type:'M',p:p(0,.16)},{type:'C',a:p(0,-.05),b:p(1,-.05),p:p(1,.16)},{type:'L',p:p(1,.84)},{type:'C',a:p(1,1.05),b:p(0,1.05),p:p(0,.84)},{type:'Z'}]);add([{type:'M',p:p(0,.16)},{type:'C',a:p(0,.37),b:p(1,.37),p:p(1,.16)}],false);break;
    case 'rounded':case 'capsule':{const r=n.kind==='capsule'?Math.min(w,h)/2:Math.min(12,w/4,h/4),rx=r/w,ry=r/h;add([{type:'M',p:p(rx,0)},{type:'L',p:p(1-rx,0)},{type:'C',a:p(1-rx*.448,0),b:p(1,ry*.448),p:p(1,ry)},{type:'L',p:p(1,1-ry)},{type:'C',a:p(1,1-ry*.448),b:p(1-rx*.448,1),p:p(1-rx,1)},{type:'L',p:p(rx,1)},{type:'C',a:p(rx*.448,1),b:p(0,1-ry*.448),p:p(0,1-ry)},{type:'L',p:p(0,ry)},{type:'C',a:p(0,ry*.448),b:p(rx*.448,0),p:p(rx,0)},{type:'Z'}]);break;}
    case 'text':break;
    default:add(outline([[0,0],[1,0],[1,1],[0,1]]));if(n.kind==='process'){add(polygonPath([p(.13,0),p(.13,1)],false),false);add(polygonPath([p(.87,0),p(.87,1)],false),false);}
  }return paths;
}
export function pathSamples(commands:PathCommand[],steps=16):Point[]{let current:Point={x:0,y:0},first=current;const points:Point[]=[];for(const cmd of commands){if(cmd.type==='Z'){points.push(first);current=first;}else if(cmd.type==='C'){const start=current;for(let i=1;i<=steps;i++){const t=i/steps,u=1-t;points.push({x:u*u*u*start.x+3*u*u*t*cmd.a.x+3*u*t*t*cmd.b.x+t*t*t*cmd.p.x,y:u*u*u*start.y+3*u*u*t*cmd.a.y+3*u*t*t*cmd.b.y+t*t*t*cmd.p.y});}current=cmd.p;}else{current=cmd.p;if(cmd.type==='M')first=current;points.push(current);}}return points;}
export function nodeAnchor(node:DiagramNode,target:Point,port:Port='auto'):Point {
  const c=center(node),rotation=node.rotation??0;
  if(port!=='auto'){const p={top:{x:c.x,y:node.y},right:{x:node.x+node.width,y:c.y},bottom:{x:c.x,y:node.y+node.height},left:{x:node.x,y:c.y}}[port];return rotatePoint(p,c,rotation);}
  const local=rotatePoint(target,c,-rotation),dx=local.x-c.x,dy=local.y-c.y;if(!dx&&!dy)return c;
  const border=pathSamples(shapePaths(node)[0]?.commands??polygonPath([{x:node.x,y:node.y},{x:node.x+node.width,y:node.y},{x:node.x+node.width,y:node.y+node.height},{x:node.x,y:node.y+node.height}]));
  let t=Infinity;for(let i=1;i<border.length;i++){const a=border[i-1],b=border[i],sx=b.x-a.x,sy=b.y-a.y,den=dx*sy-dy*sx;if(Math.abs(den)<1e-8)continue;const qx=a.x-c.x,qy=a.y-c.y,r=(qx*sy-qy*sx)/den,u=(qx*dy-qy*dx)/den;if(r>=0&&u>=0&&u<=1)t=Math.min(t,r);}
  return rotatePoint({x:c.x+dx*(Number.isFinite(t)?t:0),y:c.y+dy*(Number.isFinite(t)?t:0)},c,rotation);
}
export function edgePoints(d:Diagram,e:DiagramEdge):Point[]{
  const from=d.nodes.find(n=>n.id===e.from),to=d.nodes.find(n=>n.id===e.to),a=from?center(from):e.start!,b=to?center(to):e.end!,manual=e.waypoints??[];
  const start=(target:Point)=>from?nodeAnchor(from,target,e.fromPort):a,end=(target:Point)=>to?nodeAnchor(to,target,e.toPort):b;
  if(manual.length)return [start(manual[0]),...manual,end(manual.at(-1)!)];
  if(e.route==='straight')return [start(b),end(a)];
  const horizontal=Math.abs(b.x-a.x)>=Math.abs(b.y-a.y),s=start(horizontal?{x:b.x,y:a.y}:{x:a.x,y:b.y}),t=end(horizontal?{x:a.x,y:b.y}:{x:b.x,y:a.y});
  if(e.route==='curve')return horizontal?[s,{x:s.x+(t.x-s.x)/3,y:s.y},{x:t.x-(t.x-s.x)/3,y:t.y},t]:[s,{x:s.x,y:s.y+(t.y-s.y)/3},{x:t.x,y:t.y-(t.y-s.y)/3},t];
  return horizontal?[s,{x:(s.x+t.x)/2,y:s.y},{x:(s.x+t.x)/2,y:t.y},t]:[s,{x:s.x,y:(s.y+t.y)/2},{x:t.x,y:(s.y+t.y)/2},t];
}
export function edgePath(d:Diagram,e:DiagramEdge):PathCommand[]{const p=edgePoints(d,e);return e.route==='curve'?[{type:'M',p:p[0]},{type:'C',a:p[1]??p[0],b:p[p.length-2]??p[0],p:p.at(-1)!}]:polygonPath(p,false);}
export function pathMiddle(commands:PathCommand[]):Point {const p=pathSamples(commands),lengths=p.slice(1).map((v,i)=>Math.hypot(v.x-p[i].x,v.y-p[i].y));let remaining=lengths.reduce((a,b)=>a+b,0)/2;for(let i=0;i<lengths.length;i++){if(remaining<=lengths[i]){const t=lengths[i]?remaining/lengths[i]:0;return {x:p[i].x+(p[i+1].x-p[i].x)*t,y:p[i].y+(p[i+1].y-p[i].y)*t};}remaining-=lengths[i];}return p[0];}
export function arrowPoints(points:Point[],size=10){const tip=points.at(-1)!,previous=[...points.slice(0,-1)].reverse().find(p=>Math.hypot(p.x-tip.x,p.y-tip.y)>.01)??{x:tip.x-1,y:tip.y},a=Math.atan2(tip.y-previous.y,tip.x-previous.x);return [tip,{x:tip.x-size*Math.cos(a)+size*.42*Math.sin(a),y:tip.y-size*Math.sin(a)-size*.42*Math.cos(a)},{x:tip.x-size*Math.cos(a)-size*.42*Math.sin(a),y:tip.y-size*Math.sin(a)+size*.42*Math.cos(a)}];}
export function arrowPath(points:Point[],kind:ArrowKind,size=10):PathCommand[]{if(kind==='none')return [];const [tip,a,b]=arrowPoints(points,size),c={x:(a.x+b.x)/2,y:(a.y+b.y)/2};if(kind==='open')return polygonPath([a,tip,b],false);if(kind==='diamond')return polygonPath([tip,a,{x:2*c.x-tip.x,y:2*c.y-tip.y},b]);if(kind==='circle'){const r=size*.4;return polygonPath(Array.from({length:24},(_,i)=>({x:c.x+r*Math.cos(i*Math.PI/12),y:c.y+r*Math.sin(i*Math.PI/12)})));}return polygonPath([tip,a,b]);}
export function shapeLines(n:DiagramNode){const width=n.width*(['diamond','triangle','star','cross'].includes(n.kind)?.55:.85),max=Math.max(1,Math.floor(n.height*.85/(n.fontSize*1.25))),lines:string[]=[];let line='',used=0;for(const char of n.text){const size=char.codePointAt(0)!>255?1:.56;if(char==='\n'||used+size>width/n.fontSize){lines.push(line);line=char==='\n'?'':char;used=char==='\n'?0:size;}else{line+=char;used+=size;}}lines.push(line);if(lines.length>max){lines.length=max;lines[max-1]=lines[max-1].slice(0,-1)+'…';}return lines;}
export function simplifyStroke(points:Point[],tolerance=1.2):Point[]{if(points.length<=2)return points;const a=points[0],b=points.at(-1)!,dx=b.x-a.x,dy=b.y-a.y,len=dx*dx+dy*dy;let max=0,index=0;for(let i=1;i<points.length-1;i++){const p=points[i],t=len?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/len)):0,d=Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);if(d>max){max=d;index=i;}}return max>tolerance?[...simplifyStroke(points.slice(0,index+1),tolerance).slice(0,-1),...simplifyStroke(points.slice(index),tolerance)]:[a,b];}
export const fmt=(n:number)=>Number(n.toFixed(3));
export const svgPath=(commands:PathCommand[])=>commands.map(c=>c.type==='Z'?'Z':c.type==='C'?`C${fmt(c.a.x)},${fmt(c.a.y)} ${fmt(c.b.x)},${fmt(c.b.y)} ${fmt(c.p.x)},${fmt(c.p.y)}`:`${c.type}${fmt(c.p.x)},${fmt(c.p.y)}`).join(' ');
const point=(p:Point)=>`(${fmt(p.x)},${fmt(p.y)})`;
const tikzPath=(commands:PathCommand[])=>commands.map(c=>c.type==='Z'?'-- cycle':c.type==='C'?`.. controls ${point(c.a)} and ${point(c.b)} .. ${point(c.p)}`:`${c.type==='L'?'-- ':''}${point(c.p)}`).join(' ');
export function diagramTikz(input:Diagram):string {
  if(input.version===1)return legacyTikz(input as LegacyDiagram);
  const d=validateDiagram(input),result=[`\\begin{tikzpicture}[x=.75bp,y=-.75bp]`,`\\path[use as bounding box] (0,0) rectangle (${d.width},${d.height});`,`\\clip (0,0) rectangle (${d.width},${d.height});`];
  const stroke=(commands:PathCommand[],color:string,width:number,dashed=false,fill='none')=>{result.push(`\\definecolor{PWStroke}{HTML}{${color.slice(1)}}`);if(fill!=='none')result.push(`\\definecolor{PWFill}{HTML}{${fill.slice(1)}}`);result.push(`\\path[draw=${width?'PWStroke':'none'},line width=${fmt(width*.75)}bp,line join=round,line cap=round${dashed?',dash pattern=on 5bp off 3bp':''},fill=${fill==='none'?'none':'PWFill'}] ${tikzPath(commands)};`);};
  const label=(at:Point,text:string,mode:'text'|'math',color:string,size:number,rotation=0,background=false)=>{result.push(`\\definecolor{PWText}{HTML}{${color.slice(1)}}`,`\\node[${background?'fill=white,inner sep=2bp':'inner sep=0pt'},text=PWText,align=center,rotate=${-rotation},font=\\fontsize{${fmt(size*.75)}bp}{${fmt(size*.9375)}bp}\\selectfont] at ${point(at)} {${mode==='math'?`$\\displaystyle ${text||'\\strut'}$`:`\\shortstack{${text.split('\n').map(escapeText).join('\\\\')}}`}};`);};
  for(const e of d.edges){const commands=edgePath(d,e),points=pathSamples(commands);stroke(commands,e.color,e.strokeWidth!,e.dashed);for(const [p,kind] of [[points,e.endArrow!],[[...points].reverse(),e.startArrow!]] as [Point[],ArrowKind][]){const a=arrowPath(p,kind,9+e.strokeWidth!);if(a.length)stroke(a,e.color,e.strokeWidth!,false,kind==='open'?'none':e.color);}if(e.label)label(pathMiddle(commands),e.label,e.labelMode!,e.color,14,0,true);}
  for(const n of d.nodes){const c=center(n),rotation=n.rotation??0;for(const part of shapePaths(n)){const commands=part.commands.map(command=>command.type==='Z'?command:command.type==='C'?{...command,p:rotatePoint(command.p,c,rotation),a:rotatePoint(command.a,c,rotation),b:rotatePoint(command.b,c,rotation)}:{...command,p:rotatePoint(command.p,c,rotation)});stroke(commands,n.stroke,n.strokeWidth!,n.dashed,part.fill?n.fill:'none');}label(c,n.textMode==='math'?n.text:shapeLines(n).join('\n'),n.textMode!,n.color,n.fontSize,rotation);}
  for(const s of d.strokes??[])stroke(polygonPath(s.points,s.closed),s.color,s.strokeWidth,s.dashed,s.closed?s.fill:'none');
  result.push('\\end{tikzpicture}');return result.join('\n');
}
export function serializeDrawing(node:RichNode){const d=validateDiagram(node.attrs?.drawing),width=bounded(node.attrs?.width,90,15,100),align=['left','center','right'].includes(node.attrs?.textAlign)?node.attrs!.textAlign:'center';return `\\PageWeaveDrawing{${encodeMetadata(d)}}{${width/100}}{${align}}{\n${diagramTikz(d)}\n}`;}
