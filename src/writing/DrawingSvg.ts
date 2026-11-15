import katex from 'katex';
import {validateDiagram,edgePath,pathSamples,pathMiddle,arrowPath,shapePaths,shapeLines,svgPath,polygonPath,center,type Diagram,type DiagramNode} from '../../core/drawing';
export const xml=(text:string)=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
const mathCache=new Map<string,string>();
export function mathHtml(latex:string){let html=mathCache.get(latex);if(html===undefined){html=katex.renderToString(latex,{displayMode:true,throwOnError:false,trust:false,strict:'ignore',output:'html'});if(mathCache.size>=180)mathCache.delete(mathCache.keys().next().value!);mathCache.set(latex,html);}return html;}
const formula=(x:number,y:number,w:number,h:number,text:string,color:string,size:number)=>`<foreignObject x="${x}" y="${y}" width="${w}" height="${h}" style="overflow:visible;pointer-events:none"><div xmlns="http://www.w3.org/1999/xhtml" class="drawing-math" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:${size}px;color:${color};line-height:1.2">${mathHtml(text)}</div></foreignObject>`;
export function shapeSvg(n:DiagramNode){return shapePaths(n).map(p=>`<path d="${svgPath(p.commands)}" fill="${p.fill?n.fill:'none'}" stroke="${n.stroke}" stroke-width="${n.strokeWidth??2}" stroke-linejoin="round" ${n.dashed?'stroke-dasharray="7 5"':''}/>`).join('');}
export function diagramSvgContent(value:Diagram){
  const d=validateDiagram(value),result:string[]=[];
  for(const e of d.edges){const commands=edgePath(d,e),points=pathSamples(commands),path=svgPath(commands),width=e.strokeWidth??2;result.push(`<g data-edge="${e.id}" aria-label="${xml(e.label||'连线')}"><path d="${path}" fill="none" stroke="${e.color}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round" ${e.dashed?'stroke-dasharray="7 5"':''}/><path class="edge-hit" d="${path}" fill="none" stroke="transparent" stroke-width="14"/>`);
    for(const [p,kind] of [[points,e.endArrow??'triangle'],[[...points].reverse(),e.startArrow??'none']] as const){const commands=arrowPath(p as typeof points,kind,9+width);if(commands.length)result.push(`<path d="${svgPath(commands)}" fill="${kind==='open'?'none':e.color}" stroke="${e.color}" stroke-width="${width}" stroke-linejoin="round"/>`);}
    if(e.label){const mid=pathMiddle(commands);result.push(e.labelMode==='math'?formula(mid.x-100,mid.y-25,200,50,e.label,e.color,14):`<text x="${mid.x}" y="${mid.y}" dy=".35em" text-anchor="middle" font-size="14" fill="${e.color}" stroke="white" stroke-width="4" paint-order="stroke" pointer-events="none">${xml(e.label)}</text>`);}result.push('</g>');
  }
  for(const n of d.nodes){const c=center(n),lines=shapeLines(n);result.push(`<g data-node="${n.id}" aria-label="${xml(n.text||'图形')}" transform="rotate(${n.rotation??0} ${c.x} ${c.y})">${n.kind==='text'?`<rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" fill="transparent"/>`:''}${shapeSvg(n)}`);
    result.push(n.textMode==='math'?formula(n.x,n.y,n.width,n.height,n.text,n.color,n.fontSize):`<text text-anchor="middle" font-size="${n.fontSize}" fill="${n.color}" pointer-events="none">${lines.map((line,i)=>`<tspan x="${c.x}" y="${c.y+(i-(lines.length-1)/2)*n.fontSize*1.25}" dy=".35em">${xml(line)}</tspan>`).join('')}</text>`);result.push('</g>');
  }
  for(const s of d.strokes??[]){const path=svgPath(polygonPath(s.points,s.closed));result.push(`<g data-stroke="${s.id}"><path d="${path}" fill="${s.closed?s.fill:'none'}" stroke="${s.color}" stroke-width="${s.strokeWidth}" stroke-linejoin="round" stroke-linecap="round" ${s.dashed?'stroke-dasharray="7 5"':''}/><path d="${path}" fill="none" stroke="transparent" stroke-width="12"/></g>`);}
  return result.join('');
}
