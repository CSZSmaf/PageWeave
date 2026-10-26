/** Public source names. Internal macros remain compatible with existing projects. */
export const TEX_NAMES:Record<string,string>={
  MogaoBlock:'PWBlock',MogaoPara:'PWPara',MogaoHeading:'PWHeading',MogaoText:'PWText',MogaoInlineMath:'PWMath',MogaoEquation:'PWEquation',MogaoLineBreak:'PWLineBreak',MogaoImage:'PWImage',
  MogaoTable:'PWBasicTable',MogaoRow:'PWBasicRow',MogaoCell:'PWBasicCell',
  PageWeaveTable:'PWTable',PageWeaveRow:'PWRow',PageWeaveCell:'PWCell',PageWeaveParagraph:'PWParagraph',PageWeaveHeading:'PWTitle',PageWeaveDrawing:'PWDrawing',PageWeaveList:'PWList',PageWeaveItem:'PWItem',PageWeaveLink:'PWLink',
  PageWeavePageStyle:'PWPageStyle',PageWeaveHeader:'PWHeader',PageWeaveFooter:'PWFooter',
};
const OLD_NAMES=Object.fromEntries(Object.entries(TEX_NAMES).map(([long,short])=>[short,long]));
function rename(source:string,names:Record<string,string>){return source.replace(/%[^\r\n]*|\\([A-Za-z]+)|\\[^A-Za-z]/g,(token,name)=>name&&names[name]?'\\'+names[name]:token);}
export const shortTex=(source:string)=>rename(source,TEX_NAMES);
export const legacyTex=(source:string)=>rename(source,OLD_NAMES);
export const usesPageWeave=(source:string)=>/\\usepackage(?:\[[^\]]*\])?\{(?:pageweave|pw)\}/.test(source.replace(/(?<!\\)%[^\r\n]*/g,''));
