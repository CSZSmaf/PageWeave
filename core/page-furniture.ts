import {escapeText} from './writing';
import {bounded,hexColor} from './table-design';
export interface PageFurniture {header:[string,string,string];footer:[string,string,string];fontSize:number;color:string;headerLine:boolean;footerLine:boolean;hideFirst:boolean}
export const defaultFurniture=():PageFurniture=>({header:['','',''],footer:['','{page}',''],fontSize:9,color:'#526178',headerLine:false,footerLine:false,hideFirst:false});
export function validateFurniture(value:unknown):PageFurniture {
  const v=value as PageFurniture;if(!v||!Array.isArray(v.header)||!Array.isArray(v.footer)||v.header.length!==3||v.footer.length!==3||[...v.header,...v.footer].some(text=>typeof text!=='string'||text.length>100||/[\r\n\x00]/.test(text)))throw new Error('页眉页脚每栏最多 100 个字符，不能换行。');
  return {header:[...v.header],footer:[...v.footer],fontSize:bounded(v.fontSize,9,6,14),color:hexColor(v.color,'#526178'),headerLine:!!v.headerLine,footerLine:!!v.footerLine,hideFirst:!!v.hideFirst};
}
export function encodeMetadata(value:unknown){return Array.from(new TextEncoder().encode(JSON.stringify(value)),byte=>byte.toString(16).padStart(2,'0')).join('');}
export function decodeMetadata(value:string){if(value.length>1000000||!/^([a-f0-9]{2})+$/i.test(value))throw new Error('绘图或页面设置数据无效。');return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(value.match(/../g)!,byte=>parseInt(byte,16))));}
const marker=/% PageWeave header-footer begin\r?\n[\s\S]*?% PageWeave header-footer end/;
const field=(text:string)=>text.split(/(\{page\}|\{pages\})/).map(part=>part==='{page}'?'\\thepage':part==='{pages}'?'\\pageref{LastPage}':escapeText(part)).join('');
export function furnitureSource(value:PageFurniture){const v=validateFurniture(value);return `% PageWeave header-footer begin\n% data: ${encodeMetadata(v)}\n\\PageWeavePageStyle{${v.fontSize}}{${v.color.slice(1)}}{${v.headerLine?1:0}}{${v.footerLine?1:0}}{${v.hideFirst?1:0}}\n\\PageWeaveHeader${v.header.map(text=>'{'+field(text)+'}').join('')}\n\\PageWeaveFooter${v.footer.map(text=>'{'+field(text)+'}').join('')}\n% PageWeave header-footer end`;}
export function readFurniture(source:string):PageFurniture|null{const block=marker.exec(source)?.[0];if(!block)return null;const hex=/% data: ([a-f\d]+)/i.exec(block)?.[1];if(!hex)return null;try{const value=validateFurniture(decodeMetadata(hex));return furnitureSource(value)===block.replaceAll('\r\n','\n')?value:null;}catch{return null;}}
export function writeFurniture(source:string,value:PageFurniture){const block=marker.exec(source);if(block&&!readFurniture(source))throw new Error('页眉页脚源码已被手动修改，请先在源码视图中检查。');return block?source.replace(marker,furnitureSource(value)):source.replace('\\begin{document}',furnitureSource(value)+'\n\\begin{document}');}
export function furnitureText(value:string,page:number,total:number){return value.replaceAll('{pages}',String(total)).replaceAll('{page}',String(page));}
