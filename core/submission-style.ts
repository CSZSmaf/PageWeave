import {TEX_NAMES} from './tex-names';
import {DESIGN_STYLE} from './design-style';
import {LIST_STYLE} from './lists';
import {INLINE_STYLE} from './inline-format';

/** The journal class owns fonts, headings, margins and page breaks. */
export const SUBMISSION_STYLE=String.raw`\NeedsTeXFormat{LaTeX2e}
\ProvidesPackage{pageweave-submission}[2026/11/15 PageWeave journal editing]
\RequirePackage{iftex,etoolbox,xcolor,amsmath,ragged2e,graphicx,array}
\makeatletter
\@ifpackageloaded{unicode-math}{}{\@ifpackageloaded{newtxmath}{}{\RequirePackage{amssymb}}}
% REVTeX 4.2 replaces array internals with an older implementation.
\@ifclassloaded{revtex4-2}{\let\switch@array\relax}{}
\makeatother
\RequirePackage{ulem}\normalem
\ifPDFTeX\else
  \makeatletter
  \@ifpackageloaded{fontspec}{}{\RequirePackage{fontspec}\setmainfont{TeX Gyre Termes}}
  \makeatother
  \RequirePackage{xeCJK}
  \setCJKmainfont{FandolSong-Regular}[BoldFont=FandolSong-Bold]
\fi
\providecommand{\MogaoStart}{}
\newcommand{\MogaoBlock}[2]{#2\par}
\newcommand{\MogaoAlignleft}{\RaggedRight}
\newcommand{\MogaoAlignright}{\RaggedLeft}
\newcommand{\MogaoAligncenter}{\centering}
\newcommand{\MogaoAlignjustify}{\justifying}
\makeatletter
\edef\PageWeaveBaseSize{\f@size}
\def\PageWeaveSpacing{1}
\def\PageWeaveParagraphSkip{0pt}
\newcommand{\PageWeaveFont}[2]{\fontsize{#1bp}{\dimexpr #1bp*6/5\relax}\selectfont\baselineskip=#2\baselineskip}
\newcommand{\PageWeaveStrut}{\strut}
\newcommand{\MogaoPara}[3]{\par\begingroup\csname MogaoAlign#1\endcsname\baselineskip=#2\baselineskip #3\par\endgroup}
\newcommand{\MogaoHeading}[3]{\ifnum#1=1\section{#3}\else\ifnum#1=2\subsection{#3}\else\subsubsection{#3}\fi\fi}
\newcommand{\MogaoText}[4]{#4}
\newcommand{\MogaoInlineMath}[1]{\ensuremath{#1}}
\newcommand{\MogaoEquation}[1]{\begin{equation}#1\end{equation}}
\newcommand{\MogaoLineBreak}{\unskip\\\strut}
\newcommand{\MogaoImage}[5]{\par\begingroup\csname MogaoAlign#3\endcsname\noindent\includegraphics[width=#2\linewidth,height=.8\textheight,keepaspectratio]{#1}\par\endgroup}
\newcommand{\MogaoTable}[2]{\par\begingroup\setlength{\tabcolsep}{4pt}\noindent\begin{tabular}{|*{#1}{>{\raggedright\arraybackslash}p{\dimexpr(\linewidth-2\tabcolsep*#1-\arrayrulewidth*(#1+1))/#1\relax}|}}\hline#2\end{tabular}\par\endgroup}
\newcommand{\MogaoRow}[1]{#1\\\hline}
\newcommand{\MogaoCell}[2]{\begingroup\ifnum#1=1\bfseries\fi#2\endgroup}
\makeatother
\RequirePackage{pageweave-lists,pageweave-submission-design,pageweave-text}
\hypersetup{hidelinks}
\makeatletter
\AtBeginDocument{
  \edef\PageWeaveBaseSize{\f@size}
  \renewcommand{\MogaoText}[4]{\begingroup
    \ifstrempty{#1}{}{\ifPDFTeX
      \ifstrequal{#1}{Times New Roman}{\fontfamily{ptm}\selectfont}{}\ifstrequal{#1}{Arial}{\sffamily}{}\ifstrequal{#1}{Courier New}{\ttfamily}{}
    \else\IfFontExistsTF{#1}{\fontspec{#1}}{}\fi}
    \ifstrempty{#2}{}{\PWSelectFont{#2}}\ifstrempty{#3}{}{\color[HTML]{#3}}#4\endgroup}
  \renewcommand{\PageWeaveHeading}[7]{\MogaoHeading{#1}{#2}{#7}}
  \patchcmd{\PageWeaveTable}{\begin{longtable}}{\noindent\ifdefstring{\PWAlign}{left}{}{\hfill}\begin{tabular}}{}{}
  \patchcmd{\PageWeaveTable}{\end{longtable}}{\end{tabular}\ifdefstring{\PWAlign}{right}{}{\hfill}\par}{}{}
}
\makeatother
`+Object.entries(TEX_NAMES).map(([long,short])=>'\\newcommand{\\'+short+'}{\\'+long+'}').join('\n')+'\n';
const submissionDesign=DESIGN_STYLE.replace('\\ProvidesPackage{pageweave-design}','\\ProvidesPackage{pageweave-submission-design}')
  .replace('tikz,fancyhdr,lastpage','tikz,fancyhdr')
  .replace('\\makeatletter','\\makeatletter\n\\@ifpackageloaded{totpages}{\\AtEndDocument{\\label{LastPage}}}{\\RequirePackage{lastpage}}');
export const SUBMISSION_STYLES:Record<string,string>={'pageweave-submission.sty':SUBMISSION_STYLE,'pageweave-submission-design.sty':submissionDesign,'pageweave-lists.sty':LIST_STYLE,'pageweave-text.sty':INLINE_STYLE};
