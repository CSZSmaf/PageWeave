import {promises as fs,constants} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {callCli} from '../core/cli-transport';
import {CLI_PROTOCOL,CliError,cliError,validateCliRequest,type CliResponse} from '../core/automation';
import {version} from '../package.json';

const help={version,protocol:CLI_PROTOCOL,usage:'pageweave <command> [options]',commands:{
  status:'读取已打开文稿的信息和 revision',
  read:'[--file main.tex] 读取源码及 revision',
  write:'--input edited.tex --revision REV [--file main.tex] 更新源码；input 为 - 时从 UTF-8 stdin 读取',
  replace:'--input patch.json --revision REV [--file main.tex] 精确替换；JSON 内容为 {"find":"原文","replace":"新文","all":false}',
  layout:'--margin 25 --paper a4paper --landscape false --revision REV 设置页面',
  save:'--revision REV 保存当前文稿',
  undo:'--revision REV 撤销最近一次源码或 CLI 修改',
  compile:'[--revision REV] [--output result.pdf] 编译当前快照；已有输出文件不会被覆盖',
  request:'--input request.json 发送完整 JSON 请求；input 为 - 时从 stdin 读取',
},options:{'--profile DIR':'使用指定的 PageWeave 用户配置目录，通常无需指定'},output:'stdout 始终输出一个 JSON 对象；成功 ok=true，失败 ok=false 并提供 error.code。',exitCodes:{'0':'成功','1':'操作失败','2':'参数无效','3':'软件未运行或连接失效','4':'版本冲突','5':'编译失败'}};

async function input(file:string){
  if(file!=='-'){const info=await fs.stat(file);if(info.size>5*1024*1024)throw new CliError('TOO_LARGE','输入文件不能超过 5 MB。');return new TextDecoder('utf-8',{fatal:true}).decode(await fs.readFile(file));}
  const chunks:Buffer[]=[];let size=0;for await(const chunk of process.stdin){size+=chunk.length;if(size>5*1024*1024)throw new CliError('TOO_LARGE','输入不能超过 5 MB。');chunks.push(Buffer.from(chunk));}return new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));
}
function profile(){return process.env.PAGEWEAVE_USER_DATA??process.env.MOGAO_USER_DATA??path.join(process.env.APPDATA??(process.platform==='darwin'?path.join(os.homedir(),'Library','Application Support'):path.join(os.homedir(),'.config')),'PageWeave');}
async function main():Promise<CliResponse>{
  const [action='help',...args]=process.argv.slice(2);
  if(['help','--help','-h'].includes(action))return {ok:true,data:help};
  if(action==='--version')return {ok:true,data:{version,protocol:CLI_PROTOCOL}};
  const options:Record<string,string>={};
  for(let i=0;i<args.length;i+=2){const key=args[i];if(!key.startsWith('--')||args[i+1]===undefined||options[key]!==undefined)throw new CliError('INVALID_REQUEST','参数须为 --名称 值，不能重复。');options[key]=args[i+1];}
  const known:Record<string,string[]>={status:[],read:['file'],write:['file','revision','input'],replace:['file','revision','input'],layout:['margin','paper','landscape','revision'],save:['revision'],undo:['revision'],compile:['revision','output'],request:['input']};
  if(!known[action])throw new CliError('UNKNOWN_COMMAND','未知命令，请运行 pageweave help。');
  if(Object.keys(options).some(key=>key!=='--profile'&&!known[action].includes(key.slice(2))))throw new CliError('INVALID_REQUEST','命令含有未知参数。');
  let request:unknown={action,...Object.fromEntries(Object.entries(options).filter(([key])=>!['--profile','--input','--output'].includes(key)).map(([key,value])=>[key.slice(2),value]))};
  if(['request','write','replace'].includes(action)){
    if(!options['--input'])throw new CliError('INVALID_REQUEST','缺少 --input 文件。');const text=await input(options['--input']);
    if(action==='request')request=JSON.parse(text);
    if(action==='write')request={...(request as object),content:text};
    if(action==='replace'){const patch=JSON.parse(text);if(!patch||typeof patch!=='object'||Array.isArray(patch)||Object.keys(patch).some(key=>!['find','replace','all'].includes(key)))throw new CliError('INVALID_REQUEST','替换文件只能包含 find、replace、all。');request={...(request as object),...patch};}
  }
  if(action==='layout')request={...(request as object),margin:Number(options['--margin']??25),paper:options['--paper']??'a4paper',landscape:options['--landscape']==='true'?true:options['--landscape']==='false'||options['--landscape']===undefined?false:null};
  const output=options['--output'];if(output&&path.extname(output).toLowerCase()!=='.pdf')throw new CliError('INVALID_REQUEST','输出文件需使用 .pdf 后缀。');
  const response=await callCli(path.resolve(options['--profile']??profile()),validateCliRequest(request));
  if(output&&response.ok&&typeof response.data.pdf==='string'){
    try{await fs.copyFile(response.data.pdf,path.resolve(output),constants.COPYFILE_EXCL);response.data.pdf=path.resolve(output);}
    catch(error){if((error as NodeJS.ErrnoException).code==='EEXIST')throw new CliError('OUTPUT_EXISTS','输出文件已存在，未覆盖。');throw error;}
  }
  return response;
}
void main().catch(error=>cliError(error instanceof SyntaxError?new CliError('INVALID_REQUEST','输入不是有效 JSON。'):error)).then(response=>{
  process.stdout.write(JSON.stringify(response)+'\n');if(response.ok)return;
  const code=response.error.code;process.exitCode=code==='REVISION_CONFLICT'?4:code==='COMPILE_FAILED'?5:['NOT_RUNNING','BAD_CONNECTION','DISCONNECTED'].includes(code)?3:['INVALID_REQUEST','UNKNOWN_COMMAND','REVISION_REQUIRED'].includes(code)?2:1;
});
