import type {Engine} from './types';

export const SUBMISSION_TEMPLATES = [
  {id:'springer',name:'Springer Nature',detail:'期刊 · sn-jnl',url:'https://www.springernature.com/gp/authors/campaigns/latex-author-support',variants:[['single','单栏'],['double','双栏']],citations:[['sn-mathphys-num','数字编号'],['sn-mathphys-ay','作者–年份'],['sn-basic','Springer Basic'],['sn-nature','Nature']]},
  {id:'ieee-journal',name:'IEEE 期刊',detail:'Transactions · IEEEtran',url:'https://journals.ieeeauthorcenter.ieee.org/create-your-ieee-journal-article/authoring-tools-and-templates/tools-for-ieee-authors/',variants:[['double','双栏'],['review','单栏审阅稿']],citations:[['IEEEtran','IEEE 数字编号']]},
  {id:'ieee-conference',name:'IEEE 会议',detail:'Conference · IEEEtran',url:'https://www.ieee.org/conferences/publishing/templates.html',variants:[['double','双栏']],citations:[['IEEEtran','IEEE 数字编号']]},
  {id:'elsevier',name:'Elsevier',detail:'期刊 · elsarticle',url:'https://www.elsevier.com/researcher/author/policies-and-guidelines/latex-instructions',variants:[['review','审阅稿'],['preprint','单栏预印本'],['double','双栏（5p）']],citations:[['elsarticle-num','数字编号'],['elsarticle-harv','作者–年份']]},
  {id:'wiley',name:'Wiley',detail:'New Journal Design · v5',url:'https://authorservices.wiley.com/author-resources/Journal-Authors/Prepare/new-journal-design.html',variants:[['single','Times 单栏'],['double','Times 双栏']],citations:[['AMA','AMA'],['APA','APA'],['VANCOUVER','Vancouver']]},
  {id:'iclr-2027',name:'ICLR 2027',detail:'OpenReview · 会议投稿',url:'https://iclr.cc/Conferences/2027/AuthorGuidelines',variants:[['review','匿名审稿'],['final','终稿']],citations:[['iclr2027_conference','ICLR 作者–年份']]},
  {id:'acm-journal',name:'ACM 期刊',detail:'Transactions · acmart',url:'https://www.acm.org/publications/proceedings-template',variants:[['journal','acmsmall 单栏'],['large','acmlarge 大幅单栏'],['tog','acmtog 双栏'],['review','单栏审阅稿']],citations:[['acmnumeric','ACM 数字编号'],['acmauthoryear','ACM 作者–年份']]},
  {id:'acm-conference',name:'ACM 会议',detail:'SIGCONF · acmart',url:'https://www.acm.org/publications/proceedings-template',variants:[['conference','SIGCONF 双栏'],['review','单栏审阅稿']],citations:[['acmnumeric','ACM 数字编号'],['acmauthoryear','ACM 作者–年份']]},
  {id:'aps',name:'APS Physical Review',detail:'物理期刊 · REVTeX 4.2',url:'https://journals.aps.org/revtex',variants:[['double','双栏 reprint'],['preprint','单栏 preprint']],citations:[['apsrev4-2','APS 数字编号']]},
  {id:'cvpr-2027',name:'CVPR 2027',detail:'计算机视觉 · 双栏',url:'https://cvpr.thecvf.com/Conferences/2027/AuthorGuidelines',variants:[['review','匿名审稿'],['final','终稿']],citations:[['ieeenat_fullname','CVPR 数字编号']]},
  {id:'neurips-2026',name:'NeurIPS 2026',detail:'机器学习 · 主会',url:'https://neurips.cc/Conferences/2026/CallForPapers',variants:[['review','匿名审稿'],['final','终稿'],['preprint','预印本']],citations:[['plainnat','作者–年份']]},
  {id:'icml-2027',name:'ICML 2027',detail:'机器学习 · 双栏',url:'https://icml.cc/Conferences/2027/CallForPapers',variants:[['review','匿名审稿'],['final','终稿'],['preprint','预印本']],citations:[['icml2027','ICML 作者–年份']]},
  {id:'acl',name:'ACL / EMNLP / NAACL',detail:'自然语言处理 · ACL 通用',url:'https://github.com/acl-org/acl-style-files',variants:[['review','匿名审稿'],['final','终稿'],['preprint','预印本']],citations:[['acl_natbib','ACL 作者–年份']]},
  {id:'ijcai-2027',name:'IJCAI 2027',detail:'人工智能 · 双栏',url:'https://ijcai.org/authors_kit/',variants:[['review','匿名审稿'],['final','终稿']],citations:[['named','IJCAI 作者–年份']]},
] as const;
export type SubmissionId = typeof SUBMISSION_TEMPLATES[number]['id'];
export const submissionCategory=(id:SubmissionId):'journal'|'conference'=>['springer','ieee-journal','elsevier','wiley','acm-journal','aps'].includes(id)?'journal':'conference';
export const managedAnonymity=(id:SubmissionId)=>['iclr-2027','cvpr-2027','neurips-2026','icml-2027','acl','ijcai-2027'].includes(id);
export interface SubmissionConfig {
  template:SubmissionId;variant:string;citation:string;engine:Engine;
  title:string;authors:string;affiliation:string;country:string;abstract:string;keywords:string;
  correspondingAuthor:string;correspondingEmail:string;
  anonymous:boolean;bibliography:string;
}
export interface SavedSubmission {id:string;name:string;config:SubmissionConfig}
export function templateDefinition(id:string){const entry=SUBMISSION_TEMPLATES.find(item=>item.id===id);if(!entry)throw new Error('请选择投稿模板。');return entry;}
export function defaultSubmission(id:SubmissionId='springer'):SubmissionConfig {
  const t=templateDefinition(id);return {template:id,variant:t.variants[0][0],citation:t.citations[0][0],engine:'pdflatex',title:'',authors:'',affiliation:'',country:'',correspondingAuthor:'',correspondingEmail:'',abstract:'',keywords:'',anonymous:managedAnonymity(id),bibliography:''};
}
export function validateSubmission(value:SubmissionConfig,requireAuthorDetails=false):SubmissionConfig {
  value={...value,country:value.country??'',correspondingAuthor:value.correspondingAuthor??'',correspondingEmail:value.correspondingEmail??''};
  const t=templateDefinition(value.template);
  if(!t.variants.some(([id])=>id===value.variant)||!t.citations.some(([id])=>id===value.citation)||!['pdflatex','xelatex'].includes(value.engine))throw new Error('模板选项无效。');
  for(const key of ['title','authors','affiliation','country','correspondingAuthor','correspondingEmail','abstract','keywords','bibliography'] as const)if(typeof value[key]!=='string'||value[key].length>30000)throw new Error('模板信息过长或无效。');
  if(requireAuthorDetails&&value.template.startsWith('acm')&&!value.anonymous&&value.affiliation.trim()&&!value.country.trim())throw new Error('ACM 模板请填写作者单位所在的国家或地区。');
  if(requireAuthorDetails&&value.template==='icml-2027'&&value.variant!=='review'&&(!value.correspondingAuthor.trim()||!value.correspondingEmail.includes('@')))throw new Error('ICML 终稿或预印本请填写通讯作者姓名和邮箱。');
  if(value.bibliography&&!/^[\w\-/]+(?:\.bib)?$/.test(value.bibliography))throw new Error('参考文献文件请使用英文名称，例如 references.bib。');
  if(value.bibliography.split('/').includes('..'))throw new Error('请选择工程内的参考文献文件。');
  return {...value,anonymous:managedAnonymity(value.template)?value.variant==='review':!!value.anonymous};
}
const META='% PageWeave submission: ';
export const BODY_START='% PW-BODY-BEGIN';
export const BODY_END='% PW-BODY-END';
const EXTRA_START='% PW-EXTRA-BEGIN',EXTRA_END='% PW-EXTRA-END';
export function readSubmission(source:string):SubmissionConfig|null {
  const line=/^% PageWeave submission: ([^\r\n]*)/m.exec(source);if(!line)return null;
  try{return validateSubmission(JSON.parse(line[1]));}catch{return null;}
}
export function submissionEngine(source:string,engine:Engine){const current=readSubmission(source);if(!current)return source;const config=validateSubmission({...current,engine});return source.replace(/^% PageWeave submission: [^\r\n]*/m,META+JSON.stringify(config)).replace(/^% !TeX program = [^\r\n]*/m,'% !TeX program = '+engine);}
export function submissionBodyRange(source:string){
  if(!readSubmission(source))return null;
  const start=/^% PW-BODY-BEGIN\r?\n/m.exec(source);if(!start)return null;
  const from=start.index+start[0].length,end=/^% PW-BODY-END\r?$/m.exec(source.slice(from));
  return end?{from,to:from+end.index}:null;
}
export function submissionExtra(source:string){
  if(readSubmission(source))return /^% PW-EXTRA-BEGIN\r?\n([\s\S]*?)^% PW-EXTRA-END\r?$/m.exec(source)?.[1].trimEnd()??'';
  return source.slice(0,source.indexOf('\\begin{document}')).replace(/\\documentclass(?:\[[^\]]*\])?\{[^}]+\}/g,'').replace(/\\usepackage(?:\[[^\]]*\])?\{(?:geometry|pageweave|pw|mogao|mogao-tools|pageweave-(?:layout|lists|design|text))\}/g,'').replace(/\\pagestyle\{[^}]*\}/g,'').replace(/^%[^\n]*$/gm,'').trim();
}
export function submissionTex(text:string){return text.replace(/[\\{}%&#_$~^]/g,c=>({'\\':'\\textbackslash{}','~':'\\textasciitilde{}','^':'\\textasciicircum{}'}[c]??'\\'+c)).replace(/\r?\n/g,' ');}
export function submissionSource(input:SubmissionConfig,body:string,extra='') {
  const v=validateSubmission(input,true),t=submissionTex;
  // Anonymous sources also omit identities from the reusable settings comment.
  const config=v.anonymous?{...v,authors:'',affiliation:'',country:'',correspondingAuthor:'',correspondingEmail:''}:v;
  const title=t(v.title||'Untitled manuscript'),abstract=t(v.abstract),keywords=t(v.keywords);
  const names=v.anonymous?['Anonymous authors']:v.authors.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const authors=(names.length?names:['Author']).map(t),affiliation=v.anonymous?'':t(v.affiliation);
  let preamble='',front='',bib=v.citation;
  if(v.template==='springer'){
    preamble=`\\documentclass[pdflatex,${v.variant==='double'?'iicol,':''}${v.citation}]{sn-jnl}`;
    front=`\\title{${title}}\n${authors.map(a=>`\\author{${a}}`).join('\n')}\n${affiliation?`\\affil{${affiliation}}\n`:''}\\abstract{${abstract}}\n\\keywords{${keywords}}\n\\maketitle`;
  }else if(v.template.startsWith('ieee')){
    preamble=`\\documentclass[${v.template==='ieee-conference'?'conference':v.variant==='review'?'journal,draftcls,onecolumn,12pt':'journal'}]{IEEEtran}`;
    const authorBlock=v.template==='ieee-conference'?`\\IEEEauthorblockN{${authors.join(', ')}}${affiliation?`\n\\IEEEauthorblockA{${affiliation}}`:''}`:`${authors.join(', ')}${affiliation?`\\thanks{${affiliation}}`:''}`;
    front=`\\title{${title}}\n\\author{${authorBlock}}\n\\maketitle\n\\begin{abstract}\n${abstract}\n\\end{abstract}\n${keywords?`\\begin{IEEEkeywords}${keywords}\\end{IEEEkeywords}`:''}`;
  }else if(v.template==='elsevier'){
    preamble=`\\documentclass[${v.variant==='double'?'5p,twocolumn':v.variant==='review'?'preprint,review,12pt':'preprint,12pt'},${v.citation==='elsarticle-harv'?'authoryear':'numbers'}]{elsarticle}`;
    front=`\\begin{frontmatter}\n\\title{${title}}\n${authors.map(a=>`\\author{${a}}`).join('\n')}\n${affiliation?`\\address{${affiliation}}\n`:''}\\begin{abstract}\n${abstract}\n\\end{abstract}\n${keywords?`\\begin{keyword}${keywords}\\end{keyword}\n`:''}\\end{frontmatter}`;
  }else if(v.template==='wiley'){
    preamble=`\\RequirePackage{etex}\n\\documentclass[${v.citation},Times${v.variant==='double'?'2':'1'}COL]{WileyNJDv5}\n\\articletype{Research Article}\n\\startpage{1}`;
    front=`\\title{${title}}\n${authors.map(a=>`\\author[1]{${a}}`).join('\n')}\n\\authormark{${authors.join(', ')}}\n\\titlemark{${title}}\n${affiliation?`\\address[1]{${affiliation}}\n`:''}\\abstract[Abstract]{${abstract}}\n\\keywords{${keywords}}\n\\maketitle`;
  }else if(v.template==='iclr-2027'){
    preamble=`\\documentclass{article}\n\\usepackage{iclr2027_conference,times}\n${v.variant==='final'?'\\iclrfinalcopy\n':''}`;
    front=`\\title{${title}}\n\\author{${authors.join(', ')}${affiliation?'\\\\ '+affiliation:''}}\n\\maketitle\n\\begin{abstract}\n${abstract}\n\\end{abstract}`;
  }else if(v.template.startsWith('acm')){
    const format=v.variant==='review'?'manuscript,review':v.variant==='conference'?'sigconf':v.variant==='large'?'acmlarge':v.variant==='tog'?'acmtog':'acmsmall';
    preamble=`\\documentclass[${format},screen,nonacm${v.anonymous?',anonymous':''}]{acmart}\n\\citestyle{${v.citation}}\n\\title{${title}}\n${authors.map(a=>`\\author{${a}}${affiliation?`\n\\affiliation{\\institution{${affiliation}}\\country{${t(v.country)}}}`:''}`).join('\n')}`;
    front=`\\begin{abstract}\n${abstract}\n\\end{abstract}\n${keywords?`\\keywords{${keywords}}\n`:''}\\maketitle`;
    bib='ACM-Reference-Format';
  }else if(v.template==='aps'){
    preamble=`\\documentclass[aps,pra,${v.variant==='double'?'reprint':'preprint'}]{revtex4-2}`;
    front=`\\title{${title}}\n${authors.map(a=>`\\author{${a}}`).join('\n')}\n${affiliation?`\\affiliation{${affiliation}}\n`:''}\\begin{abstract}\n${abstract}\n\\end{abstract}\n${keywords?`\\keywords{${keywords}}\n`:''}\\maketitle`;
  }else if(v.template==='icml-2027'){
    preamble=`\\documentclass{article}\n\\usepackage${v.variant==='review'?'':`[${v.variant==='final'?'accepted':'preprint'}]`}{icml2027}\n\\icmltitlerunning{${title}}`;
    front=`\\twocolumn[\n\\icmltitle{${title}}\n\\begin{icmlauthorlist}\n${authors.map(a=>`\\icmlauthor{${a}}{shared}`).join('\n')}\n\\end{icmlauthorlist}\n\\icmlaffiliation{shared}{${affiliation||'\\strut'}}\n\\icmlcorrespondingauthor{${v.anonymous?'':t(v.correspondingAuthor)}}{${v.anonymous?'':t(v.correspondingEmail)}}\n\\icmlkeywords{${keywords}}\n\\vskip 0.3in\n]\n\\printAffiliationsAndNotice{}\n\\begin{abstract}\n${abstract}\n\\end{abstract}`;
  }else{
    if(v.template==='cvpr-2027')preamble=`\\documentclass[10pt,twocolumn,letterpaper]{article}\n\\usepackage${v.variant==='review'?'[review]':''}{cvpr}\n\\def\\confName{CVPR}\n\\def\\confYear{2027}`;
    if(v.template==='neurips-2026')preamble=`\\documentclass{article}\n\\usepackage[${v.variant==='review'?'main':v.variant==='final'?'main,final':'preprint'}]{neurips_2026}`;
    if(v.template==='acl')preamble=`\\documentclass[11pt]{article}\n\\usepackage[${v.variant}]{acl}\n\\usepackage{times}`;
    if(v.template==='ijcai-2027')preamble=`\\documentclass[letterpaper]{article}\n\\usepackage{ijcai27,times}\n\\usepackage[switch]{lineno}\n${v.variant==='review'?'\\linenumbers\n':''}\\RequirePackage{iftex}\n\\ifPDFTeX\\pdfinfo{/TemplateVersion (IJCAI.2027.0)}\\else\\special{pdf:docinfo << /TemplateVersion (IJCAI.2027.0) >>}\\fi`;
    const affiliationCommand=v.template==='ijcai-2027'?'\\affiliations':'\\\\';
    front=`\\title{${title}}\n\\author{${authors.join(', ')}${affiliation?affiliationCommand+' '+affiliation:''}}\n\\maketitle\n\\begin{abstract}\n${abstract}\n\\end{abstract}`;
  }
  const bibliography=v.bibliography?`\n${['springer','wiley','aps','acl'].includes(v.template)?'':`\\bibliographystyle{${bib}}\n`}\\bibliography{${v.bibliography.replace(/\.bib$/,'')}}\n`:'';
  return `% !TeX program = ${v.engine}\n${META}${JSON.stringify(config)}\n% Official template: ${templateDefinition(v.template).url}\n${preamble}\n\\usepackage{pageweave-submission}\n${EXTRA_START}\n${extra}\n${EXTRA_END}\n\\begin{document}\n${front}\n${BODY_START}\n${body.trim()}\n${BODY_END}\n${bibliography}\\end{document}\n`;
}
export const SUBMISSION_BODY=String.raw`\PWBlock{introduction}{
\PWHeading{1}{left}{Introduction}
\PWPara{justify}{1}{\strut}
}
\PWBlock{methods}{
\PWHeading{1}{left}{Methods}
\PWPara{justify}{1}{\strut}
}
\PWBlock{results}{
\PWHeading{1}{left}{Results}
\PWPara{justify}{1}{\strut}
}
\PWBlock{conclusion}{
\PWHeading{1}{left}{Conclusion}
\PWPara{justify}{1}{\strut}
}`;
