import {FONTS} from './writing';
export type AiProvider='openai'|'deepseek'|'gemini'|'compatible';
export type AiMode='chat'|'draft'|'format';
export interface AiConfig {provider:AiProvider;baseUrl:string;model:string;rememberKey:boolean}
export interface AiStatus extends AiConfig {hasKey:boolean;canRememberKey:boolean}
export interface AiMessage {role:'user'|'assistant';content:string}
export interface AiRequest {id:string;mode:AiMode;messages:AiMessage[];context?:string}
export interface AiFormat {fontFamily?:string;fontSize?:number;lineHeight?:number;textAlign?:'left'|'center'|'right'|'justify';color?:string}
export interface AiReply {text:string;format?:AiFormat}
export const AI_PROVIDERS:{id:AiProvider;name:string;baseUrl:string}[]=[
  {id:'openai',name:'OpenAI',baseUrl:'https://api.openai.com/v1'},
  {id:'deepseek',name:'DeepSeek',baseUrl:'https://api.deepseek.com'},
  {id:'gemini',name:'Gemini',baseUrl:'https://generativelanguage.googleapis.com/v1beta'},
  {id:'compatible',name:'OpenAI 兼容接口',baseUrl:''},
];
export const AI_DEFAULT:AiConfig={provider:'openai',baseUrl:AI_PROVIDERS[0].baseUrl,model:'',rememberKey:true};
export function validateAiConfig(value:AiConfig):AiConfig {
  if(!value||!AI_PROVIDERS.some(p=>p.id===value.provider)||typeof value.baseUrl!=='string'||typeof value.model!=='string'||typeof value.rememberKey!=='boolean')throw new Error('AI 配置无效。');
  let url:URL;try{url=new URL(value.baseUrl.trim());}catch{throw new Error('请输入完整的 API 地址。');}
  if((url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))||url.username||url.password||url.search||url.hash)throw new Error('API 地址应使用 HTTPS；本机服务可使用 HTTP。请将密钥填入单独的密钥栏。');
  const model=value.model.trim();if(model.length>150||/[^a-zA-Z0-9._:/-]/.test(model))throw new Error('模型名称无效。');
  return {provider:value.provider,baseUrl:url.href.replace(/\/+$/,''),model,rememberKey:value.rememberKey};
}
export function parseAiFormat(text:string):AiFormat {
  let value:Record<string,unknown>;try{value=JSON.parse(text.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));}catch{throw new Error('未收到可应用的排版设置，请换一种描述后重试。');}
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('排版设置格式无效。');
  const result:AiFormat={};
  for(const [key,v]of Object.entries(value)){
    if(key==='fontFamily'&&typeof v==='string'&&FONTS.includes(v))result.fontFamily=v;
    else if(key==='fontSize'&&typeof v==='number'&&v>=6&&v<=96)result.fontSize=v;
    else if(key==='lineHeight'&&typeof v==='number'&&v>=1&&v<=3)result.lineHeight=v;
    else if(key==='textAlign'&&['left','center','right','justify'].includes(String(v)))result.textAlign=v as AiFormat['textAlign'];
    else if(key==='color'&&typeof v==='string'&&/^#[a-f\d]{6}$/i.test(v))result.color=v;
    else throw new Error('排版建议包含不支持的设置，请重新生成。');
  }
  if(!Object.keys(result).length)throw new Error('排版建议未包含可应用的设置。');
  return result;
}
export function formatDescription(format:AiFormat){
  const align={left:'左对齐',center:'居中',right:'右对齐',justify:'两端对齐'};
  return [format.fontFamily,format.fontSize&&`${format.fontSize} 磅`,format.lineHeight&&`${format.lineHeight} 倍行距`,format.textAlign&&align[format.textAlign],format.color].filter(Boolean).join(' · ');
}
