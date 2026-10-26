export const DESIGN_STYLE_FILE='pageweave-design.sty';
export const DESIGN_STYLE=String.raw`\NeedsTeXFormat{LaTeX2e}
\ProvidesPackage{pageweave-design}[2026/10/26 PageWeave document design]
\RequirePackage{array,longtable,colortbl,graphicx,tikz,fancyhdr,lastpage}
\RequirePackage[fit,breakall]{truncate}
\makeatletter
\newdimen\PWTableContent
\newdimen\PWRowHeight
\newsavebox{\PWCellBox}
\newsavebox{\PWOuterCellBox}
\def\PWExactLine{}
\pgfkeys{/pwtable/.is family,/pwtable,style/.store in=\PWStyle,width/.store in=\PWWidth,align/.store in=\PWAlign,border/.store in=\PWBorder,rule/.store in=\PWRule,pad/.store in=\PWPad,header/.code={},stripe/.code={},valign/.store in=\PWValign,cols/.code={},count/.store in=\PWColumnCount}
\newcommand{\PageWeaveTable}[3]{\par\addvspace{8bp}\begingroup\pgfkeys{/pwtable,#1}\setlength{\tabcolsep}{\PWPad bp}\setlength{\arrayrulewidth}{\PWRule bp}\definecolor{PWTableBorder}{HTML}{\PWBorder}\arrayrulecolor{PWTableBorder}\pgfmathsetlength{\PWTableContent}{\PWWidth/100*\linewidth}\@tempcnta=\PWColumnCount\relax\ifboolexpr{test {\ifdefstring{\PWStyle}{grid}} or test {\ifdefstring{\PWStyle}{blue}}}{\advance\@tempcnta by1\advance\PWTableContent by-\dimexpr\arrayrulewidth*\@tempcnta\relax}{}\setlength{\LTpre}{0pt}\setlength{\LTpost}{0pt}\renewcommand{\arraystretch}{0}\ifdefstring{\PWAlign}{left}{\setlength{\LTleft}{0pt}\setlength{\LTright}{\fill}}{\ifdefstring{\PWAlign}{right}{\setlength{\LTleft}{\fill}\setlength{\LTright}{0pt}}{\setlength{\LTleft}{\fill}\setlength{\LTright}{\fill}}}\def\PWTopRule{\hline}\ifdefstring{\PWStyle}{none}{\def\PWTopRule{}}{}\MogaoStart\begin{longtable}{#2}\PWTopRule#3\end{longtable}\endgroup\addvspace{8bp}}
\newcommand{\PageWeaveRow}[3]{\noalign{\global\PWRowHeight=#1bp\relax}#3\\\ifnum#2=1\hline\fi}
\newcommand{\PageWeaveCell}[4]{\cellcolor[HTML]{#3}\begingroup\setbox\PWCellBox=\vbox{\def\PageWeaveParagraphSkip{0bp}\ifnum#1=1\bfseries\fi#4\par}\@tempdima=\dimexpr\ht\PWCellBox+\dp\PWCellBox\relax\@tempdimb=\dimexpr\PWRowHeight-2\tabcolsep\relax\ifdim\@tempdimb>\@tempdima\@tempdima=\@tempdimb\fi\setbox\PWOuterCellBox=\vbox{\vskip\tabcolsep\vbox to\@tempdima{\ifdefstring{\PWValign}{bottom}{\vfil}{}\ifdefstring{\PWValign}{middle}{\vfil}{}\box\PWCellBox\ifdefstring{\PWValign}{bottom}{}{\vfil}}\vskip\tabcolsep}\leavevmode\raise\dimexpr\tabcolsep+.7\baselineskip-\ht\PWOuterCellBox\relax\box\PWOuterCellBox\endgroup}
\newcommand{\PWSelectFont}[1]{\ifx\PWExactLine\@empty\PageWeaveFont{#1}{\PageWeaveSpacing}\else\fontsize{#1bp}{\PWExactLine bp}\selectfont\fi}
\newcommand{\PWParagraphBody}[6]{\def\PWExactLine{}\def\PageWeaveSpacing{#2}\ifstrequal{#1}{exact}{\def\PWExactLine{#2}}{}\PWSelectFont{\PageWeaveBaseSize}\csname MogaoAlign#3\endcsname\noindent\MogaoStart\PageWeaveStrut #6\PageWeaveStrut\par}
\newcommand{\PageWeaveParagraph}[6]{\par\addvspace{#4bp}\begingroup\PWParagraphBody{#2}{#3}{#1}{#4}{#5}{#6}\endgroup\addvspace{#5bp}}
\newcommand{\PageWeaveHeading}[7]{\par\addvspace{#5bp}\begingroup\bfseries\color[HTML]{2463C7}\def\PageWeaveBaseSize{14}\ifnum#1=1\def\PageWeaveBaseSize{22}\fi\ifnum#1=2\def\PageWeaveBaseSize{17}\fi\PWParagraphBody{#3}{#4}{#2}{#5}{#6}{#7}\endgroup\addvspace{#6bp}}
\newcommand{\PageWeaveDrawing}[4]{\par\begingroup\csname MogaoAlign#3\endcsname\noindent\MogaoStart\sbox{\PWCellBox}{\resizebox{#2\linewidth}{!}{#4}}\ifdim\dimexpr\ht\PWCellBox+\dp\PWCellBox\relax>.82\textheight\resizebox{!}{.82\textheight}{\usebox{\PWCellBox}}\else\usebox{\PWCellBox}\fi\par\endgroup\addvspace{8bp}}
\newcommand{\PageWeavePageStyle}[5]{\def\PWPageSize{#1}\definecolor{PWPageColor}{HTML}{#2}\fancyhf{}\renewcommand{\headrulewidth}{\ifnum#3=1 .4pt\else0pt\fi}\renewcommand{\footrulewidth}{\ifnum#4=1 .4pt\else0pt\fi}\addtolength{\topmargin}{\headheight}\addtolength{\topmargin}{\headsep}\setlength{\headheight}{\dimexpr 1.4\dimexpr#1bp\relax+4bp\relax}\setlength{\headsep}{6bp}\addtolength{\topmargin}{-\headheight}\addtolength{\topmargin}{-\headsep}\setlength{\footskip}{16bp}\pagestyle{fancy}\ifnum#5=1\AtBeginDocument{\thispagestyle{empty}}\fi}
\newcommand{\PWPageText}[2]{{\normalfont\fontsize{\PWPageSize bp}{1.4\dimexpr\PWPageSize bp\relax}\selectfont\color{PWPageColor}\truncate[\textellipsis]{#1\headwidth}{#2}}}
\newcommand{\PWCountFields}[3]{\@tempcnta=0\ifstrempty{#1}{}{\advance\@tempcnta by1}\ifstrempty{#2}{}{\advance\@tempcnta by1}\ifstrempty{#3}{}{\advance\@tempcnta by1}}
\newcommand{\PageWeaveHeader}[3]{\PWCountFields{#1}{#2}{#3}\def\PWHeaderWidth{1}\ifnum\@tempcnta>1\def\PWHeaderWidth{.333333}\fi\fancyhead[L]{\PWPageText{\PWHeaderWidth}{#1}}\fancyhead[C]{\PWPageText{\PWHeaderWidth}{#2}}\fancyhead[R]{\PWPageText{\PWHeaderWidth}{#3}}}
\newcommand{\PageWeaveFooter}[3]{\PWCountFields{#1}{#2}{#3}\def\PWFooterWidth{1}\ifnum\@tempcnta>1\def\PWFooterWidth{.333333}\fi\fancyfoot[L]{\PWPageText{\PWFooterWidth}{#1}}\fancyfoot[C]{\PWPageText{\PWFooterWidth}{#2}}\fancyfoot[R]{\PWPageText{\PWFooterWidth}{#3}}}
\AtBeginDocument{\renewcommand{\MogaoText}[4]{\begingroup\ifstrempty{#1}{}{\IfFontExistsTF{#1}{\fontspec[AutoFakeBold=2.5,AutoFakeSlant=.2]{#1}}{}\ifboolexpr{test {\ifstrequal{#1}{SimSun}} or test {\ifstrequal{#1}{SimHei}} or test {\ifstrequal{#1}{Microsoft YaHei}} or test {\ifstrequal{#1}{KaiTi}} or test {\ifstrequal{#1}{FangSong}}}{\CJKfontspec[AutoFakeBold=2.5,AutoFakeSlant=.2]{#1}}{}}\ifstrempty{#2}{}{\PWSelectFont{#2}\PageWeaveStrut}\ifstrempty{#3}{}{\color[HTML]{#3}}#4\endgroup}}
\makeatother
`;
