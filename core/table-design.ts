import type {RichNode} from './writing';

export const TABLE_PRESETS={
  grid:{label:'网格',borderColor:'#94a3b8',headerColor:'#ffffff',stripeColor:'#ffffff'},
  blue:{label:'蓝色条纹',borderColor:'#9ab6df',headerColor:'#dce9ff',stripeColor:'#f0f5fc'},
  academic:{label:'三线表',borderColor:'#26364b',headerColor:'#ffffff',stripeColor:'#ffffff'},
  minimal:{label:'简洁横线',borderColor:'#c8d2df',headerColor:'#f2f5f9',stripeColor:'#ffffff'},
  none:{label:'无边框',borderColor:'#94a3b8',headerColor:'#ffffff',stripeColor:'#ffffff'},
} as const;
export type TableStyle=keyof typeof TABLE_PRESETS;
export const tableKeys=['tableStyle','width','textAlign','borderColor','borderWidth','cellPadding','headerColor','stripeColor','verticalAlign'] as const;
export function bounded(value:unknown,fallback:number,min:number,max:number){const n=Number(value);return value!==null&&value!==''&&Number.isFinite(n)?Math.round(Math.max(min,Math.min(max,n))*100)/100:fallback;}
export const hexColor=(value:unknown,fallback:string)=>typeof value==='string'&&/^#[a-f\d]{6}$/i.test(value)?value.toLowerCase():fallback;
export function tableDesign(attrs:Record<string,any>={}){
  const tableStyle:TableStyle=Object.hasOwn(TABLE_PRESETS,attrs.tableStyle)?attrs.tableStyle:'grid',preset=TABLE_PRESETS[tableStyle];
  return {tableStyle,width:bounded(attrs.width,100,15,100),textAlign:['left','center','right'].includes(attrs.textAlign)?attrs.textAlign:'center',borderColor:hexColor(attrs.borderColor,preset.borderColor),borderWidth:bounded(attrs.borderWidth,.75,.25,3),cellPadding:bounded(attrs.cellPadding,6,0,18),headerColor:hexColor(attrs.headerColor,preset.headerColor),stripeColor:hexColor(attrs.stripeColor,preset.stripeColor),verticalAlign:['top','middle','bottom'].includes(attrs.verticalAlign)?attrs.verticalAlign:'top'};
}
export function minimumColumnWidth(attrs:Record<string,any>={}){const d=tableDesign(attrs);return Math.max(24,(d.cellPadding*2+d.borderWidth)*96/72+12);}
export function designedTable(node:RichNode){return tableKeys.some(key=>node.attrs?.[key]!=null)||(node.content??[]).some(row=>row.attrs?.minHeight!=null||(row.content??[]).some(cell=>cell.attrs?.backgroundColor||cell.attrs?.colwidth?.some((width:number)=>width>0)));}
export function columnWidths(table:RichNode){return (table.content?.[0]?.content??[]).map(cell=>bounded(cell.attrs?.colwidth?.[0],100,1,4000));}
export function cellFill(table:RichNode,row:number,cell:RichNode){const d=tableDesign(table.attrs);return hexColor(cell.attrs?.backgroundColor,cell.type==='tableHeader'?d.headerColor:row%2?d.stripeColor:'#ffffff');}
export function tableOptions(table:RichNode){const d=tableDesign(table.attrs),widths=columnWidths(table);return `style=${d.tableStyle},width=${d.width},align=${d.textAlign},border=${d.borderColor.slice(1)},rule=${d.borderWidth},pad=${d.cellPadding},header=${d.headerColor.slice(1)},stripe=${d.stripeColor.slice(1)},valign=${d.verticalAlign},cols=${widths.join(':')},count=${widths.length}`;}
export function parseTableOptions(value:string){
  const opts=Object.fromEntries(value.split(',').map(part=>part.split('='))),widths=String(opts.cols).split(':').map(Number);
  if(Object.keys(opts).length!==11||!Object.hasOwn(TABLE_PRESETS,opts.style)||Number(opts.count)!==widths.length||widths.length<1||widths.length>12||widths.some(n=>!Number.isFinite(n)||n<1||n>4000))throw new Error('表格样式参数无效。');
  const attrs=tableDesign({tableStyle:opts.style,width:opts.width,textAlign:opts.align,borderColor:'#'+opts.border,borderWidth:opts.rule,cellPadding:opts.pad,headerColor:'#'+opts.header,stripeColor:'#'+opts.stripe,verticalAlign:opts.valign});
  const stub:RichNode={type:'table',attrs,content:[{type:'tableRow',content:widths.map(width=>({type:'tableCell',attrs:{colwidth:[width]}}))}]};
  if(tableOptions(stub)!==value)throw new Error('表格参数超出可编辑范围。');return {attrs,widths};
}
export function tableColumnSpec(table:RichNode){
  const d=tableDesign(table.attrs),widths=columnWidths(table),total=widths.reduce((a,b)=>a+b,0),grid=['grid','blue'].includes(d.tableStyle),column=d.verticalAlign==='middle'?'m':d.verticalAlign==='bottom'?'b':'p';
  return (grid?'|':'')+widths.map(width=>`>{\\raggedright\\arraybackslash}${column}{\\dimexpr ${Number((width/total).toFixed(8))}\\PWTableContent-2\\tabcolsep\\relax}`+(grid?'|':'')).join('');
}
export function serializeDesignedTable(table:RichNode,serialize:(node:RichNode)=>string,prefix?:(row:number)=>string){
  const d=tableDesign(table.attrs),rows=table.content??[],cols=rows[0]?.content?.length??0;
  if(!cols||cols>12||!rows.length||rows.length>1000)throw new Error('表格支持 1–12 列，最多 1000 行。');
  const body=rows.map((row,index)=>{
    if(row.type!=='tableRow'||row.content?.length!==cols)throw new Error('表格各行列数必须一致。');
    const cells=row.content.map(cell=>{
      if(!['tableCell','tableHeader'].includes(cell.type)||(cell.attrs?.colspan??1)!==1||(cell.attrs?.rowspan??1)!==1||cell.content?.some(child=>child.type!=='paragraph'))throw new Error('表格单元格支持段落，不支持合并或嵌套。');
      return `\\PageWeaveCell{${cell.type==='tableHeader'?1:0}}{${hexColor(cell.attrs?.backgroundColor,'').slice(1)}}{${cellFill(table,index,cell).slice(1)}}{${serialize({type:'doc',content:cell.content})}}`;
    }).join('&');
    const rule=d.tableStyle==='none'?0:d.tableStyle==='academic'?(index===rows.length-1||index===0&&row.content.some(cell=>cell.type==='tableHeader')?1:0):1;
    return (prefix?.(index)??'')+`\\PageWeaveRow{${bounded(row.attrs?.minHeight,0,0,300)}}{${rule}}{${cells}}`;
  }).join('\n');
  return `\\PageWeaveTable{${tableOptions(table)}}{${tableColumnSpec(table)}}{\n${body}\n}`;
}
