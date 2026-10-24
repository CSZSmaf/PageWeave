// Ordinary LaTeX resources, added to a project only when images or tables are used.
export const WRITING_TOOLS_STYLE=String.raw`\NeedsTeXFormat{LaTeX2e}
\ProvidesPackage{mogao-tools}[2026/10/24 MoGao images and tables]
\RequirePackage{graphicx,array,longtable}
\renewcommand{\MogaoText}[4]{\begingroup\ifstrempty{#1}{}{\IfFontExistsTF{#1}{\fontspec[AutoFakeBold=2.5,AutoFakeSlant=.2]{#1}}{}\ifboolexpr{test {\ifstrequal{#1}{SimSun}} or test {\ifstrequal{#1}{SimHei}} or test {\ifstrequal{#1}{Microsoft YaHei}} or test {\ifstrequal{#1}{KaiTi}} or test {\ifstrequal{#1}{FangSong}}}{\CJKfontspec[AutoFakeBold=2.5,AutoFakeSlant=.2]{#1}}{}}\ifstrempty{#2}{}{\fontsize{#2}{\dimexpr #2pt*3/2\relax}\selectfont}\ifstrempty{#3}{}{\color[HTML]{#3}}#4\endgroup}
\newcommand{\MogaoImage}[5]{\par\begingroup\csname MogaoAlign#3\endcsname\noindent\MogaoStart\includegraphics[width=#2\linewidth,height=.82\textheight,keepaspectratio]{#1}\par\endgroup}
\newcommand{\MogaoTable}[2]{\par\begingroup\setlength{\tabcolsep}{5pt}\renewcommand{\arraystretch}{1.35}\noindent\MogaoStart\begin{longtable}{|*{#1}{>{\raggedright\arraybackslash}p{\dimexpr(\linewidth-2\tabcolsep*#1-\arrayrulewidth*(#1+1))/#1\relax}|}}\hline#2\end{longtable}\endgroup}
\newcommand{\MogaoRow}[1]{#1\\\hline}
\newcommand{\MogaoCell}[2]{\begingroup\ifnum#1=1\bfseries\fi#2\endgroup}
`;
