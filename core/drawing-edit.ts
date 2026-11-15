import {center,edgePath,pathSamples,rotatePoint,validateDiagram,type Diagram,type DiagramNode,type DiagramStroke,type Point} from './drawing';
export interface Bounds {x:number;y:number;width:number;height:number}
export function pointBounds(points:Point[]):Bounds {const xs=points.map(p=>p.x),ys=points.map(p=>p.y),x=Math.min(...xs),y=Math.min(...ys);return {x,y,width:Math.max(...xs)-x,height:Math.max(...ys)-y};}
export const inside=(p:Point,r:Bounds)=>p.x>=r.x&&p.y>=r.y&&p.x<=r.x+r.width&&p.y<=r.y+r.height;
export function resizeStroke(stroke:DiagramStroke,next:Bounds):DiagramStroke {const before=pointBounds(stroke.points);return {...stroke,points:stroke.points.map(p=>({x:next.x+(before.width?(p.x-before.x)/before.width:.5)*next.width,y:next.y+(before.height?(p.y-before.y)/before.height:.5)*next.height}))};}
export function objectBounds(d:Diagram,id:string):Bounds|null {
  const n=d.nodes.find(n=>n.id===id);if(n)return pointBounds([{x:n.x,y:n.y},{x:n.x+n.width,y:n.y},{x:n.x+n.width,y:n.y+n.height},{x:n.x,y:n.y+n.height}].map(p=>rotatePoint(p,center(n),n.rotation??0)));
  const e=d.edges.find(e=>e.id===id);if(e)return pointBounds(pathSamples(edgePath(d,e)));
  const s=d.strokes?.find(s=>s.id===id);return s?pointBounds(s.points):null;
}
export function selectionBounds(d:Diagram,ids:string[]):Bounds|null {const points=ids.flatMap(id=>{const r=objectBounds(d,id);return r?[{x:r.x,y:r.y},{x:r.x+r.width,y:r.y+r.height}]:[];});return points.length?pointBounds(points):null;}
export function moveObjects(d:Diagram,ids:string[],dx:number,dy:number):Diagram {
  const selected=new Set(ids),bounds=selectionBounds(d,ids);if(!bounds)return d;
  dx=Math.max(-bounds.x,Math.min(d.width-bounds.x-bounds.width,dx));dy=Math.max(-bounds.y,Math.min(d.height-bounds.y-bounds.height,dy));const move=(p:Point)=>({x:p.x+dx,y:p.y+dy});
  return {...d,nodes:d.nodes.map(n=>selected.has(n.id)?{...n,x:n.x+dx,y:n.y+dy}:n),strokes:d.strokes?.map(s=>selected.has(s.id)?{...s,points:s.points.map(move)}:s),edges:d.edges.map(e=>selected.has(e.id)||selected.has(e.from)&&selected.has(e.to)?{...e,...(e.start?{start:move(e.start)}:{}),...(e.end?{end:move(e.end)}:{}),waypoints:e.waypoints?.map(move)}:e)};
}
export function removeObjects(d:Diagram,ids:string[]):Diagram {const selected=new Set(ids);return {...d,nodes:d.nodes.filter(n=>!selected.has(n.id)),edges:d.edges.filter(e=>!selected.has(e.id)&&!selected.has(e.from)&&!selected.has(e.to)),strokes:d.strokes?.filter(s=>!selected.has(s.id))};}
export function duplicateObjects(source:Diagram,target:Diagram,ids:string[],makeId:()=>string):{diagram:Diagram;ids:string[]} {
  const selected=new Set(ids),mapped=new Map<string,string>(),next=(id:string)=>{const value=makeId();mapped.set(id,value);return value;};
  const nodes=source.nodes.filter(n=>selected.has(n.id)).map(n=>({...n,id:next(n.id)})),strokes=(source.strokes??[]).filter(s=>selected.has(s.id)).map(s=>({...s,id:next(s.id),points:s.points.map(p=>({...p}))}));
  const edges=source.edges.filter(e=>selected.has(e.id)||selected.has(e.from)&&selected.has(e.to)).map(e=>{const p=pathSamples(edgePath(source,e));return {...e,id:next(e.id),from:mapped.get(e.from)??'',to:mapped.get(e.to)??'',start:p[0],end:p.at(-1)!,waypoints:e.waypoints?.map(p=>({...p}))};});
  const diagram={...target,nodes:[...target.nodes,...nodes],edges:[...target.edges,...edges],strokes:[...(target.strokes??[]),...strokes]},newIds=[...mapped.values()];return {diagram:validateDiagram(moveObjects(diagram,newIds,24,24)),ids:newIds};
}
export type Alignment='left'|'center'|'right'|'top'|'middle'|'bottom'|'horizontal'|'vertical';
export function alignNodes(d:Diagram,ids:string[],alignment:Alignment):Diagram {
  const nodes=d.nodes.filter(n=>ids.includes(n.id));if(nodes.length<2)return d;
  const bounds=pointBounds(nodes.flatMap(n=>[{x:n.x,y:n.y},{x:n.x+n.width,y:n.y+n.height}])),patch=new Map<string,DiagramNode>();
  if(alignment==='horizontal'||alignment==='vertical'){
    if(nodes.length<3)return d;const horizontal=alignment==='horizontal',key=horizontal?'x':'y',size=horizontal?'width':'height',sorted=[...nodes].sort((a,b)=>a[key]-b[key]),total=sorted.reduce((s,n)=>s+n[size],0),gap=(bounds[size]-total)/(nodes.length-1);let pos=bounds[key];for(const n of sorted){patch.set(n.id,{...n,[key]:pos});pos+=n[size]+gap;}
  }else for(const n of nodes){const p={...n};if(alignment==='left')p.x=bounds.x;if(alignment==='center')p.x=bounds.x+(bounds.width-n.width)/2;if(alignment==='right')p.x=bounds.x+bounds.width-n.width;if(alignment==='top')p.y=bounds.y;if(alignment==='middle')p.y=bounds.y+(bounds.height-n.height)/2;if(alignment==='bottom')p.y=bounds.y+bounds.height-n.height;patch.set(n.id,p);}
  return {...d,nodes:d.nodes.map(n=>patch.get(n.id)??n)};
}
