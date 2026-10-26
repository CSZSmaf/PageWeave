export function linkAddress(value:unknown):string {
  if(typeof value!=='string'||value.length>4096||/[\u0000-\u0020\u007f\\{}]/.test(value.trim()))throw new Error('请输入有效的网址或邮件地址。');
  const raw=value.trim();let url:URL;try{url=new URL(raw);}catch{throw new Error('网址需以 https://、http:// 或 mailto: 开头。');}
  if(!['https:','http:','mailto:'].includes(url.protocol)||url.username||url.password||url.protocol==='mailto:'&&(!url.pathname.includes('@')||/%0[ad]/i.test(url.href)))throw new Error('仅支持网页和邮件链接，且不能包含登录凭据。');
  return url.href;
}
export function linkTex(value:unknown){return linkAddress(value).replace(/[~$^]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase()).replace(/[%&#_]/g,c=>'\\'+c);}
export function readLinkTex(value:string){if(/\\(?![%&#_])/.test(value))throw new Error('链接地址包含未适配的命令。');return linkAddress(value.replace(/\\([%&#_])/g,'$1'));}
export const INLINE_STYLE_FILE='pageweave-text.sty';
export const INLINE_STYLE=String.raw`\NeedsTeXFormat{LaTeX2e}
\ProvidesPackage{pageweave-text}[2026/10/26 Text links]
\RequirePackage{xcolor,hyperref}
\newcommand{\PageWeaveLink}[2]{\begingroup\hypersetup{colorlinks=true,urlcolor=[RGB]{36,99,199}}\href{#1}{#2}\endgroup}
`;
