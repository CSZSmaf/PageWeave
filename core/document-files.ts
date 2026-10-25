import {promises as fs} from 'node:fs';
import path from 'node:path';

/** A file selection includes its local TeX dependencies, never unrelated neighbouring documents. */
export async function documentFiles(root:string,main:string,overrides?:Map<string,string>){
  const found=new Set<string>();let size=0;
  const inside=(file:string)=>{const rel=path.relative(root,file);return rel!=='..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel);};
  async function add(relative:string){
    const full=path.resolve(root,relative);if(!inside(full))throw new Error('文稿引用了上级目录，请通过“打开工程文件夹”选择完整工程。');
    const real=await fs.realpath(full).catch(()=>null);if(!real||!inside(real))return false;
    const name=path.relative(root,real).replaceAll(path.sep,'/');if(found.has(name))return true;
    const info=await fs.stat(real);if(!info.isFile())return false;
    if(found.size>=3000||(size+=info.size)>300*1024*1024)throw new Error('文稿及资源最多支持 3000 个文件、总计 300 MB。');found.add(name);
    if(!/\.(tex|sty|cls|cfg)$/i.test(name)||info.size>5*1024*1024)return true;
    const source=(overrides?.get(name)??await fs.readFile(real,'utf8')).replace(/(?<!\\)%[^\r\n]*/g,'');
    const imageDirs=[...source.matchAll(/\\graphicspath\s*\{((?:\s*\{[^{}]*\}\s*)+)\}/g)].flatMap(m=>[...m[1].matchAll(/\{([^{}]*)\}/g)].map(p=>p[1]));
    const commands=/\\(input|include|subfile|includegraphics\*?|MogaoImage|usepackage|RequirePackage|documentclass|LoadClass|bibliography|addbibresource|bibliographystyle|lstinputlisting|verbatiminput)\s*(?:\[[^\]]*\]\s*)?\{([^{}]+)\}/g;
    for(const match of source.matchAll(commands)){
      const kind=match[1],multi=/^(usepackage|RequirePackage|bibliography)$/.test(kind);
      for(const raw of multi?match[2].split(','):[match[2]]){
        const value=raw.trim().replace(/\\_/g,'_');if(!value||/[\\#]/.test(value))continue;
        const image=/^(includegraphics\*?|MogaoImage)$/.test(kind),ext=/package$/i.test(kind)?['.sty']:/^(documentclass|LoadClass)$/.test(kind)?['.cls']:/^(bibliography|addbibresource)$/.test(kind)?['.bib']:kind==='bibliographystyle'?['.bst']:image?['.png','.jpg','.jpeg','.pdf','.eps']:['.tex'];
        const names=path.extname(value)?[value]:[value,...ext.map(e=>value+e)];let loaded=false;
        for(const dir of ['',path.dirname(name),...(image?imageDirs:[])]){for(const candidate of names){if(await add(path.join(dir,candidate))){loaded=true;break;}}if(loaded)break;}
      }
    }
    return true;
  }
  if(!await add(main))throw new Error('找不到所选的 .tex 文件。');
  await add('pageweave-review.json');await add('pageweave-pages.tex');
  return [...found].sort();
}
