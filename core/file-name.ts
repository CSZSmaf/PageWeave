export const DEFAULT_DOCUMENT_NAME='未命名.tex';
export function documentFileName(main:string){return main.replaceAll('\\','/').split('/').at(-1)||DEFAULT_DOCUMENT_NAME;}
export function texFileName(value:string){
  const name=value.trim();
  if(!name||name.length>180||/[<>:"/\\|?*{}%#\x00-\x1f]/.test(name)||/[. ]$/.test(name)||name.startsWith('.')||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))throw new Error('请输入有效的文件名，不能包含路径或特殊字符。');
  if(/\.tex$/i.test(name))return name;
  if(/\.[^.]+$/.test(name))throw new Error('文稿文件使用 .tex 后缀。');
  return name+'.tex';
}
