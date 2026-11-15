import {promises as fs} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {unzipSync} from 'fflate';
import {run} from './compiler';
import {defaultSubmission,validateSubmission,type SubmissionConfig,type SavedSubmission} from './submission';
import {SUBMISSION_STYLES} from './submission-style';

export const SUBMISSION_DOWNLOADS:Record<string,string>={
  springer:'https://cms-resources.apps.public.k8s.springernature.io/springer-cms/rest/v1/content/18782940/data/v12',
  wiley:'https://authorservices-ppd.wiley.com/asset/WileyNJDv5_Template.zip',
  'iclr-2027':'https://media.iclr.cc/Conferences/ICLR2027/iclr-2027-style-files.zip',
  'cvpr-2027':'https://media.eventhosts.cc/Conferences/CVPR2027/author-kit-CVPR2027-v1-latex.zip',
  'neurips-2026':'https://media.neurips.cc/Conferences/NeurIPS2026/Formatting_Instructions_For_NeurIPS_2026.zip',
  'icml-2027':'https://media.icml.cc/Conferences/ICML2027/styles/icml2027.zip',
  acl:'https://codeload.github.com/acl-org/acl-style-files/zip/refs/heads/master',
  'ijcai-2027':'https://ijcai.org/sites/default/files/Guidelines/FormattingGuidelines-IJCAI-27.zip',
};
const localFiles:Record<string,string[]>={ieee:['IEEEtran.cls','IEEEtran.bst'],elsevier:['elsarticle.cls','elsarticle-num.bst','elsarticle-harv.bst'],acm:['acmart.cls','ACM-Reference-Format.bst'],aps:['revtex4-2.cls','apsrev4-2.bst']};
export function unpackSubmission(id:string,bytes:Uint8Array):Record<string,Buffer>{
  const entries=unzipSync(bytes,{filter:file=>file.originalSize<5*1024*1024&&/\.(cls|sty|bst|cfg|def|eps|pdf)$/i.test(file.name)&&!file.name.startsWith('__MACOSX/')&&!/\/Fonts\//i.test('/'+file.name)}),files:Record<string,Buffer>={};
  for(const [entry,data]of Object.entries(entries)){
    // Only the fixed publisher asset types enter a manuscript, never executables or paths from a ZIP.
    if(entry.split(/[\\/]/).includes('..'))throw new Error('模板包路径无效。');
    const base=path.posix.basename(entry);
    if(id==='wiley'&&base.endsWith('.sty')&&!/^(NJDnatbib|NJDapacite|mla)\.sty$/.test(base))continue;
    if(id==='iclr-2027'&&['fancyhdr.sty','natbib.sty'].includes(base))continue;
    if(id==='icml-2027'&&['fancyhdr.sty','algorithm.sty','algorithmic.sty'].includes(base))continue;
    if(/\.pdf$/i.test(base)&&base!=='empty.pdf')continue;
    const target=id==='wiley'&&base.endsWith('.bst')?base.replace(/^wileyNJD-/,'WileyNJD-').replace('-Vancouver.bst','-VANCOUVER.bst'):base;
    files[target]=Buffer.from(data);
  }
  const required:Record<string,string>={springer:'sn-jnl.cls',wiley:'WileyNJDv5.cls','iclr-2027':'iclr2027_conference.sty','cvpr-2027':'cvpr.sty','neurips-2026':'neurips_2026.sty','icml-2027':'icml2027.sty',acl:'acl.sty','ijcai-2027':'ijcai27.sty'};
  if(!required[id]||!files[required[id]])throw new Error('官方模板包中未找到预期的类文件，请检查模板来源。');
  return files;
}
export class SubmissionLibrary {
  constructor(readonly root:string,private download:typeof fetch=fetch){}
  async resources(config:SubmissionConfig){
    const v=validateSubmission(config),family=v.template.startsWith('ieee')?'ieee':v.template.startsWith('acm')?'acm':v.template;
    let files:Record<string,Buffer>={};
    if(SUBMISSION_DOWNLOADS[family]){
      const zip=path.join(this.root,family+'.zip');let bytes:Buffer;
      try{bytes=await fs.readFile(zip);}catch(error){
        if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;
        const response=await this.download(SUBMISSION_DOWNLOADS[family],{signal:AbortSignal.timeout(60000)});
        if(!response.ok)throw new Error(`官方模板下载失败（${response.status}）。请稍后重试。`);
        if(Number(response.headers.get('content-length'))>35*1024*1024)throw new Error('模板包超过 35 MB。');
        bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>35*1024*1024)throw new Error('模板包超过 35 MB。');
        files=unpackSubmission(family,bytes);await fs.mkdir(this.root,{recursive:true});await fs.writeFile(zip,bytes);
      }
      if(!Object.keys(files).length)files=unpackSubmission(family,bytes);
    }else{
      for(const name of localFiles[family]){
        const result=await run('kpsewhich',[name],undefined,8000),file=result.output.trim();
        if(result.code!==0||!file)throw new Error(`TeX 环境缺少 ${name}，请通过 TeX Live 补充安装相应宏包。`);
        files[name]=await fs.readFile(file);
      }
    }
    for(const [name,text]of Object.entries(SUBMISSION_STYLES))files[name]=Buffer.from(text);
    return files;
  }
  async list():Promise<SavedSubmission[]>{
    try{return (JSON.parse(await fs.readFile(path.join(this.root,'presets.json'),'utf8')) as SavedSubmission[]).map(item=>({...item,config:validateSubmission(item.config)}));}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return [];throw error;}
  }
  async save(name:string,config:SubmissionConfig){
    if(typeof name!=='string'||!name.trim()||name.length>80)throw new Error('请输入 1–80 字的模板名称。');
    const v=validateSubmission(config),items=await this.list();
    // A reusable preset stores layout choices; each manuscript supplies its own authors and text.
    const settings={...defaultSubmission(v.template),variant:v.variant,citation:v.citation,engine:v.engine,anonymous:v.anonymous};
    const item={id:randomUUID(),name:name.trim(),config:settings};items.push(item);
    await fs.mkdir(this.root,{recursive:true});await fs.writeFile(path.join(this.root,'presets.json'),JSON.stringify(items,null,2));return items;
  }
  async remove(id:string){const items=(await this.list()).filter(item=>item.id!==id);await fs.writeFile(path.join(this.root,'presets.json'),JSON.stringify(items,null,2));return items;}
}
