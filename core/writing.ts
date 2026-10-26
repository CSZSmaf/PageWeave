import type { Range } from './types';
import {designedTable,serializeDesignedTable,parseTableOptions,tableColumnSpec,cellFill} from './table-design';
import {designedParagraph,serializeDesignedParagraph} from './paragraph-design';
import {serializeDrawing,validateDiagram,diagramTikz} from './drawing';
import {decodeMetadata} from './page-furniture';
import {linkTex,readLinkTex} from './inline-format';
import {legacyTex} from './tex-names';
export interface RichNode { type: string; text?: string; attrs?: Record<string, any>; marks?: {type:string;attrs?:Record<string,any>}[]; content?: RichNode[] }
export interface WritingBlock { id:string; file:string; line:number; range:Range; bodyRange:Range; content:RichNode; editable:boolean; error?:string }
export interface WritingRegion { id:string; page:number; x:number; y:number; width:number; height:number }
export const FONTS=['SimSun','Microsoft YaHei','SimHei','KaiTi','FangSong','Times New Roman','Arial','Calibri'];
export function readGroup(s:string,start:number):{from:number;to:number;text:string;inner:Range}|undefined{
  let i=start;while(/\s/.test(s[i]??'')&&i<s.length)i++;if(s[i]!=='{')return;
  const from=i;let depth=1;
  for(i++;i<s.length;i++){
    if(s[i]==='\\'){i++;continue;}
    if(s[i]==='%'){const end=s.indexOf('\n',i);i=end<0?s.length:end;continue;}
    if(s[i]==='{')depth++;if(s[i]==='}'&&--depth===0)return {from,to:i+1,text:s.slice(from+1,i),inner:{from:from+1,to:i}};
  }
}
const special:Record<string,string>={'\\':'\\textbackslash{}','{':'\\{','}':'\\}','$':'\\$','%':'\\%','&':'\\&','#':'\\#','_':'\\_','~':'\\textasciitilde{}','^':'\\textasciicircum{}'};
export function escapeText(text:string){return text.replace(/[\\{}$%&#_~^]/g,c=>special[c]);}
function num(value:unknown,fallback:number,min:number,max:number){const n=Number.parseFloat(String(value??fallback));return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;}
function imagePath(value:unknown){const path=String(value??'');if(!/^[a-zA-Z0-9_./ -]+\.(png|jpe?g)$/i.test(path)||path.startsWith('/')||path.split('/').includes('..'))throw new Error('无效的工程图片路径。');return path;}
export function serializeInline(node:RichNode):string{
  if(node.type==='hardBreak')return '\\MogaoLineBreak{}';
  if(node.type==='inlineMath')return `\\MogaoInlineMath{${node.attrs?.latex??''}}`;
  if(node.type!=='text')throw new Error('不支持的正文结构：'+node.type);
  let result=escapeText(node.text??'');
  const order=['bold','italic','underline','strike','superscript','subscript'];
  for(const mark of [...(node.marks??[])].sort((a,b)=>order.indexOf(a.type)-order.indexOf(b.type))) {
    if(mark.type==='bold')result=`\\textbf{${result}}`;
    if(mark.type==='italic')result=`\\textit{${result}}`;
    if(mark.type==='underline')result=`\\uline{${result}}`;
    if(mark.type==='strike')result=`\\sout{${result}}`;
    if(mark.type==='superscript')result=`\\textsuperscript{${result}}`;
    if(mark.type==='subscript')result=`\\textsubscript{${result}}`;
  }
  const style=node.marks?.find(m=>m.type==='textStyle')?.attrs;
  if(style){const family=FONTS.includes(style.fontFamily)?style.fontFamily:'';const size=style.fontSize?num(style.fontSize,12,6,96):'';const color=/^#[a-f\d]{6}$/i.test(style.color??'')?style.color.slice(1):'';result=`\\MogaoText{${family}}{${size}}{${color}}{${result}}`;}
  const link=node.marks?.find(m=>m.type==='link');if(link)result=`\\PageWeaveLink{${linkTex(link.attrs?.href)}}{${result}}`;
  return result;
}
export function serializeRich(doc:RichNode,listDepth=0):string{
  if(doc.type!=='doc')throw new Error('无效的写作内容。');
  return (doc.content??[]).map(node=>{
    if(node.type==='bulletList'||node.type==='orderedList'){
      if(listDepth>=4)throw new Error('列表最多支持四级缩进。');
      if(!node.content?.length)throw new Error('列表不能为空。');
      const items=node.content.map(item=>{
        if(item.type!=='listItem'||item.content?.[0]?.type!=='paragraph'||item.content.some(n=>!['paragraph','bulletList','orderedList'].includes(n.type)))throw new Error('列表项支持正文和嵌套列表。');
        return `\\PageWeaveItem{${serializeRich({type:'doc',content:item.content},listDepth+1)}}`;
      }).join('\n');
      return `\\PageWeaveList{${node.type==='orderedList'?'ordered':'bullet'}}{${Math.floor(num(node.attrs?.start,1,1,999999))}}{\n${items}\n}`;
    }
    if(node.type==='flowImage')return `\\MogaoImage{${imagePath(node.attrs?.src)}}{${num(node.attrs?.width,75,10,100)/100}}{${['left','center','right'].includes(node.attrs?.textAlign)?node.attrs!.textAlign:'center'}}{${num(node.attrs?.naturalWidth,800,1,16000)}}{${num(node.attrs?.naturalHeight,600,1,16000)}}`;
    if(node.type==='drawing')return serializeDrawing(node);
    if(node.type==='table'){
      if(designedTable(node))return serializeDesignedTable(node,serializeRich);
      const rows=node.content??[],cols=rows[0]?.content?.length??0;
      if(!cols||cols>12||!rows.length||rows.length>1000)throw new Error('表格支持 1–12 列，最多 1000 行。');
      const body=rows.map(row=>{
        if(row.type!=='tableRow'||row.content?.length!==cols)throw new Error('表格各行的列数必须一致。');
        return '\\MogaoRow{'+row.content.map(cell=>{
          if(!['tableCell','tableHeader'].includes(cell.type)||(cell.attrs?.colspan??1)!==1||(cell.attrs?.rowspan??1)!==1||cell.content?.some(n=>n.type!=='paragraph'))throw new Error('当前表格支持普通单元格和段落，不支持合并或嵌套。');
          return `\\MogaoCell{${cell.type==='tableHeader'?1:0}}{${serializeRich({type:'doc',content:cell.content})}}`;
        }).join('&')+'}';
      }).join('\n');
      return `\\MogaoTable{${cols}}{\n${body}\n}`;
    }
    const body=(node.content??[]).map(serializeInline).join('')||'\\strut';
    if(['paragraph','heading'].includes(node.type)&&designedParagraph(node))return serializeDesignedParagraph(node,body);
    if(node.type==='paragraph'){
      const align=['left','center','right','justify'].includes(node.attrs?.textAlign)?node.attrs!.textAlign:'justify';
      return `\\MogaoPara{${align}}{${num(node.attrs?.lineHeight,1.5,.5,6)}}{${body}}`;
    }
    if(node.type==='heading')return `\\MogaoHeading{${num(node.attrs?.level,1,1,3)}}{${['left','center','right','justify'].includes(node.attrs?.textAlign)?node.attrs!.textAlign:'left'}}{${body}}`;
    if(node.type==='displayMath')return `\\MogaoEquation{${node.attrs?.latex??''}}`;
    if(node.type==='pageBreak')return '\\newpage';
    throw new Error('此内容需要通过源码编辑：'+node.type);
  }).join('\n');
}
function inline(source:string,marks:RichNode['marks']=[]):RichNode[]{
  const nodes:RichNode[]=[];let buffer='';const flush=()=>{if(buffer){nodes.push({type:'text',text:buffer,marks:[...(marks??[])]});buffer='';}};
  for(let i=0;i<source.length;){
    if(source[i]!=='\\'){buffer+=source[i++];continue;}
    const m=/^\\([A-Za-z]+|.)/.exec(source.slice(i));if(!m)break;i+=m[0].length;const name=m[1];
    if('%&#_{}$'.includes(name)){buffer+=name;continue;}
    if(['textbackslash','textasciitilde','textasciicircum','strut'].includes(name)){const g=readGroup(source,i);if(g)i=g.to;buffer+=({textbackslash:'\\',textasciitilde:'~',textasciicircum:'^',strut:''})[name as 'strut'];continue;}
    flush();
    if(name==='MogaoLineBreak'){const g=readGroup(source,i);if(g)i=g.to;nodes.push({type:'hardBreak'});continue;}
    if(name==='MogaoInlineMath'){const g=readGroup(source,i);if(!g)throw new Error('公式未闭合');i=g.to;nodes.push({type:'inlineMath',attrs:{latex:g.text}});continue;}
    const mark=({textbf:'bold',textit:'italic',uline:'underline',sout:'strike',textsuperscript:'superscript',textsubscript:'subscript'})[name as 'textbf'];
    if(mark){const g=readGroup(source,i);if(!g)throw new Error('格式命令未闭合');i=g.to;nodes.push(...inline(g.text,[...(marks??[]),{type:mark}]));continue;}
    if(name==='PageWeaveLink'||name==='href'){
      const href=readGroup(source,i),body=href&&readGroup(source,href.to);if(!href||!body)throw new Error('链接未闭合');i=body.to;
      nodes.push(...inline(body.text,[...(marks??[]),{type:'link',attrs:{href:readLinkTex(href.text)}}]));continue;
    }
    if(name==='MogaoText'){
      const args=[];for(let k=0;k<4;k++){const g=readGroup(source,i);if(!g)throw new Error('字体命令未闭合');args.push(g.text);i=g.to;}
      nodes.push(...inline(args[3],[...(marks??[]),{type:'textStyle',attrs:{...(args[0]?{fontFamily:args[0]}:{}),...(args[1]?{fontSize:args[1]+'pt'}:{}),...(args[2]?{color:'#'+args[2]}:{})}}]));continue;
    }
    throw new Error(`包含尚未适配的命令 \\${name}`);
  }
  flush();return nodes;
}
export function parseRich(source:string,listDepth=0):RichNode{
  source=legacyTex(source);
  const content:RichNode[]=[];let i=0;
  while(i<source.length){
    if(/\s/.test(source[i])){i++;continue;}if(source[i]==='%'){const e=source.indexOf('\n',i);i=e<0?source.length:e+1;continue;}
    const m=/^\\(MogaoPara|MogaoHeading|MogaoEquation|MogaoImage|MogaoTable|PageWeaveList|PageWeaveTable|PageWeaveParagraph|PageWeaveHeading|PageWeaveDrawing|newpage)\b/.exec(source.slice(i));if(!m)throw new Error('写作区包含未适配的 LaTeX 结构');i+=m[0].length;
    if(m[1]==='newpage'){content.push({type:'pageBreak'});continue;}
    const args=[];const count=m[1]==='PageWeaveParagraph'?6:m[1]==='PageWeaveHeading'?7:m[1]==='PageWeaveDrawing'?4:m[1]==='MogaoImage'?5:m[1]==='MogaoTable'?2:['MogaoPara','MogaoHeading','PageWeaveList','PageWeaveTable'].includes(m[1])?3:1;
    for(let n=0;n<count;n++){const g=readGroup(source,i);if(!g)throw new Error('写作结构参数未闭合');args.push(g.text);i=g.to;}
    if(m[1]==='PageWeaveDrawing'){
      const drawing=validateDiagram(decodeMetadata(args[0]));if(diagramTikz(drawing)!==args[3].trim())throw new Error('绘图源码已变化，请从源码视图编辑或恢复原绘图。');
      if(!['left','center','right'].includes(args[2])||!Number.isFinite(Number(args[1]))||Number(args[1])<.15||Number(args[1])>1)throw new Error('绘图尺寸无效。');
      content.push({type:'drawing',attrs:{drawing,width:Number(args[1])*100,textAlign:args[2]}});
    }else if(m[1]==='PageWeaveParagraph'||m[1]==='PageWeaveHeading'){
      const heading=m[1]==='PageWeaveHeading',offset=heading?1:0,[align,mode,line,before,after,body]=args.slice(offset);
      if(!['left','center','right','justify'].includes(align)||!['exact','multiple'].includes(mode)||![line,before,after].every(value=>Number.isFinite(Number(value)))||Number(before)<0||Number(before)>120||Number(after)<0||Number(after)>120||Number(line)<(mode==='exact'?6:.5)||Number(line)>(mode==='exact'?120:6)||heading&&![1,2,3].includes(Number(args[0])))throw new Error('段落设置参数无效。');
      content.push({type:heading?'heading':'paragraph',attrs:{...(heading?{level:Number(args[0])}:{}),textAlign:align,lineHeight:line+(mode==='exact'?'pt':''),spacingBefore:Number(before),spacingAfter:Number(after)},content:inline(body)});
    }else if(m[1]==='PageWeaveTable'){
      const {attrs,widths}=parseTableOptions(args[0]),table:RichNode={type:'table',attrs,content:[]},fills:{cell:RichNode;row:number;color:string}[]=[],rules:string[]=[];let at=0;
      while(at<args[2].length){if(/\s/.test(args[2][at])){at++;continue;}if(!args[2].startsWith('\\PageWeaveRow',at))throw new Error('表格行结构无效。');at+='\\PageWeaveRow'.length;
        const fields=[];for(let k=0;k<3;k++){const g=readGroup(args[2],at);if(!g)throw new Error('表格行未闭合。');fields.push(g.text);at=g.to;}
        if(!Number.isFinite(Number(fields[0]))||Number(fields[0])<0||Number(fields[0])>300||!['0','1'].includes(fields[1]))throw new Error('表格行高无效。');
        rules.push(fields[1]);const row:RichNode={type:'tableRow',attrs:{minHeight:Number(fields[0])},content:[]};let ci=0;
        while(ci<fields[2].length){if(/[\s&]/.test(fields[2][ci])){ci++;continue;}if(!fields[2].startsWith('\\PageWeaveCell',ci))throw new Error('单元格结构无效。');ci+='\\PageWeaveCell'.length;
          const values=[];for(let k=0;k<4;k++){const g=readGroup(fields[2],ci);if(!g)throw new Error('单元格未闭合。');values.push(g.text);ci=g.to;}
          if(!['0','1'].includes(values[0])||values[1]&&!/^[a-f\d]{6}$/i.test(values[1])||!/^[a-f\d]{6}$/i.test(values[2]))throw new Error('单元格颜色无效。');
          const cell:RichNode={type:values[0]==='1'?'tableHeader':'tableCell',attrs:{colspan:1,rowspan:1,colwidth:[widths[row.content!.length]],backgroundColor:values[1]?'#'+values[1]:null},content:parseRich(values[3]).content};if(cell.content?.some(child=>child.type!=='paragraph'))throw new Error('单元格包含未适配结构。');row.content!.push(cell);fills.push({cell,row:table.content!.length,color:'#'+values[2]});
        }
        if(row.content!.length!==widths.length)throw new Error('表格列数不匹配。');table.content!.push(row);
      }
      if(!table.content!.length||table.content!.length>1000||tableColumnSpec(table)!==args[1]||fills.some(item=>cellFill(table,item.row,item.cell)!==item.color))throw new Error('表格样式与源码不一致。');
      if(table.content!.some((row,index)=>rules[index]!==String(attrs.tableStyle==='none'?0:attrs.tableStyle==='academic'?(index===table.content!.length-1||index===0&&row.content!.some(cell=>cell.type==='tableHeader')?1:0):1)))throw new Error('表格边框源码已变化，请从源码视图编辑。');
      content.push(table);
    }else if(m[1]==='PageWeaveList'){
      if(listDepth>=4||!['bullet','ordered'].includes(args[0])||!/^\d+$/.test(args[1])||Number(args[1])<1||Number(args[1])>999999)throw new Error('列表参数无效。');
      const items:RichNode[]=[];let at=0;
      while(at<args[2].length){
        if(/\s/.test(args[2][at])){at++;continue;}
        if(args[2][at]==='%'){const end=args[2].indexOf('\n',at);at=end<0?args[2].length:end+1;continue;}
        if(!args[2].startsWith('\\PageWeaveItem',at))throw new Error('未知列表项结构。');
        const group=readGroup(args[2],at+'\\PageWeaveItem'.length);if(!group)throw new Error('列表项未闭合。');at=group.to;
        const body=parseRich(group.text,listDepth+1).content!;
        if(body[0]?.type!=='paragraph'||body.some(n=>!['paragraph','bulletList','orderedList'].includes(n.type)))throw new Error('列表项包含未适配结构。');
        items.push({type:'listItem',content:body});
      }
      if(!items.length)throw new Error('列表不能为空。');
      content.push({type:args[0]==='ordered'?'orderedList':'bulletList',...(args[0]==='ordered'?{attrs:{start:Number(args[1])}}:{}),content:items});
    }
    else if(m[1]==='MogaoImage')content.push({type:'flowImage',attrs:{src:imagePath(args[0]),width:Number(args[1])*100,textAlign:args[2],naturalWidth:Number(args[3]),naturalHeight:Number(args[4])}});
    else if(m[1]==='MogaoTable'){
      const rows:RichNode[]=[];let at=0;const body=args[1];
      while(at<body.length){
        if(/\s/.test(body[at])){at++;continue;}
        if(!body.startsWith('\\MogaoRow',at))throw new Error('未知表格行结构');
        const row=readGroup(body,at+9);if(!row)throw new Error('表格行未闭合');at=row.to;
        const cells:RichNode[]=[];let ci=0;
        while(ci<row.text.length){
          if(/[\s&]/.test(row.text[ci])){ci++;continue;}
          if(!row.text.startsWith('\\MogaoCell',ci))throw new Error('未知单元格结构');
          const header=readGroup(row.text,ci+10),value=header&&readGroup(row.text,header.to);if(!header||!value)throw new Error('单元格未闭合');ci=value.to;
          cells.push({type:header.text==='1'?'tableHeader':'tableCell',attrs:{colspan:1,rowspan:1,colwidth:null},content:parseRich(value.text).content});
        }
        if(cells.length!==Number(args[0]))throw new Error('表格列数不匹配');rows.push({type:'tableRow',content:cells});
      }
      content.push({type:'table',content:rows});
    }
    else if(m[1]==='MogaoPara')content.push({type:'paragraph',attrs:{textAlign:args[0],lineHeight:args[1]},content:inline(args[2])});
    else if(m[1]==='MogaoHeading')content.push({type:'heading',attrs:{level:Number(args[0]),textAlign:args[1]},content:inline(args[2])});
    else content.push({type:'displayMath',attrs:{latex:args[0]}});
  }
  return {type:'doc',content:content.length?content:[{type:'paragraph'}]};
}
export function parseWriting(source:string,file:string):WritingBlock[]{
  const blocks:WritingBlock[]=[];const re=/\\(?:MogaoBlock|PWBlock)\s*\{/g;
  for(let m;(m=re.exec(source));){
    const prefix=source.slice(source.lastIndexOf('\n',m.index)+1,m.index);if(/(^|[^\\])%/.test(prefix))continue;
    const id=readGroup(source,m.index+m[0].lastIndexOf('{'));if(!id)continue;const body=readGroup(source,id.to);if(!body)continue;re.lastIndex=body.to;
    const base={id:id.text,file,line:source.slice(0,m.index).split('\n').length,range:{from:m.index,to:body.to},bodyRange:body.inner};
    try{blocks.push({...base,content:parseRich(body.text),editable:true});}catch(e){blocks.push({...base,content:{type:'doc',content:[]},editable:false,error:String(e)});}
  }
  return blocks;
}
export function blockSource(id:string,doc:RichNode){if(!/^[a-zA-Z0-9_-]+$/.test(id))throw new Error('无效的对象 ID');return `\\MogaoBlock{${id}}{\n${serializeRich(doc)}\n}`;}
export function parseWritingPositions(aux:string):WritingRegion[]{
  const positions=new Map<string,Record<string,number>>();
  for(const m of aux.matchAll(/\\zref@newlabel\{mg-([a-zA-Z0-9_-]+)-(start|end)\}\{([^\n]+)\}/g)){
    const values=Object.fromEntries([...m[3].matchAll(/\\([a-z]+)\{(-?\d+)\}/g)].map(x=>[x[1],Number(x[2])]));positions.set(m[1]+'-'+m[2],values);
  }
  const bp=(sp:number)=>(sp/65536)*(72/72.27),regions:WritingRegion[]=[];
  for(const [key,start]of positions){if(!key.endsWith('-start'))continue;const id=key.slice(0,-6),end=positions.get(id+'-end');if(!end||!start.abspage||!end.abspage)continue;
    const h=bp(start.mgheight),w=bp(start.mgwidth),left=bp(start.mgleft),top=bp(start.mgtop);
    for(let page=start.abspage;page<=end.abspage;page++){
      const y=page===start.abspage?h-bp(start.posy)-Math.max(15,bp(start.mgsize)):top;
      const bottom=page===end.abspage?h-bp(end.posy)+8:h-top;
      if([h,w,left,y,bottom].every(Number.isFinite)&&w>0)regions.push({id,page,x:left,y:Math.max(top-6,y),width:w,height:Math.max(24,bottom-y)});
    }
  }
  return regions;
}
