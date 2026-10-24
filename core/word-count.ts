import type {RichNode} from './writing';

export interface WordCount{words:number;characters:number;charactersWithSpaces:number}
const object='\uFFFC';
export function documentText(node:RichNode):string{
  if(node.type==='text')return node.text??'';
  if(['inlineMath','displayMath','flowImage'].includes(node.type))return object;
  if(['hardBreak','pageBreak'].includes(node.type))return '\n';
  const text=(node.content??[]).map(documentText).join('');
  return ['paragraph','heading','tableCell','tableHeader','tableRow'].includes(node.type)?text+'\n':text;
}
export function countWords(text:string):WordCount{
  const cjk=/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu;
  const letters=(text.match(cjk)??[]).length;
  const words=text.replace(cjk,' ').replaceAll(object,' ').match(/[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:['’.-][\p{L}\p{M}\p{N}]+)*/gu)??[];
  const characters=Array.from(text.replaceAll(object,'').replace(/[\r\n]/g,''));
  return {words:letters+words.length,characters:characters.filter(c=>!/^\s$/u.test(c)).length,charactersWithSpaces:characters.length};
}
