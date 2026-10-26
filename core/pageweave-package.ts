import {WRITING_TOOLS_STYLE} from './writing-tools';
import {LAYOUT_STYLE,LAYOUT_STYLE_FILE} from './layout-style';
import {LIST_STYLE,LIST_STYLE_FILE} from './lists';
import {DESIGN_STYLE,DESIGN_STYLE_FILE} from './design-style';
import {INLINE_STYLE,INLINE_STYLE_FILE} from './inline-format';
import {TEX_NAMES} from './tex-names';
export const LEGACY_BASE_STYLE=String.raw`\NeedsTeXFormat{LaTeX2e}
\ProvidesPackage{mogao}[2026/10/24 MoGao native page writing]
\RequirePackage{fontspec,xeCJK,xcolor,amsmath,amssymb,setspace,ragged2e,etoolbox}
\RequirePackage[normalem]{ulem}
\RequirePackage{zref-savepos,zref-abspage}
\setmainfont{Times New Roman}
\setCJKmainfont{SimSun}[AutoFakeBold=2.5,AutoFakeSlant=.2]
\makeatletter
\zref@addprops{savepos}{abspage}
\zref@newprop{mgheight}{\number\paperheight}
\zref@newprop{mgwidth}{\number\textwidth}
\zref@newprop{mgleft}{\number\dimexpr 1in+\oddsidemargin\relax}
\zref@newprop{mgtop}{\number\dimexpr 1in+\topmargin+\headheight+\headsep\relax}
\zref@newprop{mgsize}{\number\dimexpr\f@size pt\relax}
\zref@addprops{savepos}{mgheight,mgwidth,mgleft,mgtop,mgsize}
\makeatother
\newif\ifMogaoMarked
\newcommand{\MogaoStart}{\ifMogaoMarked\else\zsavepos{mg-\MogaoId-start}\global\MogaoMarkedtrue\fi}
\newcommand{\MogaoBlock}[2]{\par\begingroup\def\MogaoId{#1}\global\MogaoMarkedfalse #2\par\zsavepos{mg-#1-end}\endgroup\par\addvspace{8pt}}
\newcommand{\MogaoPara}[3]{\par\begingroup\setstretch{#2}\setlength{\parindent}{0pt}\csname MogaoAlign#1\endcsname\noindent\MogaoStart #3\par\endgroup}
\newcommand{\MogaoAlignleft}{\RaggedRight}
\newcommand{\MogaoAlignright}{\RaggedLeft}
\newcommand{\MogaoAligncenter}{\centering}
\newcommand{\MogaoAlignjustify}{\justifying}
\newcommand{\MogaoText}[4]{\begingroup\IfFontExistsTF{#1}{\fontspec[AutoFakeBold=2.5,AutoFakeSlant=.2]{#1}}{}\ifboolexpr{test {\ifstrequal{#1}{SimSun}} or test {\ifstrequal{#1}{SimHei}} or test {\ifstrequal{#1}{Microsoft YaHei}} or test {\ifstrequal{#1}{KaiTi}} or test {\ifstrequal{#1}{FangSong}}}{\CJKfontspec[AutoFakeBold=2.5,AutoFakeSlant=.2]{#1}}{}\fontsize{#2}{\dimexpr #2pt*3/2\relax}\selectfont\color[HTML]{#3}#4\endgroup}
\newcommand{\MogaoHeading}[3]{\par\begingroup\bfseries\color[HTML]{2463C7}\ifnum#1=1\fontsize{22}{31}\selectfont\else\ifnum#1=2\fontsize{17}{25}\selectfont\else\fontsize{14}{21}\selectfont\fi\fi\csname MogaoAlign#2\endcsname\noindent\MogaoStart #3\par\endgroup}
\newcommand{\MogaoInlineMath}[1]{\ensuremath{#1}}
\newcommand{\MogaoEquation}[1]{\par\noindent\MogaoStart\hfill$\displaystyle #1$\hfill\null\par}
\newcommand{\MogaoLineBreak}{\unskip\\\strut}
`;
const base=LEGACY_BASE_STYLE.replace('\\ProvidesPackage{mogao}', '\\ProvidesPackage{pageweave-base}').replace('MoGao native page writing','PageWeave writing');
const tools=WRITING_TOOLS_STYLE.replace('\\ProvidesPackage{mogao-tools}','\\ProvidesPackage{pageweave-tools}').replace('MoGao images and tables','PageWeave images and tables');
export const PAGEWEAVE_STYLE=String.raw`\NeedsTeXFormat{LaTeX2e}
\ProvidesPackage{pageweave}[2026/10/26 PageWeave document authoring]
\RequirePackage{pageweave-base,pageweave-tools,pageweave-layout,pageweave-lists,pageweave-design,pageweave-text}
`+Object.entries(TEX_NAMES).map(([long,short])=>'\\newcommand{\\'+short+'}{\\'+long+'}').join('\n')+'\n';
export const PAGEWEAVE_STYLES:Record<string,string>={'pageweave.sty':PAGEWEAVE_STYLE,'pw.sty':String.raw`\NeedsTeXFormat{LaTeX2e}
\ProvidesPackage{pw}[2026/10/26 PageWeave shorthand]
\RequirePackage{pageweave}
`,'pageweave-base.sty':base,'pageweave-tools.sty':tools,[LAYOUT_STYLE_FILE]:LAYOUT_STYLE,[LIST_STYLE_FILE]:LIST_STYLE,[DESIGN_STYLE_FILE]:DESIGN_STYLE,[INLINE_STYLE_FILE]:INLINE_STYLE};
