# PageWeave 源码命令

PageWeave 的 LaTeX 宏包名是 `pageweave`，缩写为 `pw`。新建文稿会生成所需的 `.sty` 文件，与 `.tex` 文件一起保存。可选择下面任意一种入口，无需再逐个加载布局、表格和绘图样式：

```tex
\usepackage{pageweave}
% 等价简写：\usepackage{pw}
```

使用 XeLaTeX 编译。完整工程可从软件的“导出 → LaTeX 工程”保存。

## 基本示例

```tex
\documentclass[a4paper,12pt]{article}
\usepackage[margin=25mm]{geometry}
\usepackage{pw}
\begin{document}
\PWBlock{intro}{
  \PWHeading{1}{left}{实验报告}
  \PWPara{justify}{1.5}{正文内容。行内公式：\PWMath{E=mc^2}。}
  \PWEquation{y=ax+b}
}
\end{document}
```

`PWBlock` 的标识在文稿中必须唯一，只使用字母、数字、短横线或下划线。正文保持在写作块内，才能与写作视图同步。

## 常用命令

| 命令 | 参数与用途 |
| --- | --- |
| `\PWBlock{id}{正文}` | 写作区域 |
| `\PWPara{对齐}{行距}{文字}` | 普通段落；对齐为 `left`、`center`、`right` 或 `justify` |
| `\PWHeading{级别}{对齐}{文字}` | 标题，级别为 1–3 |
| `\PWText{字体}{字号}{颜色}{文字}` | 字体名、磅值、六位十六进制颜色；空参数继承当前格式 |
| `\PWMath{公式}` | 行内公式 |
| `\PWEquation{公式}` | 独立公式 |
| `\PWLineBreak{}` | 段内换行 |
| `\PWParagraph{对齐}{模式}{行距}{段前}{段后}{文字}` | 精确段落设置；模式为 `multiple` 或 `exact`，段间距使用磅 |
| `\PWTitle{级别}{对齐}{模式}{行距}{段前}{段后}{文字}` | 带间距设置的标题 |
| `\PWLink{地址}{文字}` | 超链接，地址中的 `%`、`&`、`#`、`_` 需加反斜杠转义 |
| `\PWList{bullet或ordered}{起始编号}{项目}` | 项目符号或编号列表 |
| `\PWItem{段落}` | 列表项目，包含 `PWPara` 等段落命令 |
| `\PWTable` / `\PWRow` / `\PWCell` | 表格、行、单元格，参数保持与软件生成的表格一致 |
| `\PWImage` / `\PWDrawing` | 图片和可编辑绘图，保留软件生成的资源路径及绘图数据 |
| `\PWPageStyle` / `\PWHeader` / `\PWFooter` | 页面样式、页眉、页脚 |

文字加粗、斜体、上下标也可使用标准命令：`\textbf{文字}`、`\textit{文字}`、`\textsuperscript{2}`、`\textsubscript{2}`。分页用 `\newpage`。

表格与绘图含有尺寸、列定义和数据，建议从界面插入，再在源码中修改文字。修改原生 TikZ 绘图代码后，如与可编辑数据不一致，写作视图会保留源码并停用该区域的可视化覆盖。

## 兼容旧工程

旧的 `mogao` 宏包和 `Mogao…`、`PageWeave…` 命令仍然兼容。只有确认样式文件为软件原版时，软件才会自动将主文件改为 `pageweave` 入口及 `PW` 命令；转换保留正文、批注、修订和旧样式文件，可在源码视图撤销。旧样式文件可能还被同目录的其他文稿引用，因此不会自动删除。

`PWBasicTable`、`PWBasicRow`、`PWBasicCell` 是早期基础表格的兼容写法。新式表格使用 `PWTable`、`PWRow`、`PWCell`。
