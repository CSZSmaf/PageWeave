export const LIST_STYLE_FILE='pageweave-lists.sty';
export const LIST_STYLE=String.raw`\NeedsTeXFormat{LaTeX2e}
\ProvidesPackage{pageweave-lists}[2026/10/24 PageWeave lists]
\RequirePackage{enumitem}
\newlist{PWBullet}{itemize}{4}
\setlist[PWBullet]{label=\textbullet,leftmargin=1.6em,labelsep=.5em,topsep=4pt,itemsep=2pt,parsep=0pt}
\newlist{PWNumber}{enumerate}{4}
\setlist[PWNumber]{label=\arabic*.,leftmargin=1.8em,labelsep=.5em,topsep=4pt,itemsep=2pt,parsep=0pt}
\newcommand{\PageWeaveList}[3]{\ifstrequal{#1}{ordered}{\begin{PWNumber}[start=#2]#3\end{PWNumber}}{\begin{PWBullet}#3\end{PWBullet}}}
% Finish the preceding list's paragraph cleanup before installing the next label.
\newcommand{\PageWeaveItem}[1]{\par\item #1}
`;
